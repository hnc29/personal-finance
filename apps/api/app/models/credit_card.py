"""Credit-card account profile persistence."""

from __future__ import annotations

import calendar
import datetime
import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import money_to_scaled, scaled_to_money
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.account import Account


class CreditCardProfile(Base):
    """Billing configuration attached to exactly one credit-card account."""

    __tablename__ = "credit_card_profiles"
    __table_args__ = (
        CheckConstraint(
            "credit_limit_scaled >= 0", name="ck_credit_card_limit_nonnegative"
        ),
        CheckConstraint(
            "statement_day BETWEEN 1 AND 31", name="ck_credit_card_statement_day"
        ),
        CheckConstraint(
            "payment_due_day BETWEEN 1 AND 31", name="ck_credit_card_due_day"
        ),
        CheckConstraint(
            "payment_due_month_offset >= 0", name="ck_credit_card_due_offset"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id"), unique=True, nullable=False
    )
    credit_limit_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    statement_day: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_due_day: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_due_month_offset: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    account: Mapped[Account] = relationship(back_populates="credit_card_profile")

    @property
    def credit_limit(self) -> Decimal:
        """Return the limit in application money representation."""
        return scaled_to_money(self.credit_limit_scaled)

    @credit_limit.setter
    def credit_limit(self, value: Decimal | str | int) -> None:
        self.credit_limit_scaled = money_to_scaled(value)


class CreditCardStatementStatus(str, enum.Enum):
    OPEN = "OPEN"
    ISSUED = "ISSUED"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"


class CreditCardStatement(Base):
    __tablename__ = "credit_card_statements"
    __table_args__ = (
        CheckConstraint(
            "balance_due_scaled >= 0", name="ck_cc_statement_due_nonnegative"
        ),
        CheckConstraint("paid_scaled >= 0", name="ck_cc_statement_paid_nonnegative"),
        CheckConstraint(
            "paid_scaled <= balance_due_scaled", name="ck_cc_statement_paid_not_excess"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("credit_card_profiles.id"), nullable=False
    )
    statement_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    due_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    balance_due_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_scaled: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    status: Mapped[CreditCardStatementStatus] = mapped_column(
        Enum(CreditCardStatementStatus, native_enum=False),
        nullable=False,
        default=CreditCardStatementStatus.OPEN,
        server_default="OPEN",
    )
    profile: Mapped[CreditCardProfile] = relationship()

    @property
    def balance_due(self) -> Decimal:
        return scaled_to_money(self.balance_due_scaled)

    @property
    def paid(self) -> Decimal:
        return scaled_to_money(self.paid_scaled)

    def refresh_status(
        self, as_of: datetime.date | None = None
    ) -> CreditCardStatementStatus:
        today = as_of or datetime.datetime.now(datetime.UTC).date()
        if self.paid_scaled >= self.balance_due_scaled:
            self.status = CreditCardStatementStatus.PAID
        elif self.paid_scaled > 0:
            self.status = (
                CreditCardStatementStatus.OVERDUE
                if today > self.due_date
                else CreditCardStatementStatus.PARTIALLY_PAID
            )
        elif self.status is CreditCardStatementStatus.OPEN:
            pass
        else:
            self.status = (
                CreditCardStatementStatus.OVERDUE
                if today > self.due_date
                else CreditCardStatementStatus.ISSUED
            )
        return self.status


def calculate_due_date(
    statement_date: datetime.date, due_day: int, month_offset: int = 0
) -> datetime.date:
    month_index = statement_date.year * 12 + statement_date.month - 1 + month_offset
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    return datetime.date(year, month, min(due_day, calendar.monthrange(year, month)[1]))
