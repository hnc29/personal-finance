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
from datetime import date, timedelta
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
_DEST_NOTE_PATTERNS = (
    # "Chuyển tiền từ <SRC> sang <DEST>", "Từ <SRC> sang <DEST>"
    re.compile(
        r"^(?:Chuyển tiền từ|Chuyen tien tu|Chuyển từ|Chuyen tu|Từ|Tu)\s+(?:.+?)\s+(?:sang ví|đến ví|tới ví|vào ví|sang|đến|tới|vào|cho)\s+(.+)$",
        re.IGNORECASE,
    ),
    # "Gửi đến <DEST>", "Chuyển đến <DEST>", "Chuyển sang <DEST>", "Chuyển tiền sang <DEST>", "Nạp vào <DEST>", "Rút về <DEST>", etc.
    re.compile(
        r"^(?:Gửi đến|Gui den|Chuyển đến|Chuyen den|Chuyển tới|Chuyen toi|Chuyển sang|Chuyen sang|Chuyển khoản đến|Chuyen khoan den|Chuyển tiền đến|Chuyen tien den|Chuyển tiền sang|Chuyen tien sang|Chuyển tiền tới|Chuyen tien toi|Chuyển tiền vào|Chuyen tien vao|Chuyển tiền cho|Chuyen tien cho|Chuyển cho|Chuyen cho|Chuyển vào|Chuyen vao|Nạp vào|Nap vao|Nạp tiền vào|Nap tien vao|Rút về|Rut ve|Gửi sang|Gui sang|Gửi cho|Gui cho|Gửi vào|Gui vao|Sang ví|Sang vi|Đến ví|Den vi|Tới ví|Toi vi)\s+(.+)$",
        re.IGNORECASE,
    ),
)
_SRC_NOTE_PATTERNS = (
    # "Chuyển tiền từ <SRC> sang <DEST>", "Từ <SRC> sang <DEST>"
    re.compile(
        r"^(?:Chuyển tiền từ|Chuyen tien tu|Chuyển từ|Chuyen tu|Từ|Tu)\s+(.+?)\s+(?:sang ví|đến ví|tới ví|vào ví|sang|đến|tới|vào|cho)\s+(?:.+)$",
        re.IGNORECASE,
    ),
    # "Nhận tiền từ <SRC>", "Nhận từ <SRC>", "Nhận chuyển khoản từ <SRC>", "Nhận ck từ <SRC>", etc.
    re.compile(
        r"^(?:Nhận tiền từ|Nhan tien tu|Nhận từ|Nhan tu|Nhận chuyển khoản từ|Nhan chuyen khoan tu|Nhận ck từ|Nhan ck tu|Nhận chuyển tiền từ|Nhan chuyen tien tu|Nhận từ ví|Nhan tu vi|Từ ví|Tu vi|Từ|Tu)\s+(.+)$",
        re.IGNORECASE,
    ),
)


def extract_dest_wallet(note: str | None) -> str | None:
    if not note:
        return None
    for pat in _DEST_NOTE_PATTERNS:
        m = pat.match(note.strip())
        if m:
            return m.group(1).strip()
    return None


def extract_src_wallet(note: str | None) -> str | None:
    if not note:
        return None
    for pat in _SRC_NOTE_PATTERNS:
        m = pat.match(note.strip())
        if m:
            return m.group(1).strip()
    return None


def find_matching_existing_transfer(
    session: Session,
    src_account_id: int,
    dst_account_id: int,
    scaled: int,
    tx_date: date,
    current_row_id: int,
    user_id: int | None = None,
) -> FinancialEvent | None:
    """Find an already-persisted TRANSFER event matching the pair and amount on ~same date."""
    min_date = tx_date - timedelta(days=2)
    max_date = tx_date + timedelta(days=2)

    stmt = select(FinancialEvent).where(
        FinancialEvent.event_type == FinancialEventType.TRANSFER,
        FinancialEvent.transaction_date >= min_date,
        FinancialEvent.transaction_date <= max_date,
    )
    if user_id is not None:
        stmt = stmt.where(FinancialEvent.user_id == user_id)
    candidates = session.scalars(stmt).all()

    for ev in candidates:
        if (
            ev.raw_import_row_id == current_row_id
            or ev.raw_import_row_id_secondary == current_row_id
        ):
            continue
        amounts = {entry.account_id: entry.amount_scaled for entry in ev.entries}
        if (
            amounts.get(src_account_id) == -scaled
            and amounts.get(dst_account_id) == scaled
            and ev.raw_import_row_id_secondary is None
        ):
            return ev
    return None


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


_BANK_ROOT_MAP: dict[str, str] = {
    # Techcombank
    "tech": "techcombank",
    "tcb": "techcombank",
    "techcom": "techcombank",
    "techcombank": "techcombank",
    # Vietcombank
    "vcb": "vietcombank",
    "vietcom": "vietcombank",
    "vietcombank": "vietcombank",
    # VPBank
    "vpb": "vpbank",
    "vp": "vpbank",
    "vpbank": "vpbank",
    # MBBank
    "mbb": "mbbank",
    "mb": "mbbank",
    "mbbank": "mbbank",
    "quandoi": "mbbank",
    # BIDV
    "bidv": "bidv",
    "bid": "bidv",
    # ACB
    "acb": "acb",
    "achau": "acb",
    # VietinBank
    "ctg": "vietinbank",
    "vietin": "vietinbank",
    "vietinbank": "vietinbank",
    # VIB
    "vib": "vib",
    "quocte": "vib",
    # SHB
    "shb": "shb",
    # Shinhan Bank
    "shinhan": "shinhan",
    "shinhanbank": "shinhan",
    # TPBank
    "tpb": "tpbank",
    "tpbank": "tpbank",
    "tienphong": "tpbank",
    # Sacombank
    "stb": "sacombank",
    "sacombank": "sacombank",
    # HDBank
    "hdb": "hdbank",
    "hdbank": "hdbank",
    # MSB
    "msb": "msb",
    "maritime": "msb",
    "hanghai": "msb",
    # OCB
    "ocb": "ocb",
    "phuongdong": "ocb",
    # SeABank
    "seabank": "seabank",
    "seab": "seabank",
    # Eximbank
    "eximbank": "eximbank",
    "eib": "eximbank",
    "exim": "eximbank",
    # LPBank
    "lpbank": "lpbank",
    "lpb": "lpbank",
    "lienviet": "lpbank",
    # Agribank
    "agribank": "agribank",
    "agri": "agribank",
    "varb": "agribank",
    # UOB
    "uob": "uob",
    # HSBC
    "hsbc": "hsbc",
    # CIMB
    "cimb": "cimb",
    # Standard Chartered
    "standardchartered": "standardchartered",
    "scbvl": "standardchartered",
    # Woori
    "woori": "woori",
    "wooribank": "woori",
    # ANZ
    "anz": "anz",
    "anzvl": "anz",
    # Hong Leong
    "hongleong": "hongleong",
    "hlb": "hongleong",
    "hlbvn": "hongleong",
    # Public Bank
    "publicbank": "publicbank",
    "pbvn": "publicbank",
    # Indovina
    "indovina": "indovina",
    "ivb": "indovina",
    # VRB
    "vrb": "vrb",
    "vietnga": "vrb",
    # SCB (Sài Gòn)
    "scb": "scb",
    "saigon": "scb",
    # BVBank (Bản Việt)
    "bvbank": "bvbank",
    "bvb": "bvbank",
    "banviet": "bvbank",
    # Bac A Bank
    "bacabank": "bacabank",
    "baca": "bacabank",
    "bab": "bacabank",
    # BaoViet Bank
    "baoviet": "baovietbank",
    "baovietbank": "baovietbank",
    # PVcomBank
    "pvcom": "pvcombank",
    "pvcombank": "pvcombank",
    "pvc": "pvcombank",
    # Kienlongbank
    "kienlong": "kienlongbank",
    "kienlongbank": "kienlongbank",
    "klb": "kienlongbank",
    # Nam A Bank
    "nama": "namabank",
    "namabank": "namabank",
    "nab": "namabank",
    # Vietbank
    "vietbank": "vietbank",
    # VietABank
    "vietabank": "vietabank",
    "vab": "vietabank",
    # Saigonbank
    "saigonbank": "saigonbank",
    "sgb": "saigonbank",
    # PGBank
    "pgbank": "pgbank",
    "pgb": "pgbank",
    # ABBANK
    "abbank": "abbank",
    "abb": "abbank",
    "anbinh": "abbank",
    # NCB
    "ncb": "ncb",
    # GPBank
    "gpbank": "gpbank",
    # Vikki Bank
    "vikki": "vikki",
    "vikkibank": "vikki",
    # VCBNeo
    "vcbneo": "vcbneo",
    # MBV
    "mbv": "mbv",
    # Co-opBank
    "coopbank": "coopbank",
    # Timo, Cake, Liobank
    "timo": "timo",
    "cake": "cake",
    "liobank": "liobank",
    "lio": "liobank",
    # Wallets
    "momo": "momo",
    "zalopay": "zalopay",
    "zalo": "zalopay",
    "shopeepay": "shopeepay",
    "airpay": "shopeepay",
    "spay": "shopeepay",
    "viettelmoney": "viettelmoney",
    "viettelpay": "viettelmoney",
    "viettel": "viettelmoney",
    "vnpay": "vnpay",
    "payoo": "payoo",
    "cash": "cash",
    "tienmat": "cash",
}

_GENERIC_TOKENS: set[str] = {
    "viet",
    "nam",
    "vn",
    "bank",
    "ngan",
    "hang",
    "tmcp",
    "nhtm",
    "tnhh",
    "mtv",
    "cp",
}
_CARD_DESCRIPTORS: set[str] = {"the", "tin", "dung", "credit", "card"}


def _normalize_wallet_text(s: str) -> str:
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", s)
    no_combining = "".join(c for c in nfkd if not unicodedata.combining(c))
    no_d = no_combining.replace("đ", "d").replace("Đ", "d")
    s_lower = no_d.casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s_lower)).strip()


def _extract_canonical_tokens(name: str) -> tuple[str, ...]:
    norm = _normalize_wallet_text(name)
    raw_tokens = norm.split()
    tokens: list[str] = []
    for t in raw_tokens:
        root = _BANK_ROOT_MAP.get(t, t)
        if root not in tokens or root == t:
            tokens.append(root)
    # Special compound handle: "tien mat" -> "cash"
    if "tien" in tokens and "mat" in tokens:
        tokens = ["cash" if t in ("tien", "mat") else t for t in tokens]
        tokens = list(dict.fromkeys(tokens))
    has_bank = any(t in _BANK_ROOT_MAP.values() for t in tokens)
    if has_bank and len(tokens) > 1:
        tokens = [t for t in tokens if t not in _GENERIC_TOKENS]
    return tuple(tokens)


def match_moneylover_account(
    accounts: list[Account], wallet: str | None
) -> Account | None:
    if not wallet:
        return None
    w_clean = wallet.strip()
    w_ci = w_clean.casefold()
    w_norm = _normalize_wallet_text(w_clean)
    w_alnum = re.sub(r"[^a-zA-Z0-9]+", "", w_ci)
    is_card_wallet = any(k in w_norm for k in ("card", "the", "credit"))

    # Priority 1: Exact match (case-sensitive then case-insensitive)
    for a in accounts:
        if a.name.strip() == w_clean:
            return a
    for a in accounts:
        if a.name.strip().casefold() == w_ci:
            return a

    # Priority 2: Normalized exact match (ignoring diacritics & spacing)
    for a in accounts:
        if _normalize_wallet_text(a.name) == w_norm:
            return a

    # Priority 3: Parentheses extraction in Account.name e.g. 'VPBank (VPB-Card)', 'Techcombank (chi tiêu)'
    for a in accounts:
        parens = re.findall(r"\((.*?)\)", a.name)
        for p in parens:
            p_clean = p.strip()
            p_ci = p_clean.casefold()
            p_norm = _normalize_wallet_text(p_clean)
            if (
                p_ci == w_ci
                or p_norm == w_norm
                or (w_alnum and re.sub(r"[^a-zA-Z0-9]+", "", p_ci) == w_alnum)
            ):
                return a
            # Prefix + parenthetical suffix e.g. 'BIDV' + '(-Card)' -> 'BIDV-Card'
            prefix = re.sub(r"\(.*?\)", "", a.name).strip()
            if p_clean.startswith(("-", " ")):
                combined_ci = f"{prefix}{p_clean}".casefold()
                combined_norm = _normalize_wallet_text(f"{prefix} {p_clean}")
                if (
                    combined_ci == w_ci
                    or combined_norm == w_norm
                    or (
                        w_alnum and re.sub(r"[^a-zA-Z0-9]+", "", combined_ci) == w_alnum
                    )
                ):
                    return a

    # Priority 4: Canonical token scoring (handles e.g. 'TECH chi tiêu' -> 'Techcombank (chi tiêu)' vs 'TECH' -> 'Techcombank')
    w_tokens = _extract_canonical_tokens(w_clean)
    w_token_set = set(w_tokens)
    if w_tokens:
        scored_candidates: list[tuple[int, Account]] = []
        for a in accounts:
            a_tokens = _extract_canonical_tokens(a.name)
            a_token_set = set(a_tokens)
            common = w_token_set & a_token_set
            if not common:
                continue

            prefix = re.sub(r"\(.*?\)", "", a.name).strip()
            prefix_tokens = (
                _extract_canonical_tokens(prefix) if prefix != a.name else ()
            )

            score = 0
            if w_tokens == a_tokens:
                score = 1000
            elif w_token_set == a_token_set:
                score = 900
            else:
                # If account is a credit card, ignore card descriptor tokens in account name
                # (e.g. 'Thẻ tín dụng', 'Credit Card') so they don't penalize the bank match.
                non_card_a_tokens = (
                    [t for t in a_tokens if t not in _CARD_DESCRIPTORS]
                    if a.account_type.value == "CREDIT_CARD"
                    else list(a_tokens)
                )
                extra_tokens = abs(len(w_tokens) - len(non_card_a_tokens))
                score = len(common) * 100 - extra_tokens * 25
                if prefix_tokens and prefix_tokens == w_tokens:
                    score += 200

            if is_card_wallet:
                if a.account_type.value == "CREDIT_CARD":
                    score += 50
                else:
                    score -= 100
            else:
                if a.account_type.value != "CREDIT_CARD":
                    score += 20
                else:
                    score += 0

            scored_candidates.append((score, a))

        if scored_candidates:
            scored_candidates.sort(key=lambda c: c[0], reverse=True)
            best_score, best_account = scored_candidates[0]
            if best_score > 50:
                return best_account

    return None


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def apply_import_batch(
    session: Session, batch_id: int, user_id: int | None = None
) -> ApplyResult:
    """Apply every not-yet-applied raw row in ``batch_id`` to the ledger.

    Flushes but does not commit -- the caller (the API route) commits so a
    failure surfaces as a normal 4xx/5xx with nothing partially persisted.
    """
    batch = session.get(ImportBatch, batch_id)
    if batch is None or (user_id is not None and batch.user_id != user_id):
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

    active_accounts = list(
        session.scalars(
            select(Account).where(
                Account.is_active.is_(True), Account.user_id == batch.user_id
            )
        )
    )

    def get_account(w: str | None) -> Account | None:
        return match_moneylover_account(active_accounts, w)

    categories = {
        c.name: c
        for c in session.scalars(
            select(Category).where(Category.user_id == batch.user_id)
        )
    }
    categories_ci = {c.name.casefold(): c for c in categories.values()}

    def get_category(raw_cat: str | None) -> Category | None:
        if not raw_cat:
            return None
        # 1. Direct exact or case-insensitive match (e.g. "Ăn sáng", "Xăng cr")
        cat = categories.get(raw_cat) or categories_ci.get(raw_cat.casefold())
        if cat is not None:
            return cat
        # 2. Canonical mapping fallback (e.g. English canonical names)
        canonical_name = VI_LABEL_TO_CANONICAL_NAME.get(raw_cat)
        if canonical_name:
            cat = categories.get(canonical_name) or categories_ci.get(
                canonical_name.casefold()
            )
            if cat is not None:
                return cat
        return None

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
    out_rows = [
        r for r in pending if _text(payloads[r.id].get("Nhóm")) == TRANSFER_OUT_GROUP
    ]
    in_rows = [
        r for r in pending if _text(payloads[r.id].get("Nhóm")) == TRANSFER_IN_GROUP
    ]

    # Pass 1: Intra-batch transfer pairing
    for out_row in out_rows:
        out_payload = payloads[out_row.id]
        own_wallet = _text(out_payload.get("Ví"))
        note = _text(out_payload.get("Ghi chú"))
        dest_wallet = extract_dest_wallet(note)
        if own_wallet is None or dest_wallet is None:
            continue
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
            in_wallet = _text(in_payload.get("Ví"))
            if in_wallet is None:
                continue

            in_acc = get_account(in_wallet)
            dest_acc = get_account(dest_wallet)
            if in_acc is not None and dest_acc is not None:
                if in_acc.id != dest_acc.id:
                    continue
            elif in_wallet != dest_wallet and _normalize_wallet_text(
                in_wallet
            ) != _normalize_wallet_text(dest_wallet):
                continue

            in_note = _text(in_payload.get("Ghi chú"))
            src_wallet = extract_src_wallet(in_note)
            if src_wallet is not None:
                src_acc = get_account(src_wallet)
                out_acc = get_account(own_wallet)
                if src_acc is not None and out_acc is not None:
                    if src_acc.id != out_acc.id:
                        continue
                elif src_wallet != own_wallet and _normalize_wallet_text(
                    src_wallet
                ) != _normalize_wallet_text(own_wallet):
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

        src_account = get_account(own_wallet)
        dst_account = get_account(dest_wallet) or get_account(
            _text(payloads[matched_in_row.id].get("Ví"))
        )
        if (
            src_account is None
            or dst_account is None
            or src_account.id == dst_account.id
        ):
            continue
        scaled = money_to_scaled(out_amount)
        if scaled == 0:
            consumed_ids.add(out_row.id)
            consumed_ids.add(matched_in_row.id)
            continue

        # Check if already booked in an earlier batch
        existing_ev = find_matching_existing_transfer(
            session,
            src_account.id,
            dst_account.id,
            scaled,
            out_date,
            out_row.id,
            user_id=batch.user_id,
        )
        if existing_ev is not None:
            existing_ev.raw_import_row_id_secondary = out_row.id
            result.transfer_pairs_applied += 1
            consumed_ids.add(out_row.id)
            consumed_ids.add(matched_in_row.id)
            continue

        event = FinancialEvent(
            user_id=batch.user_id,
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

    # Pass 2: Single-leg transfer-in (e.g. statement of receiving account imported alone)
    for in_row in in_rows:
        if in_row.id in consumed_ids:
            continue
        in_payload = payloads[in_row.id]
        own_wallet = _text(in_payload.get("Ví"))
        note = _text(in_payload.get("Ghi chú"))
        src_wallet = extract_src_wallet(note)
        if own_wallet is None or src_wallet is None:
            continue
        try:
            in_amount = abs(Decimal(str(in_payload["Số tiền"])))
            in_date = parse_moneylover_date(in_payload["Ngày"])
        except (KeyError, TypeError, ValueError, InvalidOperation):
            continue
        src_account = get_account(src_wallet)
        dst_account = get_account(own_wallet)
        if (
            src_account is None
            or dst_account is None
            or src_account.id == dst_account.id
        ):
            continue
        scaled = money_to_scaled(in_amount)
        if scaled == 0:
            consumed_ids.add(in_row.id)
            continue

        existing_ev = find_matching_existing_transfer(
            session,
            src_account.id,
            dst_account.id,
            scaled,
            in_date,
            in_row.id,
            user_id=batch.user_id,
        )
        if existing_ev is not None:
            existing_ev.raw_import_row_id_secondary = in_row.id
            result.transfer_pairs_applied += 1
            consumed_ids.add(in_row.id)
            continue

        event = FinancialEvent(
            user_id=batch.user_id,
            event_type=FinancialEventType.TRANSFER,
            transaction_date=in_date,
            note=note,
            raw_import_row_id=in_row.id,
            entries=[
                AccountEntry(account_id=src_account.id, amount_scaled=-scaled),
                AccountEntry(account_id=dst_account.id, amount_scaled=scaled),
            ],
        )
        session.add(event)
        result.transfer_pairs_applied += 1
        consumed_ids.add(in_row.id)

    # Pass 3: Single-leg transfer-out (e.g. statement of sending account imported alone)
    for out_row in out_rows:
        if out_row.id in consumed_ids:
            continue
        out_payload = payloads[out_row.id]
        own_wallet = _text(out_payload.get("Ví"))
        note = _text(out_payload.get("Ghi chú"))
        dest_wallet = extract_dest_wallet(note)
        if own_wallet is None or dest_wallet is None:
            continue
        try:
            out_amount = abs(Decimal(str(out_payload["Số tiền"])))
            out_date = parse_moneylover_date(out_payload["Ngày"])
        except (KeyError, TypeError, ValueError, InvalidOperation):
            continue
        src_account = get_account(own_wallet)
        dst_account = get_account(dest_wallet)
        if (
            src_account is None
            or dst_account is None
            or src_account.id == dst_account.id
        ):
            continue
        scaled = money_to_scaled(out_amount)
        if scaled == 0:
            consumed_ids.add(out_row.id)
            continue

        existing_ev = find_matching_existing_transfer(
            session,
            src_account.id,
            dst_account.id,
            scaled,
            out_date,
            out_row.id,
            user_id=batch.user_id,
        )
        if existing_ev is not None:
            existing_ev.raw_import_row_id_secondary = out_row.id
            result.transfer_pairs_applied += 1
            consumed_ids.add(out_row.id)
            continue

        event = FinancialEvent(
            user_id=batch.user_id,
            event_type=FinancialEventType.TRANSFER,
            transaction_date=out_date,
            note=note,
            raw_import_row_id=out_row.id,
            entries=[
                AccountEntry(account_id=src_account.id, amount_scaled=-scaled),
                AccountEntry(account_id=dst_account.id, amount_scaled=scaled),
            ],
        )
        session.add(event)
        result.transfer_pairs_applied += 1
        consumed_ids.add(out_row.id)

    for row in pending:
        if row.id in consumed_ids:
            continue
        payload = payloads[row.id]
        wallet = _text(payload.get("Ví"))
        account = get_account(wallet)
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
        category = get_category(raw_category)
        if category is not None:
            result.categorized_rows += 1
        else:
            result.uncategorized_rows += 1
        try:
            event = normalize_moneylover_row(
                row, account, category.id if category else None
            )
        except Exception:  # noqa: BLE001 - malformed row; report and keep going
            result.invalid_rows.append(row.source_row_number)
            continue
        session.add(event)
        result.expense_income_rows_applied += 1

    session.flush()
    return result
