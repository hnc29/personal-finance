"""BTMC (btmc.vn) as the single live reference price for precious metals.

User request, 2026-08-27 (verbatim): "vậy hãy code giá ở btmc làm tham
chiếu, với nguyên tắc các loại nhẫn và miếng của btmh, btmc, doji coi giá
bằng nhau, vàng miếng sjc lấy trên bảng giá, vàng nguyên liệu cũng lấy
trên bảng giá." -- i.e. btmc.vn is the only site actually wired up for
live fetching right now (baotinmanhhai.vn and banggia.doji.vn were
researched but are not directly reachable/verifiable from this
environment -- see chat history 2026-08-27). Business rule, exactly as
given:
  - Ring ("nhẫn") and bar ("miếng") holdings of brand BTMC, BTMH, or DOJI
    are all priced the same -- BTMC's own ring/bar row on btmc.vn.
  - SJC-brand bar holdings are priced from btmc.vn's own "VÀNG MIẾNG SJC"
    reference row (btmc.vn publishes it alongside its own products).
  - RAW-brand holdings (any shape) are priced from btmc.vn's "VÀNG NGUYÊN
    LIỆU" row.
  - Jewelry ("trang sức") and PNJ are NOT covered by this rule -- left
    exactly as before (UNAVAILABLE unless a MANUAL quote exists), since
    the user did not ask for them here.

This intentionally does NOT touch ``resolve_metal_instrument()`` (still
resolves distinct brand-specific instrument codes -- e.g.
"BTMH_PLAIN_RING_9999" stays a different canonical code from
"BTMC_PLAIN_RING_9999") or ``select_metal_quote()`` (its "no cross-brand
fallback" Rule 5 is deliberate, see test_pricing.py). Instead, one
adapter (BTMC's real page) is configured to answer for MULTIPLE distinct
instrument codes, each mapped to whichever real row on btmc.vn should
price it -- BTMH_PLAIN_RING_9999 and BTMC_PLAIN_RING_9999 both resolve to
the *same* btmc.vn row and therefore always get the exact same price,
which is exactly "coi giá bằng nhau" (considered equal).
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.pricing import (
    PriceQuote,
    PricingAssetType,
    PricingInstrument,
    PricingProvider,
)
from app.services.http_client import UrllibHttpClient
from app.services.metal_price_adapters import BtmcPriceAdapter
from app.services.pricing import append_quote, current_quote

# Exact product-name text as published on btmc.vn (2026-08-27 snapshot,
# verified live) -- matched via HtmlMetalPriceAdapter's accent/case
# -insensitive normalization, so exact capitalization here doesn't matter.
_BTMC_RING_BAR_PRODUCT: Final = "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU"
_SJC_BAR_PRODUCT: Final = "VÀNG MIẾNG SJC"
_RAW_GOLD_PRODUCT: Final = "VÀNG NGUYÊN LIỆU"

_RING_BAR_BRANDS: Final = ("BTMC", "BTMH", "DOJI")
_RING_BAR_CATEGORIES: Final = ("PLAIN_RING", "GOLD_BAR")
# resolve_metal_instrument() derives this suffix from the holding's own
# recorded purity (999 vs 9999); the reference price itself doesn't vary
# by purity, so both suffixes are mapped to the same row.
_PURITY_SUFFIXES: Final = ("9999", "999")
# Every product-type category resolve_metal_instrument() can produce when
# brand="RAW" (any of Nhẫn/Miếng/Trang sức the UI offers, or literal
# "nguyên liệu"/"raw" text) -- raw material is priced the same regardless
# of the shape the user picked when recording the holding.
_RAW_CATEGORIES: Final = ("PLAIN_RING", "GOLD_BAR", "JEWELRY", "RAW_GOLD")


def _btmc_reference_products() -> dict[str, str]:
    products: dict[str, str] = {}
    for brand in _RING_BAR_BRANDS:
        for category in _RING_BAR_CATEGORIES:
            # btmc.vn quotes its own ring and bar at the identical price
            # (confirmed live: both rows showed 14.800.000/15.200.000), so
            # both categories point at the same reference row here.
            for suffix in _PURITY_SUFFIXES:
                products[f"{brand}_{category}_{suffix}"] = _BTMC_RING_BAR_PRODUCT
    for suffix in _PURITY_SUFFIXES:
        products[f"SJC_GOLD_BAR_{suffix}"] = _SJC_BAR_PRODUCT
    for category in _RAW_CATEGORIES:
        for suffix in _PURITY_SUFFIXES:
            products[f"RAW_{category}_{suffix}"] = _RAW_GOLD_PRODUCT
    return products


BTMC_REFERENCE_PRODUCTS: Final[dict[str, str]] = _btmc_reference_products()

# btmc.vn confirmed to update roughly on a per-business-hour cadence, not
# continuously -- refreshing at most every 30 minutes avoids hammering
# the site on every single portfolio view while still staying current.
REFRESH_INTERVAL: Final = datetime.timedelta(minutes=30)

_btmc_adapter = BtmcPriceAdapter(
    UrllibHttpClient(),
    settings.btmc_price_url,
    BTMC_REFERENCE_PRODUCTS,
    timeout=settings.btmc_price_timeout_seconds,
    unit_scale=Decimal(1000),
)


def get_btmc_adapter() -> BtmcPriceAdapter:
    """A single process-lifetime instance; overridable in tests via the ``adapter`` param below."""
    return _btmc_adapter


def _get_or_create_instrument(db: Session, canonical_code: str) -> PricingInstrument:
    existing = db.scalar(
        select(PricingInstrument).where(PricingInstrument.canonical_code == canonical_code)
    )
    if existing is not None:
        return existing
    instrument = PricingInstrument(
        canonical_code=canonical_code, asset_type=PricingAssetType.PRECIOUS_METAL
    )
    db.add(instrument)
    db.flush()
    return instrument


def _get_or_create_provider(db: Session, code: str, name: str) -> PricingProvider:
    existing = db.scalar(select(PricingProvider).where(PricingProvider.code == code))
    if existing is not None:
        return existing
    provider = PricingProvider(code=code, name=name)
    db.add(provider)
    db.flush()
    return provider


def _persist_live_quote(
    db: Session, canonical_code: str, raw_quote: PriceQuote
) -> PriceQuote:
    """Materialize a transient adapter-built PriceQuote (with unpersisted
    instrument/provider sub-objects) against the real, already-existing
    PricingInstrument/PricingProvider rows, then append it (append-only --
    see PriceQuote's before_update/before_delete guard)."""
    instrument = _get_or_create_instrument(db, canonical_code)
    provider = _get_or_create_provider(db, raw_quote.provider.code, raw_quote.provider.name)
    quote = PriceQuote(
        instrument=instrument,
        provider=provider,
        product_code=raw_quote.product_code,
        match_level=raw_quote.match_level,
        state=raw_quote.state,
        quoted_at=raw_quote.quoted_at,
        observed_at=raw_quote.observed_at,
        source_metadata=raw_quote.source_metadata,
    )
    quote.buy_price = raw_quote.buy_price
    quote.sell_price = raw_quote.sell_price
    append_quote(db, quote)
    db.commit()
    return quote


def get_or_refresh_metal_quote(
    db: Session,
    instrument: str,
    as_of: datetime.datetime,
    *,
    adapter: BtmcPriceAdapter | None = None,
    refresh_interval: datetime.timedelta = REFRESH_INTERVAL,
) -> PriceQuote | None:
    """Read the cached quote for ``instrument``; fetch+persist a fresh one
    from btmc.vn when the cache is missing or older than ``refresh_interval``.

    Never raises: any network/parsing failure just falls back to whatever
    quote (possibly None) was already cached, so a flaky external site can
    never break the whole portfolio view -- matches the existing
    ``valuation_complete`` partial-unavailability handling in
    read_models.portfolio_overview().
    """
    cached = current_quote(db, instrument, as_of)
    if cached is not None:
        # SQLite has no native timezone type: DateTime(timezone=True)
        # columns round-trip as naive datetimes once read back from the
        # DB (confirmed 2026-08-27 -- comparing a DB-loaded observed_at
        # directly against as_of raised "can't subtract offset-naive and
        # offset-aware datetimes"). Every observed_at written by this app
        # is UTC (see read_models.portfolio_overview's
        # ``datetime.datetime.now(datetime.UTC)``), so a naive value read
        # back is reattached as UTC rather than compared as-is.
        cached_observed_at = cached.observed_at
        if cached_observed_at.tzinfo is None:
            cached_observed_at = cached_observed_at.replace(tzinfo=datetime.UTC)
        if (as_of - cached_observed_at) <= refresh_interval:
            return cached

    active_adapter = adapter if adapter is not None else get_btmc_adapter()
    try:
        fresh = active_adapter.quote(instrument, as_of)
    except Exception:  # noqa: BLE001 - network/parse boundary; a flaky site must fall back, never crash the view
        return cached

    try:
        return _persist_live_quote(db, instrument, fresh)
    except Exception:  # noqa: BLE001 - persistence boundary; see comment below on the duplicate-quote race
        db.rollback()
        # Another concurrent request may have already persisted this exact
        # (instrument, provider, product_code, quoted_at) quote -- the
        # unique constraint would reject our insert, but the row is there.
        return current_quote(db, instrument, as_of) or cached


__all__ = [
    "BTMC_REFERENCE_PRODUCTS",
    "REFRESH_INTERVAL",
    "get_btmc_adapter",
    "get_or_refresh_metal_quote",
]
