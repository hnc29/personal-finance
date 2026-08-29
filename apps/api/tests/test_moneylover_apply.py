"""Service-layer tests for TASK-040's straight-through apply feature.

The user's request: an uploaded Money Lover batch only ever produced
immutable ``RawImportRow`` rows -- nothing pushed them into
``financial_events``, so an import never showed up in Transactions or net
worth ("dữ liệu tải lên nhưng không đưa vào data"). ``apply_import_batch``
closes that gap by converting raw rows straight into real ledger events
("đưa thẳng các bản ghi vào tương ứng"), without going through the separate
reconciliation feature.

Runs Alembic against a disposable temp-file SQLite database (never
``data/finance.db``), matching the pattern used by
``tests/test_misa_export.py`` / ``tests/test_moneylover_import_api.py``. All
data is synthetic.
"""

import io
import os
import subprocess
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl import Workbook
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.ledger import FinancialEvent, FinancialEventType
from app.services.moneylover_apply import BatchNotFoundError, apply_import_batch
from app.services.moneylover_import import import_moneylover

HEADERS = (
    "Id", "Ngày", "Nhóm", "Số tiền", "Đơn vị tiền tệ", "Ví",
    "Ghi chú", "Với", "Sự kiện", "Không tính vào báo cáo", "Thành viên",
)


@pytest.fixture
def session(tmp_path: Path) -> Session:
    database_path = tmp_path / "synthetic-apply.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as database_session:
        database_session.execute(text("PRAGMA foreign_keys=ON"))
        yield database_session
    engine.dispose()


def _xlsx(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sổ giao dịch"
    sheet.append(list(HEADERS))
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def _row(
    row_id: str,
    tx_date: date,
    group: str,
    amount: object,
    wallet: str,
    note: str | None = None,
    excluded: bool = False,
) -> list[object]:
    return [row_id, tx_date, group, amount, "VND", wallet, note, None, None, excluded, None]


def test_plain_expense_and_income_rows_matched_wallet_and_category(session: Session) -> None:
    zalopay = Account(name="ZaloPay", account_type=AccountType.EWALLET, currency="VND")
    session.add(zalopay)
    salary = Category(name="Salary")
    session.add(salary)
    session.commit()

    data = _xlsx([
        _row("1", date(2026, 8, 1), "Lương", 5_000_000, "ZaloPay"),  # matches Salary category
        _row("2", date(2026, 8, 2), "Xăng cr", -150_000, "ZaloPay"),  # free-text, no category match
    ])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.total_rows == 2
    assert result.expense_income_rows_applied == 2
    assert result.transfer_pairs_applied == 0
    assert result.categorized_rows == 1
    assert result.uncategorized_rows == 1
    assert result.applied_rows == 2
    assert not result.unmatched_wallets

    events = list(session.scalars(select(FinancialEvent).order_by(FinancialEvent.id)))
    assert len(events) == 2
    income = next(e for e in events if e.event_type is FinancialEventType.INCOME)
    assert income.category_id == salary.id
    assert income.entries[0].account_id == zalopay.id
    assert income.entries[0].amount == Decimal("5000000.0000")
    expense = next(e for e in events if e.event_type is FinancialEventType.EXPENSE)
    assert expense.category_id is None
    assert expense.entries[0].amount == Decimal("-150000.0000")


def test_unmatched_wallet_is_reported_and_not_applied(session: Session) -> None:
    data = _xlsx([_row("1", date(2026, 8, 1), "Ăn ngoài", -100_000, "Ví Không Tồn Tại")])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.expense_income_rows_applied == 0
    assert result.unmatched_wallets == {"Ví Không Tồn Tại": 1}
    assert result.unmatched_row_count == 1
    assert session.scalar(select(FinancialEvent)) is None


def test_transfer_pair_booked_as_single_balanced_transfer_event(session: Session) -> None:
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    bank = Account(name="Bank", account_type=AccountType.BANK, currency="VND")
    session.add_all([cash, bank])
    session.commit()

    data = _xlsx([
        _row("1", date(2026, 8, 5), "Tiền chuyển đi", -200_000, "Cash", note="Gửi đến Bank", excluded=True),
        _row("2", date(2026, 8, 5), "Tiền chuyển đến", 200_000, "Bank", note="Nhận tiền từ Cash", excluded=True),
    ])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.transfer_pairs_applied == 1
    assert result.expense_income_rows_applied == 0
    assert result.applied_rows == 2

    events = list(session.scalars(select(FinancialEvent)))
    assert len(events) == 1
    event = events[0]
    assert event.event_type is FinancialEventType.TRANSFER
    amounts = {e.account_id: e.amount for e in event.entries}
    assert amounts[cash.id] == Decimal("-200000.0000")
    assert amounts[bank.id] == Decimal("200000.0000")
    # Both legs recorded as consumed provenance, not just one.
    raw_ids = {event.raw_import_row_id, event.raw_import_row_id_secondary}
    linked_rows = {r.id for r in batch.rows}
    assert raw_ids == linked_rows


def test_reapplying_an_already_applied_batch_is_idempotent(session: Session) -> None:
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    bank = Account(name="Bank", account_type=AccountType.BANK, currency="VND")
    session.add_all([cash, bank])
    session.commit()

    data = _xlsx([
        _row("1", date(2026, 8, 1), "Ăn ngoài", -50_000, "Cash"),
        _row("2", date(2026, 8, 5), "Tiền chuyển đi", -200_000, "Cash", note="Gửi đến Bank", excluded=True),
        _row("3", date(2026, 8, 5), "Tiền chuyển đến", 200_000, "Bank", note="Nhận tiền từ Cash", excluded=True),
    ])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    session.commit()

    first = apply_import_batch(session, batch.id)
    session.commit()
    assert first.applied_rows == 3

    second = apply_import_batch(session, batch.id)
    session.commit()
    assert second.applied_rows == 0
    assert second.already_applied_rows == 3

    assert session.scalar(select(FinancialEvent.id)) is not None
    all_events = list(session.scalars(select(FinancialEvent)))
    assert len(all_events) == 2  # one EXPENSE + one TRANSFER, never duplicated


def test_same_day_same_amount_transfer_pairs_disambiguated_by_note(session: Session) -> None:
    """Regression lock for the real-data collision found during design: two
    outgoing legs on the same day, same amount, but to two different
    destination wallets -- must not cross-pair just because amount+date
    match; the note's named counterparty wallet is what disambiguates."""
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    bank_a = Account(name="Bank A", account_type=AccountType.BANK, currency="VND")
    bank_b = Account(name="Bank B", account_type=AccountType.BANK, currency="VND")
    session.add_all([cash, bank_a, bank_b])
    session.commit()

    data = _xlsx([
        _row("1", date(2026, 8, 10), "Tiền chuyển đi", -300_000, "Cash", note="Gửi đến Bank A", excluded=True),
        _row("2", date(2026, 8, 10), "Tiền chuyển đi", -300_000, "Cash", note="Gửi đến Bank B", excluded=True),
        _row("3", date(2026, 8, 10), "Tiền chuyển đến", 300_000, "Bank B", note="Nhận tiền từ Cash", excluded=True),
        _row("4", date(2026, 8, 10), "Tiền chuyển đến", 300_000, "Bank A", note="Nhận tiền từ Cash", excluded=True),
    ])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.transfer_pairs_applied == 2
    events = list(session.scalars(select(FinancialEvent)))
    assert len(events) == 2
    for event in events:
        amounts = {e.account_id: e.amount for e in event.entries}
        assert amounts[cash.id] == Decimal("-300000.0000")
        # Each transfer landed on the wallet its own note actually named,
        # not just whichever unpaired incoming leg happened to match amount.
        assert Decimal("300000.0000") in amounts.values()
    destination_ids = set()
    for event in events:
        for entry in event.entries:
            if entry.account_id != cash.id:
                destination_ids.add(entry.account_id)
    assert destination_ids == {bank_a.id, bank_b.id}


def test_invalid_row_is_reported_and_does_not_block_the_rest(session: Session) -> None:
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    session.add(cash)
    session.commit()

    data = _xlsx([_row("1", date(2026, 8, 1), "Ăn ngoài", -10_000, "Cash")])
    batch = import_moneylover(session, data, "synthetic.xlsx")
    # Corrupt the one row's payload to simulate an unparseable date, matching
    # normalize_moneylover_row's own NormalizationError path -- this must be
    # reported, not raised, so the rest of a real 212-row batch still applies.
    batch.rows[0].raw_payload = batch.rows[0].raw_payload.replace('"2026-08-01T00:00:00"', '"not-a-date"')
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.expense_income_rows_applied == 0
    assert result.invalid_rows == [2]  # source_row_number is 1-based after the header row
    assert session.scalar(select(FinancialEvent)) is None


def test_unknown_batch_raises() -> None:
    class _EmptySession:
        def get(self, model, ident):
            return None

    with pytest.raises(BatchNotFoundError):
        apply_import_batch(_EmptySession(), 999)  # type: ignore[arg-type]


def test_credit_card_parenthetical_wallet_matching(session: Session) -> None:
    vpb_card = Account(name="VPBank (VPB-Card)", account_type=AccountType.CREDIT_CARD, currency="VND")
    bidv_card = Account(name="BIDV (-Card)", account_type=AccountType.CREDIT_CARD, currency="VND")
    tech_card = Account(name="TECH-Card", account_type=AccountType.CREDIT_CARD, currency="VND")
    session.add_all([vpb_card, bidv_card, tech_card])
    session.commit()

    data = _xlsx([
        _row("1", date(2026, 8, 21), "Ăn uống", -120_000, "VPB-Card"),
        _row("2", date(2026, 8, 22), "Mua sắm", -350_000, "BIDV-Card"),
        _row("3", date(2026, 8, 23), "Đi lại", -50_000, "TECH-Card"),
    ])
    batch = import_moneylover(session, data, "synthetic_cards.xlsx")
    session.commit()

    result = apply_import_batch(session, batch.id)
    session.commit()

    assert result.total_rows == 3
    assert result.applied_rows == 3
    assert result.unmatched_wallets == {}


def test_single_leg_transfer_in_creates_balanced_event_and_second_batch_deduplicates(session: Session) -> None:
    """When a statement/export with only the receiving account is imported,
    it creates a balanced TRANSFER (+Receiver, -Sender).
    When the sender account's statement is imported in a second batch later,
    it matches the existing TRANSFER and does not create a duplicate."""
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    bank = Account(name="Bank", account_type=AccountType.BANK, currency="VND")
    session.add_all([cash, bank])
    session.commit()

    # Batch 1: Only receiving account (Bank) is imported
    data_1 = _xlsx([
        _row("1", date(2026, 8, 15), "Tiền chuyển đến", 500_000, "Bank", note="Nhận tiền từ Cash", excluded=True),
    ])
    batch_1 = import_moneylover(session, data_1, "bank_only.xlsx")
    session.commit()

    result_1 = apply_import_batch(session, batch_1.id)
    session.commit()

    assert result_1.transfer_pairs_applied == 1
    assert result_1.expense_income_rows_applied == 0
    assert result_1.applied_rows == 2

    # Check that BOTH accounts are updated in the ledger
    events = list(session.scalars(select(FinancialEvent)))
    assert len(events) == 1
    event = events[0]
    assert event.event_type is FinancialEventType.TRANSFER
    amounts = {e.account_id: e.amount for e in event.entries}
    assert amounts[cash.id] == Decimal("-500000.0000")
    assert amounts[bank.id] == Decimal("500000.0000")
    assert event.raw_import_row_id == batch_1.rows[0].id
    assert event.raw_import_row_id_secondary is None

    # Batch 2: Later, sending account (Cash) is imported
    data_2 = _xlsx([
        _row("2", date(2026, 8, 15), "Tiền chuyển đi", -500_000, "Cash", note="Gửi đến Bank", excluded=True),
    ])
    batch_2 = import_moneylover(session, data_2, "cash_later.xlsx")
    session.commit()

    result_2 = apply_import_batch(session, batch_2.id)
    session.commit()

    assert result_2.transfer_pairs_applied == 1
    assert result_2.expense_income_rows_applied == 0

    # Must still be ONLY 1 event in the database, never duplicated!
    events_after = list(session.scalars(select(FinancialEvent)))
    assert len(events_after) == 1
    updated_event = events_after[0]
    assert updated_event.raw_import_row_id == batch_1.rows[0].id
    assert updated_event.raw_import_row_id_secondary == batch_2.rows[0].id


def test_single_leg_transfer_out_creates_balanced_event_and_second_batch_deduplicates(session: Session) -> None:
    """When a statement/export with only the sending account is imported first,
    it creates a balanced TRANSFER (+Receiver, -Sender).
    When the receiving account's statement is imported in a second batch later,
    it matches the existing TRANSFER and does not create a duplicate."""
    cash = Account(name="Cash", account_type=AccountType.CASH, currency="VND")
    bank = Account(name="Bank", account_type=AccountType.BANK, currency="VND")
    session.add_all([cash, bank])
    session.commit()

    # Batch 1: Only sending account (Cash) is imported
    data_1 = _xlsx([
        _row("1", date(2026, 8, 18), "Tiền chuyển đi", -1_000_000, "Cash", note="Gửi đến Bank", excluded=True),
    ])
    batch_1 = import_moneylover(session, data_1, "cash_first.xlsx")
    session.commit()

    result_1 = apply_import_batch(session, batch_1.id)
    session.commit()

    assert result_1.transfer_pairs_applied == 1
    assert len(list(session.scalars(select(FinancialEvent)))) == 1

    # Batch 2: Later, receiving account (Bank) is imported
    data_2 = _xlsx([
        _row("2", date(2026, 8, 18), "Tiền chuyển đến", 1_000_000, "Bank", note="Nhận tiền từ Cash", excluded=True),
    ])
    batch_2 = import_moneylover(session, data_2, "bank_second.xlsx")
    session.commit()

    result_2 = apply_import_batch(session, batch_2.id)
    session.commit()

    assert result_2.transfer_pairs_applied == 1
    # Must still be ONLY 1 event in the database, never duplicated!
    events_after = list(session.scalars(select(FinancialEvent)))
    assert len(events_after) == 1
    amounts = {e.account_id: e.amount for e in events_after[0].entries}
    assert amounts[cash.id] == Decimal("-1000000.0000")
    assert amounts[bank.id] == Decimal("1000000.0000")

