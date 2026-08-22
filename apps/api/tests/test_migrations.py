"""Focused tests for the Alembic migration chain (TASK-003 3G).

These tests read the migration scripts through Alembic's ``ScriptDirectory``.
They do not run migrations and never open ``data/finance.db``.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _script_directory() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))


def test_exactly_expected_revisions() -> None:
    script = _script_directory()
    # walk_revisions traverses the whole tree, so this is every revision.
    revisions = {revision.revision for revision in script.walk_revisions()}
    assert revisions == {"0001_core", "0002_ledger", "0003_import"}


def test_exactly_one_head() -> None:
    script = _script_directory()
    assert script.get_heads() == ["0003_import"]


def test_migration_chain_order() -> None:
    script = _script_directory()

    core = script.get_revision("0001_core")
    ledger = script.get_revision("0002_ledger")
    imports = script.get_revision("0003_import")

    assert core.down_revision is None
    assert ledger.down_revision == "0001_core"
    assert imports.down_revision == "0002_ledger"

    # walk_revisions is heads-first over the whole tree.
    chain = [revision.revision for revision in script.walk_revisions()]
    assert chain == ["0003_import", "0002_ledger", "0001_core"]
