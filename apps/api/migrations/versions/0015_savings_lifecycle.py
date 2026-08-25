"""Add savings term lifecycle state and account funding/notes tracking.

Nghiệp vụ gửi tiết kiệm review: the savings domain already had exact
day-count interest math and calendar-month rollover, but two real gaps
prevented correct lifecycle tracking:

1. ``SavingsTerm`` had no per-term status distinct from the account's
   OPEN/CLOSED, so there was no way to tell an ACTIVE term from one that was
   normally closed (tất toán đúng hạn) versus closed early (tất toán trước
   hạn), and no persisted ``actual_interest``/``closed_at`` for term history
   display.
2. ``SavingsAccount`` had no ``funding_account_id`` to record which wallet
   account funded the deposit (needed both to run the SAVINGS_DEPOSIT ledger
   entry correctly and to display "Tài khoản nguồn" later) and no ``notes``
   field for the optional note the create form exposes.

``funding_account_id`` needs a real FK constraint (the app runs with
``PRAGMA foreign_keys=ON``), and SQLite cannot add a new constraint to a
table via plain ``ALTER TABLE ADD COLUMN`` -- only via batch mode's
copy-and-move recreate. That recreate then runs into the same problem
0014_crypto_coin_identity did: ``savings_terms`` is an FK child of
``savings_accounts``, so SQLite refuses to drop/recreate the parent while
child rows still reference it (``PRAGMA foreign_keys`` toggles are a no-op
mid-transaction). So both directions detach ``savings_terms`` first
(capture its rows, drop the table), recreate ``savings_accounts`` in its new
or old shape, then recreate ``savings_terms`` and reinsert its rows.

Existing terms are backfilled to a best-effort status, computed in Python
from the captured rows rather than a follow-up UPDATE (the table is being
rebuilt anyway): a term referenced by another term's
``renewed_from_term_id`` was superseded, so it becomes CLOSED; a term
belonging to an account whose ``status`` is already CLOSED becomes CLOSED
too (historical data cannot distinguish a normal close from an early one, so
it is not guessed as EARLY_CLOSED); everything else stays ACTIVE, matching
current behavior. No lot/term data is lost or renumbered by either
direction.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0015_savings_lifecycle"
down_revision: str | Sequence[str] | None = "0014_crypto_coin_identity"
branch_labels = None
depends_on = None


_TERM_COLUMNS = (
    "id",
    "savings_account_id",
    "renewed_from_term_id",
    "sequence",
    "principal_scaled",
    "start_date",
    "maturity_date",
    "term_months",
    "annual_rate_scaled",
    "non_term_rate_scaled",
    "day_count_convention",
    "interest_payment_method",
    "maturity_action",
)
_TERM_LIFECYCLE_COLUMNS = ("status", "actual_interest_scaled", "closed_at")

_ACCOUNTS_BEFORE = sa.Table(
    "savings_accounts",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("product_id", sa.Integer(), nullable=False),
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
)

_ACCOUNTS_AFTER = sa.Table(
    "savings_accounts",
    sa.MetaData(),
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("product_id", sa.Integer(), nullable=False),
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
    sa.Column("funding_account_id", sa.Integer(), nullable=True),
    sa.Column("notes", sa.Text(), nullable=True),
)


def _create_savings_terms(*, with_lifecycle_columns: bool) -> None:
    columns = [
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
    ]
    if with_lifecycle_columns:
        columns += [
            sa.Column(
                "status",
                sa.Enum("ACTIVE", "CLOSED", "EARLY_CLOSED", native_enum=False),
                nullable=False,
                server_default="ACTIVE",
            ),
            sa.Column("actual_interest_scaled", sa.Integer(), nullable=True),
            sa.Column("closed_at", sa.Date(), nullable=True),
        ]
    op.create_table(
        "savings_terms",
        *columns,
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


def _detach_terms(columns: Sequence[str]) -> list[dict[str, object]]:
    connection = op.get_bind()
    rows = (
        connection.execute(sa.text(f"SELECT {', '.join(columns)} FROM savings_terms"))
        .mappings()
        .all()
    )
    captured = [dict(row) for row in rows]
    op.drop_table("savings_terms")
    return captured


def _reattach_terms(
    rows: list[dict[str, object]], columns: Sequence[str], *, with_lifecycle_columns: bool
) -> None:
    _create_savings_terms(with_lifecycle_columns=with_lifecycle_columns)
    if not rows:
        return
    connection = op.get_bind()
    terms_table = sa.table("savings_terms", *(sa.column(name) for name in columns))
    connection.execute(sa.insert(terms_table), rows)


def upgrade() -> None:
    connection = op.get_bind()
    closed_account_ids = {
        row[0]
        for row in connection.execute(
            sa.text("SELECT id FROM savings_accounts WHERE status = 'CLOSED'")
        )
    }
    terms = _detach_terms(_TERM_COLUMNS)
    superseded_term_ids = {
        row["renewed_from_term_id"]
        for row in terms
        if row["renewed_from_term_id"] is not None
    }

    with op.batch_alter_table(
        "savings_accounts", copy_from=_ACCOUNTS_BEFORE
    ) as batch_op:
        batch_op.add_column(
            sa.Column(
                "funding_account_id",
                sa.Integer(),
                sa.ForeignKey(
                    "accounts.id", name="fk_savings_accounts_funding_account_id"
                ),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))

    for row in terms:
        # Best-effort backfill: a term another term renewed from was
        # superseded, so it is CLOSED; a term left on an account that was
        # already CLOSED is CLOSED too. Historical data cannot distinguish a
        # normal close from an early one, so those are not guessed as
        # EARLY_CLOSED -- everything else (still-open rollover chains) stays
        # ACTIVE, matching current behavior.
        row["status"] = (
            "CLOSED"
            if row["id"] in superseded_term_ids
            or row["savings_account_id"] in closed_account_ids
            else "ACTIVE"
        )
        row["actual_interest_scaled"] = None
        row["closed_at"] = None
    _reattach_terms(
        terms, (*_TERM_COLUMNS, *_TERM_LIFECYCLE_COLUMNS), with_lifecycle_columns=True
    )


def downgrade() -> None:
    terms = _detach_terms((*_TERM_COLUMNS, *_TERM_LIFECYCLE_COLUMNS))
    for row in terms:
        for column in _TERM_LIFECYCLE_COLUMNS:
            row.pop(column, None)

    with op.batch_alter_table(
        "savings_accounts", copy_from=_ACCOUNTS_AFTER
    ) as batch_op:
        batch_op.drop_column("funding_account_id")
        batch_op.drop_column("notes")

    _reattach_terms(terms, _TERM_COLUMNS, with_lifecycle_columns=False)
