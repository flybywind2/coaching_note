"""Notifications 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.notification import NotificationOut
from app.services import notification_service
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return notification_service.get_notifications(db, current_user.user_id, unread_only)


@router.patch("/{noti_id}/read", response_model=NotificationOut)
def mark_read(noti_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return notification_service.mark_read(db, noti_id, current_user.user_id)


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notification_service.mark_all_read(db, current_user.user_id)
    return {"message": "모든 알림을 읽음 처리했습니다."}


