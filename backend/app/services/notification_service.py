"""Notification Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from datetime import datetime
from sqlalchemy.orm import Session
from app.models.notification import Notification, NotificationPreference
from typing import List, Optional


SUPPORTED_FREQUENCIES = {"realtime", "daily"}


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


def _build_default_pref(user_id: int) -> NotificationPreference:
    return NotificationPreference(
        user_id=user_id,
        mention_enabled=True,
        board_enabled=True,
        deadline_enabled=True,
        frequency="realtime",
    )


def get_or_create_preference(db: Session, user_id: int) -> NotificationPreference:
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = _build_default_pref(user_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


def update_preference(
    db: Session,
    *,
    user_id: int,
    mention_enabled: bool,
    board_enabled: bool,
    deadline_enabled: bool,
    frequency: str,
) -> NotificationPreference:
    freq = (frequency or "").strip().lower()
    if freq not in SUPPORTED_FREQUENCIES:
        freq = "realtime"
    pref = get_or_create_preference(db, user_id)
    pref.mention_enabled = mention_enabled
    pref.board_enabled = board_enabled
    pref.deadline_enabled = deadline_enabled
    pref.frequency = freq
    db.commit()
    db.refresh(pref)
    return pref


def _is_type_enabled(pref: NotificationPreference, noti_type: str) -> bool:
    kind = (noti_type or "").strip().lower()
    if kind == "mention":
        return bool(pref.mention_enabled)
    if kind in {"board", "board_notice", "notice", "post", "post_comment"}:
        return bool(pref.board_enabled)
    if kind in {"deadline", "task_deadline", "milestone_deadline"}:
        return bool(pref.deadline_enabled)
    # 정의되지 않은 타입은 차단하지 않고 전달합니다.
    return True


def _upsert_daily_notification(
    db: Session,
    *,
    user_id: int,
    noti_type: str,
    title: str,
    message: Optional[str],
    link_url: Optional[str],
) -> Notification:
    start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.noti_type == noti_type,
            Notification.created_at >= start_of_day,
        )
        .order_by(Notification.created_at.desc(), Notification.noti_id.desc())
        .first()
    )
    if existing:
        existing.title = title
        existing.message = message
        existing.link_url = link_url
        existing.is_read = False
        db.commit()
        db.refresh(existing)
        return existing

    noti = Notification(
        user_id=user_id,
        noti_type=noti_type,
        title=title,
        message=message,
        link_url=link_url,
    )
    db.add(noti)
    db.commit()
    db.refresh(noti)
    return noti


def create_notification(
    db: Session,
    user_id: int,
    noti_type: str,
    title: str,
    message: Optional[str] = None,
    link_url: Optional[str] = None,
):
    pref = get_or_create_preference(db, user_id)
    if not _is_type_enabled(pref, noti_type):
        return None

    if pref.frequency == "daily":
        return _upsert_daily_notification(
            db,
            user_id=user_id,
            noti_type=noti_type,
            title=title,
            message=message,
            link_url=link_url,
        )

    noti = Notification(
        user_id=user_id,
        noti_type=noti_type,
        title=title,
        message=message,
        link_url=link_url,
    )
    db.add(noti)
    db.commit()
    db.refresh(noti)
    return noti


