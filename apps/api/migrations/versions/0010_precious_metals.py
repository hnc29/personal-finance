"""Add shared gold and silver holdings and purchase lots."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0010_precious_metals"
down_revision: str | Sequence[str] | None = "0009_savings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "precious_metal_holdings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "metal_type", sa.Enum("GOLD", "SILVER", native_enum=False), nullable=False
        ),
        sa.Column(
            "brand",
            sa.Enum("SJC", "BTMC", "BTMH", "DOJI", "PNJ", "RAW", native_enum=False),
            nullable=False,
        ),
        sa.Column("product_type", sa.String(), nullable=False),
        sa.Column("purity_scaled", sa.Integer(), nullable=False),
        sa.Column("pricing_instrument", sa.String()),
        sa.Column(
            "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column("note", sa.String()),
        sa.Column("image_uri", sa.String()),
        sa.CheckConstraint(
            "purity_scaled > 0 AND purity_scaled <= 10000",
            name="ck_precious_holding_purity_range",
        ),
    )
    op.create_table(
        "precious_metal_lots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "holding_id",
            sa.Integer(),
            sa.ForeignKey("precious_metal_holdings.id"),
            nullable=False,
        ),
        sa.Column("quantity_scaled", sa.Integer(), nullable=False),
        sa.Column(
            "quantity_unit",
            sa.Enum("GRAM", "CHI", "LUONG", "KILOGRAM", native_enum=False),
            nullable=False,
        ),
        sa.Column("grams_scaled", sa.Integer(), nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("purchase_price_scaled", sa.Integer(), nullable=False),
        sa.Column("total_cost_scaled", sa.Integer(), nullable=False),
        sa.Column("funding_account_id", sa.Integer(), sa.ForeignKey("accounts.id")),
        sa.Column("note", sa.String()),
        sa.Column("image_uri", sa.String()),
        sa.CheckConstraint(
            "quantity_scaled > 0", name="ck_precious_lot_quantity_positive"
        ),
        sa.CheckConstraint("grams_scaled > 0", name="ck_precious_lot_grams_positive"),
        sa.CheckConstraint(
            "purchase_price_scaled >= 0",
            name="ck_precious_lot_purchase_price_nonnegative",
        ),
        sa.CheckConstraint(
            "total_cost_scaled >= 0", name="ck_precious_lot_total_cost_nonnegative"
        ),
    )


def downgrade() -> None:
    op.drop_table("precious_metal_lots")
    op.drop_table("precious_metal_holdings")
