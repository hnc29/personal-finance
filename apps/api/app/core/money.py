"""Fixed-point money primitives.

Money is represented in the application/API layer as :class:`decimal.Decimal`
and persisted as an ``int`` scaled by :data:`MONEY_SCALE` (10,000), i.e. with a
fixed precision of 4 decimal places. Conversions are exact in both directions;
values are never silently rounded, and Python ``float`` is never accepted.
"""

from decimal import Decimal, InvalidOperation

MONEY_SCALE = 10_000
MONEY_DECIMAL_PLACES = 4


class InvalidMoneyValue(ValueError):
    """Raised when a value cannot be represented exactly as fixed-point money."""


def money_to_scaled(value: Decimal | str | int) -> int:
    """Convert a Decimal, str or int money value to its scaled integer form.

    Rejects ``float`` and ``bool`` inputs, non-finite Decimals, unparseable
    numeric strings, and any value with more than four decimal places.
    """
    # ``bool`` is a subclass of ``int`` but is not a money value.
    if isinstance(value, bool):
        raise InvalidMoneyValue(f"bool is not a valid money value: {value!r}")

    if isinstance(value, float):
        raise InvalidMoneyValue(
            "float is not allowed for money; use Decimal, str or int"
        )

    if isinstance(value, int):
        dec = Decimal(value)
    elif isinstance(value, Decimal):
        dec = value
    elif isinstance(value, str):
        try:
            dec = Decimal(value)
        except InvalidOperation as exc:
            raise InvalidMoneyValue(f"invalid numeric string: {value!r}") from exc
    else:
        raise InvalidMoneyValue(
            f"unsupported type for money: {type(value).__name__}"
        )

    sign, digits, exponent = dec.as_tuple()
    # A non-int exponent ('n'/'N'/'F') marks a non-finite Decimal (NaN/Infinity).
    if not isinstance(exponent, int):
        raise InvalidMoneyValue(f"non-finite value is not valid money: {value!r}")

    if exponent < -MONEY_DECIMAL_PLACES:
        raise InvalidMoneyValue(
            f"money supports at most {MONEY_DECIMAL_PLACES} decimal places: "
            f"{value!r}"
        )

    # Exact integer scaling (exponent >= -4, so the power of ten is >= 0).
    coefficient = int("".join(str(d) for d in digits))
    scaled = coefficient * 10 ** (exponent + MONEY_DECIMAL_PLACES)
    return -scaled if sign else scaled


def scaled_to_money(value: int) -> Decimal:
    """Convert a scaled integer back to its exact Decimal money value."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise InvalidMoneyValue(
            f"scaled money must be an int: {type(value).__name__}"
        )

    sign = 0 if value >= 0 else 1
    digits = tuple(int(c) for c in str(abs(value)))
    return Decimal((sign, digits, -MONEY_DECIMAL_PLACES))
