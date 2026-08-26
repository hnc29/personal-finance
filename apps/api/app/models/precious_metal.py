"""Shared gold and silver holding and purchase-lot persistence."""

from __future__ import annotations

import datetime
import enum
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from types import MappingProxyType
from typing import Final

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import InvalidMoneyValue, money_to_scaled, scaled_to_money
from app.models.base import Base


class PreciousMetalType(str, enum.Enum):
    GOLD = "GOLD"
    SILVER = "SILVER"


class PreciousMetalBrand(str, enum.Enum):
    SJC = "SJC"
    BTMC = "BTMC"
    BTMH = "BTMH"
    DOJI = "DOJI"
    PNJ = "PNJ"
    RAW = "RAW"


class PreciousMetalQuantityUnit(str, enum.Enum):
    GRAM = "GRAM"
    CHI = "CHI"
    LUONG = "LUONG"
    KILOGRAM = "KILOGRAM"


SUPPORTED_PRECIOUS_METAL_BRANDS: Final[tuple[PreciousMetalBrand, ...]] = tuple(
    PreciousMetalBrand
)

GRAMS_PER_UNIT: Final[Mapping[PreciousMetalQuantityUnit, Decimal]] = MappingProxyType(
    {
        PreciousMetalQuantityUnit.GRAM: Decimal(1),
        PreciousMetalQuantityUnit.CHI: Decimal("3.75"),
        PreciousMetalQuantityUnit.LUONG: Decimal("37.5"),
        PreciousMetalQuantityUnit.KILOGRAM: Decimal(1000),
    }
)


def quantity_to_grams(
    quantity: Decimal | str | int, unit: PreciousMetalQuantityUnit
) -> Decimal:
    if not isinstance(unit, PreciousMetalQuantityUnit):
        raise InvalidMoneyValue(f"unsupported quantity unit: {unit!r}")
    if isinstance(quantity, (float, bool)):
        raise InvalidMoneyValue("quantity must be Decimal, str or int")
    try:
        value = quantity if isinstance(quantity, Decimal) else Decimal(quantity)
    except InvalidOperation as exc:
        raise InvalidMoneyValue(f"invalid quantity: {quantity!r}") from exc
    if not value.is_finite() or value <= 0:
        raise InvalidMoneyValue("quantity must be finite and positive")
    return scaled_to_money(money_to_scaled(value * GRAMS_PER_UNIT[unit]))


class PreciousMetalHolding(Base):
    __tablename__ = "precious_metal_holdings"
    __table_args__ = (
        CheckConstraint(
            "purity_scaled > 0 AND purity_scaled <= 10000",
            name="ck_precious_holding_purity_range",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    metal_type: Mapped[PreciousMetalType] = mapped_column(
        Enum(PreciousMetalType, native_enum=False), nullable=False
    )
    brand: Mapped[PreciousMetalBrand] = mapped_column(
        Enum(PreciousMetalBrand, native_enum=False), nullable=False
    )
    product_type: Mapped[str] = mapped_column(String, nullable=False)
    purity_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
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
    image_uri: Mapped[str | None] = mapped_column(String)
    lots: Mapped[list[PreciousMetalLot]] = relationship(
        back_populates="holding", cascade="all, delete-orphan"
    )

    @property
    def purity(self) -> Decimal:
        return scaled_to_money(self.purity_scaled)

    @purity.setter
    def purity(self, value: Decimal | str | int) -> None:
        self.purity_scaled = money_to_scaled(value)


class PreciousMetalLot(Base):
    __tablename__ = "precious_metal_lots"
    __table_args__ = (
        CheckConstraint(
            "quantity_scaled > 0", name="ck_precious_lot_quantity_positive"
        ),
        CheckConstraint("grams_scaled > 0", name="ck_precious_lot_grams_positive"),
        CheckConstraint(
            "purchase_price_scaled >= 0",
            name="ck_precious_lot_purchase_price_nonnegative",
        ),
        CheckConstraint(
            "total_cost_scaled >= 0", name="ck_precious_lot_total_cost_nonnegative"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    holding_id: Mapped[int] = mapped_column(
        ForeignKey("precious_metal_holdings.id"), nullable=False
    )
    quantity_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_unit: Mapped[PreciousMetalQuantityUnit] = mapped_column(
        Enum(PreciousMetalQuantityUnit, native_enum=False), nullable=False
    )
    grams_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    purchase_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    purchase_price_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cost_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    funding_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    note: Mapped[str | None] = mapped_column(String)
    image_uri: Mapped[str | None] = mapped_column(String)
    holding: Mapped[PreciousMetalHolding] = relationship(back_populates="lots")
    funding_account = relationship("Account")

    def set_quantity(
        self, quantity: Decimal | str | int, unit: PreciousMetalQuantityUnit
    ) -> None:
        quantity_scaled = money_to_scaled(quantity)
        grams_scaled = money_to_scaled(quantity_to_grams(quantity, unit))
        self.quantity_scaled = quantity_scaled
        self.quantity_unit = unit
        self.grams_scaled = grams_scaled

    @property
    def quantity(self) -> Decimal:
        return scaled_to_money(self.quantity_scaled)

    @property
    def canonical_grams(self) -> Decimal:
        return scaled_to_money(self.grams_scaled)

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
