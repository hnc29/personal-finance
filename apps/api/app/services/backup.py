"""Safe SQLite backup and restore primitives.

Restore never mutates the live database in-place. It validates a candidate and
produces a replacement file for an operator to install while the API is stopped.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path


class InvalidBackupError(ValueError):
    """Raised when a candidate is not a valid, internally consistent database."""


def _connect(path: Path, *, read_only: bool = False) -> sqlite3.Connection:
    if read_only:
        return sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    return sqlite3.connect(path)


def validate_backup(path: Path) -> None:
    if not path.is_file():
        raise InvalidBackupError("backup file does not exist")
    try:
        with _connect(path, read_only=True) as connection:
            result = connection.execute("PRAGMA integrity_check").fetchone()
            version = connection.execute("PRAGMA user_version").fetchone()
    except sqlite3.Error as exc:
        raise InvalidBackupError("backup is not a readable SQLite database") from exc
    if result != ("ok",) or version is None:
        raise InvalidBackupError("backup failed SQLite integrity validation")


def create_backup(source: Path, destination: Path) -> None:
    if source.resolve() == destination.resolve():
        raise ValueError("backup destination must differ from the database")
    if destination.exists():
        raise FileExistsError(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with _connect(source, read_only=True) as source_db, _connect(destination) as target_db:
            source_db.backup(target_db)
        validate_backup(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def prepare_restore(candidate: Path, replacement: Path) -> None:
    """Validate and copy a backup to a new replacement; never overwrite a DB."""
    validate_backup(candidate)
    create_backup(candidate, replacement)
