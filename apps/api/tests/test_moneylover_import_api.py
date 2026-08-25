"""API-layer regression test for TASK-038.

TASK-038 fixed a silent-failure bug: uploading a real Money Lover export
whose filename contains Vietnamese diacritics (e.g. "...Tổng cộng...xlsx")
made the browser's ``fetch()`` throw synchronously while building the
``Headers`` object -- HTTP header values must be Latin-1/ByteString, and a
diacritic is out of that range. The click appeared to do nothing at all
("bấm tải lên không phản hồi") because that throw was never caught.

The fix has two halves: the frontend now sends the filename
percent-encoded (``encodeURIComponent``) in the ``X-Filename`` header, and
the backend (``app.api.data.import_money_lover``) now ``unquote()``s it
back to the real Unicode name before storing/returning it.

``tests/test_moneylover_import.py`` only ever exercised the service
function (``import_moneylover``) directly with a plain-ASCII filename
argument -- it never went through the HTTP endpoint or the ``X-Filename``
header, so it could not have caught this class of bug. This test closes
that gap by hitting the real HTTP surface with a percent-encoded,
diacritic-bearing filename, matching exactly what the fixed frontend now
sends.

Runs Alembic against a disposable temp-file SQLite database (never
``data/finance.db``) and overrides ``get_db``, matching the pattern used by
``tests/test_savings_api.py`` / ``tests/test_assets_api.py``. All data is
synthetic.
"""

import io
import os
import subprocess
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app

REAL_FILENAME = "MoneyLover_Tổng cộng(Wallet)_Tất cả(Category)_01_07_2026-31_07_2026.xlsx"


def xlsx_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sổ giao dịch"
    sheet.append(
        [
            "Id", "Ngày", "Nhóm", "Số tiền", "Đơn vị tiền tệ", "Ví",
            "Ghi chú", "Với", "Sự kiện", "Không tính vào báo cáo", "Thành viên",
        ]
    )
    sheet.append(
        ["synthetic-api-1", date(2026, 7, 15), "Food", 1, "USD", "Cash", "test", None, None, False, None]
    )
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic-moneylover-import.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(f"sqlite:///{database_path}", connect_args={"check_same_thread": False})
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Iterator[Session]:
        db = session_factory()
        try:
            db.execute(text("PRAGMA foreign_keys=ON"))
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_upload_with_percent_encoded_vietnamese_filename_header(client: TestClient) -> None:
    """Mirrors the fixed frontend: filename sent as an encodeURIComponent-escaped
    X-Filename header (plain ASCII on the wire), decoded server-side."""
    response = client.post(
        "/api/v1/imports/money-lover",
        headers={
            "Content-Type": "application/octet-stream",
            "X-Filename": quote(REAL_FILENAME, safe=""),
        },
        content=xlsx_bytes(),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["filename"] == REAL_FILENAME
    assert body["row_count"] == 1
    assert body["status"] == "review_required"
    # TASK-040: no matching "Cash" account exists in this empty DB, so the
    # row is reported as unmatched rather than silently applied or dropped.
    assert body["apply"]["unmatched_wallets"] == {"Cash": 1}
    assert body["apply"]["expense_income_rows_applied"] == 0


def test_upload_auto_applies_rows_whose_wallet_matches_an_existing_account(
    client: TestClient,
) -> None:
    """TASK-040: "dữ liệu tải lên nhưng không đưa vào data ... hãy đưa thẳng
    các bản ghi vào tương ứng" -- a fresh upload must push straight into the
    ledger (Transactions/net worth), not just sit as raw rows."""
    create = client.post(
        "/api/v1/accounts",
        json={"name": "Cash", "account_type": "CASH", "currency": "VND"},
    )
    assert create.status_code == 201, create.text

    response = client.post(
        "/api/v1/imports/money-lover",
        headers={"Content-Type": "application/octet-stream", "X-Filename": "upload.xlsx"},
        content=xlsx_bytes(),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["apply"]["expense_income_rows_applied"] == 1
    assert body["apply"]["applied_rows"] == 1
    assert not body["apply"]["unmatched_wallets"]

    events = client.get("/api/v1/financial-events").json()
    assert len(events) == 1
    assert events[0]["event_type"] == "INCOME"  # xlsx_bytes()'s row has amount=1 (positive)
    assert events[0]["entries"][0]["amount"] == "1.0000"

    batches = client.get("/api/v1/import-batches").json()
    assert batches[0]["applied_row_count"] == 1
    assert batches[0]["row_count"] == 1


def test_raw_unencoded_header_would_be_impossible_over_http(client: TestClient) -> None:
    """Sanity check documenting *why* encoding is required: httpx (like a real
    browser's fetch()) refuses to send a non-Latin-1 header value at all, so
    the frontend has no choice but to encode it -- this isn't optional
    hardening, it's the only way the request can be sent in the first place."""
    with pytest.raises(Exception):  # noqa: B017 - exact exception type is an httpx/httpcore internal
        client.post(
            "/api/v1/imports/money-lover",
            headers={"Content-Type": "application/octet-stream", "X-Filename": REAL_FILENAME},
            content=xlsx_bytes(),
        )


def test_upload_without_filename_header_falls_back_to_default(client: TestClient) -> None:
    response = client.post(
        "/api/v1/imports/money-lover",
        headers={"Content-Type": "application/octet-stream"},
        content=xlsx_bytes(),
    )
    assert response.status_code == 200, response.text
    assert response.json()["filename"] == "upload.xlsx"


def test_cors_preflight_allows_the_x_filename_header(client: TestClient) -> None:
    """Regression test for a second bug found during TASK-038 end-to-end
    verification: app.main's CORSMiddleware allow_headers didn't list
    "X-Filename", so a real browser's CORS preflight (OPTIONS) for this
    upload would be rejected -- for ANY filename, not just non-ASCII ones --
    and the POST would never even be attempted. That failure is invisible to
    every other test here because httpx's TestClient doesn't enforce CORS on
    its own POST calls; it only shows up by simulating the actual preflight
    request a browser sends first."""
    response = client.options(
        "/api/v1/imports/money-lover",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-filename",
        },
    )
    assert response.status_code == 200, response.text
    allowed = response.headers.get("access-control-allow-headers", "")
    assert "x-filename" in allowed.lower(), (
        f"TASK-038: CORS preflight does not allow the X-Filename header (got: {allowed!r}) "
        "-- real browser uploads would be blocked before reaching this endpoint"
    )
