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

def upgrade() -> None:
    # SQLite requires table recreation for foreign keys and unique constraints.
    with op.batch_alter_table("financial_events") as batch_op:
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
    with op.batch_alter_table("financial_events") as batch_op:
        batch_op.drop_constraint("uq_financial_events_raw_import_row_id", type_="unique")
        batch_op.drop_constraint("fk_financial_events_raw_import_row", type_="foreignkey")
        batch_op.drop_column("raw_import_row_id")
