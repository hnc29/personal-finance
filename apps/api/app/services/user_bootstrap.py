"""Helper to bootstrap default starter categories and cash account for a new user."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.user import User
from app.services.default_categories import DEFAULT_CATEGORIES, CategoryNode


def bootstrap_user_data(db: Session, user: User) -> None:
    """Initialize a brand-new user with starter categories and a default Cash account."""
    # 1. Create Default Cash Account
    existing_acc = db.scalar(select(Account).where(Account.user_id == user.id))
    if not existing_acc:
        cash_account = Account(
            user_id=user.id,
            name="Tiền mặt",
            account_type=AccountType.CASH,
            currency="VND",
            is_active=True,
            sort_order=0,
        )
        db.add(cash_account)

    # 2. Seed Default Categories for this user
    def add_nodes(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        for name, children in nodes:
            parent_id = parent.id if parent else None
            cat = Category(
                user_id=user.id,
                name=name,
                parent_id=parent_id,
                is_active=True,
            )
            db.add(cat)
            db.flush()
            add_nodes(children, cat)

    existing_cat = db.scalar(select(Category).where(Category.user_id == user.id))
    if not existing_cat:
        add_nodes(DEFAULT_CATEGORIES)

    db.commit()
