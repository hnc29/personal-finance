"""Crypto pricing providers with injected network boundaries."""

import datetime
import json
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Protocol

from app.models.crypto import CryptoAsset
from app.models.pricing import PriceQuote, PricingProvider, QuoteMatchLevel, QuoteState


class CryptoPriceProvider(Protocol):
    def get_price(
        self, asset: CryptoAsset, pricing_instrument: str, as_of: datetime.date
    ) -> Decimal: ...


class UnconfiguredCryptoPriceProvider:
    def get_price(
        self, asset: CryptoAsset, pricing_instrument: str, as_of: datetime.date
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
