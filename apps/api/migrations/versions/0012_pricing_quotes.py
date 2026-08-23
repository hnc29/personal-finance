"""Add canonical pricing instruments, providers, and quote history."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0012_pricing_quotes"
down_revision: str | Sequence[str] | None = "0011_crypto_holdings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pricing_instruments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("canonical_code", sa.String(), nullable=False, unique=True),
        sa.Column(
            "asset_type",
            sa.Enum("PRECIOUS_METAL", "CRYPTO", native_enum=False),
            nullable=False,
        ),
        sa.Column("display_name", sa.String()),
    )
    op.create_table(
        "pricing_providers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_table(
        "price_quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "instrument_id",
            sa.Integer(),
            sa.ForeignKey("pricing_instruments.id"),
            nullable=False,
        ),
        sa.Column(
            "provider_id",
            sa.Integer(),
            sa.ForeignKey("pricing_providers.id"),
            nullable=False,
        ),
        sa.Column("product_code", sa.String(), nullable=False),
        sa.Column(
            "match_level",
            sa.Enum("EXACT", "PRODUCT", "INSTRUMENT", "NONE", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "state",
            sa.Enum("LIVE", "STALE", "MANUAL", "UNAVAILABLE", native_enum=False),
            nullable=False,
        ),
        sa.Column("quoted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("buy_price_scaled", sa.BigInteger()),
        sa.Column("sell_price_scaled", sa.BigInteger()),
        sa.Column("source_metadata", sa.String()),
        sa.UniqueConstraint(
            "instrument_id",
            "provider_id",
            "product_code",
            "quoted_at",
            name="uq_price_quote_history",
        ),
        sa.CheckConstraint(
            "buy_price_scaled IS NULL OR buy_price_scaled >= 0",
            name="ck_price_quote_buy_nonnegative",
        ),
        sa.CheckConstraint(
            "sell_price_scaled IS NULL OR sell_price_scaled >= 0",
            name="ck_price_quote_sell_nonnegative",
        ),
        sa.CheckConstraint(
            "(state = 'UNAVAILABLE' AND buy_price_scaled IS NULL "
            "AND sell_price_scaled IS NULL) OR "
            "(state != 'UNAVAILABLE' AND buy_price_scaled IS NOT NULL)",
            name="ck_price_quote_state_prices",
        ),
    )


def downgrade() -> None:
    op.drop_table("price_quotes")
    op.drop_table("pricing_providers")
    op.drop_table("pricing_instruments")
