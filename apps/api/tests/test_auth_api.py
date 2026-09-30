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
from app.core.security import get_current_admin_user, get_current_user
from app.main import app
from app.models.account import Account
from app.models.user import User


@pytest.fixture
def test_setup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Session]]:
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


def test_auth_register_and_login(test_setup: tuple[TestClient, Session]) -> None:
    client, _ = test_setup

    # Password policy tests
    # Reject < 8 chars
    res_short = client.post(
        "/api/v1/auth/register",
        json={"username": "user_short", "password": "Pass1"},
    )
    assert res_short.status_code == 422

    # Reject no uppercase
    res_no_upper = client.post(
        "/api/v1/auth/register",
        json={"username": "user_no_upper", "password": "password123"},
    )
    assert res_no_upper.status_code == 422

    # Reject no digit
    res_no_digit = client.post(
        "/api/v1/auth/register",
        json={"username": "user_no_digit", "password": "PasswordOnly"},
    )
    assert res_no_digit.status_code == 422

    # 1. Register User A with valid password (>= 8 chars, 1 uppercase, 1 digit)
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "usera",
            "password": "Password123",
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
        json={"username": "usera", "password": "Password456"},
    )
    assert dup_res.status_code == 400

    # 3. Login User A success
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "Password123"},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # 4. Login User A wrong password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "WrongPassword1"},
    )
    assert bad_login.status_code == 401

    # 5. Get current user profile with token
    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["username"] == "usera"

    # 6. Change password (reject weak new password)
    chg_weak = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"old_password": "Password123", "new_password": "weak"},
    )
    assert chg_weak.status_code == 422

    # Change password success
    chg_res = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"old_password": "Password123", "new_password": "NewPassword789"},
    )
    assert chg_res.status_code == 200

    # 7. Login with new password
    new_login = client.post(
        "/api/v1/auth/login",
        json={"username": "usera", "password": "NewPassword789"},
    )
    assert new_login.status_code == 200


def test_password_reset_anti_enumeration_and_flow(
    test_setup: tuple[TestClient, Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, db_session = test_setup

    # Register an active user
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "alice_reset",
            "password": "OriginalPassword123",
            "email": "alice@example.com",
        },
    )
    assert reg_res.status_code == 201

    captured_emails: list[dict[str, str]] = []

    def mock_send_email(
        to_email: str, username: str, reset_token: str, reset_url: str | None = None
    ) -> bool:
        captured_emails.append(
            {
                "to_email": to_email,
                "username": username,
                "reset_token": reset_token,
            }
        )
        return True

    monkeypatch.setattr(
        "app.api.auth.send_password_reset_email", mock_send_email
    )

    # 1. Forgot password for registered email
    forgot_res = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "alice@example.com"},
    )
    assert forgot_res.status_code == 200
    forgot_data = forgot_res.json()
    # Response must NOT leak token or internal user creation flag
    assert "reset_token" not in forgot_data
    assert "user_created" not in forgot_data
    assert "hướng dẫn đặt lại mật khẩu" in forgot_data["message"]
    assert len(captured_emails) == 1
    assert captured_emails[0]["to_email"] == "alice@example.com"
    token = captured_emails[0]["reset_token"]

    # 2. Forgot password for non-existent email must return the exact same generic message (anti-enumeration)
    forgot_nonexistent = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "ghost@example.com"},
    )
    assert forgot_nonexistent.status_code == 200
    assert forgot_nonexistent.json() == forgot_data
    # Must NOT auto-create account for non-existent email
    ghost_user = db_session.scalar(select(User).where(User.email == "ghost@example.com"))
    assert ghost_user is None
    # No email should be sent for non-existent user
    assert len(captured_emails) == 1

    # 3. Invalid email format returns 400
    invalid_email_res = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "invalid-email-address"},
    )
    assert invalid_email_res.status_code == 400

    # 4. Email sender failure does not leak error or token to caller
    def mock_failing_email(to_email: str, username: str, reset_token: str) -> bool:
        raise RuntimeError("SMTP connection timeout")

    monkeypatch.setattr(
        "app.api.auth.send_password_reset_email", mock_failing_email
    )
    forgot_fail = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "alice@example.com"},
    )
    assert forgot_fail.status_code == 200
    assert forgot_fail.json() == forgot_data

    # 5. Reset password with weak password fails with 422
    bad_reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "short"},
    )
    assert bad_reset.status_code == 422

    # 6. Reset password successfully
    reset_res = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "BrandNewPassword123"},
    )
    assert reset_res.status_code == 200

    # 7. Old reset token cannot be reused
    reuse_res = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "AnotherPassword456"},
    )
    assert reuse_res.status_code == 400

    # 8. Login with newly reset password succeeds
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "alice_reset", "password": "BrandNewPassword123"},
    )
    assert login_res.status_code == 200


def test_admin_change_user_password_and_view_as(
    test_setup: tuple[TestClient, Session]
) -> None:
    client, db_session = test_setup

    # Register admin
    admin_res = client.post(
        "/api/v1/auth/register",
        json={"username": "superadmin", "password": "AdminPassword123"},
    )
    admin_id = admin_res.json()["user"]["id"]
    admin_token = admin_res.json()["access_token"]
    admin_user = db_session.get(User, admin_id)
    assert admin_user is not None
    admin_user.is_admin = True
    db_session.commit()

    # Register target regular user
    reg_target = client.post(
        "/api/v1/auth/register",
        json={"username": "target_user", "password": "TargetPassword123"},
    )
    target_id = reg_target.json()["user"]["id"]
    target_token = reg_target.json()["access_token"]

    # Regular user cannot change another user's password
    chg_403 = client.post(
        f"/api/v1/users/{target_id}/change-password",
        headers={"Authorization": f"Bearer {target_token}"},
        json={"new_password": "ChangedByTarget123"},
    )
    assert chg_403.status_code == 403

    # Admin changes target user's password
    admin_chg = client.post(
        f"/api/v1/users/{target_id}/change-password",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_password": "NewTargetPassword999"},
    )
    assert admin_chg.status_code == 200

    # Target user can now login with new password set by Admin
    login_new = client.post(
        "/api/v1/auth/login",
        json={"username": "target_user", "password": "NewTargetPassword999"},
    )
    assert login_new.status_code == 200

    # Admin View As User
    # 1. Call view-as endpoint
    view_as_res = client.post(
        f"/api/v1/users/{target_id}/view-as",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert view_as_res.status_code == 200
    va_data = view_as_res.json()
    assert "access_token" in va_data
    assert va_data["user"]["id"] == target_id
    assert va_data["original_admin"]["id"] == admin_id

    impersonated_token = va_data["access_token"]

    # 2. Check /auth/me with impersonated token
    me_va = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {impersonated_token}"},
    )
    assert me_va.status_code == 200
    assert me_va.json()["id"] == target_id
    assert me_va.json()["impersonated_by_id"] == admin_id
    assert me_va.json()["impersonated_by_username"] == "superadmin"

    # 3. View As via X-View-As-User header with admin token
    me_hdr = client.get(
        "/api/v1/auth/me",
        headers={
            "Authorization": f"Bearer {admin_token}",
            "X-View-As-User": str(target_id),
        },
    )
    assert me_hdr.status_code == 200
    assert me_hdr.json()["id"] == target_id
    assert me_hdr.json()["impersonated_by_id"] == admin_id


def test_user_management_and_deletion(test_setup: tuple[TestClient, Session]) -> None:
    client, db_session = test_setup

    # 1. Register User B
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "userb",
            "password": "Password123",
            "display_name": "User Beta",
        },
    )
    assert reg_res.status_code == 201
    user_b_id = reg_res.json()["user"]["id"]
    token_b = reg_res.json()["access_token"]

    # Verify starter cash account created for User B
    acc_count = db_session.scalar(select(Account).where(Account.user_id == user_b_id))
    assert acc_count is not None

    # 2. Regular user B cannot list users (403 Forbidden)
    list_res_403 = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert list_res_403.status_code == 403

    # Grant admin to user B in DB
    user_b_obj = db_session.get(User, user_b_id)
    assert user_b_obj is not None
    user_b_obj.is_admin = True
    db_session.commit()

    # Admin user B can list users
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


def test_password_reset_token_cannot_be_used_as_bearer_token(
    test_setup: tuple[TestClient, Session]
) -> None:
    client, db_session = test_setup

    # Register user Charlie
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "charlie",
            "password": "Password123",
            "email": "charlie@example.com",
        },
    )
    assert reg_res.status_code == 201
    user_id = reg_res.json()["user"]["id"]
    access_token = reg_res.json()["access_token"]

    user = db_session.get(User, user_id)
    assert user is not None

    from app.core.security import create_password_reset_token

    reset_token = create_password_reset_token(
        user_id=user.id,
        username=user.username,
        email=user.email or "charlie@example.com",
        password_hash=user.password_hash,
    )

    # Valid access token works
    valid_me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert valid_me.status_code == 200

    valid_acc = client.get(
        "/api/v1/accounts",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert valid_acc.status_code == 200

    # Using reset_token as Bearer token must return 401 Unauthorized
    me_401 = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {reset_token}"},
    )
    assert me_401.status_code == 401
    assert "Invalid token type" in me_401.json()["detail"]

    accounts_401 = client.get(
        "/api/v1/accounts",
        headers={"Authorization": f"Bearer {reset_token}"},
    )
    assert accounts_401.status_code == 401
    assert "Invalid token type" in accounts_401.json()["detail"]
