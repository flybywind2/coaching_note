"""SSP+ 소개 페이지 콘텐츠 API 라우터입니다."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.site_content import SiteContent
from app.models.user import User, Coach
from app.schemas.about import SiteContentOut, SiteContentUpdate, CoachProfileOut

router = APIRouter(prefix="/api/about", tags=["about"])

ALLOWED_CONTENT_KEYS = {
    "ssp_intro": "SSP+ 소개",
    "coach_intro": "코치 소개",
}

DEFAULT_CONTENT = {
    "ssp_intro": """
<h3>SSP+ 프로그램 소개</h3>
<p>SSP+는 실무 중심의 AI 도입 과제를 빠르게 검증하고 실행까지 연결하기 위한 코칭 프로그램입니다.</p>
<ul>
  <li>현업 과제 기반 문제 정의</li>
  <li>코치 피드백 중심의 반복 개선</li>
  <li>문서/코칭노트/성과를 하나의 워크스페이스에서 관리</li>
</ul>
""".strip(),
    "coach_intro": """
<p>프로그램에 참여하는 코치진의 전문 분야와 이력을 확인하세요.</p>
""".strip(),
}


def _validate_key(key: str) -> str:
    if key not in ALLOWED_CONTENT_KEYS:
        raise HTTPException(status_code=400, detail="지원하지 않는 콘텐츠 키입니다.")
    return key


def _get_or_default_content(db: Session, key: str) -> SiteContentOut:
    row = db.query(SiteContent).filter(SiteContent.content_key == key).first()
    if row:
        return SiteContentOut(
            content_key=row.content_key,
            title=row.title,
            content=row.content,
            updated_by=row.updated_by,
            updated_at=row.updated_at,
        )
    return SiteContentOut(
        content_key=key,
        title=ALLOWED_CONTENT_KEYS[key],
        content=DEFAULT_CONTENT.get(key, ""),
        updated_by=None,
        updated_at=None,
    )


@router.get("/content", response_model=SiteContentOut)
def get_content(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_key = _validate_key(key)
    return _get_or_default_content(db, content_key)


@router.put("/content/{key}", response_model=SiteContentOut)
def update_content(
    key: str,
    data: SiteContentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    content_key = _validate_key(key)
    row = db.query(SiteContent).filter(SiteContent.content_key == content_key).first()
    if not row:
        row = SiteContent(
            content_key=content_key,
            title=ALLOWED_CONTENT_KEYS[content_key],
            content=data.content,
            updated_by=current_user.user_id,
        )
        db.add(row)
    else:
        row.content = data.content
        row.updated_by = current_user.user_id
    db.commit()
    db.refresh(row)
    return SiteContentOut(
        content_key=row.content_key,
        title=row.title,
        content=row.content,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


@router.get("/coaches", response_model=List[CoachProfileOut])
def list_coaches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coaches = (
        db.query(Coach)
        .filter(Coach.is_active == True)  # noqa: E712
        .order_by(Coach.name.asc())
        .all()
    )
    if coaches:
        return [
            CoachProfileOut(
                coach_id=coach.coach_id,
                user_id=coach.user_id,
                name=coach.name,
                coach_type=coach.coach_type,
                department=coach.department,
                affiliation=coach.affiliation,
                specialty=coach.specialty,
                career=coach.career,
                photo_url=coach.photo_url,
            )
            for coach in coaches
        ]

    fallback_users = (
        db.query(User)
        .filter(User.is_active == True, User.role == "coach")  # noqa: E712
        .order_by(User.name.asc())
        .all()
    )
    return [
        CoachProfileOut(
            coach_id=None,
            user_id=user.user_id,
            name=user.name,
            coach_type="internal",
            department=user.department,
            affiliation=user.department,
            specialty=None,
            career=None,
            photo_url=None,
        )
        for user in fallback_users
    ]
