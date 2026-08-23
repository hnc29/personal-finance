"""Provider and quote cache boundaries; network implementations are injected."""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.pricing import PriceQuote, PricingInstrument, QuoteState


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
