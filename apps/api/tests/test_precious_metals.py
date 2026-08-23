"""Synthetic persistence checks for the shared precious-metals domain."""

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import Float, Integer, Numeric

from app.core.money import InvalidMoneyValue
from app.models.precious_metal import (
    GRAMS_PER_UNIT,
    SUPPORTED_PRECIOUS_METAL_BRANDS,
    PreciousMetalBrand,
    PreciousMetalHolding,
    PreciousMetalLot,
    PreciousMetalQuantityUnit,
    PreciousMetalType,
    quantity_to_grams,
)


def test_conversion_and_brand_mappings_are_domain_data() -> None:
    assert GRAMS_PER_UNIT == {
        PreciousMetalQuantityUnit.GRAM: Decimal(1),
        PreciousMetalQuantityUnit.CHI: Decimal("3.75"),
        PreciousMetalQuantityUnit.LUONG: Decimal("37.5"),
        PreciousMetalQuantityUnit.KILOGRAM: Decimal(1000),
    }
    assert tuple(brand.value for brand in SUPPORTED_PRECIOUS_METAL_BRANDS) == (
        "SJC",
        "BTMC",
        "BTMH",
        "DOJI",
        "PNJ",
        "RAW",
    )


@pytest.mark.parametrize(
    ("unit", "expected"),
    [
        (PreciousMetalQuantityUnit.GRAM, "2.0000"),
        (PreciousMetalQuantityUnit.CHI, "7.5000"),
        (PreciousMetalQuantityUnit.LUONG, "75.0000"),
        (PreciousMetalQuantityUnit.KILOGRAM, "2000.0000"),
    ],
)
def test_exact_canonical_gram_conversions(
    unit: PreciousMetalQuantityUnit, expected: str
) -> None:
    assert quantity_to_grams(Decimal(2), unit) == Decimal(expected)


def test_one_model_supports_gold_and_silver_with_purchase_lots() -> None:
    holding = PreciousMetalHolding(
        metal_type=PreciousMetalType.SILVER,
        brand=PreciousMetalBrand.RAW,
        product_type="Bar",
        pricing_instrument="SILVER_SPOT",
        lots=[],
    )
    holding.purity = Decimal("0.9999")
    lot = PreciousMetalLot(
        holding=holding, purchase_date=datetime.date(2026, 1, 1), funding_account_id=7
    )
    lot.set_quantity(Decimal("2.5"), PreciousMetalQuantityUnit.LUONG)
    lot.purchase_price = Decimal("1234.5678")
    lot.total_cost = Decimal("3086.4195")
    assert lot.canonical_grams == Decimal("93.7500")
    assert lot.holding.metal_type is PreciousMetalType.SILVER
    for name in (
        "quantity_scaled",
        "grams_scaled",
        "purchase_price_scaled",
        "total_cost_scaled",
    ):
        column_type = PreciousMetalLot.__table__.c[name].type
        assert isinstance(column_type, Integer)
        assert not isinstance(column_type, (Float, Numeric))


@pytest.mark.parametrize(
    ("metal_type", "brand", "product_type"),
    [
        (PreciousMetalType.GOLD, PreciousMetalBrand.SJC, "bar"),
        (PreciousMetalType.SILVER, PreciousMetalBrand.RAW, "coin"),
    ],
)
def test_gold_and_silver_share_the_same_holding_contract(
    metal_type: PreciousMetalType,
    brand: PreciousMetalBrand,
    product_type: str,
) -> None:
    holding = PreciousMetalHolding(
        metal_type=metal_type,
        brand=brand,
        product_type=product_type,
        purity_scaled=9_999,
        is_net_worth=False,
        pricing_instrument="METAL_SPOT",
        note="synthetic fixture",
        image_uri="https://example.invalid/metal.png",
    )
    lot = PreciousMetalLot(
        holding=holding,
        purchase_date=datetime.date(2026, 2, 3),
        purchase_price_scaled=12_345_678,
        total_cost_scaled=24_691_356,
    )
    lot.set_quantity("1", PreciousMetalQuantityUnit.LUONG)
    assert lot.canonical_grams == Decimal("37.5000")
    assert lot.purchase_price == Decimal("1234.5678")
    assert lot.total_cost == Decimal("2469.1356")
    assert lot.holding.metal_type is metal_type
    assert lot.holding.brand is brand


def test_quantity_validation_is_atomic_and_reports_invalid_units() -> None:
    lot = PreciousMetalLot()
    lot.set_quantity("2", PreciousMetalQuantityUnit.CHI)
    before = (lot.quantity_scaled, lot.quantity_unit, lot.grams_scaled)
    with pytest.raises(InvalidMoneyValue):
        lot.set_quantity("1.00001", PreciousMetalQuantityUnit.GRAM)
    assert (lot.quantity_scaled, lot.quantity_unit, lot.grams_scaled) == before
    with pytest.raises(InvalidMoneyValue, match="unsupported quantity unit"):
        quantity_to_grams(Decimal(1), "GRAM")  # type: ignore[arg-type]


def test_quantity_and_money_reject_float_or_excess_precision() -> None:
    lot = PreciousMetalLot()
    with pytest.raises(InvalidMoneyValue):
        lot.set_quantity(1.0, PreciousMetalQuantityUnit.CHI)  # type: ignore[arg-type]
    with pytest.raises(InvalidMoneyValue):
        lot.total_cost = Decimal("1.00001")
