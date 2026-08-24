"""Deterministic starter category taxonomy for a new ledger."""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.category import Category

CategoryNode = tuple[str, Sequence["CategoryNode"]]

DEFAULT_CATEGORIES: Sequence[CategoryNode] = (
    ("Expenses", (
        ("Food & Drinks", (("Groceries", ()), ("Eating Out", ()), ("Coffee & Drinks", ()))),
        ("Bills & Utilities", (("Electricity", ()), ("Water", ()), ("Internet", ()), ("Mobile Phone", ()), ("Rent", ()), ("Gas", ()))),
        ("Transportation", (("Fuel", ()), ("Parking", ()), ("Taxi & Ride-hailing", ()), ("Public Transport", ()), ("Vehicle Maintenance", ()))),
        ("Shopping", (("Clothing", ()), ("Electronics", ()), ("Personal Items", ()), ("Household", ()))),
        ("Home & Family", (("Home Maintenance", ()), ("Family", ()), ("Children", ()), ("Pets", ()))),
        ("Health & Fitness", (("Medical", ()), ("Pharmacy", ()), ("Fitness", ()))),
        ("Entertainment", (("Movies & Events", ()), ("Games", ()), ("Subscriptions", ()), ("Hobbies", ()))),
        ("Education", (("Tuition", ()), ("Books", ()), ("Courses", ()))),
        ("Travel", (("Flights", ()), ("Accommodation", ()), ("Local Transport", ()), ("Activities", ()))),
        ("Gifts & Donations", (("Gifts", ()), ("Charity", ()))),
        ("Insurance", ()), ("Taxes & Fees", ()), ("Other Expense", ()),
    )),
    ("Income", (("Salary", ()), ("Bonus", ()), ("Business Income", ()), ("Investment Income", ()), ("Interest", ()), ("Gifts Received", ()), ("Refunds", ()), ("Other Income", ()))),
)


def seed_default_categories(db: Session, *, force: bool = False) -> int:
    """Seed the catalog when empty; forced calls add only missing exact paths."""
    if not force and db.scalar(select(func.count(Category.id))) != 0:
        return 0
    created = 0

    def add(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        nonlocal created
        for name, children in nodes:
            category = db.scalar(select(Category).where(Category.name == name, Category.parent_id == (parent.id if parent else None)))
            if category is None:
                category = Category(name=name, parent=parent)
                db.add(category)
                db.flush()
                created += 1
            add(children, category)

    add(DEFAULT_CATEGORIES)
    db.commit()
    return created
