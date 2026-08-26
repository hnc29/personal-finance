"""HTTP routes for the savings ("Sổ tiết kiệm") lifecycle.

Thin adapters over :mod:`app.services.savings`. Money movement is always
delegated to the service layer so the ledger-correctness invariants
documented there (deposit is a transfer, only actual interest is Income,
capitalized interest never fakes a bank deposit) hold regardless of which
endpoint is called.
"""

import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.money import money_to_scaled
from app.models.account import Account, AccountType
from app.models.savings import (
    DayCountConvention,
    InterestPaymentMethod,
    MaturityAction,
    SavingsAccount,
    SavingsProduct,
    SavingsTerm,
    SavingsTermStatus,
)
from app.services.savings import (
    SavingsActionError,
    add_months,
    calculate_interest,
    close_savings,
    days_to_maturity,
    early_close_savings,
    is_maturing_soon,
    open_savings,
    renew_savings,
)

router = APIRouter(prefix="/api/v1/assets/savings", tags=["savings"])
DbSession = Annotated[Session, Depends(get_db)]

#: Valid funding/receiving sources for a savings action (BA spec §6): never
#: a Credit Card, and never another SavingsAccount.
_WALLET_ACCOUNT_TYPES = {AccountType.CASH, AccountType.BANK, AccountType.EWALLET}


def _today() -> datetime.date:
    return datetime.datetime.now(datetime.UTC).date()


def _require_wallet_account(db: Session, account_id: int, *, field: str) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(400, f"{field}: account not found")
    if account.account_type not in _WALLET_ACCOUNT_TYPES:
        raise HTTPException(
            400, f"{field}: must be a cash, bank, or e-wallet account"
        )
    return account


def _not_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be blank")
    return stripped


class SavingsAccountCreate(BaseModel):
    institution: str
    product_name: str = "Tiết kiệm có kỳ hạn"
    name: str
    principal: Decimal
    funding_account_id: int
    opened_date: datetime.date
    term_months: int
    annual_rate: Decimal
    non_term_rate: Decimal = Decimal(0)
    day_count_convention: Literal["ACTUAL_365", "ACTUAL_360", "THIRTY_360"] = (
        "ACTUAL_365"
    )
    interest_payment_method: Literal["AT_MATURITY", "UPFRONT", "PERIODIC"] = (
        "AT_MATURITY"
    )
    maturity_action: Literal[
        "CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"
    ] = "CLOSE"
    notes: str | None = None
    # User request, 2026-08-26: "không tính vào báo cáo" also applies to
    # newly-added assets -- opt-in, defaults False.
    excluded_from_reports: bool = False

    @field_validator("institution", "name", "product_name")
    @classmethod
    def _not_blank_fields(cls, value: str) -> str:
        return _not_blank(value)

    @field_validator("principal", "annual_rate", "non_term_rate")
    @classmethod
    def _exact_money(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


class SavingsAccountPatch(BaseModel):
    """Edit-before-history (BA spec §16.1): only while the sole term is

    still ACTIVE and has never been renewed -- enforced by the endpoint, not
    by this schema. Every field is optional so a client can send only what
    changed.
    """

    name: str | None = None
    institution: str | None = None
    product_name: str | None = None
    opened_date: datetime.date | None = None
    term_months: int | None = None
    annual_rate: Decimal | None = None
    non_term_rate: Decimal | None = None
    maturity_action: (
        Literal["CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"] | None
    ) = None
    notes: str | None = None
    # User request, 2026-08-26: unlike every other field on this schema,
    # editing this one is NOT gated by "editable" below -- it's pure
    # reporting metadata, not financial history, so it stays editable even
    # after a savings account has renewals/tất toán history.
    excluded_from_reports: bool | None = None


class SavingsCloseRequest(BaseModel):
    closed_date: datetime.date
    receiving_account_id: int
    actual_interest: Decimal

    @field_validator("actual_interest")
    @classmethod
    def _exact_money(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


class SavingsEarlyCloseRequest(SavingsCloseRequest):
    fee: Decimal = Decimal(0)

    @field_validator("fee")
    @classmethod
    def _exact_fee(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


class SavingsRenewRequest(BaseModel):
    start_date: datetime.date
    actual_interest: Decimal = Decimal(0)
    receiving_account_id: int | None = None

    @field_validator("actual_interest")
    @classmethod
    def _exact_money(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


def _term_json(term: SavingsTerm, *, as_of: datetime.date) -> dict[str, object]:
    active = term.status is SavingsTermStatus.ACTIVE
    return {
        "id": term.id,
        "sequence": term.sequence,
        "principal": str(term.principal),
        "start_date": term.start_date.isoformat(),
        "maturity_date": term.maturity_date.isoformat(),
        "term_months": term.term_months,
        "annual_rate": str(term.annual_rate),
        "non_term_rate": str(term.non_term_rate),
        "day_count_convention": term.day_count_convention.value,
        "interest_payment_method": term.interest_payment_method.value,
        "maturity_action": term.maturity_action.value,
        "status": term.status.value,
        "actual_interest": (
            str(term.actual_interest) if term.actual_interest is not None else None
        ),
        "closed_at": term.closed_at.isoformat() if term.closed_at else None,
        "expected_interest": str(calculate_interest(term)) if active else None,
        "days_to_maturity": days_to_maturity(term, as_of=as_of) if active else None,
        "maturing_soon": is_maturing_soon(term, as_of=as_of) if active else False,
    }


def _account_json(
    account: SavingsAccount, *, as_of: datetime.date, include_terms: bool = False
) -> dict[str, object]:
    current = account.terms[-1] if account.terms else None
    editable = (
        len(account.terms) == 1
        and current is not None
        and current.status is SavingsTermStatus.ACTIVE
    )
    data: dict[str, object] = {
        "id": account.id,
        "name": account.name,
        "institution": account.product.institution,
        "product_name": account.product.name,
        "currency": account.product.currency,
        "principal": str(account.principal),
        "status": account.status.value,
        "opened_date": account.opened_date.isoformat(),
        "closed_date": account.closed_date.isoformat() if account.closed_date else None,
        "funding_account_id": account.funding_account_id,
        "notes": account.notes,
        "excluded_from_reports": account.excluded_from_reports,
        "editable": editable,
        "current_term": _term_json(current, as_of=as_of) if current else None,
    }
    if include_terms:
        data["terms"] = [_term_json(t, as_of=as_of) for t in account.terms]
    return data


def _get_account(db: Session, account_id: int) -> SavingsAccount:
    account = db.get(
        SavingsAccount,
        account_id,
        options=[selectinload(SavingsAccount.product), selectinload(SavingsAccount.terms)],
    )
    if account is None:
        raise HTTPException(404, "Savings account not found")
    return account


def _find_or_create_product(
    db: Session, *, institution: str, name: str, currency: str = "VND"
) -> SavingsProduct:
    existing = db.scalars(
        select(SavingsProduct).where(
            SavingsProduct.institution == institution, SavingsProduct.name == name
        )
    ).first()
    if existing is not None:
        return existing
    product = SavingsProduct(name=name, institution=institution, currency=currency)
    db.add(product)
    db.flush()
    return product


@router.get("")
def list_savings(db: DbSession) -> list[dict[str, object]]:
    accounts = db.scalars(
        select(SavingsAccount)
        .options(selectinload(SavingsAccount.product), selectinload(SavingsAccount.terms))
        .order_by(SavingsAccount.id)
    )
    as_of = _today()
    return [_account_json(account, as_of=as_of) for account in accounts]


@router.post("", status_code=201)
def create_savings(data: SavingsAccountCreate, db: DbSession) -> dict[str, object]:
    _require_wallet_account(db, data.funding_account_id, field="funding_account_id")
    product = _find_or_create_product(
        db, institution=data.institution, name=data.product_name
    )
    try:
        account = open_savings(
            db,
            product=product,
            name=data.name,
            principal=data.principal,
            opened_date=data.opened_date,
            term_months=data.term_months,
            annual_rate=data.annual_rate,
            non_term_rate=data.non_term_rate,
            day_count_convention=DayCountConvention(data.day_count_convention),
            interest_payment_method=InterestPaymentMethod(
                data.interest_payment_method
            ),
            maturity_action=MaturityAction(data.maturity_action),
            funding_account_id=data.funding_account_id,
            notes=data.notes,
            excluded_from_reports=data.excluded_from_reports,
        )
    except SavingsActionError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return _account_json(account, as_of=_today(), include_terms=True)


@router.get("/{account_id}")
def get_savings(account_id: int, db: DbSession) -> dict[str, object]:
    account = _get_account(db, account_id)
    return _account_json(account, as_of=_today(), include_terms=True)


@router.get("/{account_id}/terms")
def list_savings_terms(account_id: int, db: DbSession) -> list[dict[str, object]]:
    account = _get_account(db, account_id)
    as_of = _today()
    return [_term_json(t, as_of=as_of) for t in account.terms]


@router.patch("/{account_id}")
def update_savings(
    account_id: int, data: SavingsAccountPatch, db: DbSession
) -> dict[str, object]:
    account = _get_account(db, account_id)
    fields = data.model_dump(exclude_unset=True)
    # excluded_from_reports is pure reporting metadata, not financial
    # history -- editable regardless of lifecycle state, so it's applied
    # and popped before the edit-before-history gate below (which only
    # protects the remaining, history-affecting fields).
    if "excluded_from_reports" in fields:
        value = fields.pop("excluded_from_reports")
        if value is not None:
            account.excluded_from_reports = value
    if fields and (
        len(account.terms) != 1 or account.terms[0].status is not SavingsTermStatus.ACTIVE
    ):
        raise HTTPException(
            400,
            "Cannot edit a savings account once it has lifecycle history "
            "(tất toán/tái tục); use those actions instead",
        )
    # The gate above guarantees that whenever `fields` is still non-empty
    # here, the account has exactly one ACTIVE term -- so `term` is safe to
    # dereference in every branch below (all of which are themselves gated
    # on some key being present in `fields`).
    term = account.terms[0] if fields else None
    if "name" in fields:
        account.name = _not_blank(fields["name"])
    if "institution" in fields or "product_name" in fields:
        institution = fields.get("institution", account.product.institution)
        product_name = fields.get("product_name", account.product.name)
        account.product = _find_or_create_product(
            db, institution=_not_blank(institution), name=_not_blank(product_name)
        )
    if "notes" in fields:
        account.notes = fields["notes"]
    if "term_months" in fields and fields["term_months"] <= 0:
        raise HTTPException(400, "term_months must be positive")
    if "opened_date" in fields:
        assert term is not None
        account.opened_date = fields["opened_date"]
        term.start_date = fields["opened_date"]
    if "term_months" in fields:
        assert term is not None
        term.term_months = fields["term_months"]
    if "opened_date" in fields or "term_months" in fields:
        assert term is not None
        term.maturity_date = add_months(term.start_date, term.term_months)
    if "annual_rate" in fields:
        assert term is not None
        try:
            term.annual_rate = fields["annual_rate"]
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if "non_term_rate" in fields:
        assert term is not None
        try:
            term.non_term_rate = fields["non_term_rate"]
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if "maturity_action" in fields:
        assert term is not None
        term.maturity_action = MaturityAction(fields["maturity_action"])
    db.commit()
    db.refresh(account)
    return _account_json(account, as_of=_today(), include_terms=True)


@router.post("/{account_id}/close")
def close_savings_route(
    account_id: int, data: SavingsCloseRequest, db: DbSession
) -> dict[str, object]:
    account = _get_account(db, account_id)
    _require_wallet_account(db, data.receiving_account_id, field="receiving_account_id")
    try:
        close_savings(
            db,
            account,
            closed_date=data.closed_date,
            receiving_account_id=data.receiving_account_id,
            actual_interest=data.actual_interest,
        )
    except SavingsActionError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return _account_json(account, as_of=_today(), include_terms=True)


@router.post("/{account_id}/early-close")
def early_close_savings_route(
    account_id: int, data: SavingsEarlyCloseRequest, db: DbSession
) -> dict[str, object]:
    account = _get_account(db, account_id)
    _require_wallet_account(db, data.receiving_account_id, field="receiving_account_id")
    try:
        early_close_savings(
            db,
            account,
            closed_date=data.closed_date,
            receiving_account_id=data.receiving_account_id,
            actual_interest=data.actual_interest,
            fee=data.fee,
        )
    except SavingsActionError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return _account_json(account, as_of=_today(), include_terms=True)


@router.post("/{account_id}/renew")
def renew_savings_route(
    account_id: int, data: SavingsRenewRequest, db: DbSession
) -> dict[str, object]:
    account = _get_account(db, account_id)
    if data.receiving_account_id is not None:
        _require_wallet_account(
            db, data.receiving_account_id, field="receiving_account_id"
        )
    try:
        renew_savings(
            db,
            account,
            start_date=data.start_date,
            interest=data.actual_interest,
            receiving_account_id=data.receiving_account_id,
        )
    except SavingsActionError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return _account_json(account, as_of=_today(), include_terms=True)
