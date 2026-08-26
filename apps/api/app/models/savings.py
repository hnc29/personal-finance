"""Savings products, accounts, and immutable term history persistence."""

from __future__ import annotations

import datetime
import enum
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import money_to_scaled, scaled_to_money
from app.models.base import Base


class SavingsAccountStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class DayCountConvention(str, enum.Enum):
    ACTUAL_365 = "ACTUAL_365"
    ACTUAL_360 = "ACTUAL_360"
    THIRTY_360 = "THIRTY_360"


class InterestPaymentMethod(str, enum.Enum):
    AT_MATURITY = "AT_MATURITY"
    UPFRONT = "UPFRONT"
    PERIODIC = "PERIODIC"


class MaturityAction(str, enum.Enum):
    CLOSE = "CLOSE"
    RENEW_PRINCIPAL = "RENEW_PRINCIPAL"
    RENEW_PRINCIPAL_AND_INTEREST = "RENEW_PRINCIPAL_AND_INTEREST"


class SavingsTermStatus(str, enum.Enum):
    """Per-term lifecycle state, independent of the parent account's status.

    A rollover chain accumulates one CLOSED term per renewal plus a final
    ACTIVE (or CLOSED/EARLY_CLOSED, once tất toán) term; the account itself
    only tracks OPEN/CLOSED as a whole.
    """

    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    EARLY_CLOSED = "EARLY_CLOSED"


class SavingsProduct(Base):
    """A savings offering from a financial institution."""

    __tablename__ = "savings_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    institution: Mapped[str] = mapped_column(String, nullable=False)
    currency: Mapped[str] = mapped_column(
        String, nullable=False, default="VND", server_default="VND"
    )
    accounts: Mapped[list[SavingsAccount]] = relationship(back_populates="product")


class SavingsAccount(Base):
    """A separately tracked savings holding, distinct from wallet accounts."""

    __tablename__ = "savings_accounts"
    __table_args__ = (
        CheckConstraint(
            "principal_scaled >= 0", name="ck_savings_account_principal_nonnegative"
        ),
        CheckConstraint(
            "closed_date IS NULL OR closed_date >= opened_date",
            name="ck_savings_account_dates_ordered",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("savings_products.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    principal_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    opened_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    closed_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    status: Mapped[SavingsAccountStatus] = mapped_column(
        Enum(SavingsAccountStatus, native_enum=False),
        nullable=False,
        default=SavingsAccountStatus.OPEN,
        server_default="OPEN",
    )
    funding_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id"), nullable=True
    )
    # User request, 2026-08-26: "không tính vào báo cáo" also applies to
    # newly-added assets -- this savings account still counts toward Net
    # Worth; it's just left out of income/expense summary reports.
    excluded_from_reports: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    product: Mapped[SavingsProduct] = relationship(back_populates="accounts")
    terms: Mapped[list[SavingsTerm]] = relationship(
        back_populates="account",
        foreign_keys="SavingsTerm.savings_account_id",
        order_by="SavingsTerm.sequence",
    )

    @property
    def principal(self) -> Decimal:
        return scaled_to_money(self.principal_scaled)

    @principal.setter
    def principal(self, value: Decimal | str | int) -> None:
        self.principal_scaled = money_to_scaled(value)


class SavingsTerm(Base):
    """One contractual term; predecessor links preserve rollover history."""

    __tablename__ = "savings_terms"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_savings_term_sequence_positive"),
        CheckConstraint(
            "principal_scaled > 0", name="ck_savings_term_principal_positive"
        ),
        CheckConstraint("term_months > 0", name="ck_savings_term_months_positive"),
        CheckConstraint(
            "annual_rate_scaled >= 0", name="ck_savings_term_rate_nonnegative"
        ),
        CheckConstraint(
            "non_term_rate_scaled >= 0", name="ck_savings_term_nonterm_rate_nonnegative"
        ),
        CheckConstraint(
            "maturity_date > start_date", name="ck_savings_term_dates_ordered"
        ),
        UniqueConstraint(
            "savings_account_id", "sequence", name="uq_savings_term_account_sequence"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    savings_account_id: Mapped[int] = mapped_column(
        ForeignKey("savings_accounts.id"), nullable=False
    )
    renewed_from_term_id: Mapped[int | None] = mapped_column(
        ForeignKey("savings_terms.id"), unique=True, nullable=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    principal_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    maturity_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    term_months: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_rate_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    non_term_rate_scaled: Mapped[int] = mapped_column(Integer, nullable=False)
    day_count_convention: Mapped[DayCountConvention] = mapped_column(
        Enum(DayCountConvention, native_enum=False), nullable=False
    )
    interest_payment_method: Mapped[InterestPaymentMethod] = mapped_column(
        Enum(InterestPaymentMethod, native_enum=False), nullable=False
    )
    maturity_action: Mapped[MaturityAction] = mapped_column(
        Enum(MaturityAction, native_enum=False), nullable=False
    )
    status: Mapped[SavingsTermStatus] = mapped_column(
        Enum(SavingsTermStatus, native_enum=False),
        nullable=False,
        default=SavingsTermStatus.ACTIVE,
        server_default="ACTIVE",
    )
    actual_interest_scaled: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    closed_at: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    account: Mapped[SavingsAccount] = relationship(
        back_populates="terms", foreign_keys=[savings_account_id]
    )
    renewed_from: Mapped[SavingsTerm | None] = relationship(
        remote_side=[id], foreign_keys=[renewed_from_term_id]
    )

    @property
    def principal(self) -> Decimal:
        return scaled_to_money(self.principal_scaled)

    @principal.setter
    def principal(self, value: Decimal | str | int) -> None:
        self.principal_scaled = money_to_scaled(value)

    @property
    def actual_interest(self) -> Decimal | None:
        return (
            None
            if self.actual_interest_scaled is None
            else scaled_to_money(self.actual_interest_scaled)
        )

    @actual_interest.setter
    def actual_interest(self, value: Decimal | str | int | None) -> None:
        self.actual_interest_scaled = (
            None if value is None else money_to_scaled(value)
        )

    @property
    def annual_rate(self) -> Decimal:
        return scaled_to_money(self.annual_rate_scaled)

    @annual_rate.setter
    def annual_rate(self, value: Decimal | str | int) -> None:
        self.annual_rate_scaled = money_to_scaled(value)

    @property
    def non_term_rate(self) -> Decimal:
        return scaled_to_money(self.non_term_rate_scaled)

    @non_term_rate.setter
    def non_term_rate(self, value: Decimal | str | int) -> None:
        self.non_term_rate_scaled = money_to_scaled(value)
