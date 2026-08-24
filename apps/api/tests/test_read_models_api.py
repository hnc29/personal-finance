import datetime

from fastapi.testclient import TestClient

from app.api import read_models as read_models_api
from app.core.database import get_db
from app.main import app
from app.schemas.read_models import (
    PortfolioOverview,
    PortfolioRow,
    QuoteMeta,
    ReconciliationRead,
)


def _client() -> TestClient:
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app)


def test_portfolio_overview_endpoint_empty_portfolio_is_complete(monkeypatch) -> None:
    overview = PortfolioOverview(
        as_of=datetime.datetime(2026, 8, 23, tzinfo=datetime.UTC),
        valuation_complete=True,
        net_worth="0.0000",
        invested_assets="0.0000",
        account_count=0,
        accounts=[],
        savings=[],
        credit_cards=[],
        precious_metals=[],
        crypto=[],
    )
    monkeypatch.setattr(read_models_api.read_models, "portfolio_overview", lambda db: overview)
    client = _client()
    try:
        body = client.get("/api/v1/portfolio/overview").json()
    finally:
        app.dependency_overrides.clear()
    assert body["valuation_complete"] is True
    assert body["net_worth"] == "0.0000"
    assert body["invested_assets"] == "0.0000"


def test_portfolio_overview_endpoint_exposes_exact_contract_and_quote_metadata(
    monkeypatch,
) -> None:
    observed = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    overview = PortfolioOverview(
        as_of=observed,
        valuation_complete=True,
        net_worth="75.0000",
        invested_assets="25.0000",
        account_count=2,
        accounts=[PortfolioRow(id=1, name="Bank", value="100.0000")],
        savings=[],
        credit_cards=[PortfolioRow(id=2, name="Card", value="-25.0000")],
        precious_metals=[],
        crypto=[
            PortfolioRow(
                id=3,
                name="BTC",
                value="25.0000",
                quote=QuoteMeta(
                    state="STALE",
                    provider="SYNTHETIC",
                    quoted_at=observed,
                    observed_at=observed,
                    valuation_price="123.4567",
                ),
            )
        ],
    )
    monkeypatch.setattr(read_models_api.read_models, "portfolio_overview", lambda db: overview)
    client = _client()
    try:
        body = client.get("/api/v1/portfolio/overview").json()
    finally:
        app.dependency_overrides.clear()
    assert body["net_worth"] == "75.0000"
    assert body["credit_cards"][0]["value"] == "-25.0000"
    assert body["crypto"][0]["quote"]["observed_at"] == observed.isoformat().replace("+00:00", "Z")
    assert body["crypto"][0]["quote"]["valuation_price"] == "123.4567"


def test_portfolio_overview_endpoint_does_not_expose_partial_totals(monkeypatch) -> None:
    overview = PortfolioOverview(
        as_of=datetime.datetime(2026, 8, 23, tzinfo=datetime.UTC),
        valuation_complete=False,
        net_worth=None,
        invested_assets=None,
        account_count=0,
        accounts=[],
        savings=[],
        credit_cards=[],
        precious_metals=[
            PortfolioRow(
                id=1,
                name="Gold",
                value=None,
                quote=QuoteMeta(state="UNAVAILABLE"),
            )
        ],
        crypto=[],
    )
    monkeypatch.setattr(read_models_api.read_models, "portfolio_overview", lambda db: overview)
    client = _client()
    try:
        body = client.get("/api/v1/portfolio/overview").json()
    finally:
        app.dependency_overrides.clear()
    assert body["valuation_complete"] is False
    assert body["net_worth"] is None
    assert body["invested_assets"] is None
    assert body["precious_metals"][0]["value"] is None


def test_import_and_reconciliation_endpoints_read_sanitized_persisted_models(monkeypatch) -> None:
    imported_at = datetime.datetime(2026, 8, 23, tzinfo=datetime.UTC)
    monkeypatch.setattr(
        read_models_api.read_models,
        "list_import_batches",
        lambda db: [{"id": 1, "source": "SYNTHETIC", "original_filename": "statement.csv", "imported_at": imported_at, "row_count": 1}],
    )
    monkeypatch.setattr(
        read_models_api.read_models,
        "list_reconciliation",
        lambda db: [ReconciliationRead(id=1, state="PROPOSED", raw_row_id=2, source_row_number=4, source_row_id="ROW-4", financial_event_id=3, transaction_date=datetime.date(2026, 8, 23), event_type="EXPENSE")],
    )
    client = _client()
    try:
        imports = client.get("/api/v1/import-batches").json()
        reconciliation = client.get("/api/v1/reconciliation-candidates").json()
    finally:
        app.dependency_overrides.clear()
    assert imports[0]["original_filename"] == "statement.csv"
    assert reconciliation[0]["raw_row_id"] == 2
