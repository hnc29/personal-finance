"""Credit-card profile, statement, and reminder domain operations."""

import datetime
from collections.abc import Callable, Iterable
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import money_to_scaled, scaled_to_money
from app.models.account import Account, AccountType
from app.models.credit_card import (
    CreditCardProfile,
    CreditCardStatement,
    CreditCardStatementStatus,
    calculate_due_date,
)
from app.schemas.credit_card import CreditCardProfileCreate, CreditCardProfileUpdate


class InvalidCreditCardProfileError(ValueError):
    """Raised when a profile cannot be attached to an account."""


def available_credit(
    credit_limit: Decimal | str | int, current_balance: Decimal | str | int
) -> Decimal:
    limit_scaled = money_to_scaled(credit_limit)
    balance_scaled = money_to_scaled(current_balance)
    if balance_scaled > 0:
        raise ValueError("credit-card current balance must be zero or negative")
    return scaled_to_money(limit_scaled + balance_scaled)


def issue_statement(
    profile: CreditCardProfile,
    statement_date: datetime.date,
    balance_due: Decimal | str | int,
) -> CreditCardStatement:
    statement = CreditCardStatement(
        profile=profile,
        statement_date=statement_date,
        due_date=calculate_due_date(
            statement_date, profile.payment_due_day, profile.payment_due_month_offset
        ),
        balance_due_scaled=money_to_scaled(balance_due),
        status=CreditCardStatementStatus.ISSUED,
    )
    return statement


def record_statement_payment(
    statement: CreditCardStatement,
    amount: Decimal | str | int,
    as_of: datetime.date | None = None,
) -> CreditCardStatementStatus:
    amount_scaled = money_to_scaled(amount)
    if amount_scaled <= 0:
        raise ValueError("payment amount must be positive")
    if statement.paid_scaled + amount_scaled > statement.balance_due_scaled:
        raise ValueError("payment exceeds statement balance due")
    statement.paid_scaled += amount_scaled
    return statement.refresh_status(as_of)


def due_reminders(
    statements: Iterable[CreditCardStatement], as_of: datetime.date | None = None
) -> tuple[CreditCardStatement, ...]:
    today = as_of or datetime.datetime.now(datetime.UTC).date()
    return tuple(
        s
        for s in statements
        if s.status not in (CreditCardStatementStatus.PAID,) and s.due_date <= today
    )


def run_due_reminder_hooks(
    statements: Iterable[CreditCardStatement],
    hook: Callable[[CreditCardStatement], object],
    as_of: datetime.date | None = None,
) -> None:
    for statement in due_reminders(statements, as_of):
        hook(statement)


def create_credit_card_profile(
    db: Session, data: CreditCardProfileCreate
) -> CreditCardProfile:
    account = db.get(Account, data.account_id)
    if account is None or account.account_type is not AccountType.CREDIT_CARD:
        raise InvalidCreditCardProfileError(
            "profile account must be a CREDIT_CARD account"
        )
    values = data.model_dump()
    values["credit_limit_scaled"] = money_to_scaled(values.pop("credit_limit"))
    profile = CreditCardProfile(**values)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_credit_card_profile(db: Session, account_id: int) -> CreditCardProfile | None:
    profile = db.scalar(
        select(CreditCardProfile).where(CreditCardProfile.account_id == account_id)
    )
    return profile


def update_credit_card_profile(
    db: Session, account_id: int, data: CreditCardProfileUpdate
) -> CreditCardProfile | None:
    profile = get_credit_card_profile(db, account_id)
    if profile is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(
            profile,
            "credit_limit_scaled" if field == "credit_limit" else field,
            money_to_scaled(value) if field == "credit_limit" else value,
        )
    db.commit()
    db.refresh(profile)
    return profile
