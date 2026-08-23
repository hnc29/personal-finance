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
    metal_provider_order,
    provider_quote,
    quote_state,
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


def test_metal_provider_order_prefers_own_brand_then_configured_priority() -> None:
    assert metal_provider_order("SJC", ["DOJI", "SJC", "BTMC", "PNJ"]) == (
        "SJC",
        "BTMC",
        "DOJI",
    )
    assert metal_provider_order("PNJ", ["SJC", "PNJ", "BTMH"]) == (
        "PNJ",
        "BTMH",
        "SJC",
    )
    assert metal_provider_order("sjc", ["sjc", "btmc"]) == ("SJC", "BTMC")


def test_selection_tries_own_brand_then_fallback_and_requires_exact_quote() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    wrong = _selection_quote("SJC", QuoteState.LIVE, as_of)
    wrong.match_level = QuoteMatchLevel.PRODUCT
    exact = _selection_quote("BTMC", QuoteState.LIVE, as_of)
    sjc = Mock(spec=PricingProviderProtocol)
    sjc.quote.return_value = wrong
    btmc = Mock(spec=PricingProviderProtocol)
    btmc.quote.return_value = exact

    assert select_metal_quote(
        instrument="GOLD/SJC/BAR", brand="SJC", as_of=as_of, providers={"BTMC": btmc, "SJC": sjc}
    ) is exact
    sjc.quote.assert_called_once_with("GOLD/SJC/BAR", as_of)
    btmc.quote.assert_called_once_with("GOLD/SJC/BAR", as_of)


def test_selection_uses_latest_successful_buy_then_manual() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("synthetic outage")
    older = _selection_quote("BTMC", QuoteState.STALE, as_of - datetime.timedelta(hours=2))
    newer = _selection_quote("DOJI", QuoteState.LIVE, as_of - datetime.timedelta(hours=1))
    manual = _selection_quote("MANUAL", QuoteState.MANUAL, as_of - datetime.timedelta(minutes=30))

    assert select_metal_quote(
        instrument="GOLD/RAW/BAR", brand="RAW", as_of=as_of,
        providers={"BTMC": provider},
        historical_quotes={"GOLD/RAW/BAR": [older, newer]},
        manual_quote=manual,
    ) is newer
    assert select_metal_quote(
        instrument="GOLD/RAW/BAR", brand="RAW", as_of=as_of,
        providers={"BTMC": provider}, manual_quote=manual,
    ) is manual


def test_selection_falls_back_in_btmc_btmh_doji_sjc_order() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    exact = _selection_quote("SJC", QuoteState.LIVE, as_of)
    calls: list[str] = []

    def provider(code: str, result: PriceQuote | Exception) -> Mock:
        mocked = Mock(spec=PricingProviderProtocol)

        def quote(_instrument: str, _as_of: datetime.datetime) -> PriceQuote:
            calls.append(code)
            if isinstance(result, Exception):
                raise result
            return result

        mocked.quote.side_effect = quote
        return mocked

    providers = {
        "SJC": provider("SJC", exact),
        "DOJI": provider("DOJI", ValueError("synthetic outage")),
        "BTMH": provider("BTMH", ValueError("synthetic outage")),
        "BTMC": provider("BTMC", ValueError("synthetic outage")),
    }

    result = select_metal_quote(
        instrument="GOLD/RAW/BAR",
        brand="RAW",
        as_of=as_of,
        providers=providers,
    )

    assert result is exact
    assert calls == ["BTMC", "BTMH", "DOJI", "SJC"]


def test_selection_tries_own_brand_before_btmc_fallback() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    own_brand = _selection_quote("DOJI", QuoteState.LIVE, as_of)
    doji = Mock(spec=PricingProviderProtocol)
    doji.quote.return_value = own_brand
    btmc = Mock(spec=PricingProviderProtocol)

    result = select_metal_quote(
        instrument="GOLD/DOJI/RING",
        brand="DOJI",
        as_of=as_of,
        providers={"BTMC": btmc, "DOJI": doji},
    )

    assert result is own_brand
    doji.quote.assert_called_once_with("GOLD/DOJI/RING", as_of)
    btmc.quote.assert_not_called()


def test_selection_rejects_equivalent_product_and_continues_fallback() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    equivalent = _selection_quote("BTMC", QuoteState.LIVE, as_of)
    equivalent.match_level = QuoteMatchLevel.PRODUCT
    exact = _selection_quote("BTMH", QuoteState.LIVE, as_of)
    btmc = Mock(spec=PricingProviderProtocol)
    btmc.quote.return_value = equivalent
    btmh = Mock(spec=PricingProviderProtocol)
    btmh.quote.return_value = exact

    result = select_metal_quote(
        instrument="GOLD/RAW/BAR",
        brand="RAW",
        as_of=as_of,
        providers={"BTMC": btmc, "BTMH": btmh},
    )

    assert result is exact
    btmc.quote.assert_called_once()
    btmh.quote.assert_called_once()


def test_selection_uses_stale_successful_buy_before_manual_quote() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("synthetic outage")
    stale = _selection_quote("BTMC", QuoteState.STALE, as_of - datetime.timedelta(days=1))
    manual = _selection_quote("MANUAL", QuoteState.MANUAL, as_of - datetime.timedelta(minutes=1))

    result = select_metal_quote(
        instrument="GOLD/RAW/BAR",
        brand="BTMC",
        as_of=as_of,
        providers={"BTMC": provider},
        historical_quotes={"GOLD/RAW/BAR": [stale]},
        manual_quote=manual,
    )

    assert result is stale


def test_selection_ignores_history_for_other_instruments_and_nonexact_quotes() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("synthetic outage")
    other_instrument = _selection_quote(
        "BTMC", QuoteState.STALE, as_of - datetime.timedelta(hours=1)
    )
    nonexact = _selection_quote(
        "BTMC", QuoteState.STALE, as_of - datetime.timedelta(hours=2)
    )
    nonexact.match_level = QuoteMatchLevel.PRODUCT
    manual = _selection_quote(
        "MANUAL", QuoteState.MANUAL, as_of - datetime.timedelta(minutes=1)
    )

    result = select_metal_quote(
        instrument="GOLD/RAW/BAR",
        brand="RAW",
        as_of=as_of,
        providers={"BTMC": provider},
        historical_quotes={
            "GOLD/OTHER/BAR": [other_instrument],
            "GOLD/RAW/BAR": [nonexact],
        },
        manual_quote=manual,
    )

    assert result is manual


def test_selection_uses_manual_quote_when_no_live_or_historical_buy_exists() -> None:
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    provider = Mock(spec=PricingProviderProtocol)
    provider.quote.side_effect = ValueError("synthetic outage")
    manual = _selection_quote("MANUAL", QuoteState.MANUAL, as_of - datetime.timedelta(minutes=1))

    assert select_metal_quote(
        instrument="GOLD/RAW/BAR",
        brand="RAW",
        as_of=as_of,
        providers={"BTMC": provider},
        manual_quote=manual,
    ) is manual
