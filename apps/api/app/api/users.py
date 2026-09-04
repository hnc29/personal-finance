from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import CurrentUser, hash_password
from app.models.user import User
from app.services.user_bootstrap import bootstrap_user_data

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UserAdminCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=3, max_length=128)
    display_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=255)
    is_admin: bool = False


class UserUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    is_active: bool | None = None
    new_password: str | None = None


class UserDetailResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    email: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime.datetime


@router.get("", response_model=list[UserDetailResponse])
def list_users(
    db: DbSession,
    _current_user: CurrentUser,
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
    _current_user: CurrentUser,
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
