"""0002_ledger

Create the ledger tables: ``financial_events`` and ``account_entries``.

Revision ID: 0002_ledger
Revises: 0001_core
Create Date: 2026-08-22

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_ledger"
down_revision: str | Sequence[str] | None = "0001_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "financial_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum(
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
                name="financialeventtype",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("payee_text", sa.String(), nullable=True),
        sa.Column("trip_event_text", sa.String(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_financial_events_transaction_date",
        "financial_events",
        ["transaction_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_events_category_id",
        "financial_events",
        ["category_id"],
        unique=False,
    )
    op.create_table(
        "account_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("financial_event_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("amount_scaled", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(
            ["financial_event_id"], ["financial_events.id"]
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_account_entries_financial_event_id",
        "account_entries",
        ["financial_event_id"],
        unique=False,
    )
    op.create_index(
        "ix_account_entries_account_id",
        "account_entries",
        ["account_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_account_entries_account_id", table_name="account_entries")
    op.drop_index(
        "ix_account_entries_financial_event_id", table_name="account_entries"
    )
    op.drop_table("account_entries")
    op.drop_index(
        "ix_financial_events_category_id", table_name="financial_events"
    )
    op.drop_index(
        "ix_financial_events_transaction_date", table_name="financial_events"
    )
    op.drop_table("financial_events")
