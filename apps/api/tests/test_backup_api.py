"""API tests for the backup and restore endpoints."""

from __future__ import annotations

import os
import sqlite3
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic_finance.db"
    backup_folder = tmp_path / "backup"
    backup_folder.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )

    monkeypatch.setattr(settings, "database_path", database_path)
    from app.api import backup as backup_module

    monkeypatch.setattr(backup_module, "BACKUP_DIR", backup_folder)

    # Insert a dummy record in accounts
    with sqlite3.connect(database_path) as conn:
        conn.execute(
            "INSERT INTO accounts (id, name, account_type, currency, is_active, sort_order) "
            "VALUES (999, 'Initial Bank', 'BANK', 'VND', 1, 1)"
        )
        conn.commit()

    yield TestClient(app)


def test_list_backups_empty_initially(client: TestClient) -> None:
    res = client.get("/api/v1/backup/list")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_project_backup_and_list(client: TestClient) -> None:
    # 1. Create project backup
    res = client.post("/api/v1/backup/create", json={"mode": "project"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    filename = data["filename"]
    assert filename.startswith("backup_data_")

    # 2. List backups should now include it
    listed = client.get("/api/v1/backup/list").json()
    assert any(b["filename"] == filename for b in listed)

    # 3. Download the created backup
    dl = client.get(f"/api/v1/backup/download/{filename}")
    assert dl.status_code == 200
    assert len(dl.content) > 0

    # 4. Delete the backup
    del_res = client.delete(f"/api/v1/backup/{filename}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ok"

    # 5. Should no longer be in list
    listed_after = client.get("/api/v1/backup/list").json()
    assert not any(b["filename"] == filename for b in listed_after)


def test_create_download_backup(client: TestClient) -> None:
    res = client.post("/api/v1/backup/create", json={"mode": "download"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/x-sqlite3"
    assert len(res.content) > 0


def test_restore_from_project_backup(client: TestClient) -> None:
    # 1. Create a backup
    res = client.post("/api/v1/backup/create", json={"mode": "project"})
    filename = res.json()["filename"]

    # 2. Mutate live DB
    with sqlite3.connect(settings.database_path) as conn:
        conn.execute("DELETE FROM accounts WHERE id = 999")
        conn.commit()

    with sqlite3.connect(settings.database_path) as conn:
        assert conn.execute("SELECT count(*) FROM accounts WHERE id = 999").fetchone()[0] == 0

    # 3. Restore from project backup
    restore_res = client.post("/api/v1/backup/restore/project", json={"filename": filename})
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "ok"

    # 4. Check that record 999 is back
    with sqlite3.connect(settings.database_path) as conn:
        assert conn.execute("SELECT count(*) FROM accounts WHERE id = 999").fetchone()[0] == 1


def test_restore_from_upload(client: TestClient) -> None:
    # 1. Download backup file stream
    dl = client.post("/api/v1/backup/create", json={"mode": "download"})
    file_bytes = dl.content

    # 2. Mutate live DB
    with sqlite3.connect(settings.database_path) as conn:
        conn.execute("DELETE FROM accounts WHERE id = 999")
        conn.commit()

    # 3. Restore via upload
    restore_res = client.post(
        "/api/v1/backup/restore/upload",
        content=file_bytes,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "ok"

    # 4. Check that record 999 is restored
    with sqlite3.connect(settings.database_path) as conn:
        assert conn.execute("SELECT count(*) FROM accounts WHERE id = 999").fetchone()[0] == 1
