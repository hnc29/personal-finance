"""API tests for the assets endpoints (TASK-032).

Runs Alembic against a disposable temp-file SQLite database (never
``data/finance.db``) and overrides ``get_db`` to bind to it, matching the
pattern already used by ``tests/test_crypto.py``. All data is synthetic.
"""

import os
import subprocess
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.assets import get_coin_catalog
from app.core.database import get_db
from app.main import app
from app.services.crypto_coin_catalog import CoinGeckoCoinListProvider, CoinSummary


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "synthetic-assets.db"
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


def test_metal_brands_endpoint_returns_managed_catalog(client: TestClient) -> None:
    response = client.get("/api/v1/assets/metal-brands")
    assert response.status_code == 200
    brands = response.json()
    for expected in ("SJC", "BTMC", "BTMH", "PNJ", "DOJI", "RAW"):
        assert expected in brands


def test_create_metal_persists_selected_brand(client: TestClient) -> None:
    response = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng miếng SJC 1 lượng",
            "purity": "0.9999",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "7500000",
            "total_cost": "7500000",
        },
    )
    assert response.status_code == 201
    assert response.json()["brand"] == "SJC"

    listed = client.get("/api/v1/assets/metals").json()
    assert listed[0]["brand"] == "SJC"


def test_create_crypto_persists_arbitrary_coingecko_id_not_only_btc(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "ethereum",
            "symbol": "eth",
            "display_name": "Ethereum",
            "quantity": "2.5",
            "purchase_date": "2026-08-01",
            "purchase_price": "3500",
            "total_cost": "8750",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["coingecko_id"] == "ethereum"
    assert body["symbol"] == "eth"

    listed = client.get("/api/v1/assets/crypto").json()
    assert listed[0]["coingecko_id"] == "ethereum"
    assert listed[0]["display_name"] == "Ethereum"


def test_create_crypto_rejects_blank_coingecko_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "  ",
            "symbol": "eth",
            "quantity": "1",
            "purchase_date": "2026-08-01",
            "purchase_price": "1",
            "total_cost": "1",
        },
    )
    assert response.status_code == 422


def test_search_coins_endpoint_uses_injected_catalog(client: TestClient) -> None:
    fake_catalog = Mock(spec=CoinGeckoCoinListProvider)
    fake_catalog.search.return_value = [
        CoinSummary(id="bitcoin", symbol="btc", name="Bitcoin"),
    ]
    app.dependency_overrides[get_coin_catalog] = lambda: fake_catalog
    try:
        response = client.get("/api/v1/assets/crypto/coins", params={"q": "bit"})
    finally:
        del app.dependency_overrides[get_coin_catalog]
    assert response.status_code == 200
    assert response.json() == [{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"}]
    fake_catalog.search.assert_called_once_with("bit", limit=50)
