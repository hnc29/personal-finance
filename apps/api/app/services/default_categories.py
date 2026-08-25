"""Deterministic starter category taxonomy for a new ledger."""

from collections.abc import Sequence

from sqlalchemy import select
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
        ("Insurance", ()), ("Taxes & Fees", ()),
        # TASK-035: added while reconciling the seed taxonomy against a real
        # Moneylover export -- these three showed up as materially large,
        # recurring categories with no good existing fit (debt/loan cash
        # flow, crypto investment outflow, and large pay-on-behalf transfers).
        ("Debt Repayment", ()), ("Loans Given", ()),
        ("Investments", (("Crypto", ()),)),
        ("Paid on Behalf", ()),
        ("Other Expense", ()),
    )),
    ("Income", (
        ("Salary", ()), ("Bonus", ()), ("Business Income", ()),
        ("Investment Income", (("Crypto Gains", ()),)),
        ("Interest", ()), ("Gifts Received", ()), ("Refunds", ()),
        # TASK-035: income-side counterparts of the debt/loan and
        # pay-on-behalf additions above.
        ("Loans & Debt Collection", ()), ("Collected on Behalf", ()),
        ("Other Income", ()),
    )),
)


def merge_default_categories(db: Session) -> dict[str, int]:
    """Safely merge the canonical tree, preserving conflicting user rows."""
    created = existing = conflicts = 0

    def add(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        nonlocal created, existing, conflicts
        for name, children in nodes:
            parent_id = parent.id if parent else None
            category = db.scalar(select(Category).where(Category.name == name, Category.parent_id == parent_id))
            if category is None:
                conflict = db.scalar(select(Category).where(Category.name == name))
                if conflict is not None:
                    conflicts += 1
                    existing += 1
                    add(children, conflict)
                    continue
                category = Category(name=name, parent=parent)
                db.add(category)
                db.flush()
                created += 1
            else:
                existing += 1
            add(children, category)

    try:
        add(DEFAULT_CATEGORIES)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"inserted": created, "existing": existing, "conflicts": conflicts}


def seed_default_categories(db: Session, *, force: bool = False) -> int:
    """Backward-compatible wrapper for the safe merge."""
    if not force and db.scalar(select(Category.id)) is not None:
        return 0
    return merge_default_categories(db)["inserted"]


def missing_default_categories(db: Session) -> int:
    """Count canonical paths that are absent without changing the database."""
    missing = 0

    def check(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        nonlocal missing
        for name, children in nodes:
            parent_id = parent.id if parent else None
            category = db.scalar(select(Category).where(Category.name == name, Category.parent_id == parent_id))
            if category is None:
                category = db.scalar(select(Category).where(Category.name == name))
            if category is None:
                missing += 1
                check_missing(children)
            else:
                check(children, category)

    def check_missing(nodes: Sequence[CategoryNode]) -> None:
        nonlocal missing
        for _name, children in nodes:
            missing += 1
            check_missing(children)

    check(DEFAULT_CATEGORIES)
    return missing
