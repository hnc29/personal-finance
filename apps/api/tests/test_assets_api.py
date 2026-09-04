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


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/api/v1/assets/metals",
            {
                "metal_type": "GOLD",
                "product_type": "Synthetic ring",
                "purity": "0.9999",
                "quantity_grams": "1.2345",
                "purchase_date": "2026-08-01",
                "purchase_price": "2.3456",
                "total_cost": "3.4567",
            },
        ),
        (
            "/api/v1/assets/crypto",
            {
                "coingecko_id": "synthetic-coin",
                "symbol": "syn",
                "quantity": "1.23456789",
                "purchase_date": "2026-08-01",
                "purchase_price": "2.3456",
                "total_cost": "3.4567",
            },
        ),
    ],
)
def test_create_asset_accepts_supported_exact_precision(
    client: TestClient, path: str, payload: dict[str, object]
) -> None:
    response = client.post(path, json=payload)
    assert response.status_code == 201
    assert response.json()["purchase_price"] == "2.3456"
    assert response.json()["total_cost"] == "3.4567"


@pytest.mark.parametrize("asset_type", ["metals", "crypto"])
@pytest.mark.parametrize("field", ["purchase_price", "total_cost"])
@pytest.mark.parametrize("invalid_value", ["1.23456", "-0.0001"])
def test_create_and_patch_reject_invalid_money_consistently_without_mutation(
    client: TestClient, asset_type: str, field: str, invalid_value: str
) -> None:
    if asset_type == "metals":
        create_payload = {
            "metal_type": "GOLD",
            "product_type": "Synthetic ring",
            "quantity_grams": "3.7500",
            "purchase_date": "2026-08-01",
            "purchase_price": "10.0000",
            "total_cost": "20.0000",
        }
    else:
        create_payload = {
            "coingecko_id": "synthetic-coin",
            "symbol": "syn",
            "quantity": "1.00000000",
            "purchase_date": "2026-08-01",
            "purchase_price": "10.0000",
            "total_cost": "20.0000",
        }

    invalid_create = client.post(
        f"/api/v1/assets/{asset_type}",
        json={**create_payload, field: invalid_value},
    )
    assert invalid_create.status_code == 422

    created = client.post(f"/api/v1/assets/{asset_type}", json=create_payload)
    assert created.status_code == 201
    holding_id = created.json()["id"]
    identity_field = "product_type" if asset_type == "metals" else "symbol"
    original_identity = create_payload[identity_field]

    invalid_patch = client.patch(
        f"/api/v1/assets/{asset_type}/{holding_id}",
        json={field: invalid_value, identity_field: "would-mutate"},
    )
    assert invalid_patch.status_code == 422

    persisted = client.get(f"/api/v1/assets/{asset_type}").json()[0]
    assert persisted[field] == create_payload[field]
    assert persisted[identity_field] == original_identity


def test_create_and_patch_metal_reject_excess_purity_precision_without_mutation(
    client: TestClient,
) -> None:
    payload = {
        "metal_type": "GOLD",
        "product_type": "Synthetic ring",
        "purity": "0.9999",
        "quantity_grams": "3.75",
        "purchase_date": "2026-08-01",
        "purchase_price": "10",
        "total_cost": "20",
    }
    assert client.post(
        "/api/v1/assets/metals", json={**payload, "purity": "0.99999"}
    ).status_code == 422

    created = client.post("/api/v1/assets/metals", json=payload)
    response = client.patch(
        f"/api/v1/assets/metals/{created.json()['id']}",
        json={"purity": "0.99999", "product_type": "would-mutate"},
    )
    assert response.status_code == 422
    persisted = client.get("/api/v1/assets/metals").json()[0]
    assert persisted["purity"] == "0.9999"
    assert persisted["product_type"] == "Synthetic ring"


@pytest.mark.parametrize(
    ("asset_type", "quantity_field", "invalid_value"),
    [
        ("metals", "quantity_grams", "0"),
        ("metals", "quantity_grams", "-0.0001"),
        ("metals", "quantity_grams", "1.23456"),
        ("crypto", "quantity", "0"),
        ("crypto", "quantity", "-0.00000001"),
        ("crypto", "quantity", "1.000000001"),
    ],
)
def test_create_and_patch_enforce_existing_quantity_rules_consistently(
    client: TestClient,
    asset_type: str,
    quantity_field: str,
    invalid_value: str,
) -> None:
    if asset_type == "metals":
        create_payload = {
            "metal_type": "GOLD",
            "product_type": "Synthetic ring",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-01",
            "purchase_price": "10",
            "total_cost": "20",
        }
    else:
        create_payload = {
            "coingecko_id": "synthetic-coin",
            "symbol": "syn",
            "quantity": "1",
            "purchase_date": "2026-08-01",
            "purchase_price": "10",
            "total_cost": "20",
        }

    assert client.post(
        f"/api/v1/assets/{asset_type}",
        json={**create_payload, quantity_field: invalid_value},
    ).status_code == 422

    created = client.post(f"/api/v1/assets/{asset_type}", json=create_payload)
    assert created.status_code == 201
    invalid_patch = client.patch(
        f"/api/v1/assets/{asset_type}/{created.json()['id']}",
        json={quantity_field: invalid_value},
    )
    assert invalid_patch.status_code == 422


def test_patch_crypto_rejects_blank_symbol_without_mutation(client: TestClient) -> None:
    created = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "synthetic-coin",
            "symbol": "syn",
            "quantity": "1",
            "purchase_date": "2026-08-01",
            "purchase_price": "10",
            "total_cost": "20",
        },
    )
    holding_id = created.json()["id"]

    response = client.patch(
        f"/api/v1/assets/crypto/{holding_id}", json={"symbol": "   "}
    )
    assert response.status_code == 422
    assert client.get("/api/v1/assets/crypto").json()[0]["symbol"] == "syn"


def test_create_metal_with_funding_account_debits_balance(client: TestClient) -> None:
    # 1. Create a bank account with 10,000,000 balance
    acc = client.post(
        "/api/v1/accounts",
        json={"name": "Checking Account", "account_type": "BANK", "currency": "VND"},
    ).json()
    acc_id = acc["id"]
    client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "INCOME",
            "transaction_date": "2026-08-01",
            "note": "Initial funds",
            "entries": [{"account_id": acc_id, "amount": "10000000"}],
        },
    )
    bal_before = client.get(f"/api/v1/accounts/{acc_id}/balance").json()["balance"]
    assert bal_before == "10000000.0000"

    # 2. Buy gold for 7,500,000 deducting from checking account
    res = client.post(
        "/api/v1/assets/metals",
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng nhẫn 1 chỉ",
            "purity": "0.9999",
            "quantity_grams": "3.75",
            "purchase_date": "2026-08-02",
            "purchase_price": "7500000",
            "total_cost": "7500000",
            "funding_account_id": acc_id,
        },
    )
    assert res.status_code == 201

    # 3. Balance must now be 2,500,000
    bal_after = client.get(f"/api/v1/accounts/{acc_id}/balance").json()["balance"]
    assert bal_after == "2500000.0000"


def test_create_crypto_with_funding_account_debits_balance(client: TestClient) -> None:
    # 1. Create a bank account with 50,000,000 balance
    acc = client.post(
        "/api/v1/accounts",
        json={"name": "Savings Wallet", "account_type": "BANK", "currency": "VND"},
    ).json()
    acc_id = acc["id"]
    client.post(
        "/api/v1/financial-events",
        json={
            "event_type": "INCOME",
            "transaction_date": "2026-08-01",
            "note": "Initial funds",
            "entries": [{"account_id": acc_id, "amount": "50000000"}],
        },
    )

    # 2. Buy BTC for 30,000,000 deducting from wallet
    res = client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "bitcoin",
            "symbol": "btc",
            "quantity": "0.02",
            "purchase_date": "2026-08-02",
            "purchase_price": "1500000000",
            "total_cost": "30000000",
            "funding_account_id": acc_id,
        },
    )
    assert res.status_code == 201

    # 3. Balance must now be 20,000,000
    bal_after = client.get(f"/api/v1/accounts/{acc_id}/balance").json()["balance"]
    assert bal_after == "20000000.0000"


def test_sync_crypto_prices_endpoint(client: TestClient) -> None:
    client.post(
        "/api/v1/assets/crypto",
        json={
            "coingecko_id": "bitcoin",
            "symbol": "btc",
            "quantity": "0.1",
            "purchase_date": "2026-08-01",
            "purchase_price": "2000000000",
            "total_cost": "200000000",
        },
    )

    import datetime
    from decimal import Decimal
    from unittest.mock import patch

    from app.models.pricing import (
        PriceQuote,
        PricingProvider,
        QuoteMatchLevel,
        QuoteState,
    )

    mock_quote = PriceQuote(
        provider=PricingProvider(code="COINMARKETCAP", name="CoinMarketCap"),
        product_code="BTC/USD",
        match_level=QuoteMatchLevel.EXACT,
        state=QuoteState.LIVE,
        quoted_at=datetime.datetime.now(datetime.UTC),
        observed_at=datetime.datetime.now(datetime.UTC),
    )
    mock_quote.buy_price = Decimal("2080000000.0000")
    mock_quote.sell_price = Decimal("2080000000.0000")

    with patch(
        "app.services.crypto_pricing.CoinMarketCapPriceAdapter.fetch_all_quotes",
        return_value={"BTC": (Decimal(80000), Decimal("2080000000.0000"), mock_quote)},
    ), patch(
        "app.services.crypto_pricing.CoinMarketCapPriceAdapter.get_usd_vnd_rate",
        return_value=Decimal("26000.0000"),
    ):
        res = client.post("/api/v1/assets/crypto/sync-prices")
        assert res.status_code == 200
        data = res.json()
        assert data["updated_count"] == 1
        assert data["usd_vnd_rate"] == "26000.0000"
        assert len(data["items"]) == 1
        assert data["items"][0]["symbol"] == "BTC"


def test_sync_metal_prices_endpoint(client: TestClient) -> None:
    client.post(
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

    import datetime
    from decimal import Decimal
    from unittest.mock import patch

    from app.models.pricing import (
        PriceQuote,
        PricingProvider,
        QuoteMatchLevel,
        QuoteState,
    )

    mock_quote = PriceQuote(
        provider=PricingProvider(code="BTMC", name="Bảo Tín Minh Châu"),
        product_code="SJC_GOLD_BAR_9999",
        match_level=QuoteMatchLevel.EXACT,
        state=QuoteState.LIVE,
        quoted_at=datetime.datetime.now(datetime.UTC),
        observed_at=datetime.datetime.now(datetime.UTC),
    )
    mock_quote.buy_price = Decimal("14700000.0000")
    mock_quote.sell_price = Decimal("15000000.0000")

    with patch(
        "app.api.assets.get_or_refresh_metal_quote",
        return_value=mock_quote,
    ):
        res = client.post("/api/v1/assets/metals/sync-prices")
        assert res.status_code == 200
        data = res.json()
        assert data["updated_count"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["brand"] == "SJC"
        assert data["items"][0]["valuation_price"] == "14700000.0000"

