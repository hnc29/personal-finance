"""Ledger models: financial events and their per-account entries."""

import datetime
import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import scaled_to_money
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.import_batch import RawImportRow


class FinancialEventType(str, enum.Enum):
    """Kinds of financial event recorded in the ledger."""

    EXPENSE = "EXPENSE"
    INCOME = "INCOME"
    TRANSFER = "TRANSFER"
    CREDIT_CARD_PAYMENT = "CREDIT_CARD_PAYMENT"
    INTEREST = "INTEREST"
    SAVINGS_DEPOSIT = "SAVINGS_DEPOSIT"
    SAVINGS_WITHDRAWAL = "SAVINGS_WITHDRAWAL"
    ASSET_PURCHASE = "ASSET_PURCHASE"
    ASSET_SALE = "ASSET_SALE"
    ADJUSTMENT = "ADJUSTMENT"


class FinancialEvent(Base):
    """A single financial event; the unit that account entries hang off.

    ``transaction_date`` (the accounting date) and ``occurred_at`` (a precise
    timestamp, when one is known) are kept deliberately separate. Midnight is
    never fabricated for date-only sources, so ``occurred_at`` stays NULL when
    no time is known.
    """

    __tablename__ = "financial_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[FinancialEventType] = mapped_column(
        Enum(FinancialEventType, native_enum=False),
        nullable=False,
    )
    transaction_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    occurred_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"),
        nullable=True,
    )
    payee_text: Mapped[str | None] = mapped_column(String, nullable=True)
    trip_event_text: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_import_row_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_import_rows.id"), nullable=True, unique=True
    )

    entries: Mapped[list["AccountEntry"]] = relationship(
        "AccountEntry",
        back_populates="financial_event",
    )
    raw_import_row: Mapped["RawImportRow | None"] = relationship("RawImportRow")

    __table_args__ = (
        Index("ix_financial_events_transaction_date", "transaction_date"),
        Index("ix_financial_events_category_id", "category_id"),
    )


class AccountEntry(Base):
    """A signed movement against one account, belonging to a financial event.

    ``amount_scaled`` is a fixed-point integer scaled by ``MONEY_SCALE``:
    negative decreases the account, positive increases it. Never a float.
    """

    __tablename__ = "account_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    financial_event_id: Mapped[int] = mapped_column(
        ForeignKey("financial_events.id"),
        nullable=False,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id"),
        nullable=False,
    )
    amount_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False)

    financial_event: Mapped["FinancialEvent"] = relationship(
        "FinancialEvent",
        back_populates="entries",
    )

    @property
    def amount(self) -> Decimal:
        """Expose the application-layer Decimal amount for API schemas."""
        return scaled_to_money(self.amount_scaled)

    __table_args__ = (
        Index("ix_account_entries_financial_event_id", "financial_event_id"),
        Index("ix_account_entries_account_id", "account_id"),
    )
