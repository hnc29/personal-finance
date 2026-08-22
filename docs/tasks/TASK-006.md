# TASK-006 — Money Lover Raw Import Foundation

Implement only Money Lover XLSX parsing and immutable raw-import ingestion.

openpyxl is the only new dependency allowed in this task if it is not already
installed.

## Source worksheet

Read worksheet exactly:
Sổ giao dịch

Expected columns:
- Id
- Ngày
- Nhóm
- Số tiền
- Đơn vị tiền tệ
- Ví
- Ghi chú
- Với
- Sự kiện
- Không tính vào báo cáo
- Thành viên

Do not use summary sheets such as Khoản chi/Khoản thu as source of truth.

## Adapter

Create a focused MoneyLover adapter under app/importers.

It must:
- accept workbook bytes or a file-like object suitable for tests
- locate Sổ giao dịch
- validate required headers
- preserve source_row_number
- preserve source Id as source_row_id when present
- preserve all source columns in raw_payload
- parse money into Decimal/scaled integer without ever passing Python float
  into money_to_scaled
- preserve date-only values as dates; do not fabricate 00:00 timestamps
- compute SHA-256 for exact-file duplicate detection
- support a semantic fingerprint field, but do not use it to auto-delete or
  auto-merge rows

If openpyxl exposes a numeric cell as float, convert at the import boundary via
Decimal(str(cell_value)) before calling money primitives. Do not retain float
inside application/domain objects.

## Raw ingestion

Add a service that can create one ImportBatch and corresponding immutable
RawImportRow records from parsed Money Lover rows.

- file_sha256 is used for exact-file duplicate detection
- an already-imported SHA must produce an explicit duplicate-file result/error
- raw_payload is immutable source JSON/text
- do not assume Money Lover Id is stable across exports

## Tests

Create exactly:
- tests/test_moneylover_adapter.py
- tests/test_moneylover_import.py

Generate XLSX workbooks entirely in memory using synthetic data.
Never read real Money Lover exports or data/**.

Cover at least:
- required worksheet/header parsing
- integer and fractional monetary values
- date-only preservation
- source metadata/raw payload preservation
- SHA-256 stability
- duplicate-file detection
- invalid workbook/header behavior

## Out of scope

- transfer pairing
- category normalization
- account mapping
- semantic duplicate auto-merge
- MISA import/export
- bank statements
- API upload endpoint
- savings/assets/market prices
- commits
