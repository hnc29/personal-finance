import os
import subprocess

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.services.default_categories import seed_default_categories


@pytest.fixture
def db(tmp_path) -> Session:
    database = tmp_path / "synthetic.db"
    env = {**os.environ, "PF_DATABASE_PATH": str(database)}
    subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(f"sqlite:///{database}")
    with Session(engine) as value:
        yield value


def test_empty_database_gets_expected_hierarchy(db: Session) -> None:
    assert seed_default_categories(db) == 61
    rows = list(db.scalars(select(Category)))
    by_name = {row.name: row for row in rows}
    assert by_name["Groceries"].parent is by_name["Food & Drinks"]
    assert by_name["Food & Drinks"].parent is by_name["Expenses"]
    assert by_name["Salary"].parent is by_name["Income"]


def test_second_seed_is_idempotent(db: Session) -> None:
    seed_default_categories(db)
    assert seed_default_categories(db) == 0
    assert len(list(db.scalars(select(Category)))) == 61


def test_non_empty_database_is_untouched(db: Session) -> None:
    db.add(Category(name="My category"))
    db.commit()
    assert seed_default_categories(db) == 0
    assert [row.name for row in db.scalars(select(Category))] == ["My category"]


def test_catalog_depth_is_at_most_three(db: Session) -> None:
    seed_default_categories(db)
    for row in db.scalars(select(Category)):
        depth = 1
        parent = row.parent
        while parent is not None:
            depth += 1
            parent = parent.parent
        assert depth <= 3
