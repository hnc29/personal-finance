from __future__ import annotations

import os
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models.account import Account
from app.models.user import User


@pytest.fixture
def test_setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Session]]:
    database_path = tmp_path / "synthetic_finance.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    monkeypatch.setattr(settings, "database_path", database_path)

    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    session = TestingSessionLocal()
    with TestClient(app) as client:
        yield client, session

    session.close()
    app.dependency_overrides.clear()


def test_auth_register_and_login(test_setup: tuple[TestClient, Session]) -> None:
    client, _ = test_setup

    # 1. Register User A
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "usera",
            "password": "password123",
            "display_name": "User Alpha",
            "email": "usera@example.com",
        },
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "usera"
    token_a = data["access_token"]

    # 2. Duplicate username rejected
    dup_res = client.post(
        "/api/v1/auth/register",
        json={"username": "usera", "password": "password456"},
    )
    assert dup_res.status_code == 400

    # 3. Login User A success
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "password123"},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # 4. Login User A wrong password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "wrongpassword"},
    )
    assert bad_login.status_code == 401

    # 5. Get current user profile with token
    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["username"] == "usera"

    # 6. Change password
    chg_res = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"old_password": "password123", "new_password": "newpassword789"},
    )
    assert chg_res.status_code == 200

    # 7. Login with new password
    new_login = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "newpassword789"},
    )
    assert new_login.status_code == 200


def test_user_management_and_deletion(test_setup: tuple[TestClient, Session]) -> None:
    client, db_session = test_setup

    # 1. Register User B
    reg_res = client.post(
        "/api/v1/auth/register",
        json={"username": "userb", "password": "password123", "display_name": "User Beta"},
    )
    assert reg_res.status_code == 201
    user_b_id = reg_res.json()["user"]["id"]
    token_b = reg_res.json()["access_token"]

    # Verify starter cash account created for User B
    acc_count = db_session.scalar(select(Account).where(Account.user_id == user_b_id))
    assert acc_count is not None

    # 2. List users
    list_res = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert list_res.status_code == 200
    usernames = [u["username"] for u in list_res.json()]
    assert "userb" in usernames

    # 3. Delete user B
    del_res = client.delete(
        f"/api/v1/users/{user_b_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert del_res.status_code == 204

    # Verify user B is deleted
    deleted_user = db_session.scalar(select(User).where(User.id == user_b_id))
    assert deleted_user is None
