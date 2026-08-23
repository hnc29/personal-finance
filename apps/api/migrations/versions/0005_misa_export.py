"""0005_misa_export

Add MISA export configurations, explicit account mappings, and export history.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_misa_export"
down_revision: str | Sequence[str] | None = "0004_normalized_import"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "misa_export_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "export_format",
            sa.Enum("BANK_STATEMENT_XLSX", name="misaexportformat", native_enum=False),
            nullable=False,
        ),
        sa.Column("currency", sa.String(), server_default="VND", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "misa_account_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("configuration_id", sa.Integer(), nullable=False),
        sa.Column("source_account_id", sa.Integer(), nullable=False),
        sa.Column("target_account_code", sa.String(), nullable=False),
        sa.Column("target_account_name", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["configuration_id"], ["misa_export_configurations.id"]),
        sa.ForeignKeyConstraint(["source_account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "configuration_id", "source_account_id", name="uq_misa_mapping_configuration_source"
        ),
    )
    op.create_index(
        "ix_misa_account_mappings_source_account_id",
        "misa_account_mappings",
        ["source_account_id"],
    )
    op.create_table(
        "misa_export_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("configuration_id", sa.Integer(), nullable=False),
        sa.Column("exported_at", sa.DateTime(), nullable=False),
        sa.Column("output_filename", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["configuration_id"], ["misa_export_configurations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "configuration_id", name="uq_misa_export_run_configuration"),
    )
    op.create_index(
        "ix_misa_export_runs_configuration_id",
        "misa_export_runs",
        ["configuration_id"],
    )
    op.create_table(
        "misa_exported_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("export_run_id", sa.Integer(), nullable=False),
        sa.Column("configuration_id", sa.Integer(), nullable=False),
        sa.Column("financial_event_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["export_run_id", "configuration_id"],
            ["misa_export_runs.id", "misa_export_runs.configuration_id"],
            name="fk_misa_exported_event_run_configuration",
        ),
        sa.ForeignKeyConstraint(["financial_event_id"], ["financial_events.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "configuration_id", "financial_event_id", name="uq_misa_exported_configuration_event"
        ),
    )
    op.create_index(
        "ix_misa_exported_events_export_run_id",
        "misa_exported_events",
        ["export_run_id"],
    )
    op.create_index(
        "ix_misa_exported_events_financial_event_id",
        "misa_exported_events",
        ["financial_event_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_misa_exported_events_financial_event_id", table_name="misa_exported_events")
    op.drop_index("ix_misa_exported_events_export_run_id", table_name="misa_exported_events")
    op.drop_table("misa_exported_events")
    op.drop_index("ix_misa_export_runs_configuration_id", table_name="misa_export_runs")
    op.drop_table("misa_export_runs")
    op.drop_index("ix_misa_account_mappings_source_account_id", table_name="misa_account_mappings")
    op.drop_table("misa_account_mappings")
    op.drop_table("misa_export_configurations")
