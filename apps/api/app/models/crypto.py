"""Crypto holdings and purchase lots.

Asset identity is the CoinGecko coin id (e.g. ``"bitcoin"``), not a closed
enum, so any CoinGecko-listed coin can be held -- not only BTC. Symbols are
not used as identity because they can collide across coins.
"""

from __future__ import annotations

import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import InvalidMoneyValue, money_to_scaled, scaled_to_money
from app.models.base import Base

CRYPTO_QUANTITY_SCALE = 100_000_000


def crypto_quantity_to_scaled(value: Decimal | str | int) -> int:
    if isinstance(value, (float, bool)):
        raise InvalidMoneyValue("quantity must be Decimal, str or int")
    try:
        quantity = value if isinstance(value, Decimal) else Decimal(value)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise InvalidMoneyValue(f"invalid quantity: {value!r}") from exc
    if not quantity.is_finite() or quantity <= 0:
        raise InvalidMoneyValue("quantity must be finite and positive")
    scaled = quantity * CRYPTO_QUANTITY_SCALE
    if scaled != scaled.to_integral_value():
        raise InvalidMoneyValue("crypto quantity supports at most 8 decimal places")
    return int(scaled)


class CryptoHolding(Base):
    __tablename__ = "crypto_holdings"
    id: Mapped[int] = mapped_column(primary_key=True)
    coingecko_id: Mapped[str] = mapped_column(String, nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String)
    pricing_instrument: Mapped[str | None] = mapped_column(String)
    is_net_worth: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("1")
    )
    # User request, 2026-08-26: "không tính vào báo cáo" also applies to
    # newly-added assets -- independent of is_net_worth above (this holding
    # still counts toward Net Worth; it's just left out of income/expense
    # summary reports), so it's its own column rather than reusing that one.
    excluded_from_reports: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    note: Mapped[str | None] = mapped_column(String)
    lots: Mapped[list[CryptoLot]] = relationship(
        back_populates="holding", cascade="all, delete-orphan"
    )


class CryptoLot(Base):
    __tablename__ = "crypto_lots"
    __table_args__ = (
        CheckConstraint("quantity_scaled > 0", name="ck_crypto_lot_quantity_positive"),
        CheckConstraint(
            "purchase_price_scaled >= 0",
            name="ck_crypto_lot_purchase_price_nonnegative",
        ),
        CheckConstraint(
            "total_cost_scaled >= 0", name="ck_crypto_lot_total_cost_nonnegative"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    holding_id: Mapped[int] = mapped_column(
        ForeignKey("crypto_holdings.id"), nullable=False
    )
    quantity_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchase_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    purchase_price_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_cost_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)
    funding_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    financial_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_events.id")
    )
    note: Mapped[str | None] = mapped_column(String)
    holding: Mapped[CryptoHolding] = relationship(back_populates="lots")
    funding_account = relationship("Account")
    financial_event = relationship("FinancialEvent")

    def set_quantity(self, value: Decimal | str | int) -> None:
        self.quantity_scaled = crypto_quantity_to_scaled(value)

    @property
    def quantity(self) -> Decimal:
        return Decimal(self.quantity_scaled) / CRYPTO_QUANTITY_SCALE

    @property
    def purchase_price(self) -> Decimal:
        return scaled_to_money(self.purchase_price_scaled)

    @purchase_price.setter
    def purchase_price(self, value: Decimal | str | int) -> None:
        self.purchase_price_scaled = money_to_scaled(value)

    @property
    def total_cost(self) -> Decimal:
        return scaled_to_money(self.total_cost_scaled)

    @total_cost.setter
    def total_cost(self, value: Decimal | str | int) -> None:
        self.total_cost_scaled = money_to_scaled(value)
