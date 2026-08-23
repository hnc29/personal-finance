"""credit card statement lifecycle"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0008_credit_card_statements"
down_revision: str | Sequence[str] | None = "0007_credit_card_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_card_statements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "profile_id",
            sa.Integer(),
            sa.ForeignKey("credit_card_profiles.id"),
            nullable=False,
        ),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("balance_due_scaled", sa.Integer(), nullable=False),
        sa.Column("paid_scaled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", native_enum=False
            ),
            nullable=False,
            server_default="OPEN",
        ),
        sa.CheckConstraint(
            "balance_due_scaled >= 0", name="ck_cc_statement_due_nonnegative"
        ),
        sa.CheckConstraint("paid_scaled >= 0", name="ck_cc_statement_paid_nonnegative"),
        sa.CheckConstraint(
            "paid_scaled <= balance_due_scaled", name="ck_cc_statement_paid_not_excess"
        ),
    )


def downgrade() -> None:
    op.drop_table("credit_card_statements")
