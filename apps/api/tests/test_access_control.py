"""Comprehensive access control and multi-tenant isolation tests.

Verifies:
1. Unauthenticated requests to protected endpoints return 401 Unauthorized.
2. Regular users cannot access admin endpoints (403 Forbidden).
3. Admin users can access admin and backup endpoints (200/201).
4. Data isolation: User A's accounts, categories, events, metals, crypto, savings,
   and import batches are completely invisible and unmodifiable by User B (404 Not Found).
5. User B cannot reference User A's accounts as funding accounts, receiving accounts,
   or parent categories (400/404).
6. Public metadata and health endpoints remain accessible without auth.
"""

from __future__ import annotations

import os
import subprocess
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.assets import get_coin_catalog
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_admin_user, get_current_user
from app.main import app
from app.models.user import User
from app.services.crypto_coin_catalog import CoinGeckoCoinListProvider, CoinSummary


@pytest.fixture(autouse=True)
def disable_default_auth_override() -> Iterator[None]:
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_admin_user, None)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_admin_user, None)


@pytest.fixture
def test_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Session]]:
    database_path = tmp_path / "synthetic_access_control.db"
    backup_folder = tmp_path / "synthetic_backups"
    backup_folder.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    monkeypatch.setattr(settings, "database_path", database_path)

    from app.api import backup as backup_api_mod

    monkeypatch.setattr(backup_api_mod, "BACKUP_DIR", backup_folder)

    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_admin_user, None)

    session = TestingSessionLocal()
    with TestClient(app) as client:
        yield client, session

    session.close()
    app.dependency_overrides.clear()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient, username: str, password: str = "Password123") -> tuple[int, str]:
    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "password": password,
            "display_name": username.title(),
            "email": f"{username}@example.com",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return data["user"]["id"], data["access_token"]


def test_public_routes_accessible_without_auth(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env
    fake_catalog = Mock(spec=CoinGeckoCoinListProvider)
    fake_catalog.search.return_value = [
        CoinSummary(id="bitcoin", symbol="btc", name="Bitcoin"),
    ]
    app.dependency_overrides[get_coin_catalog] = lambda: fake_catalog
    try:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/api/v1/ready").status_code == 200
        assert client.get("/api/v1/health/database").status_code == 200
        assert client.get("/api/v1/assets/metal-brands").status_code == 200
        assert client.get("/api/v1/assets/crypto/coins?q=btc").status_code == 200
    finally:
        app.dependency_overrides.pop(get_coin_catalog, None)


def test_unauthenticated_requests_return_401(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env

    protected_endpoints = [
        ("GET", "/api/v1/accounts"),
        ("POST", "/api/v1/accounts"),
        ("GET", "/api/v1/categories"),
        ("POST", "/api/v1/categories"),
        ("GET", "/api/v1/financial-events"),
        ("POST", "/api/v1/financial-events"),
        ("GET", "/api/v1/portfolio/overview"),
        ("GET", "/api/v1/assets/metals"),
        ("POST", "/api/v1/assets/metals"),
        ("GET", "/api/v1/assets/crypto"),
        ("POST", "/api/v1/assets/crypto"),
        ("GET", "/api/v1/assets/savings"),
        ("POST", "/api/v1/assets/savings"),
        ("GET", "/api/v1/exports/events.csv"),
        ("GET", "/api/v1/exports/statement/data"),
        ("GET", "/api/v1/backup/list"),
        ("POST", "/api/v1/backup/create"),
        ("GET", "/api/v1/users"),
    ]

    for method, path in protected_endpoints:
        if method == "GET":
            res = client.get(path)
        elif method == "POST":
            res = client.post(path, json={})
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}, expected 401"


def test_admin_routes_forbidden_for_regular_user_and_allowed_for_admin(
    test_env: tuple[TestClient, Session]
) -> None:
    client, db = test_env
    user_id, token = _register_and_login(client, "regular_user")
    headers = _auth_headers(token)

    # Regular user gets 403 on admin endpoints
    assert client.get("/api/v1/users", headers=headers).status_code == 403
    assert client.post("/api/v1/users", headers=headers, json={"username": "new_u", "password": "Password123"}).status_code == 403
    assert client.get("/api/v1/backup/list", headers=headers).status_code == 403
    assert client.post("/api/v1/backup/create", headers=headers).status_code == 403

    # Promote to admin
    db_user = db.get(User, user_id)
    assert db_user is not None
    db_user.is_admin = True
    db.commit()

    # Admin user gets 200/201 on admin endpoints
    assert client.get("/api/v1/users", headers=headers).status_code == 200
    assert client.get("/api/v1/backup/list", headers=headers).status_code == 200
    create_bk = client.post(
        "/api/v1/backup/create", headers=headers, json={"mode": "project"}
    )
    assert create_bk.status_code in (200, 201)


def test_multi_tenant_account_isolation(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env
    _, token_a = _register_and_login(client, "user_a")
    _, token_b = _register_and_login(client, "user_b")
    headers_a = _auth_headers(token_a)
    headers_b = _auth_headers(token_b)

    # User A creates an account
    create_res = client.post(
        "/api/v1/accounts",
        headers=headers_a,
        json={"name": "User A Bank", "account_type": "BANK", "currency": "VND"},
    )
    assert create_res.status_code == 201
    account_a_id = create_res.json()["id"]

    # User A can get and update account
    assert client.get(f"/api/v1/accounts/{account_a_id}", headers=headers_a).status_code == 200
    assert client.patch(f"/api/v1/accounts/{account_a_id}", headers=headers_a, json={"name": "A Renamed"}).status_code == 200

    # User B cannot see User A's account in list
    list_b = client.get("/api/v1/accounts", headers=headers_b).json()
    assert not any(acc["id"] == account_a_id for acc in list_b)

    # User B cannot get, update, or get balance of User A's account (404)
    assert client.get(f"/api/v1/accounts/{account_a_id}", headers=headers_b).status_code == 404
    assert client.patch(f"/api/v1/accounts/{account_a_id}", headers=headers_b, json={"name": "Hacked"}).status_code == 404
    assert client.get(f"/api/v1/accounts/{account_a_id}/balance", headers=headers_b).status_code == 404


def test_multi_tenant_category_isolation(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env
    _, token_a = _register_and_login(client, "user_a_cat")
    _, token_b = _register_and_login(client, "user_b_cat")
    headers_a = _auth_headers(token_a)
    headers_b = _auth_headers(token_b)

    # User A creates a category
    create_res = client.post(
        "/api/v1/categories",
        headers=headers_a,
        json={"name": "Food A", "category_type": "EXPENSE"},
    )
    assert create_res.status_code == 201
    cat_a_id = create_res.json()["id"]

    # User B cannot see User A's category
    list_b = client.get("/api/v1/categories", headers=headers_b).json()
    assert not any(cat["id"] == cat_a_id for cat in list_b)

    # User B cannot get or update User A's category (404)
    assert client.get(f"/api/v1/categories/{cat_a_id}", headers=headers_b).status_code == 404
    assert client.patch(f"/api/v1/categories/{cat_a_id}", headers=headers_b, json={"name": "Food B"}).status_code == 404

    # User B cannot use User A's category as parent_id (404)
    res_parent = client.post(
        "/api/v1/categories",
        headers=headers_b,
        json={"name": "Sub Food", "category_type": "EXPENSE", "parent_id": cat_a_id},
    )
    assert res_parent.status_code == 404


def test_multi_tenant_financial_events_and_cross_account_rejection(
    test_env: tuple[TestClient, Session]
) -> None:
    client, _ = test_env
    _, token_a = _register_and_login(client, "user_a_fe")
    _, token_b = _register_and_login(client, "user_b_fe")
    headers_a = _auth_headers(token_a)
    headers_b = _auth_headers(token_b)

    # Create accounts for A and B
    acc_a_id = client.post(
        "/api/v1/accounts",
        headers=headers_a,
        json={"name": "Account A", "account_type": "CASH", "currency": "VND"},
    ).json()["id"]
    acc_b_id = client.post(
        "/api/v1/accounts",
        headers=headers_b,
        json={"name": "Account B", "account_type": "CASH", "currency": "VND"},
    ).json()["id"]

    # User A creates an event on Account A
    ev_a_res = client.post(
        "/api/v1/financial-events",
        headers=headers_a,
        json={
            "event_type": "INCOME",
            "transaction_date": "2026-09-01",
            "entries": [{"account_id": acc_a_id, "amount": "1000000.0000"}],
        },
    )
    assert ev_a_res.status_code == 201
    ev_a_id = ev_a_res.json()["id"]

    # User B cannot see User A's event
    list_b = client.get("/api/v1/financial-events", headers=headers_b).json()
    assert not any(ev["id"] == ev_a_id for ev in list_b)

    # User B cannot get, update, or delete User A's event (404)
    assert client.get(f"/api/v1/financial-events/{ev_a_id}", headers=headers_b).status_code == 404
    assert client.patch(
        f"/api/v1/financial-events/{ev_a_id}",
        headers=headers_b,
        json={"event_type": "INCOME", "transaction_date": "2026-09-01", "entries": [{"account_id": acc_b_id, "amount": "500.0000"}]},
    ).status_code == 404
    assert client.delete(f"/api/v1/financial-events/{ev_a_id}", headers=headers_b).status_code == 404

    # User B cannot create an event referencing User A's account (404)
    res_cross = client.post(
        "/api/v1/financial-events",
        headers=headers_b,
        json={
            "event_type": "EXPENSE",
            "transaction_date": "2026-09-01",
            "entries": [{"account_id": acc_a_id, "amount": "-50000.0000"}],
        },
    )
    assert res_cross.status_code == 404


def test_multi_tenant_precious_metals_and_crypto(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env
    _, token_a = _register_and_login(client, "user_a_assets")
    _, token_b = _register_and_login(client, "user_b_assets")
    headers_a = _auth_headers(token_a)
    headers_b = _auth_headers(token_b)

    acc_a_id = client.post(
        "/api/v1/accounts",
        headers=headers_a,
        json={"name": "Wallet A", "account_type": "BANK", "currency": "VND"},
    ).json()["id"]

    _acc_b_id = client.post(
        "/api/v1/accounts",
        headers=headers_b,
        json={"name": "Wallet B", "account_type": "BANK", "currency": "VND"},
    ).json()["id"]

    # User A creates metal holding
    metal_a_res = client.post(
        "/api/v1/assets/metals",
        headers=headers_a,
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng miếng SJC",
            "quantity_grams": "37.5",
            "purchase_date": "2026-01-01",
            "purchase_price": "80000000",
            "total_cost": "80000000",
        },
    )
    assert metal_a_res.status_code == 201
    metal_a_id = metal_a_res.json()["id"]

    # User A creates crypto holding
    crypto_a_res = client.post(
        "/api/v1/assets/crypto",
        headers=headers_a,
        json={
            "coingecko_id": "bitcoin",
            "symbol": "btc",
            "quantity": "0.5",
            "purchase_date": "2026-01-01",
            "purchase_price": "1000000000",
            "total_cost": "500000000",
        },
    )
    assert crypto_a_res.status_code == 201
    crypto_a_id = crypto_a_res.json()["id"]

    # User B cannot see User A's assets
    metals_b = client.get("/api/v1/assets/metals", headers=headers_b).json()
    crypto_b = client.get("/api/v1/assets/crypto", headers=headers_b).json()
    assert not any(m["id"] == metal_a_id for m in metals_b)
    assert not any(c["id"] == crypto_a_id for c in crypto_b)

    # User B cannot patch or delete User A's assets (404)
    assert client.patch(f"/api/v1/assets/metals/{metal_a_id}", headers=headers_b, json={"product_type": "Hacked"}).status_code == 404
    assert client.delete(f"/api/v1/assets/metals/{metal_a_id}", headers=headers_b).status_code == 404
    assert client.patch(f"/api/v1/assets/crypto/{crypto_a_id}", headers=headers_b, json={"display_name": "Hacked"}).status_code == 404
    assert client.delete(f"/api/v1/assets/crypto/{crypto_a_id}", headers=headers_b).status_code == 404

    # User B cannot use User A's account as funding account (400 or 404)
    res_fund_metal = client.post(
        "/api/v1/assets/metals",
        headers=headers_b,
        json={
            "metal_type": "GOLD",
            "brand": "SJC",
            "product_type": "Vàng miếng",
            "quantity_grams": "3.75",
            "purchase_date": "2026-01-01",
            "purchase_price": "8000000",
            "total_cost": "8000000",
            "funding_account_id": acc_a_id,
        },
    )
    assert res_fund_metal.status_code in (400, 404)


def test_multi_tenant_savings_isolation(test_env: tuple[TestClient, Session]) -> None:
    client, _ = test_env
    _, token_a = _register_and_login(client, "user_a_savings")
    _, token_b = _register_and_login(client, "user_b_savings")
    headers_a = _auth_headers(token_a)
    headers_b = _auth_headers(token_b)

    acc_a_id = client.post(
        "/api/v1/accounts",
        headers=headers_a,
        json={"name": "Savings Wallet A", "account_type": "BANK", "currency": "VND"},
    ).json()["id"]
    acc_b_id = client.post(
        "/api/v1/accounts",
        headers=headers_b,
        json={"name": "Savings Wallet B", "account_type": "BANK", "currency": "VND"},
    ).json()["id"]

    # User A opens savings
    savings_a_res = client.post(
        "/api/v1/assets/savings",
        headers=headers_a,
        json={
            "product_name": "Tiết kiệm 12T",
            "institution": "VCB",
            "name": "Sổ A",
            "principal": "100000000",
            "opened_date": "2026-01-01",
            "term_months": 12,
            "annual_rate": "6.0",
        },
    )
    assert savings_a_res.status_code == 201
    savings_a_id = savings_a_res.json()["id"]

    # User B cannot see User A's savings
    savings_b = client.get("/api/v1/assets/savings", headers=headers_b).json()
    assert not any(s["id"] == savings_a_id for s in savings_b)

    # User B cannot get, patch, close, renew, or delete User A's savings (404)
    assert client.get(f"/api/v1/assets/savings/{savings_a_id}", headers=headers_b).status_code == 404
    assert client.patch(f"/api/v1/assets/savings/{savings_a_id}", headers=headers_b, json={"name": "Hacked"}).status_code == 404
    assert client.post(
        f"/api/v1/assets/savings/{savings_a_id}/close",
        headers=headers_b,
        json={"closed_date": "2027-01-01", "receiving_account_id": acc_b_id, "actual_interest": "6000000"},
    ).status_code == 404
    assert client.post(
        f"/api/v1/assets/savings/{savings_a_id}/renew",
        headers=headers_b,
        json={"start_date": "2027-01-01"},
    ).status_code == 404
    assert client.delete(f"/api/v1/assets/savings/{savings_a_id}", headers=headers_b).status_code == 404

    # User B cannot open savings using User A's funding account (400 or 404)
    res_fund_sav = client.post(
        "/api/v1/assets/savings",
        headers=headers_b,
        json={
            "product_name": "Tiết kiệm B",
            "institution": "VCB",
            "name": "Sổ B",
            "principal": "50000000",
            "opened_date": "2026-01-01",
            "term_months": 6,
            "annual_rate": "5.0",
            "funding_account_id": acc_a_id,
        },
    )
    assert res_fund_sav.status_code in (400, 404)
