"""Money Lover XLSX source adapter."""

from __future__ import annotations

import hashlib
import io
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import BinaryIO

from openpyxl import load_workbook  # type: ignore[import-untyped]

from app.core.money import money_to_scaled

WORKSHEET = "Sổ giao dịch"
HEADERS = (
    "Id",
    "Ngày",
    "Nhóm",
    "Số tiền",
    "Đơn vị tiền tệ",
    "Ví",
    "Ghi chú",
    "Với",
    "Sự kiện",
    "Không tính vào báo cáo",
    "Thành viên",
)

_HEADER_ALIASES: dict[str, str] = {
    # Id
    "id": "Id",
    # Ngày
    "ngay": "Ngày",
    "ngày": "Ngày",
    "date": "Ngày",
    "transaction date": "Ngày",
    # Nhóm
    "nhom": "Nhóm",
    "nhóm": "Nhóm",
    "category": "Nhóm",
    "hạng mục": "Nhóm",
    "hang muc": "Nhóm",
    # Số tiền
    "so tien": "Số tiền",
    "số tiền": "Số tiền",
    "amount": "Số tiền",
    # Đơn vị tiền tệ
    "don vi tien te": "Đơn vị tiền tệ",
    "đơn vị tiền tệ": "Đơn vị tiền tệ",
    "tien te": "Đơn vị tiền tệ",
    "tiền tệ": "Đơn vị tiền tệ",
    "currency": "Đơn vị tiền tệ",
    # Ví
    "vi": "Ví",
    "ví": "Ví",
    "wallet": "Ví",
    "account": "Ví",
    "tai khoan": "Ví",
    "tài khoản": "Ví",
    # Ghi chú
    "ghi chu": "Ghi chú",
    "ghi chú": "Ghi chú",
    "note": "Ghi chú",
    "notes": "Ghi chú",
    "description": "Ghi chú",
    "diễn giải": "Ghi chú",
    "dien giai": "Ghi chú",
    # Với
    "voi": "Với",
    "với": "Với",
    "with": "Với",
    "payee": "Với",
    # Sự kiện
    "su kien": "Sự kiện",
    "sự kiện": "Sự kiện",
    "event": "Sự kiện",
    # Không tính vào báo cáo
    "khong tinh vao bao cao": "Không tính vào báo cáo",
    "không tính vào báo cáo": "Không tính vào báo cáo",
    "exclude from report": "Không tính vào báo cáo",
    "exclude from reports": "Không tính vào báo cáo",
    "excluded from report": "Không tính vào báo cáo",
    "excluded from reports": "Không tính vào báo cáo",
    "bo qua khoi bao cao": "Không tính vào báo cáo",
    "bỏ qua khỏi báo cáo": "Không tính vào báo cáo",
    "loai tru khoi bao cao": "Không tính vào báo cáo",
    "loại trừ khỏi báo cáo": "Không tính vào báo cáo",
    # Thành viên
    "thanh vien": "Thành viên",
    "thành viên": "Thành viên",
    "member": "Thành viên",
}


def _normalize_header_name(val: object) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    nfkd = unicodedata.normalize("NFKD", s)
    no_combining = "".join(c for c in nfkd if not unicodedata.combining(c))
    no_d = no_combining.replace("đ", "d").replace("Đ", "d").casefold()
    clean_lower = re.sub(r"\s+", " ", no_d).strip()
    return _HEADER_ALIASES.get(s.casefold()) or _HEADER_ALIASES.get(clean_lower) or s


@dataclass(frozen=True)
class ParsedMoneyLoverRow:
    source_row_number: int
    source_row_id: str | None
    raw_payload: dict[str, object]
    transaction_date: date | None
    amount: Decimal | None
    amount_scaled: int | None


@dataclass(frozen=True)
class ParsedMoneyLoverFile:
    file_sha256: str
    rows: tuple[ParsedMoneyLoverRow, ...]


def _json_value(value: object) -> object:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def parse_moneylover_xlsx(source: bytes | BinaryIO) -> ParsedMoneyLoverFile:
    data = source if isinstance(source, bytes) else source.read()
    if not isinstance(data, bytes):
        raise TypeError("source must provide XLSX bytes")
    digest = hashlib.sha256(data).hexdigest()
    workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        sheet_name = None
        for name in workbook.sheetnames:
            clean_name = " ".join(name.split()).casefold()
            if clean_name in (
                WORKSHEET.casefold(),
                "so giao dich",
                "transactions",
                "transaction",
                "giao dich",
                "giao dịch",
            ):
                sheet_name = name
                break

        if sheet_name is None and workbook.sheetnames:
            for name in workbook.sheetnames:
                candidate_sheet = workbook[name]
                for cells in candidate_sheet.iter_rows(max_row=30):
                    raw_vals = [cell.value for cell in cells]
                    norm_vals = [_normalize_header_name(v) for v in raw_vals]
                    if "Ngày" in norm_vals and "Số tiền" in norm_vals:
                        sheet_name = name
                        break
                if sheet_name is not None:
                    break

        if sheet_name is None:
            raise ValueError(f"missing required worksheet: {WORKSHEET}")
        sheet = workbook[sheet_name]

        header_row_idx: int | None = None
        source_headers: tuple[str, ...] | None = None
        col_map: dict[str, int] = {}

        for r_idx, cells in enumerate(sheet.iter_rows(max_row=30), start=1):
            raw_vals = [cell.value for cell in cells]
            if not any(v is not None for v in raw_vals):
                continue
            norm_vals = [_normalize_header_name(v) for v in raw_vals]
            has_ngay = "Ngày" in norm_vals
            has_tien = "Số tiền" in norm_vals
            has_vi = "Ví" in norm_vals
            has_nhom = "Nhóm" in norm_vals
            if (has_ngay and has_tien and (has_vi or has_nhom)) or (
                tuple(norm_vals[: len(HEADERS)]) == HEADERS
            ):
                header_row_idx = r_idx
                source_headers = tuple(norm_vals)
                for c_idx, h in enumerate(norm_vals):
                    if h in HEADERS and h not in col_map:
                        col_map[h] = c_idx
                break

        if header_row_idx is None or source_headers is None:
            raise ValueError("invalid Sổ giao dịch headers")

        id_idx = col_map.get("Id")
        date_idx = col_map.get("Ngày")
        amount_idx = col_map.get("Số tiền")

        rows: list[ParsedMoneyLoverRow] = []
        for row_number, cells in enumerate(
            sheet.iter_rows(min_row=header_row_idx + 1), start=header_row_idx + 1
        ):
            if not any(cell.value is not None for cell in cells):
                continue
            raw_amount = (
                cells[amount_idx].value
                if amount_idx is not None and len(cells) > amount_idx
                else (cells[3].value if len(cells) > 3 else None)
            )
            source_id = (
                cells[id_idx].value
                if id_idx is not None and len(cells) > id_idx
                else (cells[0].value if cells else None)
            )
            transaction_date = (
                cells[date_idx].value
                if date_idx is not None and len(cells) > date_idx
                else (cells[1].value if len(cells) > 1 else None)
            )
            if source_id is None and transaction_date is None and raw_amount is None:
                continue

            values = [_json_value(cell.value) for cell in cells]
            payload = dict(zip(source_headers, values, strict=False))
            for h, idx in col_map.items():
                if h not in payload and idx < len(values):
                    payload[h] = values[idx]

            amount: Decimal | None = None
            if raw_amount is not None:
                amt_str = str(raw_amount).replace(",", "").strip()
                try:
                    amount = Decimal(amt_str)
                except (InvalidOperation, ValueError):
                    try:
                        amount = Decimal(str(raw_amount))
                    except (InvalidOperation, ValueError):
                        amount = None

            if isinstance(transaction_date, datetime):
                transaction_date = transaction_date.date()
            elif isinstance(transaction_date, str):
                try:
                    from app.services.moneylover_normalize import parse_moneylover_date

                    transaction_date = parse_moneylover_date(transaction_date)
                except (ValueError, TypeError):
                    pass

            if transaction_date is not None and not isinstance(transaction_date, date):
                raise ValueError(f"invalid date at source row {row_number}")

            rows.append(
                ParsedMoneyLoverRow(
                    row_number,
                    None if source_id is None else str(source_id),
                    payload,
                    transaction_date,
                    amount,
                    None if amount is None else money_to_scaled(amount),
                )
            )
        return ParsedMoneyLoverFile(digest, tuple(rows))
    finally:
        workbook.close()


def raw_payload_text(payload: dict[str, object]) -> str:
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def semantic_fingerprint(payload: dict[str, object]) -> str:
    """Return a stable fingerprint for a row's source semantics.

    This is informational only: callers must not use it to merge or discard rows.
    """
    # Money Lover identifiers are export-local and may be regenerated.  The
    # semantic key therefore deliberately excludes ``Id`` while retaining all
    # transaction fields that describe the row.
    semantic_payload = {key: value for key, value in payload.items() if key != "Id"}
    return hashlib.sha256(
        raw_payload_text(semantic_payload).encode("utf-8")
    ).hexdigest()
