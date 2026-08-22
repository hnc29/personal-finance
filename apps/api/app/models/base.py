"""Common declarative base for all ORM models.

Alembic is the sole schema authority; models never call
``Base.metadata.create_all()``.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy 2 typed declarative models."""
