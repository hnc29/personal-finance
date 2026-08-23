"""0004_normalized_import

Add provenance linkage from canonical events to immutable raw rows.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_normalized_import"
down_revision: str | Sequence[str] | None = "0003_import"
branch_labels = None
depends_on = None


_FINANCIAL_EVENTS = sa.Table(
    "financial_events",
    sa.MetaData(),
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
    sa.Index("ix_financial_events_transaction_date", "transaction_date"),
    sa.Index("ix_financial_events_category_id", "category_id"),
)


def upgrade() -> None:
    # SQLite requires table recreation for foreign keys and unique constraints.
    with op.batch_alter_table(
        "financial_events", copy_from=_FINANCIAL_EVENTS
    ) as batch_op:
        batch_op.add_column(sa.Column("raw_import_row_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_financial_events_raw_import_row",
            "raw_import_rows",
            ["raw_import_row_id"],
            ["id"],
        )
        batch_op.create_unique_constraint(
            "uq_financial_events_raw_import_row_id", ["raw_import_row_id"]
        )

def downgrade() -> None:
    with op.batch_alter_table(
        "financial_events", copy_from=_FINANCIAL_EVENTS
    ) as batch_op:
        batch_op.drop_constraint("uq_financial_events_raw_import_row_id", type_="unique")
        batch_op.drop_constraint("fk_financial_events_raw_import_row", type_="foreignkey")
        batch_op.drop_column("raw_import_row_id")
