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


def test_create_metal_rejects_purity_outside_unit_range(client: TestClient) -> None:
    """Regression test (found via E2E, see docs/qa/QA_STATE.md Batch #2):
    purity is a (0, 1] fraction (the DB's ck_precious_holding_purity_range
    CHECK enforces this too), but the API used to accept anything -- e.g.
    the common Vietnamese "999" per-mille gold notation -- and let an
    unhandled IntegrityError 500 out instead of a clean validation error.
    """
    base = {
        "metal_type": "GOLD",
        "brand": "SJC",
        "product_type": "Nhẫn tròn trơn",
        "quantity_grams": "3.75",
        "purchase_date": "2026-08-01",
        "purchase_price": "7500000",
        "total_cost": "7500000",
    }
    too_high = client.post("/api/v1/assets/metals", json={**base, "purity": "999"})
    assert too_high.status_code == 422

    zero = client.post("/api/v1/assets/metals", json={**base, "purity": "0"})
    assert zero.status_code == 422

    negative = client.post("/api/v1/assets/metals", json={**base, "purity": "-0.5"})
    assert negative.status_code == 422

    assert client.get("/api/v1/assets/metals").json() == []


def test_create_metal_purity_defaults_to_9999_when_omitted(client: TestClient) -> None:
    """Regression test (user report, 2026-08-26: "Độ tinh khiết ko bắt buộc
    nhập, mặc định giá trị 99,99"): purity used to be a required field with
    no default -- the frontend now defaults its own input to 99.99% when
    left blank, but the API itself must also tolerate the field being
    omitted entirely by any client, since "not required" means the server
    accepts its absence, not just that one caller happens to always fill it.
    """
    response = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "RING",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "7500000",
            "total_cost": "7500000",
        },
    )
    assert response.status_code == 201


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


# User request, 2026-08-26: "không tính vào báo cáo" also applies to newly
# added assets, and must be editable afterwards via the asset-edit menu.


def test_create_metal_defaults_excluded_from_reports_false_and_persists_true(
    client: TestClient,
) -> None:
    default_resp = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng miếng SJC 1 lượng",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "7500000",
            "total_cost": "7500000",
        },
    )
    assert default_resp.status_code == 201
    assert default_resp.json()["excluded_from_reports"] is False

    excluded_resp = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Nhẫn trơn",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "7500000",
            "total_cost": "7500000",
            "excluded_from_reports": True,
        },
    )
    assert excluded_resp.status_code == 201
    assert excluded_resp.json()["excluded_from_reports"] is True

    listed = client.get("/api/v1/assets/metals").json()
    by_id = {row["id"]: row for row in listed}
    assert by_id[default_resp.json()["id"]]["excluded_from_reports"] is False
    assert by_id[excluded_resp.json()["id"]]["excluded_from_reports"] is True


def test_patch_metal_toggles_excluded_from_reports(client: TestClient) -> None:
    created = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng miếng SJC 1 lượng",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "7500000",
            "total_cost": "7500000",
        },
    ).json()
    assert created["excluded_from_reports"] is False

    patched = client.patch(
        f"/api/v1/assets/metals/{created['id']}",
        json={"excluded_from_reports": True},
    )
    assert patched.status_code == 200
    assert patched.json()["excluded_from_reports"] is True

    listed = client.get("/api/v1/assets/metals").json()
    assert listed[0]["excluded_from_reports"] is True


def test_patch_metal_unknown_id_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/assets/metals/999999", json={"excluded_from_reports": True}
    )
    assert response.status_code == 404


def test_create_crypto_defaults_excluded_from_reports_false_and_persists_true(
    client: TestClient,
) -> None:
    default_resp = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "bitcoin",
            "symbol": "btc",
            "quantity": "0.5",
            "purchase_date": "2026-08-01",
            "purchase_price": "60000",
            "total_cost": "30000",
        },
    )
    assert default_resp.status_code == 201
    assert default_resp.json()["excluded_from_reports"] is False

    excluded_resp = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "ethereum",
            "symbol": "eth",
            "quantity": "1",
            "purchase_date": "2026-08-01",
            "purchase_price": "3500",
            "total_cost": "3500",
            "excluded_from_reports": True,
        },
    )
    assert excluded_resp.status_code == 201
    assert excluded_resp.json()["excluded_from_reports"] is True


def test_patch_crypto_toggles_excluded_from_reports(client: TestClient) -> None:
    created = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "bitcoin",
            "symbol": "btc",
            "quantity": "0.5",
            "purchase_date": "2026-08-01",
            "purchase_price": "60000",
            "total_cost": "30000",
        },
    ).json()
    assert created["excluded_from_reports"] is False

    patched = client.patch(
        f"/api/v1/assets/crypto/{created['id']}",
        json={"excluded_from_reports": True},
    )
    assert patched.status_code == 200
    assert patched.json()["excluded_from_reports"] is True

    listed = client.get("/api/v1/assets/crypto").json()
    assert listed[0]["excluded_from_reports"] is True


def test_patch_crypto_unknown_id_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/assets/crypto/999999", json={"excluded_from_reports": True}
    )
    assert response.status_code == 404
