"""Savings lifecycle actions and exact interest calculations."""

from __future__ import annotations

import calendar
import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.money import money_to_scaled, scaled_to_money
from app.models.account import Account
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.models.savings import (
    DayCountConvention,
    InterestPaymentMethod,
    MaturityAction,
    SavingsAccount,
    SavingsAccountStatus,
    SavingsProduct,
    SavingsTerm,
)


class SavingsActionError(ValueError):
    """Raised when a savings lifecycle action violates its invariants."""


def _asset_movement(
    db: Session,
    *,
    account_id: int,
    amount_scaled: int,
    event_type: FinancialEventType,
    transaction_date: datetime.date,
) -> None:
    if db.get(Account, account_id) is None:
        raise SavingsActionError("wallet account not found")
    db.add(
        FinancialEvent(
            event_type=event_type,
            transaction_date=transaction_date,
            entries=[AccountEntry(account_id=account_id, amount_scaled=amount_scaled)],
        )
    )


def _require_open(account: SavingsAccount) -> None:
    if account.status is not SavingsAccountStatus.OPEN:
        raise SavingsActionError("savings account is closed")


def _add_months(value: datetime.date, months: int) -> datetime.date:
    month = value.month - 1 + months
    year, month = value.year + month // 12, month % 12 + 1
    return value.replace(
        year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1])
    )


def open_savings(
    db: Session,
    *,
    product: SavingsProduct,
    name: str,
    principal: Decimal | str | int,
    opened_date: datetime.date,
    term_months: int | None = None,
    annual_rate: Decimal | str | int = "0",
    non_term_rate: Decimal | str | int = "0",
    day_count_convention: DayCountConvention = DayCountConvention.ACTUAL_365,
    interest_payment_method: InterestPaymentMethod = InterestPaymentMethod.AT_MATURITY,
    maturity_action: MaturityAction = MaturityAction.CLOSE,
) -> SavingsAccount:
    principal_scaled = money_to_scaled(principal)
    annual_rate_scaled = money_to_scaled(annual_rate)
    non_term_rate_scaled = money_to_scaled(non_term_rate)
    if principal_scaled < 0:
        raise SavingsActionError("principal must not be negative")
    if annual_rate_scaled < 0 or non_term_rate_scaled < 0:
        raise SavingsActionError("rates must not be negative")
    account = SavingsAccount(
        product=product,
        name=name,
        principal_scaled=principal_scaled,
        opened_date=opened_date,
    )
    if term_months is not None:
        if term_months <= 0 or principal_scaled <= 0:
            raise SavingsActionError("term months and principal must be positive")
        account.terms.append(
            SavingsTerm(
                sequence=1,
                principal_scaled=principal_scaled,
                start_date=opened_date,
                maturity_date=_add_months(opened_date, term_months),
                term_months=term_months,
                annual_rate_scaled=annual_rate_scaled,
                non_term_rate_scaled=non_term_rate_scaled,
                day_count_convention=day_count_convention,
                interest_payment_method=interest_payment_method,
                maturity_action=maturity_action,
            )
        )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def add_to_savings(
    db: Session,
    account: SavingsAccount,
    amount: Decimal | str | int,
    *,
    source_account_id: int | None = None,
    transaction_date: datetime.date | None = None,
) -> SavingsAccount:
    _require_open(account)
    value = money_to_scaled(amount)
    if value <= 0:
        raise SavingsActionError("amount must be positive")
    if source_account_id is not None:
        _asset_movement(
            db,
            account_id=source_account_id,
            amount_scaled=-value,
            event_type=FinancialEventType.SAVINGS_DEPOSIT,
            transaction_date=transaction_date
            or datetime.datetime.now(datetime.UTC).date(),
        )
    account.principal_scaled += value
    db.commit()
    db.refresh(account)
    return account


def partial_withdraw(
    db: Session,
    account: SavingsAccount,
    amount: Decimal | str | int,
    *,
    as_of: datetime.date | None = None,
    destination_account_id: int | None = None,
) -> SavingsAccount:
    _require_open(account)
    value = money_to_scaled(amount)
    if value <= 0 or value > account.principal_scaled:
        raise SavingsActionError(
            "withdrawal must be positive and no greater than principal"
        )
    if destination_account_id is not None:
        _asset_movement(
            db,
            account_id=destination_account_id,
            amount_scaled=value,
            event_type=FinancialEventType.SAVINGS_WITHDRAWAL,
            transaction_date=as_of or datetime.datetime.now(datetime.UTC).date(),
        )
    account.principal_scaled -= value
    if account.principal_scaled == 0:
        account.status = SavingsAccountStatus.CLOSED
        account.closed_date = as_of or datetime.datetime.now(datetime.UTC).date()
    db.commit()
    db.refresh(account)
    return account


def close_savings(
    db: Session, account: SavingsAccount, *, closed_date: datetime.date
) -> SavingsAccount:
    _require_open(account)
    if closed_date < account.opened_date:
        raise SavingsActionError("closed date precedes opening date")
    account.status = SavingsAccountStatus.CLOSED
    account.closed_date = closed_date
    db.commit()
    db.refresh(account)
    return account


def calculate_interest(
    term: SavingsTerm, *, end_date: datetime.date | None = None
) -> Decimal:
    end = end_date or term.maturity_date
    if term.day_count_convention is DayCountConvention.THIRTY_360:
        start_day = min(term.start_date.day, 30)
        end_day = min(end.day, 30) if start_day == 30 else end.day
        days = (
            (end.year - term.start_date.year) * 360
            + (end.month - term.start_date.month) * 30
            + end_day
            - start_day
        )
    else:
        days = (end - term.start_date).days
    if days < 0:
        raise SavingsActionError("end date precedes term start")
    denominator = (
        360
        if term.day_count_convention is DayCountConvention.ACTUAL_360
        else 360
        if term.day_count_convention is DayCountConvention.THIRTY_360
        else 365
    )
    rate = term.annual_rate if end >= term.maturity_date else term.non_term_rate
    return (
        term.principal * rate / Decimal(100) * Decimal(days) / Decimal(denominator)
    ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def record_interest(
    db: Session,
    account: SavingsAccount,
    amount: Decimal | str | int,
    *,
    capitalize: bool = False,
) -> Decimal:
    """Record interest, optionally adding it to savings principal."""
    _require_open(account)
    amount_scaled = money_to_scaled(amount)
    if amount_scaled < 0:
        raise SavingsActionError("interest must not be negative")
    if capitalize:
        account.principal_scaled += amount_scaled
        db.commit()
        db.refresh(account)
    return scaled_to_money(amount_scaled)


def renew_savings(
    db: Session,
    account: SavingsAccount,
    *,
    start_date: datetime.date,
    interest: Decimal | str | int = "0",
) -> SavingsTerm:
    _require_open(account)
    previous = account.terms[-1] if account.terms else None
    if previous is None:
        raise SavingsActionError("no term to renew")
    interest_scaled = money_to_scaled(interest)
    if interest_scaled < 0:
        raise SavingsActionError("interest must not be negative")
    if previous.maturity_action is MaturityAction.CLOSE:
        raise SavingsActionError("term maturity action does not allow renewal")
    principal_scaled = previous.principal_scaled
    if previous.maturity_action is MaturityAction.RENEW_PRINCIPAL_AND_INTEREST:
        principal_scaled += interest_scaled
    if principal_scaled <= 0:
        raise SavingsActionError("renewed principal must be positive")
    term = SavingsTerm(
        account=account,
        renewed_from=previous,
        sequence=previous.sequence + 1,
        principal_scaled=principal_scaled,
        start_date=start_date,
        maturity_date=_add_months(start_date, previous.term_months),
        term_months=previous.term_months,
        annual_rate_scaled=previous.annual_rate_scaled,
        non_term_rate_scaled=previous.non_term_rate_scaled,
        day_count_convention=previous.day_count_convention,
        interest_payment_method=previous.interest_payment_method,
        maturity_action=previous.maturity_action,
    )
    account.principal_scaled = principal_scaled
    db.add(term)
    db.commit()
    db.refresh(term)
    return term


accrue_interest = calculate_interest
interest = record_interest
open_account = open_savings
add = add_to_savings
withdraw = partial_withdraw
close = close_savings
renew = renew_savings
