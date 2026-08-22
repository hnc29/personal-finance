"""0003_import

Create the import tables: ``import_batches`` and ``raw_import_rows``.

Revision ID: 0003_import
Revises: 0002_ledger
Create Date: 2026-08-22

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_import"
down_revision: str | Sequence[str] | None = "0002_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("file_sha256", sa.String(), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_import_batches_file_sha256",
        "import_batches",
        ["file_sha256"],
        unique=False,
    )
    op.create_table(
        "raw_import_rows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=False),
        sa.Column("source_row_number", sa.Integer(), nullable=False),
        sa.Column("source_row_id", sa.String(), nullable=True),
        sa.Column("raw_payload", sa.Text(), nullable=False),
        sa.Column("semantic_fingerprint", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "import_batch_id",
            "source_row_number",
            name="uq_raw_import_rows_batch_row_number",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("raw_import_rows")
    op.drop_index(
        "ix_import_batches_file_sha256", table_name="import_batches"
    )
    op.drop_table("import_batches")
