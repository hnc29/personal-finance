"""HTTP routes for the accounts API.

Thin adapters over :mod:`app.services.account`. Accounts are never
hard-deleted; deactivation is expressed through ``is_active`` on update. An
unknown account id maps to 404.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountRead, AccountUpdate
from app.schemas.ledger import AccountBalanceRead
from app.services import account as account_service
from app.services import ledger as ledger_service

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


@router.post(
    "",
    response_model=AccountRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_account(data: AccountCreate, db: DbSession) -> Account:
    """Create a new account."""
    return account_service.create_account(db, data)


@router.get("", response_model=list[AccountRead], response_model_exclude_none=True)
def list_accounts(db: DbSession) -> list[Account]:
    """Return every account ordered by its user-controlled sort_order."""
    return account_service.list_accounts(db)


@router.get("/{account_id}", response_model=AccountRead, response_model_exclude_none=True)
def get_account(account_id: int, db: DbSession) -> Account:
    """Return a single account or 404 if it does not exist."""
    account = account_service.get_account(db, account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.get("/{account_id}/balance", response_model=AccountBalanceRead)
def get_account_balance(account_id: int, db: DbSession) -> AccountBalanceRead:
    """Return the account's balance summed from its entries, or 404."""
    balance = ledger_service.account_balance(db, account_id)
    if balance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return AccountBalanceRead(account_id=account_id, balance=balance)


@router.patch("/{account_id}", response_model=AccountRead, response_model_exclude_none=True)
def update_account(
    account_id: int, data: AccountUpdate, db: DbSession
) -> Account:
    """Apply a partial update or 404 if the account does not exist."""
    account = account_service.update_account(db, account_id, data)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account
