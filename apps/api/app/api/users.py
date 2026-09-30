from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    CurrentAdmin,
    CurrentUser,
    create_access_token,
    hash_password,
    validate_password_strength,
)
from app.models.user import User
from app.services.user_bootstrap import bootstrap_user_data

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UserAdminCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=255)
    is_admin: bool = False

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    is_active: bool | None = None
    new_password: str | None = None

    @field_validator("new_password")
    @classmethod
    def check_new_password(cls, v: str | None) -> str | None:
        if v is not None:
            return validate_password_strength(v)
        return v


class AdminChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_new_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserDetailResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    email: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime.datetime


class ViewAsResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserDetailResponse
    original_admin: UserDetailResponse


@router.get("", response_model=list[UserDetailResponse])
def list_users(
    db: DbSession,
    _current_admin: CurrentAdmin,
) -> list[UserDetailResponse]:
    users = db.scalars(select(User).order_by(User.id)).all()
    return [
        UserDetailResponse(
            id=u.id,
            username=u.username,
            display_name=u.display_name,
            email=u.email,
            is_active=u.is_active,
            is_admin=u.is_admin,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("", response_model=UserDetailResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    req: UserAdminCreateRequest,
    db: DbSession,
    _current_admin: CurrentAdmin,
) -> UserDetailResponse:
    norm_username = req.username.strip().lower()
    existing = db.scalar(select(User).where(User.username == norm_username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên người dùng đã tồn tại",
        )

    user = User(
        username=norm_username,
        email=req.email.strip().lower() if req.email else None,
        password_hash=hash_password(req.password),
        display_name=req.display_name.strip() if req.display_name else norm_username,
        is_active=True,
        is_admin=req.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    bootstrap_user_data(db, user)

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )


@router.patch("/{user_id}", response_model=UserDetailResponse)
def update_user(
    user_id: int,
    req: UserUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> UserDetailResponse:
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền sửa thông tin người dùng này",
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )

    if req.display_name is not None:
        user.display_name = req.display_name.strip()
    if req.email is not None:
        user.email = req.email.strip().lower() if req.email else None
    if req.is_active is not None and current_user.is_admin:
        user.is_active = req.is_active
    if req.new_password:
        if not current_user.is_admin and current_user.id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Người dùng vui lòng đổi mật khẩu tại chức năng Đổi mật khẩu với mật khẩu cũ",
            )
        user.password_hash = hash_password(req.new_password)

    db.commit()
    db.refresh(user)

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )


@router.post("/{user_id}/change-password")
def admin_change_user_password(
    user_id: int,
    req: AdminChangePasswordRequest,
    db: DbSession,
    _current_admin: CurrentAdmin,
) -> dict[str, str]:
    """Admin endpoint to set/change another user's password."""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )

    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": f"Đã đổi mật khẩu cho người dùng {user.username} thành công"}


@router.post("/{user_id}/view-as", response_model=ViewAsResponse)
def view_as_user(
    user_id: int,
    db: DbSession,
    current_admin: CurrentAdmin,
) -> ViewAsResponse:
    """Allow an Admin to view data as another user via an impersonation session token."""
    target_user = db.scalar(select(User).where(User.id == user_id))
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )
    if not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xem dưới danh nghĩa tài khoản đang bị khóa",
        )

    token = create_access_token(
        user_id=target_user.id,
        username=target_user.username,
        is_admin=False,
        impersonated_by_id=current_admin.id,
        impersonated_by_username=current_admin.username,
    )

    return ViewAsResponse(
        access_token=token,
        token_type="bearer",
        user=UserDetailResponse(
            id=target_user.id,
            username=target_user.username,
            display_name=target_user.display_name,
            email=target_user.email,
            is_active=target_user.is_active,
            is_admin=target_user.is_admin,
            created_at=target_user.created_at,
        ),
        original_admin=UserDetailResponse(
            id=current_admin.id,
            username=current_admin.username,
            display_name=current_admin.display_name,
            email=current_admin.email,
            is_active=current_admin.is_active,
            is_admin=current_admin.is_admin,
            created_at=current_admin.created_at,
        ),
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xóa người dùng này",
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )

    db.delete(user)
    db.commit()
