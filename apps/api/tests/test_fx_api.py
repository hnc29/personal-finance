"""API tests for GET /api/v1/fx/usd-vnd (see app/api/fx.py).

No database involved -- overrides only the FX rate provider dependency,
matching the get_coin_catalog override pattern in test_assets_api.py.
"""

import datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.fx import get_usd_vnd_provider
from app.main import app
from app.services.fx_rate import FxRate, FxRateUnavailableError, UsdVndRateProvider


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_returns_the_live_rate(client: TestClient) -> None:
    fake_provider = Mock(spec=UsdVndRateProvider)
    fake_provider.get_rate.return_value = FxRate(
        rate=Decimal("26123.4500"),
        as_of=datetime.datetime(2026, 8, 26, 10, tzinfo=datetime.UTC),
        source="open.er-api.com",
    )
    app.dependency_overrides[get_usd_vnd_provider] = lambda: fake_provider
    try:
        response = client.get("/api/v1/fx/usd-vnd")
    finally:
        del app.dependency_overrides[get_usd_vnd_provider]

    assert response.status_code == 200
    body = response.json()
    assert body["rate"] == "26123.4500"
    assert body["source"] == "open.er-api.com"
    assert "2026-08-26" in body["as_of"]


def test_returns_503_when_the_rate_is_unavailable(client: TestClient) -> None:
    fake_provider = Mock(spec=UsdVndRateProvider)
    fake_provider.get_rate.side_effect = FxRateUnavailableError("no rate")
    app.dependency_overrides[get_usd_vnd_provider] = lambda: fake_provider
    try:
        response = client.get("/api/v1/fx/usd-vnd")
    finally:
        del app.dependency_overrides[get_usd_vnd_provider]

    assert response.status_code == 503
