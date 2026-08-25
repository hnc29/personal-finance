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
    assert merge_default_categories(db)["inserted"] == 69
    rows = list(db.scalars(select(Category)))
    by_name = {row.name: row for row in rows}
    assert by_name["Groceries"].parent is by_name["Food & Drinks"]
    assert by_name["Food & Drinks"].parent is by_name["Expenses"]
    assert by_name["Salary"].parent is by_name["Income"]


def test_second_seed_is_idempotent(db: Session) -> None:
    merge_default_categories(db)
    assert merge_default_categories(db)["inserted"] == 0
    assert len(list(db.scalars(select(Category)))) == 69


def test_non_empty_database_preserves_custom_and_merges(db: Session) -> None:
    custom = Category(name="My category", is_active=False)
    db.add(custom)
    db.commit()
    assert merge_default_categories(db)["inserted"] == 69
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
    food = Category(name="Food & Drinks", parent=expenses)
    db.add_all([expenses, food])
    db.commit()
    assert merge_default_categories(db)["inserted"] == 67
    assert merge_default_categories(db)["inserted"] == 0
    assert len(list(db.scalars(select(Category)))) == 69


def test_conflict_is_preserved_and_reported(db: Session) -> None:
    custom = Category(name="Custom")
    groceries = Category(name="Groceries", parent=custom, is_active=False)
    db.add_all([custom, groceries])
    db.commit()
    result = merge_default_categories(db)
    db.refresh(groceries)
    assert result["conflicts"] == 1
    assert (groceries.parent_id, groceries.is_active) == (custom.id, False)
    assert missing_default_categories(db) == 0
