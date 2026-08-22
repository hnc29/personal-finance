"""Category business logic.

Thin service functions over the synchronous :class:`~sqlalchemy.orm.Session`,
mirroring the account service. Categories form an adjacency-list hierarchy via
``parent_id`` and are never hard-deleted; callers deactivate them via
``is_active`` instead. Lookups return ``None`` for an unknown id so the routing
layer can map that to 404, while parent-integrity violations raise so they can
be reported distinctly. No database depth limit is enforced.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate


class UnknownParentError(Exception):
    """Raised when a referenced ``parent_id`` does not exist."""


class SelfParentError(Exception):
    """Raised when a category would be set as its own parent."""


def create_category(db: Session, data: CategoryCreate) -> Category:
    """Create and persist a category, validating any ``parent_id``."""
    if data.parent_id is not None and db.get(Category, data.parent_id) is None:
        raise UnknownParentError(data.parent_id)

    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def list_categories(db: Session) -> list[Category]:
    """Return every category ordered by id."""
    return list(db.scalars(select(Category).order_by(Category.id)))


def get_category(db: Session, category_id: int) -> Category | None:
    """Return the category with ``category_id`` or ``None`` if absent."""
    return db.get(Category, category_id)


def update_category(
    db: Session, category_id: int, data: CategoryUpdate
) -> Category | None:
    """Apply a partial update; return the category or ``None`` if absent.

    A supplied ``parent_id`` is validated: it may not reference the category
    itself and must point to an existing category.
    """
    category = db.get(Category, category_id)
    if category is None:
        return None

    fields = data.model_dump(exclude_unset=True)
    parent_id = fields.get("parent_id")
    if "parent_id" in fields and parent_id is not None:
        if parent_id == category_id:
            raise SelfParentError(category_id)
        if db.get(Category, parent_id) is None:
            raise UnknownParentError(parent_id)

    for field, value in fields.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category
