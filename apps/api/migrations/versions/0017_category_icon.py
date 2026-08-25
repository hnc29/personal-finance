"""Add categories.icon for per-category customizable icons.

TASK-036: category icons today are inferred purely from the category's
*name* via a client-side lookup table (``ICONS`` in
``apps/web/lib/category-icons.tsx``) -- there is no way for a user to pick a
different icon for a given category. The user wants to browse a broad icon
library and assign any icon to any category, overriding the name-based
default.

``icon`` is a nullable free-text column holding an *icon key* (a string id
into the frontend's icon registry, e.g. ``"Coffee"``) -- not an image, not a
URL. ``NULL`` means "no override, fall back to the name-based default",
matching how every existing category (created before this column existed)
keeps rendering exactly as it did. No backfill is needed or wanted: backfilling
every row with its current name-inferred icon key would freeze today's
name->icon mapping into stored data, so a future change to the *default*
mapping (e.g. a nicer default icon for "Coffee & Drinks") would no longer
reach categories that never asked for a custom icon.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0017_category_icon"
down_revision: str | Sequence[str] | None = "0016_account_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("icon", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "icon")
