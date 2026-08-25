"""Replace BTC-only crypto asset enum with arbitrary CoinGecko coin identity.

TASK-031/TASK-032: ``crypto_holdings.asset`` was a closed enum with a single
value (``BTC``), so no other CoinGecko-listed coin could ever be stored.
CoinGecko's coin id is the canonical external identity (symbols alone can
collide across coins), so this migration replaces ``asset`` with
``coingecko_id`` / ``symbol`` / ``display_name`` and migrates every existing
row -- which was always BTC -- to ``id: bitcoin, symbol: btc, name: Bitcoin``.

SQLite has no native ALTER for tightening nullability or dropping a column
that another table's foreign key still points at while data exists in that
child table, and toggling ``PRAGMA foreign_keys`` mid-transaction is a no-op
in SQLite, so recreating ``crypto_holdings`` in place while ``crypto_lots``
still references it is unsafe. Instead this migration detaches the child
table (captures its rows, drops it), recreates the parent, then recreates
the child and reinserts its rows unchanged -- no lot data is lost or
renumbered.

This is the one Alembic revision TASK-031 §12 allows for the crypto identity
change.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0014_crypto_coin_identity"
down_revision: str | Sequence[str] | None = "0013_portfolio_snapshots"
branch_labels = None
depends_on = None


_HOLDINGS_BEFORE = sa.Table(
    "crypto_holdings",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("asset", sa.Enum("BTC", native_enum=False), nullable=False),
    sa.Column("pricing_instrument", sa.String()),
    sa.Column(
        "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
    ),
    sa.Column("note", sa.String()),
)

_HOLDINGS_MID = sa.Table(
    "crypto_holdings",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("asset", sa.Enum("BTC", native_enum=False), nullable=False),
    sa.Column("coingecko_id", sa.String(), nullable=True),
    sa.Column("symbol", sa.String(), nullable=True),
    sa.Column("display_name", sa.String()),
    sa.Column("pricing_instrument", sa.String()),
    sa.Column(
        "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
    ),
    sa.Column("note", sa.String()),
)

_HOLDINGS_AFTER = sa.Table(
    "crypto_holdings",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("coingecko_id", sa.String(), nullable=False),
    sa.Column("symbol", sa.String(), nullable=False),
    sa.Column("display_name", sa.String()),
    sa.Column("pricing_instrument", sa.String()),
    sa.Column(
        "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
    ),
    sa.Column("note", sa.String()),
)

_HOLDINGS_AFTER_WITH_ASSET = sa.Table(
    "crypto_holdings",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("coingecko_id", sa.String(), nullable=False),
    sa.Column("symbol", sa.String(), nullable=False),
    sa.Column("display_name", sa.String()),
    sa.Column("asset", sa.Enum("BTC", native_enum=False), nullable=True),
    sa.Column("pricing_instrument", sa.String()),
    sa.Column(
        "is_net_worth", sa.Boolean(), nullable=False, server_default=sa.text("1")
    ),
    sa.Column("note", sa.String()),
)

_LOT_COLUMNS = (
    "id",
    "holding_id",
    "quantity_scaled",
    "purchase_date",
    "purchase_price_scaled",
    "total_cost_scaled",
    "funding_account_id",
    "financial_event_id",
    "note",
)


def _create_crypto_lots() -> None:
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


def _detach_lots() -> list[dict[str, object]]:
    """Capture every ``crypto_lots`` row and drop the table (see module docstring)."""
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(f"SELECT {', '.join(_LOT_COLUMNS)} FROM crypto_lots")
    ).mappings().all()
    captured = [dict(row) for row in rows]
    op.drop_table("crypto_lots")
    return captured


def _reattach_lots(rows: list[dict[str, object]]) -> None:
    _create_crypto_lots()
    if not rows:
        return
    connection = op.get_bind()
    lots_table = sa.table(
        "crypto_lots", *(sa.column(name) for name in _LOT_COLUMNS)
    )
    connection.execute(sa.insert(lots_table), rows)


def upgrade() -> None:
    with op.batch_alter_table(
        "crypto_holdings", copy_from=_HOLDINGS_BEFORE
    ) as batch_op:
        batch_op.add_column(sa.Column("coingecko_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("symbol", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("display_name", sa.String(), nullable=True))

    # Every existing row predates arbitrary-coin support, so it was always BTC.
    op.execute(
        "UPDATE crypto_holdings SET coingecko_id = 'bitcoin', symbol = 'btc', "
        "display_name = COALESCE(display_name, 'Bitcoin') WHERE asset = 'BTC'"
    )
    op.execute(
        "UPDATE crypto_holdings SET coingecko_id = 'bitcoin', symbol = 'btc', "
        "display_name = COALESCE(display_name, 'Bitcoin') WHERE coingecko_id IS NULL"
    )

    lots = _detach_lots()
    with op.batch_alter_table("crypto_holdings", copy_from=_HOLDINGS_MID) as batch_op:
        batch_op.alter_column("coingecko_id", nullable=False)
        batch_op.alter_column("symbol", nullable=False)
        batch_op.drop_column("asset")
    _reattach_lots(lots)


def downgrade() -> None:
    with op.batch_alter_table("crypto_holdings", copy_from=_HOLDINGS_AFTER) as batch_op:
        batch_op.add_column(
            sa.Column("asset", sa.Enum("BTC", native_enum=False), nullable=True)
        )
    # Downgrading only round-trips pre-TASK-031 data (BTC-only); any other
    # coin cannot fit the closed enum and is left with a NULL asset rather
    # than silently mislabeled as BTC.
    op.execute(
        "UPDATE crypto_holdings SET asset = 'BTC' WHERE coingecko_id = 'bitcoin'"
    )

    lots = _detach_lots()
    with op.batch_alter_table(
        "crypto_holdings", copy_from=_HOLDINGS_AFTER_WITH_ASSET
    ) as batch_op:
        batch_op.drop_column("coingecko_id")
        batch_op.drop_column("symbol")
        batch_op.drop_column("display_name")
    _reattach_lots(lots)
