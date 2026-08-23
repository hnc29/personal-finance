"""Add crypto holdings and purchase lots."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0011_crypto_holdings"
down_revision: str | Sequence[str] | None = "0010_precious_metals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crypto_holdings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset", sa.Enum("BTC", native_enum=False), nullable=False),
        sa.Column("pricing_instrument", sa.String()),
        sa.Column(
            "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column("note", sa.String()),
    )
    op.create_table(
        "crypto_lots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "holding_id",
            sa.Integer(),
            sa.ForeignKey("crypto_holdings.id"),
            nullable=False,
        ),
        sa.Column("quantity_scaled", sa.BigInteger(), nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("purchase_price_scaled", sa.BigInteger(), nullable=False),
        sa.Column("total_cost_scaled", sa.BigInteger(), nullable=False),
        sa.Column("funding_account_id", sa.Integer(), sa.ForeignKey("accounts.id")),
        sa.Column(
            "financial_event_id",
            sa.Integer(),
            sa.ForeignKey("financial_events.id"),
        ),
        sa.Column("note", sa.String()),
        sa.CheckConstraint(
            "quantity_scaled > 0", name="ck_crypto_lot_quantity_positive"
        ),
        sa.CheckConstraint(
            "purchase_price_scaled >= 0",
            name="ck_crypto_lot_purchase_price_nonnegative",
        ),
        sa.CheckConstraint(
            "total_cost_scaled >= 0", name="ck_crypto_lot_total_cost_nonnegative"
        ),
    )


def downgrade() -> None:
    op.drop_table("crypto_lots")
    op.drop_table("crypto_holdings")
