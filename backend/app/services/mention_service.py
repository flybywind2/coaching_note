"""멘션(@) 파싱 및 알림 발송을 담당하는 도메인 서비스입니다."""

import html
import re
from typing import Iterable, Optional, Set

from sqlalchemy.orm import Session

from app.models.user import User
from app.services import notification_service


MENTION_PATTERN = re.compile(r"(?<![\w@])@([A-Za-z0-9가-힣._-]{2,30})")


def _strip_html(raw: Optional[str]) -> str:
    if not raw:
        return ""
    no_tag = re.sub(r"<[^>]+>", " ", raw)
    return html.unescape(no_tag)


def extract_mentions(texts: Iterable[Optional[str]]) -> Set[str]:
    tokens: Set[str] = set()
    for text in texts:
        plain = _strip_html(text)
        for token in MENTION_PATTERN.findall(plain):
            tokens.add(token.strip())
    return {token for token in tokens if token}


def notify_mentions(
    db: Session,
    *,
    actor: User,
    context_title: str,
    link_url: Optional[str],
    new_texts: Iterable[Optional[str]],
    previous_texts: Optional[Iterable[Optional[str]]] = None,
):
    tokens = extract_mentions(new_texts)
    if not tokens:
        return

    if previous_texts is not None:
        tokens -= extract_mentions(previous_texts)
    if not tokens:
        return

    users = (
        db.query(User)
        .filter((User.emp_id.in_(list(tokens))) | (User.name.in_(list(tokens))))
        .all()
    )

    notified_user_ids = set()
    for user in users:
        if user.user_id == actor.user_id:
            continue
        if user.user_id in notified_user_ids:
            continue
        notified_user_ids.add(user.user_id)
        notification_service.create_notification(
            db=db,
            user_id=user.user_id,
            noti_type="mention",
            title=f"{context_title} 멘션",
            message=f"{actor.name}님이 회원님을 멘션했습니다.",
            link_url=link_url,
        )

