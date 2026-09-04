"""Add users table and user_id tenancy column to all user-scoped tables.

Revision ID: 0020_user_authentication_multitenancy
Revises: 0019_excluded_from_reports
Create Date: 2026-09-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.security import hash_password

revision: str = "0020_user_authentication_multitenancy"
down_revision: str | Sequence[str] | None = "0019_excluded_from_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_USER_SCOPED_TABLES = (
    "accounts",
    "categories",
    "financial_events",
    "savings_accounts",
    "precious_metal_holdings",
    "crypto_holdings",
    "import_batches",
    "reconciliation_candidates",
    "misa_export_runs",
    "portfolio_snapshots",
)


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create users table if it does not exist
    existing_tables = [
        row[0]
        for row in conn.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
    ]

    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("username", sa.String(length=64), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("ix_users_username", "users", ["username"], unique=True)
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 2. Insert default admin user if not already present
    admin_pw_hash = hash_password("admin")
    admin_exists = conn.execute(
        sa.text("SELECT id FROM users WHERE username = 'admin'")
    ).fetchone()

    if not admin_exists:
        conn.execute(
            sa.text(
                "INSERT INTO users (id, username, password_hash, display_name, is_active, is_admin) "
                "VALUES (1, 'admin', :pw_hash, 'Admin', 1, 1)"
            ),
            {"pw_hash": admin_pw_hash},
        )

    # 3. Add user_id column with server_default=1
    for table_name in _USER_SCOPED_TABLES:
        if table_name in existing_tables:
            columns = [
                row[1]
                for row in conn.execute(
                    sa.text(f"PRAGMA table_info({table_name})")
                ).fetchall()
            ]
            if "user_id" not in columns:
                op.execute(
                    f"ALTER TABLE {table_name} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"
                )
            op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_user_id ON {table_name}(user_id)")


def downgrade() -> None:
    for table_name in reversed(_USER_SCOPED_TABLES):
        op.execute(f"DROP INDEX IF EXISTS ix_{table_name}_user_id")
        op.execute(f"ALTER TABLE {table_name} DROP COLUMN user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
