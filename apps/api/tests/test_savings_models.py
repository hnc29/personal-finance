"""Synthetic persistence checks for the TASK-013 savings domain."""

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import Float, Integer, Numeric

from app.core.money import InvalidMoneyValue
from app.models import (
    DayCountConvention,
    InterestPaymentMethod,
    MaturityAction,
    SavingsAccount,
    SavingsProduct,
    SavingsTerm,
)


def test_savings_values_use_exact_scaled_integers() -> None:
    account = SavingsAccount(
        product=SavingsProduct(name="Synthetic", institution="Example"),
        name="Deposit",
        opened_date=datetime.date(2026, 1, 1),
    )
    account.principal = Decimal("1000000.1234")
    term = SavingsTerm(
        account=account,
        sequence=1,
        start_date=datetime.date(2026, 1, 1),
        maturity_date=datetime.date(2027, 1, 1),
        term_months=12,
        day_count_convention=DayCountConvention.ACTUAL_365,
        interest_payment_method=InterestPaymentMethod.AT_MATURITY,
        maturity_action=MaturityAction.RENEW_PRINCIPAL,
    )
    term.principal = account.principal
    term.annual_rate = Decimal("5.2500")
    term.non_term_rate = Decimal("0.1000")

    assert account.principal_scaled == 10_000_001_234
    assert term.principal == Decimal("1000000.1234")
    assert term.annual_rate == Decimal("5.2500")
    for name in ("principal_scaled", "annual_rate_scaled", "non_term_rate_scaled"):
        column_type = SavingsTerm.__table__.c[name].type
        assert isinstance(column_type, Integer)
        assert not isinstance(column_type, (Float, Numeric))


def test_savings_fixed_precision_rejects_float_and_excess_precision() -> None:
    term = SavingsTerm()
    with pytest.raises(InvalidMoneyValue):
        term.annual_rate = 5.25  # type: ignore[assignment]
    with pytest.raises(InvalidMoneyValue):
        term.non_term_rate = Decimal("0.12345")


def test_rollover_is_a_self_referencing_term_history_link() -> None:
    renewed_from = SavingsTerm.__table__.c.renewed_from_term_id
    foreign_key = next(iter(renewed_from.foreign_keys))
    assert foreign_key.column.table.name == "savings_terms"
    assert foreign_key.column.name == "id"
    assert renewed_from.unique is True
