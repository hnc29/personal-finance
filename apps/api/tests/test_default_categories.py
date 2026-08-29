import os
import subprocess

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.services.default_categories import (
    merge_default_categories,
    missing_default_categories,
)


@pytest.fixture
def db(tmp_path) -> Session:
    database = tmp_path / "synthetic.db"
    env = {**os.environ, "PF_DATABASE_PATH": str(database)}
    subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True, env=env, capture_output=True)
    engine = create_engine(f"sqlite:///{database}")
    with Session(engine) as value:
        yield value


def test_empty_database_gets_expected_hierarchy(db: Session) -> None:
    assert merge_default_categories(db)["inserted"] == 79
    rows = list(db.scalars(select(Category)))
    by_name = {row.name: row for row in rows}
    assert by_name["Ăn sáng"].parent is by_name["Ăn uống"]
    assert by_name["Ăn uống"].parent is by_name["Expenses"]
    assert by_name["Lương"].parent is by_name["Income"]


def test_second_seed_is_idempotent(db: Session) -> None:
    merge_default_categories(db)
    assert merge_default_categories(db)["inserted"] == 0
    assert len(list(db.scalars(select(Category)))) == 79


def test_non_empty_database_preserves_custom_and_merges(db: Session) -> None:
    custom = Category(name="My category", is_active=False)
    db.add(custom)
    db.commit()
    assert merge_default_categories(db)["inserted"] == 79
    db.refresh(custom)
    assert (custom.name, custom.parent_id, custom.is_active) == ("My category", None, False)


def test_catalog_depth_is_at_most_three(db: Session) -> None:
    merge_default_categories(db)
    for row in db.scalars(select(Category)):
        depth = 1
        parent = row.parent
        while parent is not None:
            depth += 1
            parent = parent.parent
        assert depth <= 3


def test_partial_tree_is_completed_without_duplicates(db: Session) -> None:
    expenses = Category(name="Expenses")
    food = Category(name="Ăn uống", parent=expenses)
    db.add_all([expenses, food])
    db.commit()
    assert merge_default_categories(db)["inserted"] == 77
    assert merge_default_categories(db)["inserted"] == 0
    assert len(list(db.scalars(select(Category)))) == 79


def test_conflict_is_preserved_and_reported(db: Session) -> None:
    custom = Category(name="Custom")
    an_sang = Category(name="Ăn sáng", parent=custom, is_active=False)
    db.add_all([custom, an_sang])
    db.commit()
    result = merge_default_categories(db)
    db.refresh(an_sang)
    assert result["conflicts"] == 1
    assert (an_sang.parent_id, an_sang.is_active) == (custom.id, False)
    assert missing_default_categories(db) == 0
