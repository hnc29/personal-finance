"""Focused synthetic coverage for the savings lifecycle actions.

Originally TASK-013; extended by the "Nghiệp vụ gửi tiết kiệm" review to
cover funded deposits, tất toán (normal and early close) ledger settlement,
renewal interest payout vs capitalization, and the lifecycle guards that
reject double-close and invalid renewal.
"""

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
    SavingsTermStatus,
)
from app.services.savings import (
    SavingsActionError,
    add_to_savings,
    calculate_interest,
    close_savings,
    early_close_savings,
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

    def financial_events(self) -> list[object]:
        return [item for item in self.added if hasattr(item, "event_type")]


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
    maturity_action: MaturityAction = MaturityAction.RENEW_PRINCIPAL,
    status: SavingsTermStatus = SavingsTermStatus.ACTIVE,
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
        maturity_action=maturity_action,
        status=status,
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
    assert account.terms[0].status is SavingsTermStatus.ACTIVE

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


def test_open_with_funding_account_debits_it_as_a_deposit_not_an_expense() -> None:
    """BA spec §2.1: gửi tiết kiệm is an asset transfer, not Chi tiêu."""
    session = FakeSession([wallet(1)])

    account = open_savings(
        session,  # type: ignore[arg-type]
        product=SavingsProduct(name="Synthetic product", institution="Example"),
        name="Synthetic savings",
        principal=Decimal(100000000),
        opened_date=datetime.date(2026, 1, 1),
        term_months=12,
        annual_rate=Decimal(6),
        funding_account_id=1,
    )

    (deposit,) = session.financial_events()
    assert deposit.event_type is FinancialEventType.SAVINGS_DEPOSIT  # type: ignore[attr-defined]
    assert deposit.entries[0].amount_scaled == -1_000_000_000_000  # type: ignore[attr-defined]
    assert account.funding_account_id == 1
    assert account.principal == Decimal("100000000.0000")


def test_open_without_funding_account_creates_no_ledger_event() -> None:
    session = FakeSession()
    open_savings(
        session,  # type: ignore[arg-type]
        product=SavingsProduct(name="Synthetic product", institution="Example"),
        name="Unfunded",
        principal=Decimal(1000),
        opened_date=datetime.date(2026, 1, 1),
    )
    assert session.financial_events() == []


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

    deposit, withdrawal = session.financial_events()
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


def test_close_settles_principal_and_actual_interest_as_separate_movements() -> None:
    """BA spec §11.2: only actual interest is Income; principal is not."""
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term(maturity_action=MaturityAction.CLOSE)
    original.account = account
    account.terms.append(original)

    closed = close_savings(
        session,  # type: ignore[arg-type]
        account,
        closed_date=datetime.date(2027, 1, 1),
        receiving_account_id=1,
        actual_interest=Decimal(30),
    )

    withdrawal, interest_event = session.financial_events()
    assert withdrawal.event_type is FinancialEventType.SAVINGS_WITHDRAWAL  # type: ignore[attr-defined]
    assert withdrawal.entries[0].amount_scaled == 10_000_000  # type: ignore[attr-defined]
    assert interest_event.event_type is FinancialEventType.INTEREST  # type: ignore[attr-defined]
    assert interest_event.entries[0].amount_scaled == 300_000  # type: ignore[attr-defined]
    assert closed.status is SavingsAccountStatus.CLOSED
    assert closed.principal == Decimal("0.0000")
    assert original.status is SavingsTermStatus.CLOSED
    assert original.actual_interest == Decimal("30.0000")
    assert original.closed_at == datetime.date(2027, 1, 1)


def test_close_rejects_before_maturity_and_without_a_term() -> None:
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term()
    original.account = account
    account.terms.append(original)

    with pytest.raises(SavingsActionError, match="not reached maturity"):
        close_savings(
            session,  # type: ignore[arg-type]
            account,
            closed_date=datetime.date(2026, 6, 1),
            receiving_account_id=1,
            actual_interest=Decimal(0),
        )

    empty_account = savings_account()
    with pytest.raises(SavingsActionError, match="no term"):
        close_savings(
            session,  # type: ignore[arg-type]
            empty_account,
            closed_date=datetime.date(2025, 12, 31),
            receiving_account_id=1,
            actual_interest=Decimal(0),
        )


def test_double_close_is_rejected() -> None:
    """BA spec §24.5/§33: a closed term cannot be tất toán a second time."""
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term()
    original.account = account
    account.terms.append(original)

    close_savings(
        session,  # type: ignore[arg-type]
        account,
        closed_date=datetime.date(2027, 1, 1),
        receiving_account_id=1,
        actual_interest=Decimal(30),
    )

    with pytest.raises(SavingsActionError, match="closed"):
        close_savings(
            session,  # type: ignore[arg-type]
            account,
            closed_date=datetime.date(2027, 1, 2),
            receiving_account_id=1,
            actual_interest=Decimal(0),
        )


def test_early_close_uses_demand_rate_window_and_records_optional_fee() -> None:
    """BA spec §12: early tất toán before maturity, with an optional fee."""
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term()
    original.account = account
    account.terms.append(original)

    early_close_savings(
        session,  # type: ignore[arg-type]
        account,
        closed_date=datetime.date(2026, 7, 2),
        receiving_account_id=1,
        actual_interest=Decimal(5),
        fee=Decimal(2),
    )

    withdrawal, interest_event, fee_event = session.financial_events()
    assert withdrawal.entries[0].amount_scaled == 10_000_000  # type: ignore[attr-defined]
    assert interest_event.event_type is FinancialEventType.INTEREST  # type: ignore[attr-defined]
    assert interest_event.entries[0].amount_scaled == 50_000  # type: ignore[attr-defined]
    assert fee_event.event_type is FinancialEventType.EXPENSE  # type: ignore[attr-defined]
    assert fee_event.entries[0].amount_scaled == -20_000  # type: ignore[attr-defined]
    assert original.status is SavingsTermStatus.EARLY_CLOSED
    assert account.status is SavingsAccountStatus.CLOSED


def test_early_close_rejects_at_or_after_maturity() -> None:
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term()
    original.account = account
    account.terms.append(original)

    with pytest.raises(SavingsActionError, match="already reached maturity"):
        early_close_savings(
            session,  # type: ignore[arg-type]
            account,
            closed_date=datetime.date(2027, 1, 1),
            receiving_account_id=1,
            actual_interest=Decimal(0),
        )


def test_renewal_rejects_negative_interest_and_preserves_term_history() -> None:
    session = FakeSession([wallet(1)])
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
            receiving_account_id=1,
        )

    renewed = renew_savings(
        session,  # type: ignore[arg-type]
        account,
        start_date=original.maturity_date,
        interest=Decimal(100),
        receiving_account_id=1,
    )
    assert renewed.sequence == 2
    assert renewed.renewed_from is original
    assert renewed.status is SavingsTermStatus.ACTIVE
    assert original.status is SavingsTermStatus.CLOSED
    assert original.actual_interest == Decimal("100.0000")
    assert original.closed_at == original.maturity_date
    assert original.principal == Decimal("1000.0000")
    assert renewed.principal == Decimal("1000.0000")
    assert account.principal == Decimal("1000.0000")


def test_renew_principal_pays_interest_out_and_requires_a_receiving_account() -> None:
    """BA spec §13: renew-principal-only still pays interest as real cash."""
    session = FakeSession([wallet(1)])
    account = savings_account()
    original = term(maturity_action=MaturityAction.RENEW_PRINCIPAL)
    original.account = account
    account.terms.append(original)

    with pytest.raises(SavingsActionError, match="receiving account is required"):
        renew_savings(
            session,  # type: ignore[arg-type]
            account,
            start_date=original.maturity_date,
            interest=Decimal(100),
        )

    renewed = renew_savings(
        session,  # type: ignore[arg-type]
        account,
        start_date=original.maturity_date,
        interest=Decimal(100),
        receiving_account_id=1,
    )
    (interest_event,) = session.financial_events()
    assert interest_event.event_type is FinancialEventType.INTEREST  # type: ignore[attr-defined]
    assert interest_event.entries[0].amount_scaled == 1_000_000  # type: ignore[attr-defined]
    assert renewed.principal == Decimal("1000.0000")
    assert account.principal == Decimal("1000.0000")


def test_renew_principal_and_interest_capitalizes_with_no_ledger_event() -> None:
    """BA spec §14: capitalized interest must not create a fake bank deposit."""
    session = FakeSession()
    account = savings_account()
    original = term(maturity_action=MaturityAction.RENEW_PRINCIPAL_AND_INTEREST)
    original.account = account
    account.terms.append(original)

    renewed = renew_savings(
        session,  # type: ignore[arg-type]
        account,
        start_date=original.maturity_date,
        interest=Decimal(100),
    )

    assert session.financial_events() == []
    assert renewed.principal == Decimal("1100.0000")
    assert account.principal == Decimal("1100.0000")


def test_renewal_rejects_close_only_action_and_already_closed_term() -> None:
    session = FakeSession()
    closing_account = savings_account()
    closing_term = term(maturity_action=MaturityAction.CLOSE)
    closing_term.account = closing_account
    closing_account.terms.append(closing_term)

    with pytest.raises(SavingsActionError, match="does not allow renewal"):
        renew_savings(
            session,  # type: ignore[arg-type]
            closing_account,
            start_date=closing_term.maturity_date,
        )

    already_closed_account = savings_account()
    already_closed_term = term(status=SavingsTermStatus.CLOSED)
    already_closed_term.account = already_closed_account
    already_closed_account.terms.append(already_closed_term)

    with pytest.raises(SavingsActionError, match="already closed"):
        renew_savings(
            session,  # type: ignore[arg-type]
            already_closed_account,
            start_date=already_closed_term.maturity_date,
        )
