"""Persistence boundary for exact, daily portfolio snapshots."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import money_to_scaled, scaled_to_money
from app.models.portfolio import (
    PortfolioComponentType,
    PortfolioSnapshot,
    PortfolioSnapshotComponent,
)
from app.models.pricing import PriceQuote, QuoteState


@dataclass(frozen=True)
class PortfolioComponentValue:
    component_type: PortfolioComponentType
    source_key: str
    value: Decimal
    quote_state: QuoteState | None = None
    quote_provider: str | None = None
    quoted_at: datetime.datetime | None = None

    @classmethod
    def from_quote(
        cls,
        *,
        component_type: PortfolioComponentType,
        source_key: str,
        value: Decimal,
        quote: PriceQuote,
    ) -> PortfolioComponentValue:
        return cls(
            component_type=component_type,
            source_key=source_key,
            value=value,
            quote_state=quote.state,
            quote_provider=quote.provider.code,
            quoted_at=quote.quoted_at,
        )


def calculate_net_worth(components: list[PortfolioComponentValue]) -> Decimal:
    """Calculate net worth from signed asset values and credit liabilities.

    Credit-card values are liabilities and are therefore subtracted by their
    magnitude. Negative values are accepted for compatibility with balance
    projections that already represent an outstanding card balance as a
    negative account balance.
    """
    total = Decimal(0)
    for component in components:
        value = scaled_to_money(money_to_scaled(component.value))
        if component.component_type is PortfolioComponentType.CREDIT_CARD:
            total -= abs(value)
        else:
            total += value
    return total


def persist_daily_snapshot(
    session: Session,
    *,
    snapshot_date: datetime.date,
    captured_at: datetime.datetime,
    components: list[PortfolioComponentValue],
) -> PortfolioSnapshot:
    """Insert one immutable daily snapshot and propagate valuation quote metadata."""
    if captured_at.tzinfo is None or captured_at.utcoffset() is None:
        raise ValueError("captured_at must be timezone-aware")
    if captured_at.date() < snapshot_date:
        raise ValueError("captured_at cannot precede snapshot_date")
    if session.scalar(
        select(PortfolioSnapshot.id).where(
            PortfolioSnapshot.snapshot_date == snapshot_date
        )
    ) is not None:
        raise ValueError(f"snapshot already exists for {snapshot_date.isoformat()}")

    seen: set[tuple[PortfolioComponentType, str]] = set()
    rows: list[PortfolioSnapshotComponent] = []
    for component in components:
        key = (component.component_type, component.source_key)
        if not component.source_key or key in seen:
            raise ValueError("snapshot component sources must be non-empty and unique")
        seen.add(key)
        metadata = (
            component.quote_state,
            component.quote_provider,
            component.quoted_at,
        )
        if any(value is None for value in metadata) != all(
            value is None for value in metadata
        ):
            raise ValueError("quote state, provider and timestamp must be supplied together")
        if component.quoted_at is not None:
            if component.quoted_at.tzinfo is None or component.quoted_at.utcoffset() is None:
                raise ValueError("quoted_at must be timezone-aware")
            if component.quoted_at > captured_at:
                raise ValueError("quoted_at cannot be after captured_at")

        value_scaled = money_to_scaled(component.value)
        rows.append(
            PortfolioSnapshotComponent(
                component_type=component.component_type,
                source_key=component.source_key,
                value_scaled=value_scaled,
                quote_state=component.quote_state,
                quote_provider=component.quote_provider,
                quoted_at=component.quoted_at,
            )
        )

    snapshot = PortfolioSnapshot(
        snapshot_date=snapshot_date,
        captured_at=captured_at,
        net_worth_scaled=money_to_scaled(calculate_net_worth(components)),
        components=rows,
    )
    session.add(snapshot)
    session.flush()
    return snapshot
