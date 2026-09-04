"""Focused tests for the Alembic migration chain (TASK-003 3G).

These tests inspect the migration scripts and run the full chain only against a
disposable temporary database. They never open ``data/finance.db``.
"""

import os
import subprocess
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.models import Base

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
        "0014_crypto_coin_identity",
        "0015_savings_lifecycle",
        "0016_account_sort_order",
        "0017_category_icon",
        "0018_transfer_pair_import",
        "0019_excluded_from_reports",
        "0020_user_authentication_multitenancy",
    }


def test_exactly_one_head() -> None:
    script = _script_directory()
    assert script.get_heads() == ["0020_user_authentication_multitenancy"]


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
    coin_identity = script.get_revision("0014_crypto_coin_identity")
    savings_lifecycle = script.get_revision("0015_savings_lifecycle")
    account_sort_order = script.get_revision("0016_account_sort_order")
    category_icon = script.get_revision("0017_category_icon")
    transfer_pair_import = script.get_revision("0018_transfer_pair_import")
    excluded_from_reports = script.get_revision("0019_excluded_from_reports")
    user_auth = script.get_revision("0020_user_authentication_multitenancy")

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
    assert coin_identity.down_revision == "0013_portfolio_snapshots"
    assert savings_lifecycle.down_revision == "0014_crypto_coin_identity"
    assert account_sort_order.down_revision == "0015_savings_lifecycle"
    assert category_icon.down_revision == "0016_account_sort_order"
    assert transfer_pair_import.down_revision == "0017_category_icon"
    assert excluded_from_reports.down_revision == "0018_transfer_pair_import"
    assert user_auth.down_revision == "0019_excluded_from_reports"

    # walk_revisions is heads-first over the whole tree.
    chain = [revision.revision for revision in script.walk_revisions()]
    assert chain == [
        "0020_user_authentication_multitenancy",
        "0019_excluded_from_reports",
        "0018_transfer_pair_import",
        "0017_category_icon",
        "0016_account_sort_order",
        "0015_savings_lifecycle",
        "0014_crypto_coin_identity",
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


def test_fresh_database_upgrades_to_model_coherent_single_head(tmp_path: Path) -> None:
    database_path = tmp_path / "fresh.db"
    script = _script_directory()
    heads = script.get_heads()
    assert len(heads) == 1

    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(ALEMBIC_INI), "upgrade", "head"],
        check=True,
        cwd=ALEMBIC_INI.parent,
        env=env,
        capture_output=True,
        text=True,
    )

    engine = create_engine(f"sqlite:///{database_path}")
    try:
        migrated_tables = set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            current_revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
    finally:
        engine.dispose()

    assert current_revision == heads[0]
    assert migrated_tables == set(Base.metadata.tables) | {"alembic_version"}
