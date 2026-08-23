import io
from datetime import date, datetime
from decimal import Decimal

import pytest
from openpyxl import Workbook

from app.importers.bank_statement import BankStatementAdapter
from app.importers.shb import SHBStatementAdapter


def _workbook_bytes(
    rows: list[tuple[object, ...]], headers: tuple[str, ...] | None = None
) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(("Synthetic SHB statement",))
    sheet.append(("Synthetic account metadata",))
    sheet.append(
        headers
        or (
            "Ngày hệ thống",
            "Ngày hiệu lực",
            "Số tham chiếu",
            "Diễn giải",
            "Ghi nợ",
            "Ghi có",
            "Số dư sau giao dịch",
        )
    )
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def test_normalizes_shb_rows_and_preserves_date_semantics() -> None:
    adapter: BankStatementAdapter = SHBStatementAdapter()
    rows = adapter.parse(
        _workbook_bytes(
            [
                (
                    datetime(2026, 8, 20, 23, 30),  # noqa: DTZ001
                    "21/08/2026",
                    "SHB-REF-1",
                    "Synthetic card purchase",
                    "1234.5000",
                    None,
                    "8765.5000",
                ),
                (
                    "22-08-2026 08:15:00",
                    "23-08-2026",
                    101,
                    " Synthetic transfer receipt ",
                    None,
                    "2,000",
                    "10,765.5000",
                ),
            ]
        )
    )

    assert len(rows) == 2
    assert rows[0].source_row_number == 4
    assert rows[0].transaction_date == date(2026, 8, 20)
    assert rows[0].effective_date == date(2026, 8, 21)
    assert rows[0].reference == "SHB-REF-1"
    assert rows[0].description == "Synthetic card purchase"
    assert rows[0].debit == Decimal("1234.5000")
    assert rows[0].credit is None
    assert rows[0].signed_amount == Decimal("-1234.5000")
    assert rows[0].running_balance == Decimal("8765.5000")
    assert rows[1].transaction_date == date(2026, 8, 22)
    assert rows[1].effective_date == date(2026, 8, 23)
    assert rows[1].reference == "101"
    assert rows[1].description == "Synthetic transfer receipt"
    assert rows[1].debit is None
    assert rows[1].credit == Decimal("2000.0000")
    assert rows[1].signed_amount == Decimal("2000.0000")
    assert rows[1].running_balance == Decimal("10765.5000")


def test_accepts_shb_header_variants_and_binary_stream() -> None:
    data = _workbook_bytes(
        [("2026-08-22", "2026-08-23", "R", "Synthetic", "10", None, "90")],
        (
            "Posting date",
            "Value date",
            "Reference number",
            "Transaction details",
            "Debit amount",
            "Credit amount",
            "Running balance",
        ),
    )

    rows = SHBStatementAdapter().parse(io.BytesIO(data))

    assert rows[0].transaction_date == date(2026, 8, 22)
    assert rows[0].effective_date == date(2026, 8, 23)
    assert rows[0].signed_amount == Decimal("-10.0000")


def test_accepts_vietnamese_description_header() -> None:
    rows = SHBStatementAdapter().parse(
        _workbook_bytes(
            [("22/08/2026", "23/08/2026", "R", "Synthetic", None, "1", "1")],
            (
                "Ngày hệ thống",
                "Ngày hiệu lực",
                "Số tham chiếu",
                "Mô tả",
                "Ghi nợ",
                "Ghi có",
                "Số dư sau giao dịch",
            ),
        )
    )

    assert rows[0].description == "Synthetic"


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        (
            [("bad date", "23/08/2026", None, None, "1", None, "9")],
            "invalid system date",
        ),
        (
            [("22/08/2026", "bad date", None, None, "1", None, "9")],
            "invalid effective date",
        ),
        (
            [("22/08/2026", "23/08/2026", None, None, "1", "2", "9")],
            "both debit and credit",
        ),
        (
            [("22/08/2026", "23/08/2026", None, None, None, None, "9")],
            "missing debit and credit",
        ),
        (
            [("22/08/2026", "23/08/2026", None, None, None, "-1", "9")],
            "negative credit",
        ),
        (
            [("22/08/2026", "23/08/2026", None, None, None, 1.5, "9")],
            "invalid credit",
        ),
        (
            [("22/08/2026", "23/08/2026", None, None, "0.00001", None, "9")],
            "invalid debit",
        ),
    ],
)
def test_rejects_invalid_shb_transaction_rows(
    rows: list[tuple[object, ...]], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        SHBStatementAdapter().parse(_workbook_bytes(rows))


def test_requires_shb_statement_headers() -> None:
    with pytest.raises(ValueError, match="headers not found"):
        SHBStatementAdapter().parse(_workbook_bytes([], ("wrong",)))
