"""Add daily portfolio snapshots and component quote metadata."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0013_portfolio_snapshots"
down_revision: str | Sequence[str] | None = "0012_pricing_quotes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("net_worth_scaled", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint("snapshot_date", name="uq_portfolio_snapshot_date"),
    )
    op.create_table(
        "portfolio_snapshot_components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "snapshot_id",
            sa.Integer(),
            sa.ForeignKey("portfolio_snapshots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "component_type",
            sa.Enum(
                "CASH", "BANK", "EWALLET", "SAVINGS", "PRECIOUS_METAL",
                "CRYPTO", "CREDIT_CARD", native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("source_key", sa.String(), nullable=False),
        sa.Column("value_scaled", sa.BigInteger(), nullable=False),
        sa.Column(
            "quote_state",
            sa.Enum("LIVE", "STALE", "MANUAL", "UNAVAILABLE", native_enum=False),
        ),
        sa.Column("quote_provider", sa.String()),
        sa.Column("quoted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "snapshot_id", "component_type", "source_key",
            name="uq_portfolio_snapshot_component_source",
        ),
        sa.CheckConstraint(
            "(quote_state IS NULL AND quote_provider IS NULL AND quoted_at IS NULL) OR "
            "(quote_state IS NOT NULL AND quote_provider IS NOT NULL AND quoted_at IS NOT NULL)",
            name="ck_portfolio_component_quote_metadata_complete",
        ),
    )


def downgrade() -> None:
    op.drop_table("portfolio_snapshot_components")
    op.drop_table("portfolio_snapshots")
