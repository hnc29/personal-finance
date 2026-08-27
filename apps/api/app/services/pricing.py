"""Provider and quote cache boundaries; network implementations are injected."""

from __future__ import annotations

import datetime
import re
import unicodedata
from collections.abc import Iterable, Mapping
from decimal import Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.pricing import (
    PriceQuote,
    PricingInstrument,
    QuoteMatchLevel,
    QuoteState,
)


def _normalized(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", unaccented.lower()).split())



class PricingProvider(Protocol):
    def quote(self, instrument: str, as_of: datetime.datetime) -> PriceQuote: ...


class QuoteCache(Protocol):
    def get(self, instrument: str, as_of: datetime.datetime) -> PriceQuote | None: ...

    def put(self, instrument: str, quote: PriceQuote) -> None: ...


class InMemoryQuoteCache:
    def __init__(self) -> None:
        self._quotes: dict[str, list[PriceQuote]] = {}

    def get(self, instrument: str, as_of: datetime.datetime) -> PriceQuote | None:
        quotes = self._quotes.get(instrument, ())
        return next(
            (quote for quote in reversed(quotes) if quote.observed_at <= as_of),
            None,
        )

    def put(self, instrument: str, quote: PriceQuote) -> None:
        quotes = self._quotes.setdefault(instrument, [])
        quotes.append(quote)
        quotes.sort(key=lambda item: item.observed_at)


def provider_quote(
    provider: PricingProvider,
    cache: QuoteCache,
    canonical_instrument: str,
    as_of: datetime.datetime,
) -> PriceQuote:
    """Resolve a canonical quote through the cache and injected provider."""
    cached = cache.get(canonical_instrument, as_of)
    if cached is not None:
        return cached

    quote = provider.quote(canonical_instrument, as_of)
    if quote.observed_at > as_of:
        raise ValueError("provider quote cannot be observed after as_of")
    cache.put(canonical_instrument, quote)
    return quote


def resolve_metal_instrument(
    brand: str,
    product_type: str,
    purity: Decimal | str | int | None = None,
) -> str:
    """Resolve exact canonical pricing instrument for a gold/silver holding (Rule 2)."""
    norm_brand = brand.strip().upper()
    norm_product = _normalized(product_type)

    purity_str = str(purity) if purity is not None else ""
    is_999 = "999" in purity_str and "9999" not in purity_str and "0.9999" not in purity_str
    suffix = "999" if is_999 else "9999"

    if any(k in norm_product for k in ("nhan", "tron", "tron tron", "ep vi", "hung thinh vuong", "kim gia bao")):
        cat = "PLAIN_RING"
    elif any(k in norm_product for k in ("mieng", "bar", "thoi", "la")):
        cat = "GOLD_BAR"
    elif any(k in norm_product for k in ("nu trang", "trang suc", "jewelry")):
        cat = "JEWELRY"
    elif any(k in norm_product for k in ("nguyen lieu", "raw")):
        cat = "RAW_GOLD"
    else:
        cat = "PLAIN_RING"

    if norm_brand in {"SJC", "PNJ", "DOJI", "BTMC", "BTMH"}:
        return f"{norm_brand}_{cat}_{suffix}"
    return f"RAW_{cat}_{suffix}"


def select_metal_quote(
    *,
    instrument: str,
    brand: str,
    as_of: datetime.datetime,
    providers: Mapping[str, PricingProvider],
    historical_quotes: Mapping[str, Iterable[PriceQuote]] | None = None,
    manual_quote: PriceQuote | None = None,
    recoverable_errors: tuple[type[Exception], ...] = (Exception,),
) -> PriceQuote:
    """Resolve quote for a specific metal instrument (Rule 5 & Rule 6).

    Strict fallback order:
    1. LIVE quote from own brand provider for exact instrument.
    2. STALE quote from cached official history for exact instrument.
    3. MANUAL quote for exact instrument.
    4. UNAVAILABLE (no cross-brand fallback).
    """
    normalized_providers = {code.upper(): provider for code, provider in providers.items()}
    norm_brand = brand.upper()

    # 1. Try own brand provider for exact instrument (LIVE)
    if norm_brand in normalized_providers:
        try:
            quote = normalized_providers[norm_brand].quote(instrument, as_of)
            if (
                quote is not None
                and quote.provider.code.upper() == norm_brand
                and quote.match_level is QuoteMatchLevel.EXACT
                and quote.state is QuoteState.LIVE
                and quote.buy_price is not None
                and quote.observed_at <= as_of
            ):
                return quote
        except recoverable_errors:
            pass

    # 2. Check cached historical quotes of the EXACT same instrument (STALE)
    if historical_quotes is not None:
        exact_history = [
            q
            for q in historical_quotes.get(instrument, ())
            if q.match_level is QuoteMatchLevel.EXACT
            and q.buy_price is not None
            and q.observed_at <= as_of
        ]
        if exact_history:
            latest = max(
                exact_history,
                key=lambda q: (q.observed_at, q.quoted_at, q.id or 0),
            )
            return PriceQuote(
                id=latest.id,
                instrument=latest.instrument,
                instrument_id=latest.instrument_id,
                provider=latest.provider,
                provider_id=latest.provider_id,
                product_code=latest.product_code,
                match_level=QuoteMatchLevel.EXACT,
                state=QuoteState.STALE,
                quoted_at=latest.quoted_at,
                observed_at=latest.observed_at,
                buy_price_scaled=latest.buy_price_scaled,
                sell_price_scaled=latest.sell_price_scaled,
                source_metadata=latest.source_metadata,
            )

    # 3. Check manual quote for the EXACT same instrument (MANUAL)
    if (
        manual_quote is not None
        and manual_quote.state is QuoteState.MANUAL
        and manual_quote.buy_price is not None
        and manual_quote.observed_at <= as_of
    ):
        return manual_quote

    # 4. UNAVAILABLE (never return price=0, never fallback cross-brand)
    return PriceQuote(
        product_code=instrument,
        match_level=QuoteMatchLevel.EXACT,
        state=QuoteState.UNAVAILABLE,
        quoted_at=as_of,
        observed_at=as_of,
        buy_price_scaled=None,
        sell_price_scaled=None,
    )


def quote_state(
    *,
    quoted_at: datetime.datetime,
    as_of: datetime.datetime,
    stale_after: datetime.timedelta,
    is_manual: bool = False,
    is_available: bool = True,
) -> QuoteState:
    """Classify a provider result without changing its historical record."""
    if not is_available:
        return QuoteState.UNAVAILABLE
    if is_manual:
        return QuoteState.MANUAL
    if stale_after < datetime.timedelta(0):
        raise ValueError("stale_after cannot be negative")
    if quoted_at > as_of:
        raise ValueError("quoted_at cannot be after as_of")
    if as_of - quoted_at > stale_after:
        return QuoteState.STALE
    return QuoteState.LIVE


def append_quote(session: Session, quote: PriceQuote) -> PriceQuote:
    """Append a quote; callers never update a historical quote in place."""
    if quote.id is not None:
        raise ValueError("historical quotes cannot be overwritten")
    session.add(quote)
    session.flush()
    return quote


def latest_quote(session: Session, instrument_id: int) -> PriceQuote | None:
    return session.scalar(
        select(PriceQuote)
        .where(PriceQuote.instrument_id == instrument_id)
        .order_by(PriceQuote.quoted_at.desc(), PriceQuote.id.desc())
        .limit(1)
    )


def current_quote(
    session: Session, canonical_instrument: str, as_of: datetime.datetime
) -> PriceQuote | None:
    """Return the latest quote known by ``as_of`` for a canonical instrument."""
    return session.scalar(
        select(PriceQuote)
        .join(PricingInstrument)
        .where(
            PricingInstrument.canonical_code == canonical_instrument,
            PriceQuote.observed_at <= as_of,
        )
        .order_by(
            PriceQuote.observed_at.desc(),
            PriceQuote.quoted_at.desc(),
            PriceQuote.id.desc(),
        )
        .limit(1)
    )


def current_valuation_price(
    session: Session, canonical_instrument: str, as_of: datetime.datetime
) -> Decimal | None:
    """Select only the dealer BUY side of the current quote for valuation."""
    quote = current_quote(session, canonical_instrument, as_of)
    return None if quote is None else quote.valuation_price
