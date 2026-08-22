from decimal import Decimal

import pytest

from app.core.money import InvalidMoneyValue, money_to_scaled, scaled_to_money


def test_integer_one_million() -> None:
    assert money_to_scaled(1_000_000) == 10_000_000_000


def test_fractional_string() -> None:
    assert money_to_scaled("1088867.41") == 10_888_674_100


def test_negative_value() -> None:
    assert money_to_scaled("-1803566.59") == -18_035_665_900


def test_exact_decimal_round_trip() -> None:
    original = Decimal("1088867.41")

    assert scaled_to_money(money_to_scaled(original)) == original


def test_string_round_trip() -> None:
    scaled = money_to_scaled("-1803566.59")

    assert scaled_to_money(scaled) == Decimal("-1803566.59")


def test_zero() -> None:
    assert money_to_scaled(0) == 0
    assert money_to_scaled("0") == 0
    assert money_to_scaled(Decimal(0)) == 0
    assert scaled_to_money(0) == Decimal(0)


def test_minimum_precision() -> None:
    assert money_to_scaled("0.0001") == 1
    assert scaled_to_money(1) == Decimal("0.0001")


def test_float_rejected() -> None:
    with pytest.raises(InvalidMoneyValue):
        money_to_scaled(1.5)

    with pytest.raises(InvalidMoneyValue):
        money_to_scaled(1_000_000.0)


def test_more_than_four_decimals_rejected() -> None:
    with pytest.raises(InvalidMoneyValue):
        money_to_scaled("1.00001")

    with pytest.raises(InvalidMoneyValue):
        money_to_scaled(Decimal("1.23456"))


def test_invalid_string_rejected() -> None:
    with pytest.raises(InvalidMoneyValue):
        money_to_scaled("abc")

    with pytest.raises(InvalidMoneyValue):
        money_to_scaled("")
