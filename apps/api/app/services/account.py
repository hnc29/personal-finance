"""Account business logic.

Thin service functions over the synchronous :class:`~sqlalchemy.orm.Session`.
No current balance is stored or computed here, and accounts are never
hard-deleted; callers deactivate them via ``is_active`` instead. Lookups
return ``None`` for an unknown id so the routing layer can map that to 404.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate


def create_account(db: Session, data: AccountCreate) -> Account:
    """Create and persist a new account."""
    account = Account(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session) -> list[Account]:
    """Return every account ordered by id."""
    return list(db.scalars(select(Account).order_by(Account.id)))


def get_account(db: Session, account_id: int) -> Account | None:
    """Return the account with ``account_id`` or ``None`` if absent."""
    return db.get(Account, account_id)


def update_account(
    db: Session, account_id: int, data: AccountUpdate
) -> Account | None:
    """Apply a partial update; return the account or ``None`` if absent."""
    account = db.get(Account, account_id)
    if account is None:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return account
