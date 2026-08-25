"""Synthetic unit coverage for the TASK-005 ledger service."""

import datetime
from decimal import Decimal

import pytest

from app.models.account import Account, AccountType
from app.models.ledger import FinancialEventType
from app.schemas.ledger import AccountEntryCreate, FinancialEventCreate
from app.services.ledger import (
    InvalidEventEntriesError,
    UnknownAccountError,
    account_balance,
    create_financial_event,
)


class FakeSession:
    def __init__(self, accounts: list[Account]) -> None:
        self.accounts = {account.id: account for account in accounts}
        self.events = []
        self.refreshed = False

    def get(self, model: object, object_id: int) -> object | None:
        if model is Account:
            return self.accounts.get(object_id)
        return None

    def add(self, event: object) -> None:
        self.events.append(event)

    def commit(self) -> None:
        return None

    def refresh(self, event: object) -> None:
        self.refreshed = True

    def scalar(self, statement: object) -> int:
        account_id = statement.compile().params.get("account_id_1")
        return sum(
            entry.amount_scaled
            for event in self.events
            for entry in event.entries
            if entry.account_id == account_id
        )


def account(account_id: int) -> Account:
    return Account(id=account_id, name=f"Synthetic {account_id}", account_type=AccountType.CASH)


def payload(event_type: FinancialEventType, entries: list[AccountEntryCreate], **kwargs: object) -> FinancialEventCreate:
    return FinancialEventCreate(
        event_type=event_type,
        transaction_date=datetime.date(2026, 8, 22),
        entries=entries,
        **kwargs,
    )


def test_creates_ordinary_expense_and_income_without_zero_sum_rule() -> None:
    session = FakeSession([account(1), account(2)])
    expense = create_financial_event(
        session, payload(FinancialEventType.EXPENSE, [AccountEntryCreate(account_id=1, amount=Decimal("-12.3456"))])
    )
    income = create_financial_event(
        session, payload(FinancialEventType.INCOME, [AccountEntryCreate(account_id=2, amount=Decimal(100))])
    )
    assert expense.entries[0].amount_scaled == -123456
    assert income.entries[0].amount_scaled == 1_000_000
    assert len(session.events) == 2


# QA (2026-08-25): a real-database reconciliation pass found one EXPENSE
# event persisted with a positive amount -- nothing server-side enforced
# the sign invariant the frontend composer relies on. This locks it in.
def test_expense_and_income_reject_wrong_sign_and_zero() -> None:
    session = FakeSession([account(1)])

    for bad_amount in (Decimal(1), Decimal(0)):
        with pytest.raises(InvalidEventEntriesError):
            create_financial_event(
                session, payload(FinancialEventType.EXPENSE, [AccountEntryCreate(account_id=1, amount=bad_amount)])
            )
    for bad_amount in (Decimal(-1), Decimal(0)):
        with pytest.raises(InvalidEventEntriesError):
            create_financial_event(
                session, payload(FinancialEventType.INCOME, [AccountEntryCreate(account_id=1, amount=bad_amount)])
            )
    assert session.events == []

    with pytest.raises(InvalidEventEntriesError):
        create_financial_event(session, payload(FinancialEventType.EXPENSE, [
            AccountEntryCreate(account_id=1, amount=Decimal(-1)),
            AccountEntryCreate(account_id=1, amount=Decimal(-1)),
        ]))


def test_preserves_transaction_date_and_nullable_occurred_at() -> None:
    session = FakeSession([account(1)])
    event = create_financial_event(session, payload(FinancialEventType.EXPENSE, [AccountEntryCreate(account_id=1, amount=Decimal(-1))]))
    assert event.transaction_date == datetime.date(2026, 8, 22)
    assert event.occurred_at is None

    occurred = datetime.datetime(2026, 8, 22, 14, 30, tzinfo=datetime.UTC)
    event = create_financial_event(session, payload(FinancialEventType.INCOME, [AccountEntryCreate(account_id=1, amount=Decimal(2))], occurred_at=occurred))
    assert event.occurred_at == occurred


@pytest.mark.parametrize("event_type", [FinancialEventType.TRANSFER])
def test_balanced_pair_events_require_exact_opposite_distinct_entries(event_type: FinancialEventType) -> None:
    session = FakeSession([account(1), account(2)])
    event = create_financial_event(session, payload(event_type, [
        AccountEntryCreate(account_id=1, amount=Decimal("25.1250")),
        AccountEntryCreate(account_id=2, amount=Decimal("-25.1250")),
    ]))
    assert [entry.amount_scaled for entry in event.entries] == [251250, -251250]

    for entries in (
        [AccountEntryCreate(account_id=1, amount=Decimal(1))],
        [AccountEntryCreate(account_id=1, amount=Decimal(1)), AccountEntryCreate(account_id=1, amount=Decimal(-1))],
        [AccountEntryCreate(account_id=1, amount=Decimal(1)), AccountEntryCreate(account_id=2, amount=Decimal("-0.9999"))],
    ):
        with pytest.raises(InvalidEventEntriesError):
            create_financial_event(session, payload(event_type, entries))


def test_credit_card_payment_requires_card_credit_and_funding_debit() -> None:
    session = FakeSession([
        account(1),
        Account(id=2, name="Synthetic card", account_type=AccountType.CREDIT_CARD),
    ])
    event = create_financial_event(
        session,
        payload(FinancialEventType.CREDIT_CARD_PAYMENT, [
            AccountEntryCreate(account_id=1, amount=Decimal(-25)),
            AccountEntryCreate(account_id=2, amount=Decimal(25)),
        ]),
    )
    assert [entry.amount_scaled for entry in event.entries] == [-250000, 250000]

    invalid = (
        [AccountEntryCreate(account_id=1, amount=Decimal(25)), AccountEntryCreate(account_id=2, amount=Decimal(-25))],
        [AccountEntryCreate(account_id=1, amount=Decimal(-25)), AccountEntryCreate(account_id=1, amount=Decimal(25))],
    )
    for entries in invalid:
        with pytest.raises(InvalidEventEntriesError):
            create_financial_event(session, payload(FinancialEventType.CREDIT_CARD_PAYMENT, entries))


def test_unknown_account_is_rejected_before_persisting() -> None:
    session = FakeSession([account(1)])
    with pytest.raises(UnknownAccountError):
        create_financial_event(session, payload(FinancialEventType.EXPENSE, [AccountEntryCreate(account_id=99, amount=Decimal(1))]))
    assert session.events == []


def test_account_balance_sums_scaled_entries_exactly() -> None:
    session = FakeSession([account(1), account(2)])
    create_financial_event(session, payload(FinancialEventType.INCOME, [AccountEntryCreate(account_id=1, amount=Decimal("10.125"))]))
    create_financial_event(session, payload(FinancialEventType.EXPENSE, [AccountEntryCreate(account_id=1, amount=Decimal("-2.125"))]))
    assert account_balance(session, 1) == Decimal("8.0000")
    assert account_balance(session, 2) == Decimal("0.0000")
    assert account_balance(session, 999) is None
