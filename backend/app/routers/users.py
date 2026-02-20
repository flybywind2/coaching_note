"""Users 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import require_roles
from app.models.user import User
from app.schemas.user import UserCreate, UserOut
from app.services import user_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=List[UserOut])
def list_users(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    return user_service.list_users(db, include_inactive=include_inactive)


@router.post("", response_model=UserOut)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    return user_service.create_user(db, data)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    user_service.delete_user(db, user_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{user_id}/restore", response_model=UserOut)
def restore_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    return user_service.restore_user(db, user_id)


