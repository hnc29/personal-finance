"""Deterministic normalization of stored Money Lover raw rows."""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import money_to_scaled
from app.models.account import Account
from app.models.import_batch import RawImportRow
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType


class NormalizationError(ValueError):
    pass


def parse_moneylover_date(value: object) -> date:
    """Parse a raw row's "Ngày" field, real-data shape included.

    A real Money Lover export's date cell is always a full-day Excel
    timestamp (midnight); openpyxl round-trips that as a
    ``datetime.datetime``, and ``app.importers.moneylover``'s raw-payload
    JSON serialization calls ``.isoformat()`` on it -- producing
    "YYYY-MM-DDTHH:MM:SS" rather than a bare date. ``date.fromisoformat``
    rejects that shape (it only accepts a date, never a datetime), even
    though it is what every real row's already-persisted (immutable) raw
    payload actually contains -- confirmed against the user's real staged
    export file. Falling back to ``datetime.fromisoformat(...).date()``
    handles that real shape as well as a plain "YYYY-MM-DD" string, without
    needing to touch any already-stored raw payload.
    """
    text = str(value)
    try:
        return date.fromisoformat(text)
    except ValueError:
        return datetime.fromisoformat(text).date()


def normalize_moneylover_row(row: RawImportRow, account: Account, category_id: int | None = None) -> FinancialEvent:
    payload = json.loads(row.raw_payload)
    try:
        tx_date = parse_moneylover_date(payload["Ngày"])
        amount = Decimal(str(payload["Số tiền"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise NormalizationError(f"invalid raw Money Lover row {row.id}") from exc
    scaled = money_to_scaled(amount)
    if scaled == 0:
        raise NormalizationError("zero amount is not a financial event")
    event_type = FinancialEventType.INCOME if scaled > 0 else FinancialEventType.EXPENSE
    event = FinancialEvent(event_type=event_type, transaction_date=tx_date,
        category_id=category_id, payee_text=_text(payload.get("Với")),
        trip_event_text=_text(payload.get("Sự kiện")), note=_text(payload.get("Ghi chú")),
        raw_import_row_id=row.id,
        entries=[AccountEntry(account_id=account.id, amount_scaled=-abs(scaled) if event_type is FinancialEventType.EXPENSE else abs(scaled))])
    return event

def normalize_moneylover_batch(session: Session, batch_id: int, account_map: dict[str, int], category_map: dict[str, int] | None = None) -> list[FinancialEvent]:
    rows = session.scalars(select(RawImportRow).where(RawImportRow.import_batch_id == batch_id).order_by(RawImportRow.source_row_number)).all()
    result: list[FinancialEvent] = []
    category_map = category_map or {}
    for row in rows:
        payload = json.loads(row.raw_payload)
        wallet = _text(payload.get("Ví"))
        if not wallet or wallet not in account_map:
            raise NormalizationError(f"unknown wallet for raw row {row.id}: {wallet!r}")
        account = session.get(Account, account_map[wallet])
        if account is None:
            raise NormalizationError(f"unknown account id for wallet {wallet!r}")
        event = normalize_moneylover_row(row, account, category_map.get(_text(payload.get("Nhóm")) or ""))
        session.add(event); result.append(event)
    session.flush()
    return result

def _text(value: object) -> str | None:
    if value is None: return None
    text = str(value).strip()
    return text or None
