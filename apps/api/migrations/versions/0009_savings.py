"""Add savings products, accounts, and term rollover history."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0009_savings"
down_revision: str | Sequence[str] | None = "0008_credit_card_statements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "savings_products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("institution", sa.String(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="VND"),
    )
    op.create_table(
        "savings_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("savings_products.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("principal_scaled", sa.Integer(), nullable=False),
        sa.Column("opened_date", sa.Date(), nullable=False),
        sa.Column("closed_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("OPEN", "CLOSED", native_enum=False),
            nullable=False,
            server_default="OPEN",
        ),
        sa.CheckConstraint(
            "principal_scaled >= 0", name="ck_savings_account_principal_nonnegative"
        ),
        sa.CheckConstraint(
            "closed_date IS NULL OR closed_date >= opened_date",
            name="ck_savings_account_dates_ordered",
        ),
    )
    op.create_table(
        "savings_terms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "savings_account_id",
            sa.Integer(),
            sa.ForeignKey("savings_accounts.id"),
            nullable=False,
        ),
        sa.Column(
            "renewed_from_term_id",
            sa.Integer(),
            sa.ForeignKey("savings_terms.id"),
            unique=True,
            nullable=True,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("principal_scaled", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("maturity_date", sa.Date(), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("annual_rate_scaled", sa.Integer(), nullable=False),
        sa.Column("non_term_rate_scaled", sa.Integer(), nullable=False),
        sa.Column(
            "day_count_convention",
            sa.Enum("ACTUAL_365", "ACTUAL_360", "THIRTY_360", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "interest_payment_method",
            sa.Enum("AT_MATURITY", "UPFRONT", "PERIODIC", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "maturity_action",
            sa.Enum(
                "CLOSE",
                "RENEW_PRINCIPAL",
                "RENEW_PRINCIPAL_AND_INTEREST",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.CheckConstraint("sequence > 0", name="ck_savings_term_sequence_positive"),
        sa.CheckConstraint(
            "principal_scaled > 0", name="ck_savings_term_principal_positive"
        ),
        sa.CheckConstraint("term_months > 0", name="ck_savings_term_months_positive"),
        sa.CheckConstraint(
            "annual_rate_scaled >= 0", name="ck_savings_term_rate_nonnegative"
        ),
        sa.CheckConstraint(
            "non_term_rate_scaled >= 0", name="ck_savings_term_nonterm_rate_nonnegative"
        ),
        sa.CheckConstraint(
            "maturity_date > start_date", name="ck_savings_term_dates_ordered"
        ),
        sa.UniqueConstraint(
            "savings_account_id", "sequence", name="uq_savings_term_account_sequence"
        ),
    )


def downgrade() -> None:
    op.drop_table("savings_terms")
    op.drop_table("savings_accounts")
    op.drop_table("savings_products")
