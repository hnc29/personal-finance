"""Account model and the supported account kinds."""

import enum

from sqlalchemy import Boolean, Enum, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AccountType(str, enum.Enum):
    """Kinds of account money can be held in."""

    CASH = "CASH"
    BANK = "BANK"
    CREDIT_CARD = "CREDIT_CARD"
    EWALLET = "EWALLET"


class Account(Base):
    """A place where money is held.

    No current-balance column is persisted; balances are derived from
    ledger entries.
    """

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, native_enum=False),
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="VND",
        server_default="VND",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("1"),
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
