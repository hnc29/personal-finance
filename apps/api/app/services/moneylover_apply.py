"""TASK-040: push a Money Lover import batch's raw rows straight into the
ledger as real financial events, without a manual reconciliation step.

An uploaded Money Lover file only ever produced immutable
``RawImportRow`` records (see ``moneylover_import.py``) -- nothing wired
those rows into ``financial_events``, so an import never showed up in
Transactions/net worth at all. :func:`apply_import_batch` closes that gap:

- Each row's wallet ("Ví") is matched by exact name against an existing,
  active :class:`Account` -- no fuzzy guessing, no auto-creating accounts.
  A row whose wallet doesn't match a real account is left unapplied and
  reported back, never silently dropped or misrouted.
- Each row's category ("Nhóm") is matched, best-effort, against this
  app's seed taxonomy via the Vietnamese-label lookup in
  ``moneylover_category_map.py``. Most real Money Lover category names are
  personal free text (e.g. "Xăng cr", "Ck mẹ") that simply won't match --
  those rows still get applied, just without a category (``category_id =
  None``), never blocked on this.
- A Money Lover "internal transfer between my own wallets" is exported as
  TWO raw rows: one "Tiền chuyển đi" (outgoing) on the source wallet and
  one "Tiền chuyển đến" (incoming) on the destination wallet, both flagged
  "Không tính vào báo cáo" (excluded from Money Lover's own report).
  Money Lover's auto-generated notes name the counterparty wallet
  ("Gửi đến X" / "Nhận tiền từ X"), which lets both legs be matched
  unambiguously by (own wallet, counterparty wallet, amount) and booked as
  ONE balanced TRANSFER event instead of two separate EXPENSE/INCOME
  events -- booking them separately would double-count the same money
  movement as both an expense on one account and income on another, even
  though the user's net worth never changed. A pair that can't be fully
  resolved (either leg's wallet doesn't match a real account) is left for
  the plain per-row path below rather than forced through.
- Idempotent: a raw row already linked to a financial event (via either
  ``raw_import_row_id`` or ``raw_import_row_id_secondary``) is skipped, so
  calling this twice on the same batch (or a batch that was partially
  applied because some wallets were unmatched at the time) never
  double-books a row.

Nothing here touches ``reconciliation_candidates`` -- that is a separate,
independent feature (matching an imported statement row against an
*already existing* ledger event, e.g. for bank-statement dedup) and is
untouched by this straight-through apply path.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.money import money_to_scaled
from app.models.account import Account
from app.models.category import Category
from app.models.import_batch import ImportBatch, RawImportRow
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.services.moneylover_category_map import VI_LABEL_TO_CANONICAL_NAME
from app.services.moneylover_normalize import (
    normalize_moneylover_row,
    parse_moneylover_date,
)

TRANSFER_OUT_GROUP = "Tiền chuyển đi"
TRANSFER_IN_GROUP = "Tiền chuyển đến"
_DEST_NOTE_RE = re.compile(r"^Gửi đến (.+)$")
_SRC_NOTE_RE = re.compile(r"^Nhận tiền từ (.+)$")


class BatchNotFoundError(Exception):
    """Raised when the given ``batch_id`` has no ``ImportBatch``."""


@dataclass
class ApplyResult:
    batch_id: int
    total_rows: int
    already_applied_rows: int = 0
    transfer_pairs_applied: int = 0
    expense_income_rows_applied: int = 0
    categorized_rows: int = 0
    uncategorized_rows: int = 0
    invalid_rows: list[int] = field(default_factory=list)
    unmatched_wallets: dict[str, int] = field(default_factory=dict)

    @property
    def applied_rows(self) -> int:
        return self.transfer_pairs_applied * 2 + self.expense_income_rows_applied

    @property
    def unmatched_row_count(self) -> int:
        return sum(self.unmatched_wallets.values())


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def apply_import_batch(session: Session, batch_id: int) -> ApplyResult:
    """Apply every not-yet-applied raw row in ``batch_id`` to the ledger.

    Flushes but does not commit -- the caller (the API route) commits so a
    failure surfaces as a normal 4xx/5xx with nothing partially persisted.
    """
    if session.get(ImportBatch, batch_id) is None:
        raise BatchNotFoundError(batch_id)

    rows = list(
        session.scalars(
            select(RawImportRow)
            .where(RawImportRow.import_batch_id == batch_id)
            .order_by(RawImportRow.source_row_number)
        )
    )
    result = ApplyResult(batch_id=batch_id, total_rows=len(rows))

    already_linked_ids = set(
        session.scalars(
            select(FinancialEvent.raw_import_row_id).where(
                FinancialEvent.raw_import_row_id.is_not(None)
            )
        )
    ) | set(
        session.scalars(
            select(FinancialEvent.raw_import_row_id_secondary).where(
                FinancialEvent.raw_import_row_id_secondary.is_not(None)
            )
        )
    )

    accounts = {a.name: a for a in session.scalars(select(Account).where(Account.is_active.is_(True)))}
    categories = {c.name: c for c in session.scalars(select(Category))}

    pending: list[RawImportRow] = []
    payloads: dict[int, dict[str, object]] = {}
    for row in rows:
        if row.id in already_linked_ids:
            result.already_applied_rows += 1
            continue
        try:
            payloads[row.id] = json.loads(row.raw_payload)
        except json.JSONDecodeError:
            result.invalid_rows.append(row.source_row_number)
            continue
        pending.append(row)

    consumed_ids: set[int] = set()
    search_used_in_ids: set[int] = set()
    out_rows = [r for r in pending if _text(payloads[r.id].get("Nhóm")) == TRANSFER_OUT_GROUP]
    in_rows = [r for r in pending if _text(payloads[r.id].get("Nhóm")) == TRANSFER_IN_GROUP]

    for out_row in out_rows:
        out_payload = payloads[out_row.id]
        own_wallet = _text(out_payload.get("Ví"))
        note = _text(out_payload.get("Ghi chú"))
        dest_match = _DEST_NOTE_RE.match(note) if note else None
        if own_wallet is None or dest_match is None:
            continue  # falls through to the plain per-row path below
        dest_wallet = dest_match.group(1).strip()
        try:
            out_amount = abs(Decimal(str(out_payload["Số tiền"])))
            out_date = parse_moneylover_date(out_payload["Ngày"])
        except (KeyError, TypeError, ValueError, InvalidOperation):
            continue

        matched_in_row = None
        for in_row in in_rows:
            if in_row.id in search_used_in_ids:
                continue
            in_payload = payloads[in_row.id]
            if _text(in_payload.get("Ví")) != dest_wallet:
                continue
            in_note = _text(in_payload.get("Ghi chú"))
            src_match = _SRC_NOTE_RE.match(in_note) if in_note else None
            if src_match is None or src_match.group(1).strip() != own_wallet:
                continue
            try:
                in_amount = abs(Decimal(str(in_payload["Số tiền"])))
            except (KeyError, TypeError, ValueError, InvalidOperation):
                continue
            if in_amount != out_amount:
                continue
            matched_in_row = in_row
            break
        if matched_in_row is None:
            continue
        search_used_in_ids.add(matched_in_row.id)

        src_account = accounts.get(own_wallet)
        dst_account = accounts.get(dest_wallet)
        if src_account is None or dst_account is None:
            # Leave BOTH legs for the plain per-row path -- the side whose
            # wallet DOES match still gets booked correctly there (as a
            # standalone EXPENSE/INCOME), only the truly-unmatched side is
            # reported as unresolved. Forcing a transfer here would either
            # silently drop the matched side's real balance movement or
            # require guessing which account was meant.
            continue
        scaled = money_to_scaled(out_amount)
        if scaled == 0:
            consumed_ids.add(out_row.id)
            consumed_ids.add(matched_in_row.id)
            continue
        event = FinancialEvent(
            event_type=FinancialEventType.TRANSFER,
            transaction_date=out_date,
            note=note,
            raw_import_row_id=out_row.id,
            raw_import_row_id_secondary=matched_in_row.id,
            entries=[
                AccountEntry(account_id=src_account.id, amount_scaled=-scaled),
                AccountEntry(account_id=dst_account.id, amount_scaled=scaled),
            ],
        )
        session.add(event)
        result.transfer_pairs_applied += 1
        consumed_ids.add(out_row.id)
        consumed_ids.add(matched_in_row.id)

    for row in pending:
        if row.id in consumed_ids:
            continue
        payload = payloads[row.id]
        wallet = _text(payload.get("Ví"))
        account = accounts.get(wallet) if wallet else None
        if account is None:
            key = wallet or "(trống)"
            result.unmatched_wallets[key] = result.unmatched_wallets.get(key, 0) + 1
            continue
        try:
            scaled = money_to_scaled(Decimal(str(payload["Số tiền"])))
        except (KeyError, TypeError, ValueError, InvalidOperation):
            result.invalid_rows.append(row.source_row_number)
            continue
        if scaled == 0:
            continue  # a zero-amount row is not a financial event; silently skipped, same as normalize_moneylover_row
        raw_category = _text(payload.get("Nhóm"))
        canonical_name = VI_LABEL_TO_CANONICAL_NAME.get(raw_category) if raw_category else None
        category = categories.get(canonical_name) if canonical_name else None
        if category is not None:
            result.categorized_rows += 1
        else:
            result.uncategorized_rows += 1
        try:
            event = normalize_moneylover_row(row, account, category.id if category else None)
        except Exception:  # noqa: BLE001 - malformed row; report and keep going
            result.invalid_rows.append(row.source_row_number)
            continue
        session.add(event)
        result.expense_income_rows_applied += 1

    session.flush()
    return result
