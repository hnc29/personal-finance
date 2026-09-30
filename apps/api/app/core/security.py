from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import secrets
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User


def _is_production() -> bool:
    return settings.environment == "production"

security_scheme = HTTPBearer(auto_error=False)
AuthHeader = Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)]
DbSession = Annotated[Session, Depends(get_db)]


def validate_password_strength(password: str) -> str:
    """Enforce password policy: minimum 8 characters, at least one uppercase letter, at least one digit."""
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có tối thiểu 8 ký tự")
    if not any(c.isupper() for c in password):
        raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái in hoa")
    if not any(c.isdigit() for c in password):
        raise ValueError("Mật khẩu phải chứa ít nhất một chữ số")
    return password


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with 100,000 rounds and random salt."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"pbkdf2_sha256$100000${base64.b64encode(salt).decode('utf-8')}${base64.b64encode(key).decode('utf-8')}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its PBKDF2-HMAC-SHA256 hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4:
            return False
        algorithm, iterations_str, salt_b64, key_b64 = parts
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_str)
        salt = base64.b64decode(salt_b64)
        expected_key = base64.b64decode(key_b64)
        actual_key = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt, iterations
        )
        return secrets.compare_digest(expected_key, actual_key)
    except (ValueError, TypeError):
        return False


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _base64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("utf-8"))


def create_access_token(
    user_id: int,
    username: str,
    is_admin: bool = False,
    expires_delta: datetime.timedelta | None = None,
    impersonated_by_id: int | None = None,
    impersonated_by_username: str | None = None,
) -> str:
    """Create a signed JWT token with optional view-as-user impersonation claims."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.datetime.now(datetime.UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + datetime.timedelta(days=settings.jwt_expiration_days)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "type": "access",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }
    if impersonated_by_id is not None:
        payload["impersonated_by_id"] = impersonated_by_id
        payload["impersonated_by_username"] = impersonated_by_username

    header_b64 = _base64url_encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )
    payload_b64 = _base64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode()

    signature = hmac.new(
        settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def create_password_reset_token(
    user_id: int,
    username: str,
    email: str,
    password_hash: str,
    expires_delta: datetime.timedelta | None = None,
) -> str:
    """Create a signed, time-limited token for password reset tied to the user's current password hash."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.datetime.now(datetime.UTC)
    expire = now + (expires_delta or datetime.timedelta(hours=1))

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "email": email,
        "pwd_fp": hashlib.sha256(password_hash.encode()).hexdigest()[:16],
        "type": "password_reset",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    header_b64 = _base64url_encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )
    payload_b64 = _base64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode()

    signature = hmac.new(
        settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a signed JWT token."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected_sig = hmac.new(
        settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    actual_sig = _base64url_decode(signature_b64)

    if not secrets.compare_digest(expected_sig, actual_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err

    exp = payload.get("exp")
    if exp and datetime.datetime.now(datetime.UTC).timestamp() > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def decode_password_reset_token(token: str) -> dict[str, Any]:
    """Decode and verify a password reset token."""
    payload = decode_access_token(token)
    if payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token không phải là mã đặt lại mật khẩu hợp lệ",
        )
    return payload


def get_current_user_optional(
    db: DbSession,
    auth: AuthHeader = None,
) -> User | None:
    """Extract and authenticate the user if a token is present; returns None if omitted or invalid."""
    if not auth or not auth.credentials:
        return None

    try:
        payload = decode_access_token(auth.credentials)
        if payload.get("type") != "access":
            return None
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        user_id = int(user_id_str)
        if db is None:
            return User(
                id=user_id,
                username=payload.get("username", "user"),
                is_admin=payload.get("is_admin", False),
                is_active=True,
            )
        user = db.scalar(
            select(User).where(User.id == user_id, User.is_active.is_(True))
        )
        if user and "impersonated_by_id" in payload:
            user.impersonated_by_id = payload["impersonated_by_id"]
            user.impersonated_by_username = payload.get("impersonated_by_username")
        return user
    except (HTTPException, ValueError):
        return None


def get_current_user(
    db: DbSession,
    auth: AuthHeader = None,
    request: Request = None,  # type: ignore[assignment]
) -> User:
    """Require valid authenticated user with view-as-user support for admins."""
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(auth.credentials)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(user_id_str)
    if db is None:
        return User(
            id=user_id,
            username=payload.get("username", "user"),
            is_admin=payload.get("is_admin", False),
            is_active=True,
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Check for admin X-View-As-User header
    if user.is_admin and request is not None:
        view_as_header = request.headers.get("X-View-As-User")
        if view_as_header:
            try:
                target_user_id = int(view_as_header)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid X-View-As-User header",
                )
            target_user = db.scalar(select(User).where(User.id == target_user_id))
            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target user for view-as not found",
                )
            if not target_user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target user for view-as is deactivated",
                )
            target_user.impersonated_by_id = user.id
            target_user.impersonated_by_username = user.username
            return target_user

    if "impersonated_by_id" in payload:
        user.impersonated_by_id = payload["impersonated_by_id"]
        user.impersonated_by_username = payload.get("impersonated_by_username")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_admin_user(
    current_user: CurrentUser,
) -> User:
    """Require current user to have admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


CurrentAdmin = Annotated[User, Depends(get_current_admin_user)]
