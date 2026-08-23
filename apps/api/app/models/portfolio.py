"""Daily net-worth snapshots and their auditable component valuations."""

from __future__ import annotations

import datetime
import enum
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import money_to_scaled, scaled_to_money
from app.models.base import Base
from app.models.pricing import QuoteState


class PortfolioComponentType(str, enum.Enum):
    CASH = "CASH"
    BANK = "BANK"
    EWALLET = "EWALLET"
    SAVINGS = "SAVINGS"
    PRECIOUS_METAL = "PRECIOUS_METAL"
    CRYPTO = "CRYPTO"
    CREDIT_CARD = "CREDIT_CARD"


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("snapshot_date", name="uq_portfolio_snapshot_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    captured_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    net_worth_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)
    components: Mapped[list[PortfolioSnapshotComponent]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )

    @property
    def net_worth(self) -> Decimal:
        return scaled_to_money(self.net_worth_scaled)

    @net_worth.setter
    def net_worth(self, value: Decimal | str | int) -> None:
        self.net_worth_scaled = money_to_scaled(value)


class PortfolioSnapshotComponent(Base):
    __tablename__ = "portfolio_snapshot_components"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id",
            "component_type",
            "source_key",
            name="uq_portfolio_snapshot_component_source",
        ),
        CheckConstraint(
            "(quote_state IS NULL AND quote_provider IS NULL AND quoted_at IS NULL) OR "
            "(quote_state IS NOT NULL AND quote_provider IS NOT NULL "
            "AND quoted_at IS NOT NULL)",
            name="ck_portfolio_component_quote_metadata_complete",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("portfolio_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    component_type: Mapped[PortfolioComponentType] = mapped_column(
        Enum(PortfolioComponentType, native_enum=False), nullable=False
    )
    source_key: Mapped[str] = mapped_column(String, nullable=False)
    value_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quote_state: Mapped[QuoteState | None] = mapped_column(
        Enum(QuoteState, native_enum=False)
    )
    quote_provider: Mapped[str | None] = mapped_column(String)
    quoted_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    snapshot: Mapped[PortfolioSnapshot] = relationship(back_populates="components")

    @property
    def value(self) -> Decimal:
        return scaled_to_money(self.value_scaled)

    @value.setter
    def value(self, amount: Decimal | str | int) -> None:
        self.value_scaled = money_to_scaled(amount)
