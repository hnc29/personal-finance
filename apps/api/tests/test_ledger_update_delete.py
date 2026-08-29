"""Service-layer coverage for TASK-042's edit/delete-transaction feature.

The user's request: transaction details should show the category at its
most specific (leaf) level, and add view/edit/delete for transactions
("thiết kế thêm tính năng xem chi tiết, chỉnh sửa, xoá giao dịch"). This
file covers the edit/delete half at the service layer.

Runs Alembic against a disposable temp-file SQLite database (never
``data/finance.db``), matching the pattern established by
``tests/test_moneylover_apply.py`` -- deliberately NOT the ``FakeSession``
mock used by ``tests/test_ledger_service.py``, because the behavior under
test here is real-schema-dependent in a way a mock cannot exercise: the app
enables ``PRAGMA foreign_keys=ON`` on every connection, so deleting a
``financial_events`` row while an ``account_entries`` row still references
it fails the foreign-key check unless the entries are deleted first (or, as
implemented here, via the ORM's ``delete-orphan`` cascade). That ordering
is exactly the kind of real-SQLite behavior TASK-040 found a scratch/mock
database silently never exercises.
"""

import os
import subprocess
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.schemas.ledger import (
    AccountEntryCreate,
    FinancialEventCreate,
    FinancialEventUpdate,
)
from app.services.ledger import (
    InvalidEventEntriesError,
    UnknownAccountError,
    create_financial_event,
    delete_financial_event,
    update_financial_event,
)


@pytest.fixture
def session(tmp_path: Path) -> Session:
    database_path = tmp_path / "synthetic-ledger-update-delete.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as database_session:
        database_session.execute(text("PRAGMA foreign_keys=ON"))
        yield database_session
    engine.dispose()


@pytest.fixture
def accounts(session: Session) -> dict[str, Account]:
    wallet = Account(name="Wallet", account_type=AccountType.CASH)
    bank = Account(name="Bank", account_type=AccountType.BANK)
    card = Account(name="Card", account_type=AccountType.CREDIT_CARD)
    session.add_all([wallet, bank, card])
    session.commit()
    return {"wallet": wallet, "bank": bank, "card": card}


@pytest.fixture
def categories(session: Session) -> dict[str, Category]:
    food = Category(name="Food & Drinks")
    eating_out = Category(name="Eating Out", parent=food)
    salary = Category(name="Salary")
    session.add_all([food, eating_out, salary])
    session.commit()
    return {"food": food, "eating_out": eating_out, "salary": salary}


def _entry_count(session: Session, event_id: int) -> int:
    return session.scalar(
        select(func.count(AccountEntry.id)).where(AccountEntry.financial_event_id == event_id)
    )


def test_update_expense_replaces_amount_account_and_category(
    session: Session, accounts: dict[str, Account], categories: dict[str, Category]
) -> None:
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            category_id=categories["food"].id,
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-50000))],
        ),
    )
    old_entry_id = event.entries[0].id

    updated = update_financial_event(
        session,
        event.id,
        FinancialEventUpdate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 21),
            category_id=categories["eating_out"].id,
            payee_text="Quán phở",
            entries=[AccountEntryCreate(account_id=accounts["bank"].id, amount=Decimal(-75000))],
        ),
    )

    assert updated is not None
    assert updated.transaction_date == date(2026, 8, 21)
    assert updated.category_id == categories["eating_out"].id
    assert updated.payee_text == "Quán phở"
    assert len(updated.entries) == 1
    assert updated.entries[0].account_id == accounts["bank"].id
    assert updated.entries[0].amount_scaled == -750_000_000
    # The old entry must actually be gone from the table, not just
    # unreferenced by the Python object -- this is the delete-orphan
    # cascade under real SQLite FK enforcement, not a mock.
    assert _entry_count(session, event.id) == 1
    assert session.get(AccountEntry, old_entry_id) is None


def test_excluded_from_reports_defaults_false_and_is_editable(
    session: Session, accounts: dict[str, Account], categories: dict[str, Category]
) -> None:
    """User request, 2026-08-26: "không tính vào báo cáo đối với giao dịch
    nhập mới ... Cho phép chỉnh sửa giá trị này ở các menu chỉnh sửa giao
    dịch" -- opt-in at creation, editable afterwards via the transaction-edit
    flow (update_financial_event), independent of every other field."""
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            category_id=categories["food"].id,
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-50000))],
        ),
    )
    assert event.excluded_from_reports is False

    excluded_event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            category_id=categories["food"].id,
            excluded_from_reports=True,
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-10000))],
        ),
    )
    assert excluded_event.excluded_from_reports is True

    updated = update_financial_event(
        session,
        event.id,
        FinancialEventUpdate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            category_id=categories["food"].id,
            excluded_from_reports=True,
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-50000))],
        ),
    )
    assert updated is not None
    assert updated.excluded_from_reports is True

    unset_again = update_financial_event(
        session,
        event.id,
        FinancialEventUpdate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            category_id=categories["food"].id,
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-50000))],
        ),
    )
    assert unset_again is not None
    assert unset_again.excluded_from_reports is False


def test_update_transfer_replaces_both_entries_with_no_leftover_rows(
    session: Session, accounts: dict[str, Account]
) -> None:
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.TRANSFER,
            transaction_date=date(2026, 8, 20),
            entries=[
                AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-100000)),
                AccountEntryCreate(account_id=accounts["bank"].id, amount=Decimal(100000)),
            ],
        ),
    )
    assert _entry_count(session, event.id) == 2

    updated = update_financial_event(
        session,
        event.id,
        FinancialEventUpdate(
            event_type=FinancialEventType.TRANSFER,
            transaction_date=date(2026, 8, 20),
            entries=[
                AccountEntryCreate(account_id=accounts["bank"].id, amount=Decimal(-200000)),
                AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(200000)),
            ],
        ),
    )

    assert updated is not None
    scaled_by_account = {e.account_id: e.amount_scaled for e in updated.entries}
    assert scaled_by_account == {accounts["bank"].id: -2_000_000_000, accounts["wallet"].id: 2_000_000_000}
    assert _entry_count(session, event.id) == 2
    # No orphaned account_entries rows anywhere in the table -- exactly 2,
    # belonging to this event, not 4 (2 old + 2 new).
    total = session.scalar(select(func.count(AccountEntry.id)))
    assert total == 2


def test_update_unknown_event_returns_none(session: Session, accounts: dict[str, Account]) -> None:
    result = update_financial_event(
        session,
        999,
        FinancialEventUpdate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-1))],
        ),
    )
    assert result is None


def test_update_unknown_account_raises(session: Session, accounts: dict[str, Account]) -> None:
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-1))],
        ),
    )
    with pytest.raises(UnknownAccountError):
        update_financial_event(
            session,
            event.id,
            FinancialEventUpdate(
                event_type=FinancialEventType.EXPENSE,
                transaction_date=date(2026, 8, 20),
                entries=[AccountEntryCreate(account_id=999, amount=Decimal(-1))],
            ),
        )
    # Rejected before persisting -- the original entry must survive untouched.
    assert _entry_count(session, event.id) == 1


def test_update_invalid_balanced_pair_raises_and_keeps_original_entries(
    session: Session, accounts: dict[str, Account]
) -> None:
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.TRANSFER,
            transaction_date=date(2026, 8, 20),
            entries=[
                AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-1)),
                AccountEntryCreate(account_id=accounts["bank"].id, amount=Decimal(1)),
            ],
        ),
    )
    with pytest.raises(InvalidEventEntriesError):
        update_financial_event(
            session,
            event.id,
            FinancialEventUpdate(
                event_type=FinancialEventType.TRANSFER,
                transaction_date=date(2026, 8, 20),
                # same account on both legs -- violates the two-distinct-account rule
                entries=[
                    AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-1)),
                    AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(1)),
                ],
            ),
        )
    assert _entry_count(session, event.id) == 2


@pytest.mark.parametrize(
    "event_type",
    [
        FinancialEventType.ADJUSTMENT,
        FinancialEventType.INTEREST,
        FinancialEventType.SAVINGS_DEPOSIT,
        FinancialEventType.SAVINGS_WITHDRAWAL,
        FinancialEventType.ASSET_PURCHASE,
        FinancialEventType.ASSET_SALE,
    ],
)
def test_update_any_event_type_succeeds(
    session: Session, accounts: dict[str, Account], event_type: FinancialEventType
) -> None:
    event = FinancialEvent(
        event_type=event_type,
        transaction_date=date(2026, 8, 20),
        entries=[AccountEntry(account_id=accounts["wallet"].id, amount_scaled=-10000)],
    )
    session.add(event)
    session.commit()

    updated = update_financial_event(
        session,
        event.id,
        FinancialEventUpdate(
            event_type=event_type,
            transaction_date=date(2026, 8, 21),
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-1))],
        ),
    )
    assert updated is not None
    assert updated.transaction_date == date(2026, 8, 21)
    assert _entry_count(session, event.id) == 1


def test_delete_expense_removes_event_and_its_entry(session: Session, accounts: dict[str, Account]) -> None:
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.EXPENSE,
            transaction_date=date(2026, 8, 20),
            entries=[AccountEntryCreate(account_id=accounts["wallet"].id, amount=Decimal(-50000))],
        ),
    )
    entry_id = event.entries[0].id

    assert delete_financial_event(session, event.id) is True
    assert session.get(FinancialEvent, event.id) is None
    assert session.get(AccountEntry, entry_id) is None


def test_delete_credit_card_payment_removes_both_entries_under_fk_enforcement(
    session: Session, accounts: dict[str, Account]
) -> None:
    """The real crux of this feature under real SQLite: deleting an event
    with entries still present in account_entries must not hit
    'FOREIGN KEY constraint failed' -- proving the delete-orphan cascade
    actually orders the DELETEs correctly, not just in a mock."""
    event = create_financial_event(
        session,
        FinancialEventCreate(
            event_type=FinancialEventType.CREDIT_CARD_PAYMENT,
            transaction_date=date(2026, 8, 20),
            entries=[
                AccountEntryCreate(account_id=accounts["bank"].id, amount=Decimal(-25)),
                AccountEntryCreate(account_id=accounts["card"].id, amount=Decimal(25)),
            ],
        ),
    )
    event_id = event.id

    assert delete_financial_event(session, event_id) is True
    assert session.get(FinancialEvent, event_id) is None
    remaining = session.scalar(
        select(func.count(AccountEntry.id)).where(AccountEntry.financial_event_id == event_id)
    )
    assert remaining == 0
    assert session.execute(text("PRAGMA foreign_key_check")).fetchall() == []


def test_delete_unknown_event_returns_false(session: Session) -> None:
    assert delete_financial_event(session, 999) is False


@pytest.mark.parametrize(
    "event_type",
    [
        FinancialEventType.ADJUSTMENT,
        FinancialEventType.INTEREST,
        FinancialEventType.SAVINGS_DEPOSIT,
        FinancialEventType.SAVINGS_WITHDRAWAL,
        FinancialEventType.ASSET_PURCHASE,
        FinancialEventType.ASSET_SALE,
    ],
)
def test_delete_any_event_type_succeeds(
    session: Session, accounts: dict[str, Account], event_type: FinancialEventType
) -> None:
    event = FinancialEvent(
        event_type=event_type,
        transaction_date=date(2026, 8, 20),
        entries=[AccountEntry(account_id=accounts["wallet"].id, amount_scaled=10000)],
    )
    session.add(event)
    session.commit()
    event_id = event.id

    assert delete_financial_event(session, event_id) is True
    assert session.get(FinancialEvent, event_id) is None
