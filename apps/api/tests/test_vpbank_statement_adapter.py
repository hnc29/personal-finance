import io
from datetime import date, datetime
from decimal import Decimal

import pytest
from openpyxl import Workbook

from app.importers.bank_statement import BankStatementAdapter
from app.importers.vpbank import VPBankStatementAdapter


def _workbook_bytes(
    rows: list[tuple[object, ...]], headers: tuple[str, ...] | None = None
) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(("Synthetic VPBank statement",))
    sheet.append(
        headers
        or (
            "Ngày giao dịch",
            "Ngày hiệu lực",
            "Số tham chiếu",
            "Diễn giải",
            "Ghi nợ",
            "Ghi có",
            "Số dư",
        )
    )
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def test_normalizes_vpbank_rows() -> None:
    adapter: BankStatementAdapter = VPBankStatementAdapter()
    rows = adapter.parse(
        _workbook_bytes(
            [
                (
                    datetime(2026, 8, 20, 12),  # noqa: DTZ001 - Excel stores naive dates.
                    "21/08/2026",
                    "REF-1",
                    "Synthetic purchase",
                    "1234.5000",
                    None,
                    "8765.5000",
                ),
                (
                    "22-08-2026",
                    None,
                    42,
                    " Synthetic receipt ",
                    None,
                    "2000",
                    "10765.5000",
                ),
            ]
        )
    )

    assert len(rows) == 2
    assert rows[0].source_row_number == 3
    assert rows[0].transaction_date == date(2026, 8, 20)
    assert rows[0].effective_date == date(2026, 8, 21)
    assert rows[0].reference == "REF-1"
    assert rows[0].debit == Decimal("1234.5000")
    assert rows[0].credit is None
    assert rows[0].signed_amount == Decimal("-1234.5000")
    assert rows[0].running_balance == Decimal("8765.5000")
    assert rows[1].reference == "42"
    assert rows[1].description == "Synthetic receipt"
    assert rows[1].signed_amount == Decimal("2000.0000")


def test_accepts_vpbank_header_variants_and_binary_stream() -> None:
    data = _workbook_bytes(
        [("2026-08-23", "2026-08-23", "R", "Synthetic", None, "1,000", "2,000")],
        (
            "Transaction date",
            "Value date",
            "Reference",
            "Description",
            "Debit amount",
            "Credit amount",
            "Running balance",
        ),
    )
    rows = VPBankStatementAdapter().parse(io.BytesIO(data))
    assert rows[0].credit == Decimal("1000.0000")


def test_accepts_vietnamese_description_and_posting_date_headers() -> None:
    rows = VPBankStatementAdapter().parse(
        _workbook_bytes(
            [("23/08/2026", "23/08/2026", "R", "Synthetic", "1", None, "-1")],
            (
                "Ngày giao dịch",
                "Ngày hạch toán",
                "Số tham chiếu",
                "Mô tả",
                "Ghi nợ",
                "Ghi có",
                "Số dư",
            ),
        )
    )

    assert rows[0].effective_date == date(2026, 8, 23)
    assert rows[0].description == "Synthetic"
    assert rows[0].running_balance == Decimal("-1.0000")


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ([("bad date", None, None, None, "1", None, "9")], "invalid transaction date"),
        ([("23/08/2026", None, None, None, "1", "2", "9")], "both debit and credit"),
        ([("23/08/2026", None, None, None, "-1", None, "9")], "negative debit"),
        ([("23/08/2026", None, None, None, 1.5, None, "9")], "invalid debit"),
        ([("23/08/2026", None, None, None, "0.00001", None, "9")], "invalid debit"),
    ],
)
def test_rejects_invalid_transaction_rows(
    rows: list[tuple[object, ...]], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        VPBankStatementAdapter().parse(_workbook_bytes(rows))


def test_requires_statement_headers() -> None:
    with pytest.raises(ValueError, match="headers not found"):
        VPBankStatementAdapter().parse(_workbook_bytes([], ("wrong",)))
