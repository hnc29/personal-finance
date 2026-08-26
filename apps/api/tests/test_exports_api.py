"""API tests for the /exports endpoints' account/date filters.

Regression test for the user report (2026-08-26): "Chức năng xuất dữ liệu:
Lựa chọn tài khoản, ngày bắt đầu, ngày kết thúc" -- exports used to have no
way to scope which accounts/dates were included. Runs Alembic against a
disposable temp-file SQLite database (never data/finance.db), matching the
pattern in tests/test_assets_api.py. All data is synthetic.
"""

import csv
import io
import os
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic-exports.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    engine = create_engine(
        f"sqlite:///{database_path}", connect_args={"check_same_thread": False}
    )
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


def _make_account(client: TestClient, name: str) -> int:
    response = client.post(
        "/api/v1/accounts",
        json={"name": name, "account_type": "CASH", "currency": "VND"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _make_expense(client: TestClient, account_id: int, date: str, amount: str) -> None:
    response = client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "EXPENSE",
            "transaction_date": date,
            "entries": [{"account_id": account_id, "amount": amount}],
        },
    )
    assert response.status_code == 201


def _csv_data_rows(body: bytes) -> list[list[str]]:
    rows = list(csv.reader(io.StringIO(body.decode())))
    return rows[1:]  # drop header


def test_export_csv_unfiltered_includes_every_entry(client: TestClient) -> None:
    a = _make_account(client, "A")
    b = _make_account(client, "B")
    _make_expense(client, a, "2026-01-10", "-10.0000")
    _make_expense(client, b, "2026-02-10", "-20.0000")

    response = client.get("/api/v1/exports/events.csv")
    assert response.status_code == 200
    assert len(_csv_data_rows(response.content)) == 2


def test_export_csv_filters_by_account(client: TestClient) -> None:
    a = _make_account(client, "A")
    b = _make_account(client, "B")
    _make_expense(client, a, "2026-01-10", "-10.0000")
    _make_expense(client, b, "2026-01-10", "-20.0000")

    response = client.get(f"/api/v1/exports/events.csv?account_id={a}")
    assert response.status_code == 200
    rows = _csv_data_rows(response.content)
    assert len(rows) == 1
    assert rows[0][3] == str(a)


def test_export_csv_filters_by_date_range(client: TestClient) -> None:
    a = _make_account(client, "A")
    _make_expense(client, a, "2026-01-05", "-10.0000")
    _make_expense(client, a, "2026-03-15", "-20.0000")
    _make_expense(client, a, "2026-06-01", "-30.0000")

    response = client.get(
        "/api/v1/exports/events.csv?start_date=2026-02-01&end_date=2026-04-01"
    )
    assert response.status_code == 200
    rows = _csv_data_rows(response.content)
    assert len(rows) == 1
    assert rows[0][1] == "2026-03-15"


def test_export_csv_rejects_start_after_end(client: TestClient) -> None:
    response = client.get(
        "/api/v1/exports/events.csv?start_date=2026-06-01&end_date=2026-01-01"
    )
    assert response.status_code == 400


def test_export_xlsx_filters_by_account(client: TestClient) -> None:
    from openpyxl import load_workbook

    a = _make_account(client, "A")
    b = _make_account(client, "B")
    _make_expense(client, a, "2026-01-10", "-10.0000")
    _make_expense(client, b, "2026-01-10", "-20.0000")

    response = client.get(f"/api/v1/exports/events.xlsx?account_id={b}")
    assert response.status_code == 200
    wb = load_workbook(io.BytesIO(response.content))
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    assert len(rows) == 1
    assert rows[0][3] == b
