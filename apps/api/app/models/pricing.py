"""Canonical pricing instruments, providers, and immutable quote history."""

from __future__ import annotations

import datetime
import enum
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import money_to_scaled, scaled_to_money
from app.models.base import Base


class QuoteState(str, enum.Enum):
    LIVE = "LIVE"
    STALE = "STALE"
    MANUAL = "MANUAL"
    UNAVAILABLE = "UNAVAILABLE"


class QuoteMatchLevel(str, enum.Enum):
    EXACT = "EXACT"
    PRODUCT = "PRODUCT"
    INSTRUMENT = "INSTRUMENT"
    NONE = "NONE"


class PricingAssetType(str, enum.Enum):
    PRECIOUS_METAL = "PRECIOUS_METAL"
    CRYPTO = "CRYPTO"


class PricingInstrument(Base):
    __tablename__ = "pricing_instruments"
    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    asset_type: Mapped[PricingAssetType] = mapped_column(
        Enum(PricingAssetType, native_enum=False), nullable=False
    )
    display_name: Mapped[str | None] = mapped_column(String)
    quotes: Mapped[list[PriceQuote]] = relationship(back_populates="instrument")


class PricingProvider(Base):
    __tablename__ = "pricing_providers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    quotes: Mapped[list[PriceQuote]] = relationship(back_populates="provider")


class PriceQuote(Base):
    __tablename__ = "price_quotes"
    __table_args__ = (
        UniqueConstraint(
            "instrument_id",
            "provider_id",
            "product_code",
            "quoted_at",
            name="uq_price_quote_history",
        ),
        CheckConstraint(
            "buy_price_scaled IS NULL OR buy_price_scaled >= 0",
            name="ck_price_quote_buy_nonnegative",
        ),
        CheckConstraint(
            "sell_price_scaled IS NULL OR sell_price_scaled >= 0",
            name="ck_price_quote_sell_nonnegative",
        ),
        CheckConstraint(
            "(state = 'UNAVAILABLE' AND buy_price_scaled IS NULL "
            "AND sell_price_scaled IS NULL) OR "
            "(state != 'UNAVAILABLE' AND buy_price_scaled IS NOT NULL)",
            name="ck_price_quote_state_prices",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("pricing_instruments.id"), nullable=False
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("pricing_providers.id"), nullable=False
    )
    product_code: Mapped[str] = mapped_column(String, nullable=False)
    match_level: Mapped[QuoteMatchLevel] = mapped_column(
        Enum(QuoteMatchLevel, native_enum=False), nullable=False
    )
    state: Mapped[QuoteState] = mapped_column(
        Enum(QuoteState, native_enum=False), nullable=False
    )
    quoted_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    observed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    buy_price_scaled: Mapped[int | None] = mapped_column(BigInteger)
    sell_price_scaled: Mapped[int | None] = mapped_column(BigInteger)
    source_metadata: Mapped[str | None] = mapped_column(String)
    instrument: Mapped[PricingInstrument] = relationship(back_populates="quotes")
    provider: Mapped[PricingProvider] = relationship(back_populates="quotes")

    @property
    def buy_price(self) -> Decimal | None:
        return (
            None
            if self.buy_price_scaled is None
            else scaled_to_money(self.buy_price_scaled)
        )

    @buy_price.setter
    def buy_price(self, value: Decimal | str | int | None) -> None:
        self.buy_price_scaled = None if value is None else money_to_scaled(value)

    @property
    def sell_price(self) -> Decimal | None:
        return (
            None
            if self.sell_price_scaled is None
            else scaled_to_money(self.sell_price_scaled)
        )

    @sell_price.setter
    def sell_price(self, value: Decimal | str | int | None) -> None:
        self.sell_price_scaled = None if value is None else money_to_scaled(value)

    @property
    def valuation_price(self) -> Decimal | None:
        """Dealer BUY price is the only price valid for current valuation."""
        if self.state is QuoteState.UNAVAILABLE:
            return None
        return self.buy_price


@event.listens_for(PriceQuote, "before_update")
@event.listens_for(PriceQuote, "before_delete")
def _reject_historical_quote_mutation(*_args: object) -> None:
    raise ValueError("historical quotes are append-only")
