"""Focused synthetic coverage for TASK-013 savings lifecycle actions."""

import datetime
from decimal import Decimal

import pytest

from app.models.account import Account, AccountType
from app.models.ledger import FinancialEventType
from app.models.savings import (
    DayCountConvention,
    InterestPaymentMethod,
    MaturityAction,
    SavingsAccount,
    SavingsAccountStatus,
    SavingsProduct,
    SavingsTerm,
)
from app.services.savings import (
    SavingsActionError,
    add_to_savings,
    calculate_interest,
    close_savings,
    open_savings,
    partial_withdraw,
    renew_savings,
)


class FakeSession:
    def __init__(self, accounts: list[Account] | None = None) -> None:
        self.accounts = {account.id: account for account in accounts or []}
        self.added: list[object] = []

    def get(self, model: object, object_id: int) -> object | None:
        if model is Account:
            return self.accounts.get(object_id)
        return None

    def add(self, value: object) -> None:
        self.added.append(value)

    def commit(self) -> None:
        return None

    def refresh(self, value: object) -> None:
        return None


def wallet(account_id: int) -> Account:
    return Account(
        id=account_id,
        name=f"Synthetic wallet {account_id}",
        account_type=AccountType.BANK,
    )


def savings_account(*, principal: str = "1000") -> SavingsAccount:
    return SavingsAccount(
        product=SavingsProduct(name="Synthetic product", institution="Example"),
        name="Synthetic savings",
        principal=Decimal(principal),
        opened_date=datetime.date(2026, 1, 1),
        status=SavingsAccountStatus.OPEN,
        terms=[],
    )


def term(
    *,
    convention: DayCountConvention = DayCountConvention.ACTUAL_365,
) -> SavingsTerm:
    return SavingsTerm(
        sequence=1,
        principal=Decimal(1000),
        start_date=datetime.date(2026, 1, 1),
        maturity_date=datetime.date(2027, 1, 1),
        term_months=12,
        annual_rate=Decimal(10),
        non_term_rate=Decimal(1),
        day_count_convention=convention,
        interest_payment_method=InterestPaymentMethod.AT_MATURITY,
        maturity_action=MaturityAction.RENEW_PRINCIPAL,
    )


def test_open_term_clamps_month_end_and_rejects_negative_rates() -> None:
    session = FakeSession()
    account = open_savings(
        session,  # type: ignore[arg-type]
        product=SavingsProduct(name="Synthetic product", institution="Example"),
        name="Synthetic savings",
        principal=Decimal("1000.1234"),
        opened_date=datetime.date(2026, 1, 31),
        term_months=1,
        annual_rate=Decimal("5.25"),
        non_term_rate=Decimal("0.1"),
    )

    assert account.principal == Decimal("1000.1234")
    assert account.terms[0].maturity_date == datetime.date(2026, 2, 28)

    with pytest.raises(SavingsActionError, match="rates must not be negative"):
        open_savings(
            session,  # type: ignore[arg-type]
            product=SavingsProduct(name="Synthetic product", institution="Example"),
            name="Invalid savings",
            principal=Decimal(1000),
            opened_date=datetime.date(2026, 1, 1),
            term_months=1,
            annual_rate=Decimal(-1),
        )


def test_deposit_and_withdrawal_are_asset_movements_not_expenses() -> None:
    session = FakeSession([wallet(1), wallet(2)])
    account = savings_account()

    add_to_savings(
        session,  # type: ignore[arg-type]
        account,
        Decimal("250.1250"),
        source_account_id=1,
        transaction_date=datetime.date(2026, 2, 1),
    )
    partial_withdraw(
        session,  # type: ignore[arg-type]
        account,
        Decimal("100.1250"),
        destination_account_id=2,
        as_of=datetime.date(2026, 2, 2),
    )

    deposit, withdrawal = session.added
    assert deposit.event_type is FinancialEventType.SAVINGS_DEPOSIT  # type: ignore[attr-defined]
    assert deposit.entries[0].amount_scaled == -2_501_250  # type: ignore[attr-defined]
    assert withdrawal.event_type is FinancialEventType.SAVINGS_WITHDRAWAL  # type: ignore[attr-defined]
    assert withdrawal.entries[0].amount_scaled == 1_001_250  # type: ignore[attr-defined]
    assert account.principal == Decimal("1150.0000")


def test_interest_uses_non_term_rate_before_maturity_and_term_rate_at_maturity() -> (
    None
):
    savings_term = term()

    assert calculate_interest(
        savings_term, end_date=datetime.date(2026, 7, 2)
    ) == Decimal("4.9863")
    assert calculate_interest(savings_term) == Decimal("100.0000")


def test_thirty_360_interest_is_exact_decimal() -> None:
    savings_term = term(convention=DayCountConvention.THIRTY_360)

    assert calculate_interest(
        savings_term, end_date=datetime.date(2027, 1, 1)
    ) == Decimal("100.0000")


def test_close_rejects_date_before_opening_without_mutating_account() -> None:
    session = FakeSession()
    account = savings_account()

    with pytest.raises(SavingsActionError, match="precedes opening date"):
        close_savings(
            session,  # type: ignore[arg-type]
            account,
            closed_date=datetime.date(2025, 12, 31),
        )

    assert account.status is SavingsAccountStatus.OPEN
    assert account.closed_date is None


def test_renewal_rejects_negative_interest_and_preserves_term_history() -> None:
    session = FakeSession()
    account = savings_account()
    original = term()
    original.account = account
    account.terms.append(original)

    with pytest.raises(SavingsActionError, match="interest must not be negative"):
        renew_savings(
            session,  # type: ignore[arg-type]
            account,
            start_date=original.maturity_date,
            interest=Decimal(-1),
        )

    renewed = renew_savings(
        session,  # type: ignore[arg-type]
        account,
        start_date=original.maturity_date,
        interest=Decimal(100),
    )
    assert renewed.sequence == 2
    assert renewed.renewed_from is original
    assert original.principal == Decimal("1000.0000")
    assert renewed.principal == Decimal("1000.0000")
    assert account.principal == Decimal("1000.0000")


def test_renewal_honors_maturity_action() -> None:
    session = FakeSession()
    account = savings_account()
    original = term()
    original.account = account
    original.maturity_action = MaturityAction.RENEW_PRINCIPAL_AND_INTEREST
    account.terms.append(original)

    renewed = renew_savings(
        session,  # type: ignore[arg-type]
        account,
        start_date=original.maturity_date,
        interest=Decimal(100),
    )

    assert renewed.principal == Decimal("1100.0000")
    assert account.principal == Decimal("1100.0000")

    closing_account = savings_account()
    closing_term = term()
    closing_term.account = closing_account
    closing_term.maturity_action = MaturityAction.CLOSE
    closing_account.terms.append(closing_term)

    with pytest.raises(SavingsActionError, match="does not allow renewal"):
        renew_savings(
            session,  # type: ignore[arg-type]
            closing_account,
            start_date=closing_term.maturity_date,
        )
