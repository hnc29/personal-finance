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
    assert revisions == {
        "0001_core",
        "0002_ledger",
        "0003_import",
        "0004_normalized_import",
        "0005_misa_export",
        "0006_reconciliation",
        "0007_credit_card_profiles",
        "0008_credit_card_statements",
        "0009_savings",
        "0010_precious_metals",
        "0011_crypto_holdings",
        "0012_pricing_quotes",
        "0013_portfolio_snapshots",
    }


def test_exactly_one_head() -> None:
    script = _script_directory()
    assert script.get_heads() == ["0013_portfolio_snapshots"]


def test_migration_chain_order() -> None:
    script = _script_directory()

    core = script.get_revision("0001_core")
    ledger = script.get_revision("0002_ledger")
    imports = script.get_revision("0003_import")
    normalized_import = script.get_revision("0004_normalized_import")
    misa_export = script.get_revision("0005_misa_export")
    reconciliation = script.get_revision("0006_reconciliation")
    credit_cards = script.get_revision("0007_credit_card_profiles")
    statements = script.get_revision("0008_credit_card_statements")
    savings = script.get_revision("0009_savings")
    precious_metals = script.get_revision("0010_precious_metals")
    crypto = script.get_revision("0011_crypto_holdings")
    pricing = script.get_revision("0012_pricing_quotes")
    snapshots = script.get_revision("0013_portfolio_snapshots")

    assert core.down_revision is None
    assert ledger.down_revision == "0001_core"
    assert imports.down_revision == "0002_ledger"
    assert normalized_import.down_revision == "0003_import"
    assert misa_export.down_revision == "0004_normalized_import"
    assert reconciliation.down_revision == "0005_misa_export"
    assert credit_cards.down_revision == "0006_reconciliation"
    assert statements.down_revision == "0007_credit_card_profiles"
    assert savings.down_revision == "0008_credit_card_statements"
    assert precious_metals.down_revision == "0009_savings"
    assert crypto.down_revision == "0010_precious_metals"
    assert pricing.down_revision == "0011_crypto_holdings"
    assert snapshots.down_revision == "0012_pricing_quotes"

    # walk_revisions is heads-first over the whole tree.
    chain = [revision.revision for revision in script.walk_revisions()]
    assert chain == [
        "0013_portfolio_snapshots",
        "0012_pricing_quotes",
        "0011_crypto_holdings",
        "0010_precious_metals",
        "0009_savings",
        "0008_credit_card_statements",
        "0007_credit_card_profiles",
        "0006_reconciliation",
        "0005_misa_export",
        "0004_normalized_import",
        "0003_import",
        "0002_ledger",
        "0001_core",
    ]
