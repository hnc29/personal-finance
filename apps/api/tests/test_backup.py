import sqlite3
from pathlib import Path

import pytest

from app.services.backup import InvalidBackupError, create_backup, prepare_restore


def _synthetic_db(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE synthetic_records (amount_scaled INTEGER NOT NULL)")
        connection.execute("INSERT INTO synthetic_records VALUES (12340000)")


def test_backup_and_restore_preparation_are_consistent(tmp_path: Path) -> None:
    source = tmp_path / "synthetic.db"
    backup = tmp_path / "backup.db"
    replacement = tmp_path / "replacement.db"
    _synthetic_db(source)

    create_backup(source, backup)
    prepare_restore(backup, replacement)

    with sqlite3.connect(replacement) as connection:
        assert connection.execute("SELECT amount_scaled FROM synthetic_records").fetchone() == (12340000,)


def test_backup_never_overwrites_destination(tmp_path: Path) -> None:
    source = tmp_path / "synthetic.db"
    destination = tmp_path / "existing.db"
    _synthetic_db(source)
    destination.write_text("keep", encoding="utf-8")
    with pytest.raises(FileExistsError):
        create_backup(source, destination)
    assert destination.read_text(encoding="utf-8") == "keep"


def test_restore_rejects_non_sqlite_input(tmp_path: Path) -> None:
    candidate = tmp_path / "invalid.db"
    candidate.write_text("synthetic invalid content", encoding="utf-8")
    with pytest.raises(InvalidBackupError):
        prepare_restore(candidate, tmp_path / "replacement.db")
