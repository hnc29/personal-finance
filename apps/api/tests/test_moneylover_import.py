import io
from datetime import date

import pytest
from openpyxl import Workbook

from app.models.import_batch import ImportBatch
from app.services.moneylover_import import DuplicateImportFile, import_moneylover


def xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sổ giao dịch"
    sheet.append(["Id", "Ngày", "Nhóm", "Số tiền", "Đơn vị tiền tệ", "Ví", "Ghi chú", "Với", "Sự kiện", "Không tính vào báo cáo", "Thành viên"])
    sheet.append(["synthetic-1", date(2026, 8, 22), "Food", 1, "USD", "Cash", "test", None, None, False, None])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


class Session:
    def __init__(self) -> None:
        self.batch: ImportBatch | None = None

    def scalar(self, statement: object) -> ImportBatch | None:
        return self.batch

    def add(self, batch: ImportBatch) -> None:
        self.batch = batch

    def flush(self) -> None:
        return None


def test_ingests_immutable_raw_rows_and_rejects_exact_duplicate() -> None:
    session = Session()
    data = xlsx()
    batch = import_moneylover(session, data, "synthetic.xlsx")
    assert batch.source == "money_lover"
    assert batch.original_filename == "synthetic.xlsx"
    assert batch.row_count == 1
    assert batch.rows[0].source_row_id == "synthetic-1"
    assert '"Ghi chú":"test"' in batch.rows[0].raw_payload
    assert batch.rows[0].semantic_fingerprint
    with pytest.raises(DuplicateImportFile):
        import_moneylover(session, data)
