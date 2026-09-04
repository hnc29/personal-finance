"""Ledger models: financial events and their per-account entries."""

import datetime
import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    text,
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
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        default=1,
        server_default=text("1"),
        index=True,
    )
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
    # TASK-040: a Money Lover internal transfer between the user's own
    # wallets is exported as TWO raw rows -- "Tiền chuyển đi" (outgoing) on
    # the source wallet and "Tiền chuyển đến" (incoming) on the destination
    # wallet. moneylover_apply.py pairs those into ONE balanced TRANSFER
    # event instead of two separate EXPENSE/INCOME events (which would
    # double-count the same money movement), so that single event needs to
    # record both raw rows it was built from -- otherwise a re-run of
    # auto-apply would see the second row as still unapplied and try to
    # book it again as a standalone income/expense.
    raw_import_row_id_secondary: Mapped[int | None] = mapped_column(
        ForeignKey("raw_import_rows.id"), nullable=True, unique=True
    )
    # User request, 2026-08-26: "không tính vào báo cáo đối với giao dịch
    # nhập mới" -- an opt-in per-event flag so a transaction still books
    # normally (account balances, entries -- everything ledger-side is
    # unaffected) but can be marked to be left out of income/expense
    # summary reports. Defaults False so every existing and newly-created
    # event keeps counting unless explicitly excluded.
    excluded_from_reports: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )

    # TASK-042: "all, delete-orphan" so deleting a FinancialEvent (or
    # reassigning `.entries` to a new list, as update_financial_event does)
    # removes its AccountEntry rows through the ORM's unit-of-work instead
    # of leaving them to be deleted by hand. This matters concretely on
    # SQLite: the app enables `PRAGMA foreign_keys=ON` on every connection
    # (app/core/database.py), so `DELETE FROM financial_events` would fail
    # the foreign-key check while an account_entries row still references
    # it -- SQLAlchemy's cascade orders the child deletes first, satisfying
    # that constraint automatically. Before this task nothing ever deleted
    # or replaced an event's entries, so the plain (non-cascading) default
    # was never exercised this way.
    entries: Mapped[list["AccountEntry"]] = relationship(
        "AccountEntry",
        back_populates="financial_event",
        cascade="all, delete-orphan",
    )
    raw_import_row: Mapped["RawImportRow | None"] = relationship(
        "RawImportRow", foreign_keys=[raw_import_row_id]
    )
    raw_import_row_secondary: Mapped["RawImportRow | None"] = relationship(
        "RawImportRow", foreign_keys=[raw_import_row_id_secondary]
    )

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
