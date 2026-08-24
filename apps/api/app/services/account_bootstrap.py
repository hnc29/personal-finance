"""Deterministic, local account bootstrap from explicit source metadata."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account import Account, AccountType

BANKS = {
    "vietcombank": ("Vietcombank", ("vietcombank", "vcb")), "bidv": ("BIDV", ("bidv",)),
    "vietinbank": ("VietinBank", ("vietinbank", "vietin")), "agribank": ("Agribank", ("agribank",)),
    "mb": ("MB", ("mb bank", "mbbank", "military bank")), "techcombank": ("Techcombank", ("techcombank",)),
    "acb": ("ACB", ("acb",)), "vpbank": ("VPBank", ("vpbank",)), "tpbank": ("TPBank", ("tpbank",)),
    "vib": ("VIB", ("vib",)), "sacombank": ("Sacombank", ("sacombank",)), "hdbank": ("HDBank", ("hdbank",)),
    "ocb": ("OCB", ("ocb",)), "msb": ("MSB", ("msb",)), "shb": ("SHB", ("shb",)),
    "seabank": ("SeABank", ("seabank",)), "lpbank": ("LPBank", ("lpbank",)), "eximbank": ("Eximbank", ("eximbank",)),
    "namabank": ("Nam A Bank", ("nam a bank", "namabank")), "bacabank": ("Bac A Bank", ("bac a bank", "baca bank")),
}

@dataclass(frozen=True)
class BootstrapResult:
    existing: int = 0; created_cash: int = 0; created_bank: int = 0; created_credit_card: int = 0; created_ewallet: int = 0; skipped_ambiguous: int = 0

def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", value.lower())).strip()

def match_bank(name: str) -> str | None:
    """Return a bank only when exactly one catalog identity matches."""
    normalized = _norm(name)
    matches = {
        key
        for key, (_, aliases) in BANKS.items()
        if any(re.search(rf"(?:^| ){re.escape(_norm(alias))}(?:$| )", normalized) for alias in aliases)
    }
    return next(iter(matches)) if len(matches) == 1 else None

def bootstrap_accounts(db: Session, sources: list[dict[str, Any]], *, apply: bool = False) -> BootstrapResult:
    existing_names = {_norm(a.name) for a in db.scalars(select(Account)).all()}
    counts = {"existing": 0, "created_cash": 0, "created_bank": 0, "created_credit_card": 0, "created_ewallet": 0, "skipped_ambiguous": 0}
    pending: list[Account] = []
    for source in sources:
        name = str(source.get("name", "")).strip()
        raw_type = str(source.get("account_type", source.get("type", ""))).upper().strip()
        if not name or raw_type not in {x.value for x in AccountType}:
            counts["skipped_ambiguous"] += 1; continue
        bank_key = match_bank(name) if raw_type in {"BANK", "CREDIT_CARD"} else None
        canonical = BANKS[bank_key][0] if raw_type == "BANK" and bank_key else name
        identity = _norm(canonical)
        if identity in existing_names:
            counts["existing"] += 1; continue
        account = Account(name=canonical, account_type=AccountType(raw_type), currency=str(source.get("currency", "VND")).upper())
        pending.append(account); existing_names.add(_norm(name)); existing_names.add(_norm(canonical)); counts[f"created_{raw_type.lower()}"] += 1
    if apply and pending:
        db.add_all(pending); db.commit()
    return BootstrapResult(**counts)
