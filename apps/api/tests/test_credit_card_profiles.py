"""Synthetic persistence tests for credit-card profiles."""

import datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType
from app.models.credit_card import (
    CreditCardProfile,
    CreditCardStatement,
    CreditCardStatementStatus,
    calculate_due_date,
)
from app.schemas.credit_card import CreditCardProfileCreate, CreditCardProfileRead
from app.services.credit_card import (
    InvalidCreditCardProfileError,
    available_credit,
    create_credit_card_profile,
    due_reminders,
    issue_statement,
    record_statement_payment,
    run_due_reminder_hooks,
)


def test_credit_limit_property_is_exact_decimal() -> None:
    profile = CreditCardProfile(credit_limit=Decimal("1234.5678"))
    assert profile.credit_limit_scaled == 12_345_678
    assert profile.credit_limit == Decimal("1234.5678")


def test_schema_rejects_invalid_days_and_money_precision() -> None:
    with pytest.raises(ValidationError):
        CreditCardProfileCreate(
            account_id=1, credit_limit=Decimal(1), statement_day=0, payment_due_day=1
        )
    with pytest.raises(ValidationError):
        CreditCardProfileCreate(
            account_id=1, credit_limit=1.5, statement_day=1, payment_due_day=1
        )

    profile = CreditCardProfile(credit_limit_scaled=0)
    with pytest.raises(ValueError, match="at most 4 decimal places"):
        profile.credit_limit = Decimal("1.00001")


def test_create_profile_requires_credit_card_account() -> None:
    engine = create_engine("sqlite:///:memory:")
    Account.__table__.create(engine)
    CreditCardProfile.__table__.create(engine)
    with Session(engine) as session:
        account = Account(name="Synthetic cash", account_type=AccountType.CASH)
        session.add(account)
        session.commit()
        with pytest.raises(InvalidCreditCardProfileError):
            create_credit_card_profile(
                session,
                CreditCardProfileCreate(
                    account_id=account.id,
                    credit_limit=Decimal(1000),
                    statement_day=15,
                    payment_due_day=5,
                    payment_due_month_offset=1,
                ),
            )


def test_read_schema_exposes_decimal_limit() -> None:
    profile = CreditCardProfile(
        id=2,
        account_id=3,
        credit_limit_scaled=15_000_001,
        statement_day=20,
        payment_due_day=8,
        payment_due_month_offset=1,
    )
    result = CreditCardProfileRead.model_validate(profile)
    assert result.credit_limit == Decimal("1500.0001")


def test_due_date_clamps_to_end_of_target_month() -> None:
    assert calculate_due_date(datetime.date(2026, 1, 31), 31, 1) == datetime.date(
        2026, 2, 28
    )
    assert calculate_due_date(datetime.date(2028, 1, 31), 31, 1) == datetime.date(
        2028, 2, 29
    )


def test_available_credit_uses_negative_owed_balance() -> None:
    assert available_credit(Decimal(1000), Decimal("-125.2500")) == Decimal("874.7500")
    with pytest.raises(ValueError, match="zero or negative"):
        available_credit(Decimal(1000), Decimal(1))


def test_statement_lifecycle() -> None:
    statement = CreditCardStatement(
        statement_date=datetime.date(2026, 8, 20),
        due_date=datetime.date(2026, 9, 5),
        balance_due_scaled=1_000_000,
        paid_scaled=0,
        status=CreditCardStatementStatus.OPEN,
    )
    assert (
        statement.refresh_status(datetime.date(2026, 8, 20))
        is CreditCardStatementStatus.OPEN
    )
    statement.status = CreditCardStatementStatus.ISSUED
    assert (
        record_statement_payment(statement, Decimal(25), datetime.date(2026, 8, 25))
        is CreditCardStatementStatus.PARTIALLY_PAID
    )
    assert (
        statement.refresh_status(datetime.date(2026, 9, 6))
        is CreditCardStatementStatus.OVERDUE
    )
    assert (
        record_statement_payment(statement, Decimal(75), datetime.date(2026, 9, 6))
        is CreditCardStatementStatus.PAID
    )


def test_statement_persistence_rejects_payment_above_balance_due() -> None:
    engine = create_engine("sqlite:///:memory:")
    Account.__table__.create(engine)
    CreditCardProfile.__table__.create(engine)
    CreditCardStatement.__table__.create(engine)
    with Session(engine) as session:
        account = Account(name="Synthetic card", account_type=AccountType.CREDIT_CARD)
        profile = CreditCardProfile(
            account=account,
            credit_limit_scaled=10_000_000,
            statement_day=20,
            payment_due_day=5,
            payment_due_month_offset=1,
        )
        session.add(
            CreditCardStatement(
                profile=profile,
                statement_date=datetime.date(2026, 8, 20),
                due_date=datetime.date(2026, 9, 5),
                balance_due_scaled=1_000_000,
                paid_scaled=1_000_001,
                status=CreditCardStatementStatus.PAID,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_issue_statement_and_reusable_reminder_hook() -> None:
    profile = CreditCardProfile(payment_due_day=5, payment_due_month_offset=1)
    statement = issue_statement(profile, datetime.date(2026, 8, 20), Decimal(100))
    assert statement.due_date == datetime.date(2026, 9, 5)
    called: list[CreditCardStatement] = []
    assert due_reminders([statement], datetime.date(2026, 9, 5)) == (statement,)
    run_due_reminder_hooks([statement], called.append, datetime.date(2026, 9, 5))
    assert called == [statement]
