"""Add accounts.sort_order for user-controlled account ordering.

TASK-035: the user wants to reorder their account list (and have that same
order drive every account picker used when entering a transaction), but
account order today is implicit -- ``list_accounts()`` just orders by
``id``, i.e. creation order, with no way to change it.

``accounts`` has no other table's foreign key pointing at columns that need
retyping and no data to reshape, so this is a plain ``ADD COLUMN`` (SQLite
supports adding a nullable-or-defaulted column without a table rebuild)
followed by a backfill that assigns each existing row a ``sort_order``
matching its current id-ascending position, so nothing visibly reorders the
moment this migration runs.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0016_account_sort_order"
down_revision: str | Sequence[str] | None = "0015_savings_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    # Backfill: preserve today's id-ascending order as the initial
    # sort_order so existing account lists don't visibly reshuffle.
    op.execute(
        """
        UPDATE accounts
        SET sort_order = (
            SELECT COUNT(*) FROM accounts AS a2 WHERE a2.id <= accounts.id
        )
        """
    )


def downgrade() -> None:
    op.drop_column("accounts", "sort_order")
