"""Pydantic schemas for the categories API.

Application/API representation of :class:`app.models.category.Category`. The
hierarchy is exposed through ``parent_id`` (an adjacency list); ``None`` denotes
a root category.
"""

from pydantic import BaseModel, ConfigDict


class CategoryBase(BaseModel):
    """Fields shared by category create and read schemas."""

    name: str
    parent_id: int | None = None
    is_active: bool = True
    icon: str | None = None
    """Icon-registry key (opaque to the backend); ``None`` = client default."""


class CategoryCreate(CategoryBase):
    """Payload for creating a category."""


class CategoryUpdate(BaseModel):
    """Partial category update; unset fields are left unchanged."""

    name: str | None = None
    parent_id: int | None = None
    is_active: bool | None = None
    icon: str | None = None


class CategoryRead(CategoryBase):
    """A category as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
