from __future__ import annotations

import datetime
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    CurrentUser,
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.models.user import User
from app.services.email import send_password_reset_email
from app.services.user_bootstrap import bootstrap_user_data

logger = logging.getLogger(__name__)

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=255)

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_new_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class ForgotPasswordResponse(BaseModel):
    message: str = (
        "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
    )


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_reset_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    email: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime.datetime
    impersonated_by_id: int | None = None
    impersonated_by_username: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post(
    "/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
def register(req: RegisterRequest, db: DbSession) -> AuthResponse:
    norm_username = req.username.strip().lower()
    if not norm_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập không được để trống",
        )

    existing = db.scalar(select(User).where(User.username == norm_username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã tồn tại",
        )

    if req.email:
        norm_email = req.email.strip().lower()
        existing_email = db.scalar(select(User).where(User.email == norm_email))
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email đã được sử dụng",
            )
    else:
        norm_email = None

    user = User(
        username=norm_username,
        email=norm_email,
        password_hash=hash_password(req.password),
        display_name=req.display_name.strip() if req.display_name else norm_username,
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed starter categories and cash account
    bootstrap_user_data(db, user)

    token = create_access_token(
        user_id=user.id, username=user.username, is_admin=user.is_admin
    )

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: DbSession) -> AuthResponse:
    norm_username = req.username.strip().lower()
    user = db.scalar(select(User).where(User.username == norm_username))

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị ngừng kích hoạt",
        )

    token = create_access_token(
        user_id=user.id, username=user.username, is_admin=user.is_admin
    )

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        email=current_user.email,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        impersonated_by_id=getattr(current_user, "impersonated_by_id", None),
        impersonated_by_username=getattr(current_user, "impersonated_by_username", None),
    )


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    if not verify_password(req.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu cũ không chính xác",
        )

    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Đổi mật khẩu thành công"}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    req: ForgotPasswordRequest,
    db: DbSession,
) -> ForgotPasswordResponse:
    norm_email = req.email.strip().lower()
    if not norm_email or "@" not in norm_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email không hợp lệ",
        )

    user = db.scalar(select(User).where(User.email == norm_email))

    if user and user.is_active:
        reset_token = create_password_reset_token(
            user_id=user.id,
            username=user.username,
            email=user.email or norm_email,
            password_hash=user.password_hash,
        )
        try:
            send_password_reset_email(
                to_email=norm_email,
                username=user.username,
                reset_token=reset_token,
            )
        except Exception:
            logger.exception("Failed to send password reset email")

    return ForgotPasswordResponse(
        message="Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
    )


@router.post("/reset-password")
def reset_password(
    req: ResetPasswordRequest,
    db: DbSession,
) -> dict[str, str]:
    payload = decode_password_reset_token(req.token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã token không hợp lệ",
        )

    user_id = int(user_id_str)
    user = db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng không tồn tại hoặc đã bị khóa",
        )

    pwd_fp = payload.get("pwd_fp")
    expected_fp = hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]
    if pwd_fp and pwd_fp != expected_fp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã đặt lại mật khẩu này đã hết hạn hoặc đã được sử dụng",
        )

    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới."}
