"""Pydantic schemas for the financial-events (ledger) API.

Application/API representation of :class:`app.models.ledger.FinancialEvent` and
its :class:`app.models.ledger.AccountEntry` rows. Monetary amounts cross this
boundary as :class:`decimal.Decimal`; the scaled-integer persistence form
(``amount_scaled``) is never exposed. Conversion happens in the service layer
through ``money_to_scaled``/``scaled_to_money``.
"""

import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import money_to_scaled
from app.models.ledger import FinancialEventType


class AccountEntryCreate(BaseModel):
    """A signed movement against one account, in application money."""

    account_id: int
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


class FinancialEventCreate(BaseModel):
    """Payload for creating a financial event with its account entries.

    ``transaction_date`` is the accounting date; ``occurred_at`` is an optional,
    separate precise timestamp left unset when no time is known.
    """

    event_type: FinancialEventType
    transaction_date: datetime.date
    occurred_at: datetime.datetime | None = None
    category_id: int | None = None
    payee_text: str | None = None
    trip_event_text: str | None = None
    note: str | None = None
    entries: list[AccountEntryCreate] = Field(min_length=1)


class AccountEntryRead(BaseModel):
    """An account entry as returned by the API, amount in application money."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    amount: Decimal


class FinancialEventRead(BaseModel):
    """A financial event and its entries as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: FinancialEventType
    transaction_date: datetime.date
    occurred_at: datetime.datetime | None
    category_id: int | None
    payee_text: str | None
    trip_event_text: str | None
    note: str | None
    entries: list[AccountEntryRead]


class AccountBalanceRead(BaseModel):
    """An account's balance, summed from its entries, in application money."""

    account_id: int
    balance: Decimal
