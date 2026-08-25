"""0018_transfer_pair_import

TASK-040: add a second, optional provenance link from a canonical event to
an immutable raw row. A Money Lover "internal transfer between my own
wallets" is exported as TWO raw rows -- one "Tiền chuyển đi" (outgoing) on
the source wallet and one "Tiền chuyển đến" (incoming) on the destination
wallet -- that the auto-apply importer (app/services/moneylover_apply.py)
pairs into a single balanced TRANSFER event instead of two separate
EXPENSE/INCOME events (which would double-count the same money movement).
That one event now needs to record BOTH raw rows it was built from so a
re-run of auto-apply can tell both rows are already accounted for, not just
one of them.

Revision ID: 0018_transfer_pair_import
Revises: 0017_category_icon
Create Date: 2026-08-25
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0018_transfer_pair_import"
down_revision: str | Sequence[str] | None = "0017_category_icon"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# NOTE: this deliberately does NOT use op.batch_alter_table (SQLite's
# recreate-the-table strategy for ALTER). On a real, populated database
# batch mode's table swap does `DROP TABLE financial_events` mid-migration,
# and the app enables `PRAGMA foreign_keys=ON` on every connection
# (app/core/database.py) -- including the one Alembic runs migrations
# through (migrations/env.py imports that same engine). SQLite enforces
# that pragma for the DROP itself, and account_entries.financial_event_id
# (a real, populated FK) makes the drop fail with "FOREIGN KEY constraint
# failed" on any database that actually has financial_events rows. This
# never showed up against a fresh, empty scratch database (nothing to
# violate), only when dry-run against a copy of the user's real database --
# which is exactly why that dry run happened before this ever touched the
# real file. Matches the plain add_column/drop_column style already used by
# 0016/0017 (both real-data-safe): SQLite supports ADD COLUMN with an
# inline REFERENCES clause and DROP COLUMN natively (no recreate needed)
# since well before the 3.37 version in use here; the unique constraint is
# a plain unique index instead of a table-level constraint, which SQLite
# also enforces identically (multiple NULLs allowed, matching
# raw_import_row_id's existing nullable+unique behavior).
_INDEX_NAME = "uq_financial_events_raw_import_row_id_secondary"


def upgrade() -> None:
    # Plain op.add_column(..., sa.ForeignKey(...)) routes through Alembic's
    # "add constraint" operation, which the SQLite dialect explicitly
    # refuses outside of batch mode ("No support for ALTER of constraints
    # in SQLite dialect") -- even though SQLite itself supports an inline
    # REFERENCES clause directly in ADD COLUMN at the SQL level. Emitting
    # the raw DDL via op.execute() sidesteps Alembic's operation model
    # (which doesn't have a non-batch representation for this) while still
    # using the real-data-safe SQL form.
    op.execute(
        "ALTER TABLE financial_events ADD COLUMN raw_import_row_id_secondary "
        "INTEGER REFERENCES raw_import_rows(id)"
    )
    op.create_index(_INDEX_NAME, "financial_events", ["raw_import_row_id_secondary"], unique=True)


def downgrade() -> None:
    op.drop_index(_INDEX_NAME, table_name="financial_events")
    op.drop_column("financial_events", "raw_import_row_id_secondary")
