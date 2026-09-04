"""Account business logic.

Thin service functions over the synchronous :class:`~sqlalchemy.orm.Session`.
No current balance is stored or computed here, and accounts are never
hard-deleted; callers deactivate them via ``is_active`` instead. Lookups
return ``None`` for an unknown id so the routing layer can map that to 404.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType
from app.models.credit_card import CreditCardProfile
from app.schemas.account import AccountCreate, AccountUpdate


def create_account(db: Session, data: AccountCreate, user_id: int = 1) -> Account:
    """Create and persist a new account, appended to the end of the order."""
    next_order = (
        db.scalar(select(func.max(Account.sort_order)).where(Account.user_id == user_id)) or 0
    ) + 1
    dump = data.model_dump()
    credit_limit = dump.pop("credit_limit", None)
    account = Account(**dump, user_id=user_id, sort_order=next_order)
    db.add(account)
    db.flush()
    if account.account_type == AccountType.CREDIT_CARD and credit_limit is not None and str(credit_limit).strip():
        profile = CreditCardProfile(
            account_id=account.id,
            credit_limit=credit_limit,
            statement_day=1,
            payment_due_day=15,
            payment_due_month_offset=0,
        )
        db.add(profile)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session, user_id: int | None = None) -> list[Account]:
    """Return every account ordered by its user-controlled sort_order.

    ``id`` is a stable tiebreaker for rows that happen to share a
    sort_order (e.g. legacy rows migrated to the same initial value).
    """
    stmt = select(Account).order_by(Account.sort_order, Account.id)
    if user_id is not None:
        stmt = stmt.where(Account.user_id == user_id)
    return list(db.scalars(stmt))


def get_account(db: Session, account_id: int, user_id: int | None = None) -> Account | None:
    """Return the account with ``account_id`` or ``None`` if absent."""
    if user_id is not None:
        return db.scalar(select(Account).where(Account.id == account_id, Account.user_id == user_id))
    return db.get(Account, account_id)


def update_account(
    db: Session, account_id: int, data: AccountUpdate, user_id: int | None = None
) -> Account | None:
    """Apply a partial update; return the account or ``None`` if absent."""
    account = get_account(db, account_id, user_id)
    if account is None:
        return None

    update_dict = data.model_dump(exclude_unset=True)
    credit_limit = update_dict.pop("credit_limit", None)
    for field, value in update_dict.items():
        setattr(account, field, value)

    if account.account_type == AccountType.CREDIT_CARD and credit_limit is not None:
        profile = db.scalar(
            select(CreditCardProfile).where(CreditCardProfile.account_id == account.id)
        )
        if profile is None:
            if str(credit_limit).strip():
                profile = CreditCardProfile(
                    account_id=account.id,
                    credit_limit=credit_limit,
                    statement_day=1,
                    payment_due_day=15,
                    payment_due_month_offset=0,
                )
                db.add(profile)
        else:
            if str(credit_limit).strip():
                profile.credit_limit = credit_limit

    db.commit()
    db.refresh(account)
    return account
