"""Add excluded_from_reports to financial_events, precious_metal_holdings,
crypto_holdings, and savings_accounts.

User request, 2026-08-26: "hãy thêm cho tôi tính năng không tính vào báo cáo
đối với giao dịch nhập mới ... Nút tích 'không tính vào báo cáo' này cũng áp
dụng với việc thêm tài sản mới" -- an opt-in per-record flag so a
transaction or asset still books/counts normally everywhere it already did
(account balances, entries, Net Worth) but can be marked to be left out of a
future income/expense summary report. Scoped to the four record kinds a
person actually creates through "Ghi giao dịch" or the Assets tab's three
add forms (Savings/Precious metals/Crypto) -- not to plain wallet Accounts,
which aren't "assets" in that tab's sense.

Modeled directly after the existing ``is_net_worth`` column on
``precious_metal_holdings``/``crypto_holdings`` (same Boolean +
server_default="0"/"1" pattern) -- deliberately a *separate* column from
``is_net_worth``, not a reuse of it, since the two are independent: an
asset can still count toward Net Worth while being excluded from reports.

None of these four columns are foreign keys, so a plain ``op.add_column``
with ``server_default`` works directly (no inline REFERENCES clause, so
none of the raw-SQL workaround 0018 needed for
``raw_import_row_id_secondary`` applies here) -- matches the style already
used by 0016/0017, both real-data-safe.

Revision ID: 0019_excluded_from_reports
Revises: 0018_transfer_pair_import
Create Date: 2026-08-26
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_excluded_from_reports"
down_revision: str | Sequence[str] | None = "0018_transfer_pair_import"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = (
    "financial_events",
    "precious_metal_holdings",
    "crypto_holdings",
    "savings_accounts",
)


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                "excluded_from_reports",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "excluded_from_reports")
