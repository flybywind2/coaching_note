"""SSP+ 소개 페이지 콘텐츠 API 라우터입니다."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.site_content import SiteContent
from app.models.user import User, Coach
from app.utils.permissions import EXTERNAL_COACH, INTERNAL_COACH, LEGACY_COACH
from app.schemas.about import (
    SiteContentOut,
    SiteContentUpdate,
    CoachProfileOut,
    CoachProfileCreate,
    CoachProfileUpdate,
    CoachReorderRequest,
)

router = APIRouter(prefix="/api/about", tags=["about"])
COACH_USER_ROLES = [LEGACY_COACH, INTERNAL_COACH, EXTERNAL_COACH]
COACH_LAYOUT_COLUMNS = {"left", "right"}

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
    "coach_intro": "",
}


def _validate_key(key: str) -> str:
    if key not in ALLOWED_CONTENT_KEYS:
        raise HTTPException(status_code=400, detail="지원하지 않는 콘텐츠 키입니다.")
    return key


def _validate_batch(db: Session, batch_id: int) -> Batch:
    row = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")
    return row


def _coach_to_out(coach: Coach) -> CoachProfileOut:
    return CoachProfileOut(
        coach_id=coach.coach_id,
        user_id=coach.user_id,
        batch_id=coach.batch_id,
        name=coach.name,
        coach_type=coach.coach_type,
        department=coach.department,
        affiliation=coach.affiliation,
        specialty=coach.specialty,
        career=coach.career,
        photo_url=coach.photo_url,
        is_visible=bool(coach.is_visible),
        display_order=int(coach.display_order or 0),
        layout_column=_normalize_layout_column(getattr(coach, "layout_column", None)),
    )


def _normalize_layout_column(value: str | None) -> str:
    text = (value or "left").strip().lower()
    if text not in COACH_LAYOUT_COLUMNS:
        return "left"
    return text


def _layout_sort_key(value: str | None) -> int:
    return 0 if _normalize_layout_column(value) == "left" else 1


def _validate_coach_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.user_id == user_id, User.is_active == True).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role not in COACH_USER_ROLES:
        raise HTTPException(status_code=400, detail="코치 역할 사용자만 연결할 수 있습니다.")
    return user


def _is_coach_role(user: User) -> bool:
    return user.role in COACH_USER_ROLES


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


def _next_display_order(db: Session, batch_id: int | None) -> int:
    max_order = (
        db.query(func.max(Coach.display_order))
        .filter(Coach.is_active == True, Coach.batch_id == batch_id)  # noqa: E712
        .scalar()
    )
    return int(max_order or 0) + 1


def _get_coach_users_for_batch(db: Session, batch_id: int) -> list[User]:
    internal_users = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            User.role.in_([LEGACY_COACH, INTERNAL_COACH]),
        )
        .all()
    )
    external_users_from_access = (
        db.query(User)
        .join(UserBatchAccess, UserBatchAccess.user_id == User.user_id)
        .filter(
            UserBatchAccess.batch_id == batch_id,
            User.is_active == True,  # noqa: E712
            User.role == EXTERNAL_COACH,
        )
        .all()
    )
    users_from_access = (
        db.query(User)
        .join(UserBatchAccess, UserBatchAccess.user_id == User.user_id)
        .filter(
            UserBatchAccess.batch_id == batch_id,
            User.is_active == True,  # noqa: E712
            User.role.in_(COACH_USER_ROLES),
        )
        .all()
    )
    users_from_project_member = (
        db.query(User)
        .join(ProjectMember, ProjectMember.user_id == User.user_id)
        .join(Project, Project.project_id == ProjectMember.project_id)
        .filter(
            Project.batch_id == batch_id,
            User.is_active == True,  # noqa: E712
            User.role.in_(COACH_USER_ROLES),
        )
        .all()
    )
    merged_by_user_id: dict[int, User] = {}
    for user in internal_users + external_users_from_access + users_from_access + users_from_project_member:
        merged_by_user_id[user.user_id] = user
    return sorted(merged_by_user_id.values(), key=lambda row: (row.name or "").lower())


@router.get("/content", response_model=SiteContentOut)
def get_content(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
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
    batch_id: int | None = Query(None),
    include_hidden: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if include_hidden and current_user.role != "admin":
        include_hidden = False
    if batch_id is not None:
        _validate_batch(db, batch_id)

    all_rows_q = (
        db.query(Coach)
        .outerjoin(User, Coach.user_id == User.user_id)
        .filter(
            Coach.is_active == True,  # noqa: E712
            or_(
                Coach.user_id.is_(None),
                and_(
                    User.is_active == True,  # noqa: E712
                    User.role.in_(COACH_USER_ROLES),
                ),
            ),
        )
    )
    if batch_id is not None:
        all_rows_q = all_rows_q.filter(Coach.batch_id == batch_id)
    all_rows = all_rows_q.order_by(Coach.display_order.asc(), Coach.name.asc()).all()

    existing_by_user = {row.user_id: row for row in all_rows if row.user_id}
    rows = all_rows if include_hidden else [row for row in all_rows if row.is_visible]
    merged: list[CoachProfileOut] = [_coach_to_out(row) for row in rows]

    if batch_id is None:
        coach_users = (
            db.query(User)
            .filter(
                User.is_active == True,  # noqa: E712
                User.role.in_(COACH_USER_ROLES),
            )
            .order_by(User.name.asc())
            .all()
        )
    else:
        coach_users = _get_coach_users_for_batch(db, batch_id)

    for user in coach_users:
        existing = existing_by_user.get(user.user_id)
        if existing:
            continue
        merged.append(
            CoachProfileOut(
                coach_id=None,
                user_id=user.user_id,
                batch_id=batch_id,
                name=user.name,
                coach_type="external" if user.role == EXTERNAL_COACH else "internal",
                department=user.department,
                affiliation=user.department,
                specialty=None,
                career=None,
                photo_url=None,
                is_visible=True,
                display_order=9999,
            )
        )

    merged.sort(key=lambda row: (_layout_sort_key(row.layout_column), int(row.display_order or 9999), (row.name or "").lower()))
    return merged


@router.post("/coaches", response_model=CoachProfileOut)
def create_coach(
    data: CoachProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_admin = current_user.role == "admin"
    if not is_admin and not _is_coach_role(current_user):
        raise HTTPException(status_code=403, detail="코치 프로필 등록 권한이 없습니다.")

    if data.batch_id is None:
        raise HTTPException(status_code=400, detail="차수를 선택하세요.")
    _validate_batch(db, data.batch_id)

    target_user_id = data.user_id
    if not is_admin:
        if target_user_id is not None and int(target_user_id) != int(current_user.user_id):
            raise HTTPException(status_code=403, detail="본인 코치 카드만 등록할 수 있습니다.")
        target_user_id = current_user.user_id

    linked_user = None
    if target_user_id is not None:
        linked_user = _validate_coach_user(db, target_user_id)
        exists = (
            db.query(Coach)
            .filter(
                Coach.user_id == target_user_id,
                Coach.batch_id == data.batch_id,
                Coach.is_active == True,  # noqa: E712
            )
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="이미 해당 차수에 코치 프로필이 연결된 사용자입니다.")

    coach_name = (data.name or "").strip()
    if not coach_name and linked_user:
        coach_name = linked_user.name
    if not coach_name:
        raise HTTPException(status_code=400, detail="코치 이름을 입력하세요.")

    row = Coach(
        user_id=target_user_id,
        batch_id=data.batch_id,
        name=coach_name,
        coach_type=("external" if linked_user and linked_user.role == EXTERNAL_COACH else (data.coach_type or "internal")),
        department=(data.department or (linked_user.department if linked_user else None)),
        affiliation=data.affiliation,
        specialty=data.specialty,
        career=data.career,
        photo_url=data.photo_url,
        is_visible=True if (not is_admin or data.is_visible is None) else bool(data.is_visible),
        display_order=(
            data.display_order
            if is_admin and data.display_order is not None
            else _next_display_order(db, data.batch_id)
        ),
        layout_column=_normalize_layout_column(data.layout_column),
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _coach_to_out(row)


@router.put("/coaches/{coach_id:int}", response_model=CoachProfileOut)
def update_coach(
    coach_id: int,
    data: CoachProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(Coach)
        .filter(Coach.coach_id == coach_id, Coach.is_active == True)  # noqa: E712
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="코치 프로필을 찾을 수 없습니다.")

    is_admin = current_user.role == "admin"
    can_edit_own_profile = _is_coach_role(current_user) and row.user_id == current_user.user_id
    if not is_admin and not can_edit_own_profile:
        raise HTTPException(status_code=403, detail="코치 프로필 수정 권한이 없습니다.")

    next_batch_id = data.batch_id if data.batch_id is not None else row.batch_id
    if is_admin and next_batch_id is not None:
        _validate_batch(db, next_batch_id)

    if is_admin and data.user_id is not None:
        _validate_coach_user(db, data.user_id)
        duplicate = (
            db.query(Coach)
            .filter(
                Coach.coach_id != coach_id,
                Coach.user_id == data.user_id,
                Coach.batch_id == next_batch_id,
                Coach.is_active == True,  # noqa: E712
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="이미 해당 차수의 다른 코치 프로필에 연결된 사용자입니다.")
        row.user_id = data.user_id

    payload = data.model_dump(exclude_none=True, exclude={"user_id"})
    if not is_admin:
        for field in ("batch_id", "coach_type", "is_visible", "display_order"):
            payload.pop(field, None)
    for key, value in payload.items():
        if key == "layout_column":
            value = _normalize_layout_column(value)
        setattr(row, key, value)

    if row.display_order is None:
        row.display_order = _next_display_order(db, row.batch_id)

    if not (row.name or "").strip():
        raise HTTPException(status_code=400, detail="코치 이름을 입력하세요.")

    db.commit()
    db.refresh(row)
    return _coach_to_out(row)


@router.put("/coaches/reorder", response_model=List[CoachProfileOut])
def reorder_coaches(
    data: CoachReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    _validate_batch(db, data.batch_id)
    rows = (
        db.query(Coach)
        .filter(Coach.batch_id == data.batch_id, Coach.is_active == True)  # noqa: E712
        .all()
    )
    id_map = {row.coach_id: row for row in rows}

    has_column_payload = bool(data.left_coach_ids or data.right_coach_ids)
    if has_column_payload:
        ordered_left: list[int] = []
        for coach_id in data.left_coach_ids:
            if coach_id in id_map and coach_id not in ordered_left:
                ordered_left.append(coach_id)
        ordered_right: list[int] = []
        for coach_id in data.right_coach_ids:
            if coach_id in id_map and coach_id not in ordered_left and coach_id not in ordered_right:
                ordered_right.append(coach_id)

        next_left_order = 1
        for coach_id in ordered_left:
            row = id_map[coach_id]
            row.layout_column = "left"
            row.display_order = next_left_order
            next_left_order += 1

        next_right_order = 1
        for coach_id in ordered_right:
            row = id_map[coach_id]
            row.layout_column = "right"
            row.display_order = next_right_order
            next_right_order += 1

        consumed_ids = set(ordered_left + ordered_right)
        remaining = [row for row in rows if row.coach_id not in consumed_ids]
        remaining.sort(
            key=lambda row: (
                _layout_sort_key(getattr(row, "layout_column", None)),
                int(row.display_order or 9999),
                (row.name or "").lower(),
            )
        )
        for row in remaining:
            current_column = _normalize_layout_column(getattr(row, "layout_column", None))
            row.layout_column = current_column
            if current_column == "left":
                row.display_order = next_left_order
                next_left_order += 1
            else:
                row.display_order = next_right_order
                next_right_order += 1
    else:
        ordered_ids: list[int] = []
        for coach_id in data.coach_ids:
            if coach_id in id_map and coach_id not in ordered_ids:
                ordered_ids.append(coach_id)

        next_order = 1
        for coach_id in ordered_ids:
            id_map[coach_id].display_order = next_order
            next_order += 1

        remaining = [row for row in rows if row.coach_id not in ordered_ids]
        remaining.sort(key=lambda row: (int(row.display_order or 9999), (row.name or "").lower()))
        for row in remaining:
            row.display_order = next_order
            next_order += 1

    db.commit()
    return list_coaches(
        batch_id=data.batch_id,
        include_hidden=True,
        db=db,
        current_user=current_user,
    )


@router.delete("/coaches/{coach_id:int}")
def delete_coach(
    coach_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    _ = current_user
    row = (
        db.query(Coach)
        .filter(Coach.coach_id == coach_id, Coach.is_active == True)  # noqa: E712
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="코치 프로필을 찾을 수 없습니다.")
    row.is_active = False
    db.commit()
    return {"message": "삭제되었습니다."}
