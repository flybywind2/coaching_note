from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.user import User
from typing import List, Optional


def get_notifications(db: Session, user_id: int, unread_only: bool = False) -> List[Notification]:
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).limit(50).all()


def mark_read(db: Session, noti_id: int, user_id: int) -> Notification:
    noti = db.query(Notification).filter(
        Notification.noti_id == noti_id,
        Notification.user_id == user_id,
    ).first()
    if noti:
        noti.is_read = True
        db.commit()
        db.refresh(noti)
    return noti


def mark_all_read(db: Session, user_id: int):
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()


def create_notification(
    db: Session,
    user_id: int,
    noti_type: str,
    title: str,
    message: Optional[str] = None,
    link_url: Optional[str] = None,
):
    noti = Notification(
        user_id=user_id,
        noti_type=noti_type,
        title=title,
        message=message,
        link_url=link_url,
    )
    db.add(noti)
    db.commit()
    return noti
