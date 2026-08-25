"""Pydantic schemas for the accounts API.

Application/API representation of :class:`app.models.account.Account`. No
balance is exposed; balances are derived from ledger entries elsewhere.
"""

from pydantic import BaseModel, ConfigDict

from app.models.account import AccountType


class AccountBase(BaseModel):
    """Fields shared by account create and read schemas."""

    name: str
    account_type: AccountType
    currency: str = "VND"
    is_active: bool = True


class AccountCreate(AccountBase):
    """Payload for creating an account."""


class AccountUpdate(BaseModel):
    """Partial account update; unset fields are left unchanged."""

    name: str | None = None
    account_type: AccountType | None = None
    currency: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class AccountRead(AccountBase):
    """An account as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    sort_order: int
