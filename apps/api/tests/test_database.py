from sqlalchemy import text

from app.core.database import engine


def test_sqlite_configuration() -> None:
    with engine.connect() as connection:
        journal_mode = connection.execute(
            text("PRAGMA journal_mode")
        ).scalar()

        foreign_keys = connection.execute(
            text("PRAGMA foreign_keys")
        ).scalar()

        synchronous = connection.execute(
            text("PRAGMA synchronous")
        ).scalar()

        busy_timeout = connection.execute(
            text("PRAGMA busy_timeout")
        ).scalar()

    assert journal_mode == "wal"
    assert foreign_keys == 1

    # SQLite synchronous:
    # 0 = OFF
    # 1 = NORMAL
    # 2 = FULL
    # 3 = EXTRA
    assert synchronous == 1

    assert busy_timeout == 10_000
