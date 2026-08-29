"""HTTP routes for full database backup and restore operations."""

from __future__ import annotations

import datetime
import re
import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import PROJECT_ROOT, settings
from app.core.database import engine
from app.services.backup import InvalidBackupError, create_backup, validate_backup

router = APIRouter(prefix="/api/v1/backup", tags=["backup"])

BACKUP_DIR = PROJECT_ROOT / "backup"


class BackupCreateRequest(BaseModel):
    mode: Literal["project", "download"] = "project"


class BackupRestoreRequest(BaseModel):
    filename: str


@router.get("/list")
def list_backups() -> list[dict[str, object]]:
    """List all available backup files in the project backup directory."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backups: list[dict[str, object]] = []

    for path in BACKUP_DIR.iterdir():
        if path.is_file() and (
            path.suffix in [".db", ".sqlite", ".sqlite3", ".zip"]
            or path.name.startswith("backup_")
        ):
            stat = path.stat()
            created_dt = datetime.datetime.fromtimestamp(
                stat.st_mtime, tz=datetime.UTC
            )
            backups.append(
                {
                    "filename": path.name,
                    "size_bytes": stat.st_size,
                    "created_at": created_dt.isoformat(),
                    "formatted_date": created_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "is_db": path.suffix in [".db", ".sqlite", ".sqlite3"],
                }
            )

    backups.sort(key=lambda x: str(x["created_at"]), reverse=True)
    return backups


@router.post("/create")
def create_backup_endpoint(data: BackupCreateRequest):
    """Create a full backup of the database either in project folder or for browser download."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    now_str = datetime.datetime.now(tz=datetime.UTC).strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"backup_data_{now_str}.db"

    if data.mode == "project":
        dest_path = BACKUP_DIR / filename
        try:
            create_backup(settings.database_path, dest_path)
            stat = dest_path.stat()
            return {
                "status": "ok",
                "filename": filename,
                "size_bytes": stat.st_size,
                "message": f"Đã lưu bản sao lưu thành công vào project: {filename}",
            }
        except Exception as exc:
            raise HTTPException(500, f"Backup failed: {exc}") from exc

    elif data.mode == "download":
        temp_dir = Path(tempfile.gettempdir())
        dest_path = temp_dir / filename
        dest_path.unlink(missing_ok=True)
        try:
            create_backup(settings.database_path, dest_path)
            return FileResponse(
                path=dest_path,
                filename=filename,
                media_type="application/x-sqlite3",
            )
        except Exception as exc:
            raise HTTPException(500, f"Backup download failed: {exc}") from exc


@router.get("/download/{filename}")
def download_backup_file(filename: str):
    """Download an existing backup file from project backup directory."""
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "", filename)
    target_path = BACKUP_DIR / safe_name
    if not target_path.is_file():
        raise HTTPException(404, "Backup file not found")

    return FileResponse(
        path=target_path,
        filename=safe_name,
        media_type="application/octet-stream",
    )


@router.delete("/{filename}")
def delete_backup_file(filename: str):
    """Delete an existing backup file from project backup directory."""
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "", filename)
    target_path = BACKUP_DIR / safe_name
    if not target_path.is_file():
        raise HTTPException(404, "Backup file not found")

    try:
        target_path.unlink()
        return {"status": "ok", "message": f"Đã xoá bản sao lưu {safe_name}"}
    except Exception as exc:
        raise HTTPException(500, f"Không thể xoá file: {exc}") from exc


def _perform_restore(candidate_path: Path) -> dict[str, object]:
    """Safely validate candidate DB and replace current live database."""
    try:
        validate_backup(candidate_path)
    except InvalidBackupError as exc:
        raise HTTPException(400, f"File sao lưu không hợp lệ: {exc}") from exc

    engine.dispose()

    live_db = settings.database_path
    live_db.parent.mkdir(parents=True, exist_ok=True)

    wal_file = live_db.with_name(f"{live_db.name}-wal")
    shm_file = live_db.with_name(f"{live_db.name}-shm")
    wal_file.unlink(missing_ok=True)
    shm_file.unlink(missing_ok=True)

    live_db.unlink(missing_ok=True)
    shutil.copy2(candidate_path, live_db)

    try:
        validate_backup(live_db)
        engine.dispose()
    except Exception as exc:
        raise HTTPException(500, f"Lỗi sau khi khôi phục cơ sở dữ liệu: {exc}") from exc

    return {"status": "ok", "message": "Khôi phục dữ liệu thành công"}


@router.post("/restore/project")
def restore_from_project(data: BackupRestoreRequest):
    """Restore database from an existing file in project backup folder."""
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "", data.filename)
    candidate_path = BACKUP_DIR / safe_name
    if not candidate_path.is_file():
        raise HTTPException(404, f"Không tìm thấy file sao lưu {safe_name}")

    if candidate_path.suffix not in [".db", ".sqlite", ".sqlite3"]:
        raise HTTPException(400, "Chỉ có thể khôi phục trực tiếp từ file SQLite (.db / .sqlite)")

    return _perform_restore(candidate_path)


@router.post("/restore/upload")
def restore_from_upload(payload: bytes = Body(...)):
    """Restore database from uploaded backup binary bytes."""
    temp_dir = Path(tempfile.gettempdir())
    now_str = datetime.datetime.now(tz=datetime.UTC).strftime("%Y%m%d_%H%M%S")
    temp_file = temp_dir / f"restore_{now_str}.db"
    try:
        temp_file.write_bytes(payload)
        return _perform_restore(temp_file)
    finally:
        temp_file.unlink(missing_ok=True)
