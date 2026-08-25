"""HTTP-layer coverage for TASK-040's manual apply endpoint.

``POST /api/v1/imports/{batch_id}/apply`` is what lets an already-uploaded
batch (imported before this feature shipped, e.g. the user's real 212-row
Money Lover batch) -- or one with wallets that were unmatched at import
time and have since been fixed -- get pushed into the ledger without
re-uploading. Runs against a disposable temp-file SQLite database (never
``data/finance.db``), matching the pattern in
``tests/test_moneylover_import_api.py``. All data is synthetic.
"""

import io
import os
import subprocess
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app


def xlsx_bytes(amount: object = -50_000) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sổ giao dịch"
    sheet.append(
        [
            "Id", "Ngày", "Nhóm", "Số tiền", "Đơn vị tiền tệ", "Ví",
            "Ghi chú", "Với", "Sự kiện", "Không tính vào báo cáo", "Thành viên",
        ]
    )
    sheet.append(["row-1", date(2026, 8, 1), "Ăn ngoài", amount, "VND", "ZaloPay", None, None, None, False, None])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic-apply-api.db"
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


def test_apply_unknown_batch_returns_404(client: TestClient) -> None:
    response = client.post("/api/v1/imports/999/apply")
    assert response.status_code == 404, response.text


def test_manual_apply_pushes_a_previously_unmatched_batch_once_the_account_exists(
    client: TestClient,
) -> None:
    upload = client.post(
        "/api/v1/imports/money-lover",
        headers={"Content-Type": "application/octet-stream", "X-Filename": "upload.xlsx"},
        content=xlsx_bytes(),
    )
    assert upload.status_code == 200, upload.text
    batch_id = upload.json()["id"]
    assert upload.json()["apply"]["unmatched_wallets"] == {"ZaloPay": 1}

    # The wallet didn't match any account at upload time -- fix that, the
    # way a user would after seeing the unmatched-wallet report, then
    # retry via the manual endpoint rather than re-uploading the file.
    create = client.post(
        "/api/v1/accounts",
        json={"name": "ZaloPay", "account_type": "EWALLET", "currency": "VND"},
    )
    assert create.status_code == 201, create.text

    apply_response = client.post(f"/api/v1/imports/{batch_id}/apply")
    assert apply_response.status_code == 200, apply_response.text
    body = apply_response.json()
    assert body["batch_id"] == batch_id
    assert body["expense_income_rows_applied"] == 1
    assert body["applied_rows"] == 1
    assert not body["unmatched_wallets"]

    events = client.get("/api/v1/financial-events").json()
    assert len(events) == 1
    assert events[0]["event_type"] == "EXPENSE"
    assert events[0]["entries"][0]["amount"] == "-50000.0000"

    # Idempotent: calling again applies nothing new.
    again = client.post(f"/api/v1/imports/{batch_id}/apply")
    assert again.status_code == 200, again.text
    assert again.json()["applied_rows"] == 0
    assert again.json()["already_applied_rows"] == 1
    assert len(client.get("/api/v1/financial-events").json()) == 1
