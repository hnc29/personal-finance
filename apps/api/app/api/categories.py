"""HTTP routes for the categories API.

Thin adapters over :mod:`app.services.category`. Categories form a
``parent_id`` hierarchy and are never hard-deleted; deactivation is expressed
through ``is_active`` on update. An unknown category or parent id maps to 404,
while self-parenting is rejected as 400.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from app.services import category as category_service
from app.services.category import (
    InvalidHierarchyError,
    SelfParentError,
    UnknownParentError,
)

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(data: CategoryCreate, db: DbSession) -> Category:
    """Create a new category, validating any ``parent_id``."""
    try:
        return category_service.create_category(db, data)
    except UnknownParentError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent category not found",
        ) from exc
    except InvalidHierarchyError as exc:
        raise HTTPException(status_code=400, detail="Category hierarchy exceeds three levels or contains a cycle") from exc


@router.get("", response_model=list[CategoryRead])
def list_categories(db: DbSession) -> list[Category]:
    """Return every category ordered by id."""
    return category_service.list_categories(db)


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: int, db: DbSession) -> Category:
    """Return a single category or 404 if it does not exist."""
    category = category_service.get_category(db, category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    return category


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, data: CategoryUpdate, db: DbSession
) -> Category:
    """Apply a partial update or 404 if the category does not exist."""
    try:
        category = category_service.update_category(db, category_id, data)
    except SelfParentError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A category cannot be its own parent",
        ) from exc
    except UnknownParentError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent category not found",
        ) from exc
    except InvalidHierarchyError as exc:
        raise HTTPException(status_code=400, detail="Category hierarchy exceeds three levels or contains a cycle") from exc
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    return category
