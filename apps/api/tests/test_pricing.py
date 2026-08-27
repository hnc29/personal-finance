import datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest
from sqlalchemy import BigInteger, Float, Numeric

from app.models.pricing import (
    PriceQuote,
    PricingAssetType,
    PricingInstrument,
    PricingProvider,
    QuoteMatchLevel,
    QuoteState,
)
from app.services.pricing import (
    InMemoryQuoteCache,
    provider_quote,
    quote_state,
    resolve_metal_instrument,
    select_metal_quote,
)
from app.services.pricing import PricingProvider as PricingProviderProtocol


def test_quote_uses_decimal_scaled_buy_price_and_metadata() -> None:
    quote = PriceQuote(
        instrument=PricingInstrument(
            canonical_code="BTC/USD", asset_type=PricingAssetType.CRYPTO
        ),
        provider=PricingProvider(code="synthetic", name="Synthetic"),
        match_level=QuoteMatchLevel.EXACT,
        state=QuoteState.LIVE,
        quoted_at=datetime.datetime(2026, 8, 23, tzinfo=datetime.UTC),
        observed_at=datetime.datetime(2026, 8, 23, 0, 1, tzinfo=datetime.UTC),
        product_code="BTC-USD",
    )
    quote.buy_price = Decimal("65000.1234")
    assert quote.buy_price == Decimal("65000.1234")
    assert isinstance(PriceQuote.__table__.c.buy_price_scaled.type, BigInteger)
    assert not isinstance(
        PriceQuote.__table__.c.buy_price_scaled.type, (Float, Numeric)
    )


def test_quote_cache_is_keyed_by_canonical_instrument() -> None:
    cache = InMemoryQuoteCache()
    quote = PriceQuote(
        state=QuoteState.MANUAL,
        observed_at=datetime.datetime(2026, 8, 23, tzinfo=datetime.UTC),
    )
    cache.put("GOLD/SJC", quote)
    assert cache.get("GOLD/SJC", datetime.datetime.now(datetime.UTC)) is quote
    assert cache.get("SILVER/RAW", datetime.datetime.now(datetime.UTC)) is None


def test_quote_states_cover_live_stale_manual_and_unavailable() -> None:
    now = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    max_age = datetime.timedelta(minutes=5)

    assert quote_state(quoted_at=now, as_of=now, stale_after=max_age) is QuoteState.LIVE
    assert (
        quote_state(
            quoted_at=now - datetime.timedelta(minutes=6),
            as_of=now,
            stale_after=max_age,
        )
        is QuoteState.STALE
    )
    assert (
        quote_state(
            quoted_at=now, as_of=now, stale_after=max_age, is_manual=True
        )
        is QuoteState.MANUAL
    )
    assert (
        quote_state(
            quoted_at=now, as_of=now, stale_after=max_age, is_available=False
        )
        is QuoteState.UNAVAILABLE
    )


def test_cache_does_not_replace_newer_observation_with_older_quote() -> None:
    cache = InMemoryQuoteCache()
    newer = PriceQuote(observed_at=datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC))
    older = PriceQuote(observed_at=datetime.datetime(2026, 8, 23, 11, tzinfo=datetime.UTC))
    cache.put("BTC/USD", newer)
    cache.put("BTC/USD", older)
    assert cache.get("BTC/USD", datetime.datetime(2026, 8, 23, 13, tzinfo=datetime.UTC)) is newer


def test_cache_can_resolve_older_quote_as_of_before_newer_observation() -> None:
    cache = InMemoryQuoteCache()
    older = PriceQuote(observed_at=datetime.datetime(2026, 8, 23, 11, tzinfo=datetime.UTC))
    newer = PriceQuote(observed_at=datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC))
    cache.put("BTC/USD", older)
    cache.put("BTC/USD", newer)

    assert cache.get(
        "BTC/USD", datetime.datetime(2026, 8, 23, 11, 30, tzinfo=datetime.UTC)
    ) is older


def test_provider_framework_uses_mocked_provider_on_cache_miss() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    quote = PriceQuote(
        state=QuoteState.LIVE,
        observed_at=as_of,
        quoted_at=as_of - datetime.timedelta(seconds=10),
    )
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.return_value = quote
    cache = InMemoryQuoteCache()

    assert provider_quote(provider, cache, "GOLD/SJC", as_of) is quote
    provider.quote.assert_called_once_with("GOLD/SJC", as_of)
    assert cache.get("GOLD/SJC", as_of) is quote


def test_provider_framework_uses_cache_without_network_call() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    quote = PriceQuote(observed_at=as_of)
    cache = InMemoryQuoteCache()
    cache.put("BTC/USD", quote)
    provider = Mock(spec=PricingProviderProtocol)

    assert provider_quote(provider, cache, "BTC/USD", as_of) is quote
    provider.quote.assert_not_called()


def test_provider_framework_rejects_future_observation() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.return_value = PriceQuote(
        observed_at=as_of + datetime.timedelta(seconds=1)
    )

    with pytest.raises(ValueError, match="observed after as_of"):
        provider_quote(provider, InMemoryQuoteCache(), "BTC/USD", as_of)


def _selection_quote(
    provider_code: str, state: QuoteState, observed_at: datetime.datetime
) -> PriceQuote:
    quote = PriceQuote(
        provider=PricingProvider(code=provider_code, name=provider_code),
        product_code=f"{provider_code}-EXACT",
        match_level=QuoteMatchLevel.EXACT,
        state=state,
        quoted_at=observed_at - datetime.timedelta(minutes=1),
        observed_at=observed_at,
    )
    quote.buy_price = Decimal("100.0000")
    return quote


def test_resolve_metal_instrument() -> None:
    assert resolve_metal_instrument("SJC", "Vàng miếng SJC", "0.9999") == "SJC_GOLD_BAR_9999"
    assert resolve_metal_instrument("SJC", "Nhẫn trơn 999.9", "0.9999") == "SJC_PLAIN_RING_9999"
    assert resolve_metal_instrument("PNJ", "Nhẫn Trơn PNJ 999.9", "0.9999") == "PNJ_PLAIN_RING_9999"
    assert resolve_metal_instrument("PNJ", "Vàng miếng PNJ", "0.9999") == "PNJ_GOLD_BAR_9999"
    assert resolve_metal_instrument("PNJ", "Vàng nguyên liệu", "0.999") == "PNJ_RAW_GOLD_999"
    assert resolve_metal_instrument("DOJI", "Nhẫn tròn Hưng Thịnh Vượng", "0.9999") == "DOJI_PLAIN_RING_9999"
    assert resolve_metal_instrument("DOJI", "Vàng miếng DOJI", "0.9999") == "DOJI_GOLD_BAR_9999"
    assert resolve_metal_instrument("BTMC", "Nhẫn tròn trơn Vàng Rồng Thăng Long", "0.9999") == "BTMC_PLAIN_RING_9999"
    assert resolve_metal_instrument("BTMH", "Nhẫn tròn ép vỉ Kim Gia Bảo", "0.9999") == "BTMH_PLAIN_RING_9999"


def test_selection_returns_live_quote_from_own_brand() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    exact = _selection_quote("SJC", QuoteState.LIVE, as_of)
    sjc = Mock(spec=PricingProviderProtocol)
    sjc.quote.return_value = exact

    result = select_metal_quote(
        instrument="SJC_GOLD_BAR_9999",
        brand="SJC",
        as_of=as_of,
        providers={"SJC": sjc},
    )
    assert result is exact
    sjc.quote.assert_called_once_with("SJC_GOLD_BAR_9999", as_of)


def test_selection_never_cross_brand_falls_back_when_own_brand_fails() -> None:
    """Rule 5: No cross-brand fallback. If SJC provider fails, DO NOT fetch DOJI or BTMC."""
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    sjc = Mock(spec=PricingProviderProtocol)
    sjc.quote.side_effect = ValueError("SJC website outage")
    doji = Mock(spec=PricingProviderProtocol)
    btmc = Mock(spec=PricingProviderProtocol)

    result = select_metal_quote(
        instrument="SJC_GOLD_BAR_9999",
        brand="SJC",
        as_of=as_of,
        providers={"SJC": sjc, "DOJI": doji, "BTMC": btmc},
    )

    sjc.quote.assert_called_once_with("SJC_GOLD_BAR_9999", as_of)
    doji.quote.assert_not_called()
    btmc.quote.assert_not_called()
    assert result.state is QuoteState.UNAVAILABLE
    assert result.buy_price is None


def test_selection_uses_stale_cached_quote_of_exact_instrument() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    sjc = Mock(spec=PricingProviderProtocol)
    sjc.quote.side_effect = ValueError("SJC outage")
    cached = _selection_quote("SJC", QuoteState.LIVE, as_of - datetime.timedelta(hours=2))

    result = select_metal_quote(
        instrument="SJC_GOLD_BAR_9999",
        brand="SJC",
        as_of=as_of,
        providers={"SJC": sjc},
        historical_quotes={"SJC_GOLD_BAR_9999": [cached]},
    )

    assert result.state is QuoteState.STALE
    assert result.buy_price == cached.buy_price
    assert result.product_code == cached.product_code


def test_selection_uses_manual_quote_when_no_live_or_cached_exists() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("Outage")
    manual = _selection_quote("MANUAL", QuoteState.MANUAL, as_of - datetime.timedelta(minutes=10))

    result = select_metal_quote(
        instrument="BTMH_RAW_GOLD_9999",
        brand="BTMH",
        as_of=as_of,
        providers={"BTMH": provider},
        manual_quote=manual,
    )
    assert result is manual
    assert result.state is QuoteState.MANUAL


def test_selection_returns_unavailable_when_all_fail() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("Outage")

    result = select_metal_quote(
        instrument="DOJI_PLAIN_RING_9999",
        brand="DOJI",
        as_of=as_of,
        providers={"DOJI": provider},
    )
    assert result.state is QuoteState.UNAVAILABLE
    assert result.buy_price is None
    assert result.valuation_price is None

