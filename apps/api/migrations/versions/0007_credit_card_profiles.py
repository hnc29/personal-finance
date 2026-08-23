"""0007 credit card profiles"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_credit_card_profiles"
down_revision: str | Sequence[str] | None = "0006_reconciliation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_card_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("credit_limit_scaled", sa.Integer(), nullable=False),
        sa.Column("statement_day", sa.Integer(), nullable=False),
        sa.Column("payment_due_day", sa.Integer(), nullable=False),
        sa.Column(
            "payment_due_month_offset", sa.Integer(), server_default="0", nullable=False
        ),
        sa.CheckConstraint(
            "credit_limit_scaled >= 0", name="ck_credit_card_limit_nonnegative"
        ),
        sa.CheckConstraint(
            "statement_day BETWEEN 1 AND 31", name="ck_credit_card_statement_day"
        ),
        sa.CheckConstraint(
            "payment_due_day BETWEEN 1 AND 31", name="ck_credit_card_due_day"
        ),
        sa.CheckConstraint(
            "payment_due_month_offset >= 0", name="ck_credit_card_due_offset"
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id"),
    )


def downgrade() -> None:
    op.drop_table("credit_card_profiles")
