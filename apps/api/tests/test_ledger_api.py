"""Synthetic API coverage for the TASK-005 ledger routes."""

import datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.services import ledger as ledger_service


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    event = FinancialEvent(
        id=1,
        event_type=FinancialEventType.EXPENSE,
        transaction_date=datetime.date(2026, 8, 22),
        entries=[AccountEntry(id=1, account_id=7, amount_scaled=-123456)],
    )
    monkeypatch.setattr(ledger_service, "list_financial_events", lambda db: [event])
    monkeypatch.setattr(ledger_service, "get_financial_event", lambda db, event_id: event if event_id == 1 else None)
    monkeypatch.setattr(ledger_service, "account_balance", lambda db, account_id: Decimal("8.0000") if account_id == 7 else None)
    monkeypatch.setattr(ledger_service, "create_financial_event", lambda db, payload: event)
    app.dependency_overrides[get_db] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_list_and_get_event(client: TestClient) -> None:
    assert client.get("/api/v1/financial-events").status_code == 200
    assert (
        client.get("/api/v1/financial-events/1").json()["entries"][0]["amount"]
        == "-12.3456"
    )
    assert client.get("/api/v1/financial-events/999").status_code == 404


def test_create_event_and_balance(client: TestClient) -> None:
    response = client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "EXPENSE",
            "transaction_date": "2026-08-22",
            "entries": [{"account_id": 7, "amount": "-12.3456"}],
        },
    )
    assert response.status_code == 201
    assert client.get("/api/v1/accounts/7/balance").json()["balance"] == "8.0000"
    assert client.get("/api/v1/accounts/999/balance").status_code == 404


def test_empty_entries_are_validation_error(client: TestClient) -> None:
    response = client.post(
        "/api/v1/financial-events",
        json={"event_type": "EXPENSE", "transaction_date": "2026-08-22", "entries": []},
    )
    assert response.status_code == 422
