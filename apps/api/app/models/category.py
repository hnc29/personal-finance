"""Category model using an adjacency-list hierarchy."""

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Category(Base):
    """A spending/income category.

    Hierarchy uses a self-referencing ``parent_id`` adjacency list and
    supports unlimited depth at the database level; any UI depth limit is
    enforced elsewhere.
    """

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("1"),
    )
    icon: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
        default=None,
    )
    """Optional icon-registry key overriding the name-based default icon.

    ``None`` means "use the client's name-based default" -- see migration
    0017 for why this is never backfilled.
    """

    parent: Mapped["Category | None"] = relationship(
        "Category",
        remote_side="Category.id",
        back_populates="children",
    )
    children: Mapped[list["Category"]] = relationship(
        "Category",
        back_populates="parent",
    )
