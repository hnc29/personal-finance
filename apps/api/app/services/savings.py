"""Savings lifecycle actions and exact interest calculations.

Ledger accounting model: every ``AccountEntry`` references a real wallet
``Account`` (cash/bank/e-wallet) -- there is no way to attach one to a
``SavingsAccount``. So a savings deposit/withdrawal/payout is always a
single-leg event against the wallet account that funded or received it; the
other "leg" is simply the change in ``SavingsAccount.principal_scaled``,
which the portfolio read model adds to Net Worth directly (see
``app.services.read_models``). This keeps Net Worth correct without ever
inventing a fake wallet-account movement:

- opening a savings account with a funding account debits that account by
  exactly the principal (Net Worth unchanged: Bank -> Savings);
- tất toán (close / early close) credits the receiving account with
  principal + actual interest (Net Worth increases by exactly the interest);
- capitalizing interest into a renewed term's principal (maturity_action
  RENEW_PRINCIPAL_AND_INTEREST) creates *no* ledger event at all -- the
  interest is recognized purely as a principal increase on the new term, so
  Net Worth still increases by exactly the interest, without a fabricated
  cash flow through any wallet account.
"""

from __future__ import annotations

import calendar
import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.money import money_to_scaled
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
    SavingsTermStatus,
)

#: A term within this many days of its maturity date is surfaced in the UI
#: as "sắp đáo hạn" (maturing soon) rather than plain "còn hạn".
MATURITY_SOON_THRESHOLD_DAYS = 7


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
    if amount_scaled == 0:
        return
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


def _require_term_active(term: SavingsTerm) -> None:
    if term.status is not SavingsTermStatus.ACTIVE:
        raise SavingsActionError("savings term is already closed")


def _current_term(account: SavingsAccount) -> SavingsTerm:
    if not account.terms:
        raise SavingsActionError("savings account has no term")
    return account.terms[-1]


def add_months(value: datetime.date, months: int) -> datetime.date:
    month = value.month - 1 + months
    year, month = value.year + month // 12, month % 12 + 1
    return value.replace(
        year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1])
    )


def days_to_maturity(term: SavingsTerm, *, as_of: datetime.date) -> int:
    """Signed day count to ``term.maturity_date`` (negative once matured)."""
    return (term.maturity_date - as_of).days


def is_maturing_soon(term: SavingsTerm, *, as_of: datetime.date) -> bool:
    remaining = days_to_maturity(term, as_of=as_of)
    return 0 <= remaining <= MATURITY_SOON_THRESHOLD_DAYS


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
    funding_account_id: int | None = None,
    notes: str | None = None,
) -> SavingsAccount:
    """Open a new savings book, optionally funded from a wallet account.

    When ``funding_account_id`` is given, a SAVINGS_DEPOSIT event debits it
    by exactly the principal -- an asset transfer, never an Expense -- so
    Net Worth is unchanged at the moment of deposit (the wallet account's
    balance falls by exactly as much as the new savings principal rises).
    """
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
        funding_account_id=funding_account_id,
        notes=notes,
    )
    if term_months is not None:
        if term_months <= 0 or principal_scaled <= 0:
            raise SavingsActionError("term months and principal must be positive")
        account.terms.append(
            SavingsTerm(
                sequence=1,
                principal_scaled=principal_scaled,
                start_date=opened_date,
                maturity_date=add_months(opened_date, term_months),
                term_months=term_months,
                annual_rate_scaled=annual_rate_scaled,
                non_term_rate_scaled=non_term_rate_scaled,
                day_count_convention=day_count_convention,
                interest_payment_method=interest_payment_method,
                maturity_action=maturity_action,
                status=SavingsTermStatus.ACTIVE,
            )
        )
    if funding_account_id is not None and principal_scaled > 0:
        _asset_movement(
            db,
            account_id=funding_account_id,
            amount_scaled=-principal_scaled,
            event_type=FinancialEventType.SAVINGS_DEPOSIT,
            transaction_date=opened_date,
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
    """Not exposed in the V1 UI (BA spec §15): reduces principal only, with

    no interest settlement. Kept for lower-level/service use; the API layer
    intentionally does not route to this for the user-facing tất toán flows.
    """
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


def calculate_interest(
    term: SavingsTerm, *, end_date: datetime.date | None = None
) -> Decimal:
    """Exact projected interest for ``term`` as of ``end_date``.

    Uses ``annual_rate`` once the term has reached its full maturity date,
    and ``non_term_rate`` (the demand/no-term rate) for any earlier
    ``end_date`` -- i.e. calling this with the default ``end_date`` (the
    term's own maturity date) gives "lãi dự kiến" at maturity, while passing
    a proposed early-close date gives "lãi dự tính" at the demand rate,
    matching BA spec §9/§10 without any caller-side branching.
    """
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


def close_savings(
    db: Session,
    account: SavingsAccount,
    *,
    closed_date: datetime.date,
    receiving_account_id: int,
    actual_interest: Decimal | str | int,
) -> SavingsAccount:
    """Tất toán đúng hạn: settle the current term at or after maturity.

    Principal is returned to ``receiving_account_id`` as a
    SAVINGS_WITHDRAWAL (asset transfer, never Income); only
    ``actual_interest`` is recorded as an INTEREST event, i.e. real Income
    (BA spec §11).
    """
    _require_open(account)
    term = _current_term(account)
    _require_term_active(term)
    if closed_date < term.maturity_date:
        raise SavingsActionError(
            "term has not reached maturity yet; use early close instead"
        )
    interest_scaled = money_to_scaled(actual_interest)
    if interest_scaled < 0:
        raise SavingsActionError("interest must not be negative")

    _asset_movement(
        db,
        account_id=receiving_account_id,
        amount_scaled=account.principal_scaled,
        event_type=FinancialEventType.SAVINGS_WITHDRAWAL,
        transaction_date=closed_date,
    )
    _asset_movement(
        db,
        account_id=receiving_account_id,
        amount_scaled=interest_scaled,
        event_type=FinancialEventType.INTEREST,
        transaction_date=closed_date,
    )

    term.status = SavingsTermStatus.CLOSED
    term.actual_interest_scaled = interest_scaled
    term.closed_at = closed_date
    account.status = SavingsAccountStatus.CLOSED
    account.closed_date = closed_date
    account.principal_scaled = 0
    db.commit()
    db.refresh(account)
    return account


def early_close_savings(
    db: Session,
    account: SavingsAccount,
    *,
    closed_date: datetime.date,
    receiving_account_id: int,
    actual_interest: Decimal | str | int,
    fee: Decimal | str | int = "0",
) -> SavingsAccount:
    """Tất toán trước hạn: settle the current term before maturity.

    ``actual_interest`` is a caller-supplied figure (typically the bank's
    demand-rate payout), not silently defaulted to the term rate -- BA spec
    §10 explicitly forbids assuming the full-term rate applies. An optional
    ``fee`` is recorded as a separate Expense against the receiving account.
    """
    _require_open(account)
    term = _current_term(account)
    _require_term_active(term)
    if closed_date >= term.maturity_date:
        raise SavingsActionError(
            "term has already reached maturity; use normal close instead"
        )
    if closed_date < term.start_date:
        raise SavingsActionError("closed date precedes term start")
    interest_scaled = money_to_scaled(actual_interest)
    if interest_scaled < 0:
        raise SavingsActionError("interest must not be negative")
    fee_scaled = money_to_scaled(fee)
    if fee_scaled < 0:
        raise SavingsActionError("fee must not be negative")

    _asset_movement(
        db,
        account_id=receiving_account_id,
        amount_scaled=account.principal_scaled,
        event_type=FinancialEventType.SAVINGS_WITHDRAWAL,
        transaction_date=closed_date,
    )
    _asset_movement(
        db,
        account_id=receiving_account_id,
        amount_scaled=interest_scaled,
        event_type=FinancialEventType.INTEREST,
        transaction_date=closed_date,
    )
    _asset_movement(
        db,
        account_id=receiving_account_id,
        amount_scaled=-fee_scaled,
        event_type=FinancialEventType.EXPENSE,
        transaction_date=closed_date,
    )

    term.status = SavingsTermStatus.EARLY_CLOSED
    term.actual_interest_scaled = interest_scaled
    term.closed_at = closed_date
    account.status = SavingsAccountStatus.CLOSED
    account.closed_date = closed_date
    account.principal_scaled = 0
    db.commit()
    db.refresh(account)
    return account


def renew_savings(
    db: Session,
    account: SavingsAccount,
    *,
    start_date: datetime.date,
    interest: Decimal | str | int = "0",
    receiving_account_id: int | None = None,
) -> SavingsTerm:
    """Tái tục: close the current term and open the next one from it.

    ``interest`` is the term's actual interest, always recorded on the
    closed term for history (BA spec §20). What happens to it depends on
    the term's ``maturity_action``:

    - RENEW_PRINCIPAL: interest is paid out as real cash -- an INTEREST
      event credits ``receiving_account_id`` (required if interest is
      nonzero) -- while only the original principal rolls into the new
      term (BA spec §13).
    - RENEW_PRINCIPAL_AND_INTEREST: interest is capitalized directly into
      the new term's principal with *no* ledger event, so Net Worth still
      rises by exactly the interest without a fabricated bank-account
      deposit (BA spec §14). ``receiving_account_id`` is not used.
    """
    _require_open(account)
    previous = _current_term(account)
    _require_term_active(previous)
    if previous.maturity_action is MaturityAction.CLOSE:
        raise SavingsActionError("term maturity action does not allow renewal")
    interest_scaled = money_to_scaled(interest)
    if interest_scaled < 0:
        raise SavingsActionError("interest must not be negative")

    principal_scaled = previous.principal_scaled
    if previous.maturity_action is MaturityAction.RENEW_PRINCIPAL_AND_INTEREST:
        principal_scaled += interest_scaled
    elif interest_scaled > 0:
        if receiving_account_id is None:
            raise SavingsActionError(
                "receiving account is required to pay out renewal interest"
            )
        _asset_movement(
            db,
            account_id=receiving_account_id,
            amount_scaled=interest_scaled,
            event_type=FinancialEventType.INTEREST,
            transaction_date=start_date,
        )
    if principal_scaled <= 0:
        raise SavingsActionError("renewed principal must be positive")

    previous.status = SavingsTermStatus.CLOSED
    previous.actual_interest_scaled = interest_scaled
    previous.closed_at = start_date

    term = SavingsTerm(
        account=account,
        renewed_from=previous,
        sequence=previous.sequence + 1,
        principal_scaled=principal_scaled,
        start_date=start_date,
        maturity_date=add_months(start_date, previous.term_months),
        term_months=previous.term_months,
        annual_rate_scaled=previous.annual_rate_scaled,
        non_term_rate_scaled=previous.non_term_rate_scaled,
        day_count_convention=previous.day_count_convention,
        interest_payment_method=previous.interest_payment_method,
        maturity_action=previous.maturity_action,
        status=SavingsTermStatus.ACTIVE,
    )
    account.principal_scaled = principal_scaled
    db.add(term)
    db.commit()
    db.refresh(term)
    return term
