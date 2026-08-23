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
