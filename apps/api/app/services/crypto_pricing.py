"""Crypto pricing providers with injected network boundaries."""

import datetime
import json
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crypto import CryptoHolding
from app.models.pricing import (
    PriceQuote,
    PricingAssetType,
    PricingInstrument,
    PricingProvider,
    QuoteMatchLevel,
    QuoteState,
)


class CryptoPriceProvider(Protocol):
    def get_price(
        self, coingecko_id: str, pricing_instrument: str, as_of: datetime.date
    ) -> Decimal: ...


class UnconfiguredCryptoPriceProvider:
    def get_price(
        self, coingecko_id: str, pricing_instrument: str, as_of: datetime.date
    ) -> Decimal:
        raise NotImplementedError("no live crypto price provider is configured")


class HttpResponse(Protocol):
    text: str

    def raise_for_status(self) -> None: ...


class HttpClient(Protocol):
    def get(
        self, url: str, *, params: Mapping[str, str], timeout: float
    ) -> HttpResponse: ...


class CryptoPriceSourceError(ValueError):
    """Raised when a crypto source cannot provide the configured exact asset."""


class CoinGeckoPriceAdapter:
    """Read an exact configured coin/currency pair without float conversion."""

    provider_code = "COINGECKO"
    provider_name = "CoinGecko"

    def __init__(
        self,
        client: HttpClient,
        url: str,
        products: Mapping[str, tuple[str, str]],
        *,
        timeout: float = 10.0,
    ) -> None:
        self._client = client
        self._url = url
        self._products = dict(products)
        self._timeout = timeout

    def quote(self, instrument: str, as_of: datetime.datetime) -> PriceQuote:
        product = self._products.get(instrument)
        if product is None:
            raise CryptoPriceSourceError(
                f"COINGECKO has no exact product mapping for {instrument}"
            )
        coin_id, currency = product
        response = self._client.get(
            self._url,
            params={
                "ids": coin_id,
                "vs_currencies": currency,
                "include_last_updated_at": "true",
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        try:
            payload = json.loads(response.text, parse_float=Decimal, parse_int=Decimal)
            record = payload[coin_id]
            raw_price = record[currency]
            raw_timestamp = record["last_updated_at"]
            price = raw_price if isinstance(raw_price, Decimal) else Decimal(raw_price)
            timestamp_value = (
                raw_timestamp
                if isinstance(raw_timestamp, Decimal)
                else Decimal(raw_timestamp)
            )
            if timestamp_value != timestamp_value.to_integral_value():
                raise ValueError("timestamp must be an integer")
            timestamp = int(timestamp_value)
        except (KeyError, TypeError, ValueError, InvalidOperation, json.JSONDecodeError) as exc:
            raise CryptoPriceSourceError(
                f"exact CoinGecko product {coin_id!r}/{currency!r} is unavailable"
            ) from exc
        if not price.is_finite() or price < 0:
            raise CryptoPriceSourceError("CoinGecko price must be finite and nonnegative")
        if timestamp < 0:
            raise CryptoPriceSourceError("CoinGecko timestamp must be nonnegative")
        quoted_at = datetime.datetime.fromtimestamp(timestamp, tz=datetime.UTC)
        if quoted_at > as_of:
            raise CryptoPriceSourceError("source quote cannot be after as_of")

        quote = PriceQuote(
            provider=PricingProvider(code=self.provider_code, name=self.provider_name),
            product_code=f"{coin_id}/{currency}",
            match_level=QuoteMatchLevel.EXACT,
            state=QuoteState.LIVE,
            quoted_at=quoted_at,
            observed_at=as_of,
            source_metadata=json.dumps(
                {"coin_id": coin_id, "currency": currency, "source_url": self._url},
                sort_keys=True,
            ),
        )
        quote.buy_price = price
        quote.sell_price = price
        return quote


class CoinMarketCapPriceAdapter:
    """Fetch live USD crypto prices from CoinMarketCap and convert to VND via exchange rate."""

    provider_code = "COINMARKETCAP"
    provider_name = "CoinMarketCap"
    default_listing_url = (
        "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing"
        "?start=1&limit=2000&sortBy=market_cap&sortType=desc&convert=USD"
    )
    default_fx_url = "https://open.er-api.com/v6/latest/USD"

    def __init__(
        self,
        client: HttpClient,
        listing_url: str = default_listing_url,
        fx_url: str = default_fx_url,
        *,
        timeout: float = 10.0,
    ) -> None:
        self._client = client
        self._listing_url = listing_url
        self._fx_url = fx_url
        self._timeout = timeout

    def get_usd_vnd_rate(self) -> Decimal:
        """Fetch current USD/VND exchange rate, with fallback."""
        try:
            resp = self._client.get(self._fx_url, params={}, timeout=self._timeout)
            resp.raise_for_status()
            data = json.loads(resp.text, parse_float=Decimal)
            rates = data.get("rates", {})
            rate_val = rates.get("VND")
            if rate_val is not None:
                rate = Decimal(str(rate_val))
                if rate > 0 and rate.is_finite():
                    return rate
        except (KeyError, TypeError, ValueError, InvalidOperation, json.JSONDecodeError):
            pass
        return Decimal("26000.0000")

    def fetch_all_quotes(
        self,
        as_of: datetime.datetime,
        usd_vnd_rate: Decimal | None = None,
    ) -> dict[str, tuple[Decimal, Decimal, PriceQuote]]:
        """Fetch top coins from CoinMarketCap and return mapping of symbol -> (price_usd, price_vnd, PriceQuote)."""
        if usd_vnd_rate is None:
            usd_vnd_rate = self.get_usd_vnd_rate()

        resp = self._client.get(self._listing_url, params={}, timeout=self._timeout)
        resp.raise_for_status()
        data = json.loads(resp.text, parse_float=Decimal)
        crypto_list = data.get("data", {}).get("cryptoCurrencyList", [])

        quotes: dict[str, tuple[Decimal, Decimal, PriceQuote]] = {}
        for coin in crypto_list:
            symbol = str(coin.get("symbol", "")).upper()
            slug = str(coin.get("slug", "")).lower()
            name = str(coin.get("name", ""))
            quotes_list = coin.get("quotes", [])
            if not quotes_list or not symbol:
                continue
            usd_quote = quotes_list[0]
            raw_price_usd = usd_quote.get("price")
            if raw_price_usd is None:
                continue
            price_usd = Decimal(str(raw_price_usd))
            price_vnd = (price_usd * usd_vnd_rate).quantize(Decimal("0.0001"))

            last_updated_str = str(usd_quote.get("lastUpdated", ""))
            try:
                quoted_at = datetime.datetime.fromisoformat(last_updated_str)
            except (ValueError, TypeError):
                quoted_at = as_of

            meta = {
                "provider": self.provider_code,
                "symbol": symbol,
                "slug": slug,
                "name": name,
                "price_usd": str(price_usd),
                "usd_vnd_rate": str(usd_vnd_rate),
                "currency": "VND",
                "source_url": "https://coinmarketcap.com/",
                "status": "LIVE",
            }

            quote = PriceQuote(
                provider=PricingProvider(code=self.provider_code, name=self.provider_name),
                product_code=f"{symbol}/USD",
                match_level=QuoteMatchLevel.EXACT,
                state=QuoteState.LIVE,
                quoted_at=quoted_at,
                observed_at=as_of,
                source_metadata=json.dumps(meta, ensure_ascii=False, sort_keys=True),
            )
            quote.buy_price = price_vnd
            quote.sell_price = price_vnd

            quotes[symbol] = (price_usd, price_vnd, quote)
            if slug:
                quotes[slug] = (price_usd, price_vnd, quote)
            if slug == "toncoin":
                quotes["TON"] = (price_usd, price_vnd, quote)

        return quotes


def sync_crypto_holdings_prices(
    db: Session,
    client: HttpClient | None = None,
) -> dict[str, object]:
    """Sync live prices from CoinMarketCap for all active crypto holdings."""
    if client is None:
        from app.services.http_client import UrllibHttpClient
        client = UrllibHttpClient()

    adapter = CoinMarketCapPriceAdapter(client)
    now = datetime.datetime.now(datetime.UTC)
    usd_vnd_rate = adapter.get_usd_vnd_rate()
    all_quotes = adapter.fetch_all_quotes(now, usd_vnd_rate=usd_vnd_rate)

    provider_rec = db.scalar(
        select(PricingProvider).where(PricingProvider.code == adapter.provider_code)
    )
    if provider_rec is None:
        provider_rec = PricingProvider(code=adapter.provider_code, name=adapter.provider_name)
        db.add(provider_rec)
        db.flush()

    holdings = list(db.scalars(select(CryptoHolding)))
    updated_items = []

    for h in holdings:
        sym = (h.symbol or "").upper().strip()
        disp_name = (h.display_name or "").upper().strip()
        slug = (h.coingecko_id or "").lower().strip()

        # Match by coin symbol first, then display name, then coingecko_id / slug
        matched = (
            (all_quotes.get(sym) if sym else None)
            or (all_quotes.get(disp_name) if disp_name else None)
            or (all_quotes.get(slug) if slug else None)
        )
        if not matched:
            continue

        price_usd, price_vnd, template_quote = matched
        canonical_inst = h.pricing_instrument or f"CRYPTO/{sym}/USD"
        h.pricing_instrument = canonical_inst

        inst_rec = db.scalar(
            select(PricingInstrument).where(PricingInstrument.canonical_code == canonical_inst)
        )
        if inst_rec is None:
            inst_rec = PricingInstrument(
                canonical_code=canonical_inst,
                asset_type=PricingAssetType.CRYPTO,
                display_name=h.display_name or sym,
            )
            db.add(inst_rec)
            db.flush()

        existing_quote = db.scalar(
            select(PriceQuote).where(
                PriceQuote.instrument_id == inst_rec.id,
                PriceQuote.provider_id == provider_rec.id,
                PriceQuote.product_code == template_quote.product_code,
                PriceQuote.quoted_at == template_quote.quoted_at,
            )
        )
        if existing_quote is None:
            new_quote = PriceQuote(
                instrument_id=inst_rec.id,
                provider_id=provider_rec.id,
                product_code=template_quote.product_code,
                match_level=template_quote.match_level,
                state=template_quote.state,
                quoted_at=template_quote.quoted_at,
                observed_at=template_quote.observed_at,
                buy_price_scaled=template_quote.buy_price_scaled,
                sell_price_scaled=template_quote.sell_price_scaled,
                source_metadata=template_quote.source_metadata,
            )
            db.add(new_quote)

        updated_items.append({
            "id": h.id,
            "symbol": sym,
            "display_name": h.display_name,
            "price_usd": str(price_usd),
            "price_vnd": str(price_vnd),
            "usd_vnd_rate": str(usd_vnd_rate),
        })

    db.commit()
    return {
        "updated_count": len(updated_items),
        "usd_vnd_rate": str(usd_vnd_rate),
        "items": updated_items,
    }

