"""Tests for get_or_refresh_metal_quote (BTMC-as-reference orchestration).

Uses a real, alembic-migrated, temp-file SQLite session -- same pattern as
test_crypto.py's ``session`` fixture -- because this module does real ORM
reads/writes (get-or-create instrument/provider rows, append-only
PriceQuote inserts, a unique-constraint-triggered rollback-and-reread
fallback) that a hand-rolled fake session can't faithfully exercise.
"""

import datetime
import os
import subprocess
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.pricing import (
    PriceQuote,
    PricingInstrument,
    PricingProvider,
    QuoteMatchLevel,
    QuoteState,
)
from app.services.metal_price_reference import (
    REFRESH_INTERVAL,
    get_or_refresh_metal_quote,
)


@pytest.fixture
def session(tmp_path: Path) -> Session:
    database_path = tmp_path / "synthetic-metal-reference.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as database_session:
        database_session.execute(text("PRAGMA foreign_keys=ON"))
        yield database_session
    engine.dispose()


def _fresh_quote(
    provider_code: str,
    product_code: str,
    buy: str,
    quoted_at: datetime.datetime,
    observed_at: datetime.datetime,
) -> PriceQuote:
    """An unpersisted PriceQuote shaped exactly like HtmlMetalPriceAdapter.quote()'s
    return value: a transient PricingProvider sub-object and no instrument set
    (metal_price_reference._persist_live_quote is what attaches the real,
    get-or-created PricingInstrument row)."""
    quote = PriceQuote(
        provider=PricingProvider(code=provider_code, name=provider_code),
        product_code=product_code,
        match_level=QuoteMatchLevel.EXACT,
        state=QuoteState.LIVE,
        quoted_at=quoted_at,
        observed_at=observed_at,
        source_metadata=None,
    )
    quote.buy_price = Decimal(buy)
    quote.sell_price = None
    return quote


def test_fetches_and_persists_on_cache_miss(session: Session) -> None:
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        as_of - datetime.timedelta(minutes=5),
        as_of,
    )

    quote = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    assert quote is not None
    assert quote.id is not None
    assert quote.buy_price == Decimal("14800000.0000")
    assert quote.instrument.canonical_code == "BTMC_PLAIN_RING_9999"
    assert quote.provider.code == "BTMC"
    adapter.quote.assert_called_once_with("BTMC_PLAIN_RING_9999", as_of)
    assert len(session.scalars(select(PricingInstrument)).all()) == 1
    assert len(session.scalars(select(PricingProvider)).all()) == 1


def test_second_call_within_refresh_interval_is_served_from_cache(
    session: Session,
) -> None:
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        as_of - datetime.timedelta(minutes=5),
        as_of,
    )
    first = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    later = as_of + datetime.timedelta(minutes=10)
    second = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", later, adapter=adapter
    )

    assert first is not None and second is not None
    assert second.id == first.id
    adapter.quote.assert_called_once()  # only the first call hit the network


def test_refreshes_after_refresh_interval_elapses(session: Session) -> None:
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        as_of - datetime.timedelta(minutes=5),
        as_of,
    )
    first = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    later = as_of + REFRESH_INTERVAL + datetime.timedelta(minutes=1)
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14900000.0000",
        later - datetime.timedelta(minutes=5),
        later,
    )

    refreshed = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", later, adapter=adapter
    )

    assert first is not None and refreshed is not None
    assert refreshed.id != first.id
    assert refreshed.buy_price == Decimal("14900000.0000")
    assert adapter.quote.call_count == 2


def test_falls_back_to_cached_quote_when_refresh_fetch_fails(
    session: Session,
) -> None:
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        as_of - datetime.timedelta(minutes=5),
        as_of,
    )
    first = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    later = as_of + REFRESH_INTERVAL + datetime.timedelta(minutes=1)
    adapter.quote.side_effect = RuntimeError("btmc.vn is unreachable")

    result = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", later, adapter=adapter
    )

    # A flaky source must never crash or blank out the view -- the last
    # known-good (now stale) quote is still better than nothing.
    assert first is not None and result is not None
    assert result.id == first.id


def test_returns_none_when_never_cached_and_fetch_fails(session: Session) -> None:
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.side_effect = RuntimeError("btmc.vn is unreachable")

    result = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    assert result is None


def test_falls_back_to_existing_row_when_source_has_not_updated_since_last_refresh(
    session: Session,
) -> None:
    """When REFRESH_INTERVAL elapses but btmc.vn's own page hasn't posted a
    newer "Cap nhat luc" timestamp yet, a refresh attempt would try to
    insert a (instrument, provider, product_code, quoted_at) row that
    already exists -- the unique constraint rejects it, and the code must
    roll back and re-read the existing row rather than raise or return
    None (this is also exactly what a race between two concurrent refresh
    attempts would hit)."""
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    shared_quoted_at = as_of - datetime.timedelta(minutes=5)
    adapter = Mock()
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        shared_quoted_at,
        as_of,
    )
    first = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )

    later = as_of + REFRESH_INTERVAL + datetime.timedelta(minutes=1)
    adapter.quote.return_value = _fresh_quote(
        "BTMC",
        "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
        "14800000.0000",
        shared_quoted_at,  # same source timestamp -- page hasn't updated
        later,
    )

    result = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", later, adapter=adapter
    )

    assert first is not None and result is not None
    assert result.id == first.id
    assert len(session.scalars(select(PriceQuote)).all()) == 1


def test_shared_btmc_provider_and_distinct_instruments_do_not_collide(
    session: Session,
) -> None:
    """The whole point of this module: BTMC/BTMH/DOJI ring&bar and the
    SJC-bar/raw-material rows are all served by ONE btmc.vn-backed
    provider but must resolve to DISTINCT PricingInstrument rows, each
    getting its own price."""
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)
    adapter = Mock()
    adapter.quote.side_effect = [
        _fresh_quote(
            "BTMC",
            "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU",
            "14800000.0000",
            as_of - datetime.timedelta(minutes=5),
            as_of,
        ),
        _fresh_quote(
            "BTMC",
            "VÀNG MIẾNG SJC",
            "14700000.0000",
            as_of - datetime.timedelta(minutes=5),
            as_of,
        ),
    ]

    ring = get_or_refresh_metal_quote(
        session, "BTMC_PLAIN_RING_9999", as_of, adapter=adapter
    )
    sjc = get_or_refresh_metal_quote(
        session, "SJC_GOLD_BAR_9999", as_of, adapter=adapter
    )

    assert ring is not None and sjc is not None
    assert ring.buy_price == Decimal("14800000.0000")
    assert sjc.buy_price == Decimal("14700000.0000")
    assert ring.instrument_id != sjc.instrument_id
    assert ring.provider_id == sjc.provider_id  # same BTMC provider row reused
    assert len(session.scalars(select(PricingProvider)).all()) == 1
    assert len(session.scalars(select(PricingInstrument)).all()) == 2
