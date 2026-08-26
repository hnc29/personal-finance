"""API tests for the dedicated savings ("Sổ tiết kiệm") endpoints (TASK-033).

Runs Alembic against a disposable temp-file SQLite database (never
``data/finance.db``) and overrides ``get_db`` to bind to it, matching the
pattern already used by ``tests/test_assets_api.py``. All data is synthetic.

Focus: end-to-end ledger correctness through the real HTTP surface --
opening debits the funding account (Net Worth unchanged), tất toán splits
principal vs actual interest (Net Worth rises by exactly the interest),
capitalized renewal creates no ledger event, and the portfolio overview
never double-counts savings principal.
"""

import os
import subprocess
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic-savings.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    engine = create_engine(
        f"sqlite:///{database_path}", connect_args={"check_same_thread": False}
    )
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Iterator[Session]:
        db = session_factory()
        try:
            db.execute(text("PRAGMA foreign_keys=ON"))
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def _make_bank_account(client: TestClient, name: str = "Vietcombank") -> int:
    response = client.post(
        "/api/v1/accounts",
        json={"name": name, "account_type": "BANK", "currency": "VND"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _net_worth(client: TestClient) -> Decimal:
    response = client.get("/api/v1/portfolio/overview")
    assert response.status_code == 200, response.text
    value = response.json()["net_worth"]
    assert value is not None
    return Decimal(value)


def _open_savings(
    client: TestClient,
    *,
    funding_account_id: int,
    principal: str = "100000000",
    term_months: int = 6,
    annual_rate: str = "5.5",
    maturity_action: str = "CLOSE",
    opened_date: str = "2026-01-01",
) -> dict:
    response = client.post(
        "/api/v1/assets/savings",
        json={
            "institution": "Vietcombank",
            "product_name": "Tiết kiệm có kỳ hạn",
            "name": "Sổ tiết kiệm 6 tháng",
            "principal": principal,
            "funding_account_id": funding_account_id,
            "opened_date": opened_date,
            "term_months": term_months,
            "annual_rate": annual_rate,
            "maturity_action": maturity_action,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_savings_debits_funding_account_and_preserves_net_worth(
    client: TestClient,
) -> None:
    bank_id = _make_bank_account(client)
    # Seed the bank account with cash so its balance can meaningfully drop.
    seed = client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "INCOME",
            "transaction_date": "2026-01-01",
            "entries": [{"account_id": bank_id, "amount": "200000000"}],
        },
    )
    assert seed.status_code == 201, seed.text

    net_worth_before = _net_worth(client)
    account = _open_savings(client, funding_account_id=bank_id, principal="100000000")
    net_worth_after = _net_worth(client)

    assert net_worth_after == net_worth_before

    balance = client.get(f"/api/v1/accounts/{bank_id}/balance").json()
    assert Decimal(balance["balance"]) == Decimal(100000000)
    assert account["principal"] == "100000000.0000"
    assert account["editable"] is True
    assert account["current_term"]["status"] == "ACTIVE"


def test_create_savings_rejects_non_wallet_funding_account(client: TestClient) -> None:
    card = client.post(
        "/api/v1/accounts",
        json={"name": "Credit Card", "account_type": "CREDIT_CARD"},
    )
    assert card.status_code == 201
    response = client.post(
        "/api/v1/assets/savings",
        json={
            "institution": "Vietcombank",
            "name": "Sổ tiết kiệm",
            "principal": "1000000",
            "funding_account_id": card.json()["id"],
            "opened_date": "2026-01-01",
            "term_months": 6,
            "annual_rate": "5",
        },
    )
    assert response.status_code == 400
    assert "funding_account_id" in response.json()["detail"]


def test_list_and_get_savings(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    created = _open_savings(client, funding_account_id=bank_id)

    listed = client.get("/api/v1/assets/savings").json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]
    assert "terms" not in listed[0]

    detail = client.get(f"/api/v1/assets/savings/{created['id']}").json()
    assert detail["id"] == created["id"]
    assert len(detail["terms"]) == 1


def test_get_savings_404_for_unknown_id(client: TestClient) -> None:
    response = client.get("/api/v1/assets/savings/999")
    assert response.status_code == 404


def test_patch_savings_allowed_while_sole_term_active(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(client, funding_account_id=bank_id, term_months=6)

    response = client.patch(
        f"/api/v1/assets/savings/{account['id']}",
        json={"term_months": 12, "annual_rate": "6.0", "notes": "renewed rate"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current_term"]["term_months"] == 12
    assert body["current_term"]["annual_rate"] == "6.0000"
    assert body["current_term"]["maturity_date"] == "2027-01-01"
    assert body["notes"] == "renewed rate"


def test_patch_savings_rejected_after_history_exists(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        term_months=1,
        maturity_action="RENEW_PRINCIPAL",
        opened_date="2026-01-01",
    )
    renewed = client.post(
        f"/api/v1/assets/savings/{account['id']}/renew",
        json={"start_date": "2026-02-01", "actual_interest": "0"},
    )
    assert renewed.status_code == 200, renewed.text

    response = client.patch(
        f"/api/v1/assets/savings/{account['id']}",
        json={"notes": "should be rejected"},
    )
    assert response.status_code == 400


# User request, 2026-08-26: "không tính vào báo cáo" also applies to newly
# added assets, and must be editable afterwards via the asset-edit menu.


def test_create_savings_defaults_excluded_from_reports_false(
    client: TestClient,
) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(client, funding_account_id=bank_id)
    assert account["excluded_from_reports"] is False


def test_patch_savings_can_set_excluded_from_reports_while_editable(
    client: TestClient,
) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(client, funding_account_id=bank_id)

    response = client.patch(
        f"/api/v1/assets/savings/{account['id']}",
        json={"excluded_from_reports": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["excluded_from_reports"] is True


def test_patch_savings_can_set_excluded_from_reports_after_history_exists(
    client: TestClient,
) -> None:
    """Unlike every other patchable field, excluded_from_reports is pure
    reporting metadata -- editable regardless of lifecycle history, so this
    must NOT hit the "Cannot edit ... once it has lifecycle history" gate
    that a bare 'notes' patch does (see the rejected-after-history test
    above)."""
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        term_months=1,
        maturity_action="RENEW_PRINCIPAL",
        opened_date="2026-01-01",
    )
    renewed = client.post(
        f"/api/v1/assets/savings/{account['id']}/renew",
        json={"start_date": "2026-02-01", "actual_interest": "0"},
    )
    assert renewed.status_code == 200, renewed.text

    response = client.patch(
        f"/api/v1/assets/savings/{account['id']}",
        json={"excluded_from_reports": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["excluded_from_reports"] is True

    # A mixed patch (history-affecting field + this one) still hits the gate.
    mixed = client.patch(
        f"/api/v1/assets/savings/{account['id']}",
        json={"excluded_from_reports": False, "notes": "should be rejected"},
    )
    assert mixed.status_code == 400


def test_close_at_maturity_splits_principal_and_interest(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        principal="100000000",
        term_months=1,
        opened_date="2026-01-01",
    )
    net_worth_before = _net_worth(client)

    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/close",
        json={
            "closed_date": "2026-02-01",
            "receiving_account_id": bank_id,
            "actual_interest": "458333",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "CLOSED"
    assert body["principal"] == "0.0000"
    assert body["current_term"]["status"] == "CLOSED"
    assert body["current_term"]["actual_interest"] == "458333.0000"

    net_worth_after = _net_worth(client)
    assert net_worth_after == net_worth_before + Decimal(458333)


def test_close_before_maturity_is_rejected(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client, funding_account_id=bank_id, term_months=6, opened_date="2026-01-01"
    )
    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/close",
        json={
            "closed_date": "2026-02-01",
            "receiving_account_id": bank_id,
            "actual_interest": "0",
        },
    )
    assert response.status_code == 400
    assert "maturity" in response.json()["detail"]


def test_early_close_charges_fee_and_pays_demand_interest(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        principal="100000000",
        term_months=6,
        opened_date="2026-01-01",
    )
    net_worth_before = _net_worth(client)

    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/early-close",
        json={
            "closed_date": "2026-03-01",
            "receiving_account_id": bank_id,
            "actual_interest": "100000",
            "fee": "20000",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current_term"]["status"] == "EARLY_CLOSED"

    net_worth_after = _net_worth(client)
    assert net_worth_after == net_worth_before + Decimal(100000) - Decimal(20000)


def test_early_close_after_maturity_is_rejected(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client, funding_account_id=bank_id, term_months=1, opened_date="2026-01-01"
    )
    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/early-close",
        json={
            "closed_date": "2026-02-01",
            "receiving_account_id": bank_id,
            "actual_interest": "0",
        },
    )
    assert response.status_code == 400
    assert "maturity" in response.json()["detail"]


def test_renew_capitalized_interest_creates_no_ledger_event_but_raises_net_worth(
    client: TestClient,
) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        principal="100000000",
        term_months=1,
        opened_date="2026-01-01",
        maturity_action="RENEW_PRINCIPAL_AND_INTEREST",
    )
    net_worth_before = _net_worth(client)
    balance_before = Decimal(
        client.get(f"/api/v1/accounts/{bank_id}/balance").json()["balance"]
    )

    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/renew",
        json={"start_date": "2026-02-01", "actual_interest": "458333"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current_term"]["sequence"] == 2
    assert body["current_term"]["status"] == "ACTIVE"
    assert body["principal"] == "100458333.0000"

    net_worth_after = _net_worth(client)
    assert net_worth_after == net_worth_before + Decimal(458333)

    # The receiving/wallet account's cash balance must be untouched: the
    # interest was capitalized, not paid out through any wallet account.
    balance_after = Decimal(
        client.get(f"/api/v1/accounts/{bank_id}/balance").json()["balance"]
    )
    assert balance_after == balance_before


def test_renew_pay_out_interest_requires_receiving_account(client: TestClient) -> None:
    bank_id = _make_bank_account(client)
    account = _open_savings(
        client,
        funding_account_id=bank_id,
        principal="100000000",
        term_months=1,
        opened_date="2026-01-01",
        maturity_action="RENEW_PRINCIPAL",
    )
    response = client.post(
        f"/api/v1/assets/savings/{account['id']}/renew",
        json={"start_date": "2026-02-01", "actual_interest": "458333"},
    )
    assert response.status_code == 400
    assert "receiving account" in response.json()["detail"]

    paid_out = client.post(
        f"/api/v1/assets/savings/{account['id']}/renew",
        json={
            "start_date": "2026-02-01",
            "actual_interest": "458333",
            "receiving_account_id": bank_id,
        },
    )
    assert paid_out.status_code == 200, paid_out.text
    body = paid_out.json()
    # Principal-only renewal: the new term's principal excludes interest.
    assert body["principal"] == "100000000.0000"


def test_portfolio_overview_counts_savings_principal_exactly_once(
    client: TestClient,
) -> None:
    bank_id = _make_bank_account(client)
    seed = client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "INCOME",
            "transaction_date": "2026-01-01",
            "entries": [{"account_id": bank_id, "amount": "200000000"}],
        },
    )
    assert seed.status_code == 201, seed.text

    _open_savings(client, funding_account_id=bank_id, principal="100000000")

    overview = client.get("/api/v1/portfolio/overview").json()
    assert len(overview["savings"]) == 1
    savings_component_total = sum(
        Decimal(row["value"]) for row in overview["savings"]
    )
    assert savings_component_total == Decimal(100000000)
    # Net worth = remaining bank cash (100M) + savings principal (100M).
    assert Decimal(overview["net_worth"]) == Decimal(200000000)
