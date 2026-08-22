import hashlib
import io
from datetime import date, datetime
from decimal import Decimal

import pytest
from openpyxl import Workbook

from app.importers.moneylover import HEADERS, parse_moneylover_xlsx


def workbook_bytes(headers=HEADERS, rows=()):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sổ giao dịch"
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_parses_rows_and_preserves_source_data() -> None:
    data = workbook_bytes(rows=[("id-1", date(2026, 8, 22), "Food", 12.5, "USD", "Cash", "note", "", "", False, "member")])
    parsed = parse_moneylover_xlsx(data)
    row = parsed.rows[0]
    assert row.source_row_number == 2
    assert row.source_row_id == "id-1"
    assert row.transaction_date == date(2026, 8, 22)
    assert not isinstance(row.transaction_date, datetime)
    assert row.amount == Decimal("12.5")
    assert row.amount_scaled == 125000
    assert row.raw_payload["Ghi chú"] == "note"
    assert parsed.file_sha256 == hashlib.sha256(data).hexdigest()
    assert parse_moneylover_xlsx(io.BytesIO(data)).file_sha256 == parsed.file_sha256


def test_requires_sheet_and_headers() -> None:
    workbook = Workbook()
    workbook.active.title = "Summary"
    output = io.BytesIO()
    workbook.save(output)
    with pytest.raises(ValueError, match="missing required worksheet"):
        parse_moneylover_xlsx(output.getvalue())

    with pytest.raises(ValueError, match="invalid"):
        parse_moneylover_xlsx(workbook_bytes(headers=("wrong",)))
