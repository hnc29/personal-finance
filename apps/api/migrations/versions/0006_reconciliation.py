"""0006_reconciliation

Add persisted reconciliation candidates and their review lifecycle.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_reconciliation"
down_revision: str | Sequence[str] | None = "0005_misa_export"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reconciliation_candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("raw_import_row_id", sa.Integer(), nullable=False),
        sa.Column("financial_event_id", sa.Integer(), nullable=False),
        sa.Column(
            "state",
            sa.Enum(
                "UNMATCHED",
                "PROPOSED",
                "REVIEW_REQUIRED",
                "AUTO_MATCHED",
                "CONFIRMED",
                "REJECTED",
                name="reconciliationcandidatestate",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("amount_matches", sa.Boolean(), nullable=False),
        sa.Column("reference_matches", sa.Boolean(), nullable=False),
        sa.Column("reference_conflicts", sa.Boolean(), nullable=False),
        sa.Column("date_distance_days", sa.Integer(), nullable=False),
        sa.Column("text_similarity_basis_points", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["financial_event_id"], ["financial_events.id"]),
        sa.ForeignKeyConstraint(["raw_import_row_id"], ["raw_import_rows.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "raw_import_row_id",
            "financial_event_id",
            name="uq_reconciliation_candidate_row_event",
        ),
    )
    op.create_index(
        "ix_reconciliation_candidates_raw_import_row_id",
        "reconciliation_candidates",
        ["raw_import_row_id"],
    )
    op.create_index(
        "ix_reconciliation_candidates_financial_event_id",
        "reconciliation_candidates",
        ["financial_event_id"],
    )
    op.create_index(
        "ix_reconciliation_candidates_state",
        "reconciliation_candidates",
        ["state"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reconciliation_candidates_state", table_name="reconciliation_candidates"
    )
    op.drop_index(
        "ix_reconciliation_candidates_financial_event_id",
        table_name="reconciliation_candidates",
    )
    op.drop_index(
        "ix_reconciliation_candidates_raw_import_row_id",
        table_name="reconciliation_candidates",
    )
    op.drop_table("reconciliation_candidates")
