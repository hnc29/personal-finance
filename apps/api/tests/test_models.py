"""Focused tests for the persistence-foundation ORM models (TASK-003 3G).

These tests inspect SQLAlchemy metadata only. Importing ``app.models`` does not
open the database, so nothing here touches ``data/finance.db`` and no schema is
created via ``Base.metadata.create_all()``.
"""

from sqlalchemy import Date, DateTime, Float, Integer, Numeric

from app.models import (
    AccountEntry,
    AccountType,
    Base,
    Category,
    FinancialEvent,
    FinancialEventType,
    MisaAccountMapping,
    MisaExportedEvent,
)

EXPECTED_TABLES = {
    "accounts",
    "categories",
    "financial_events",
    "account_entries",
    "import_batches",
    "raw_import_rows",
    "misa_export_configurations",
    "misa_account_mappings",
    "misa_export_runs",
    "misa_exported_events",
    "reconciliation_candidates",
}


def test_account_type_values_are_exact() -> None:
    assert {member.value for member in AccountType} == {
        "CASH",
        "BANK",
        "CREDIT_CARD",
        "EWALLET",
    }
    assert len(AccountType) == 4


def test_financial_event_type_values_are_exact() -> None:
    assert {member.value for member in FinancialEventType} == {
        "EXPENSE",
        "INCOME",
        "TRANSFER",
        "CREDIT_CARD_PAYMENT",
        "INTEREST",
        "SAVINGS_DEPOSIT",
        "SAVINGS_WITHDRAWAL",
        "ASSET_PURCHASE",
        "ASSET_SALE",
        "ADJUSTMENT",
    }
    assert len(FinancialEventType) == 10


def test_category_parent_id_is_self_referencing() -> None:
    parent_id = Category.__table__.c.parent_id
    assert parent_id.nullable is True

    foreign_keys = list(parent_id.foreign_keys)
    assert len(foreign_keys) == 1
    assert foreign_keys[0].column.table.name == "categories"
    assert foreign_keys[0].column.name == "id"


def test_financial_event_has_required_transaction_date() -> None:
    transaction_date = FinancialEvent.__table__.c.transaction_date
    assert isinstance(transaction_date.type, Date)
    assert transaction_date.nullable is False


def test_occurred_at_is_nullable_and_separate_from_transaction_date() -> None:
    columns = FinancialEvent.__table__.c
    assert "transaction_date" in columns
    assert "occurred_at" in columns

    occurred_at = columns.occurred_at
    assert isinstance(occurred_at.type, DateTime)
    assert occurred_at.nullable is True

    # The two stay distinct columns: a date-only source must never have a
    # midnight timestamp fabricated into occurred_at.
    assert columns.occurred_at is not columns.transaction_date


def test_amount_scaled_is_integer_based() -> None:
    amount_scaled = AccountEntry.__table__.c.amount_scaled
    assert isinstance(amount_scaled.type, Integer)
    assert not isinstance(amount_scaled.type, (Float, Numeric))
    assert amount_scaled.nullable is False


def test_expected_tables_present_in_metadata() -> None:
    assert EXPECTED_TABLES <= set(Base.metadata.tables)


def test_misa_mapping_allows_many_sources_to_one_target() -> None:
    constraints = {constraint.name for constraint in MisaAccountMapping.__table__.constraints}
    assert "uq_misa_mapping_configuration_source" in constraints
    assert not any(
        constraint.name and "target" in constraint.name
        for constraint in MisaAccountMapping.__table__.constraints
    )


def test_export_history_uniquely_tracks_event_per_configuration() -> None:
    constraints = {constraint.name for constraint in MisaExportedEvent.__table__.constraints}
    assert "uq_misa_exported_configuration_event" in constraints
