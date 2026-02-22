"""User Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.access_scope import UserBatchAccess, UserProjectAccess
from app.models.ai_content import AIGeneratedContent
from app.models.batch import Batch
from app.models.board import BoardPost, PostComment
from app.models.coaching_note import CoachingComment, CoachingNote
from app.models.coaching_plan import CoachActualOverride, CoachDailyPlan
from app.models.coaching_template import CoachingNoteTemplate
from app.models.content_version import ContentVersion
from app.models.document import ProjectDocument
from app.models.notification import Notification
from app.models.project import Project
from app.models.project import ProjectMember
from app.models.schedule import ProgramSchedule
from app.models.session import AttendanceLog, CoachingSession, CoachingTimeLog, SessionAttendee
from app.models.site_content import SiteContent
from app.models.task import ProjectTask
from app.models.user import User
from app.models.user import Coach
from app.utils.permissions import EXTERNAL_COACH, INTERNAL_COACH, LEGACY_COACH
from app.schemas.user import (
    UserBulkDeleteRequest,
    UserBulkDeleteResult,
    UserCreate,
    UserBulkUpsertRequest,
    UserBulkUpsertResult,
    UserBulkUpdateRequest,
    UserBulkUpdateResult,
    UserPermissionUpdate,
    UserPermissionOut,
    UserUpdate,
)

ALLOWED_ROLES = {"admin", LEGACY_COACH, INTERNAL_COACH, EXTERNAL_COACH, "participant", "observer"}


def _default_email(emp_id: str) -> str:
    return f"{emp_id}@samsung.com"


def _canonicalize_role(role: str) -> str:
    text = str(role or "").strip()
    if text == LEGACY_COACH:
        return INTERNAL_COACH
    return text


def _normalize_role_or_raise(role: str) -> str:
    normalized = _canonicalize_role(role)
    if normalized not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="유효하지 않은 역할입니다.")
    return normalized


def _can_have_project_scope(role: str) -> bool:
    return _canonicalize_role(role) == EXTERNAL_COACH


def _ensure_not_last_admin_change(db: Session, user: User, next_role: str, next_active: bool):
    is_admin_leaving = user.role == "admin" and (next_role != "admin" or next_active is False)
    if is_admin_leaving:
        admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="마지막 관리자 계정은 변경할 수 없습니다.")


def _validate_permission_ids(db: Session, batch_ids: list[int], project_ids: list[int]):
    if batch_ids:
        existing_batch_count = db.query(Batch).filter(Batch.batch_id.in_(batch_ids)).count()
        if existing_batch_count != len(batch_ids):
            raise HTTPException(status_code=400, detail="유효하지 않은 차수가 포함되어 있습니다.")
    if project_ids:
        existing_project_count = db.query(Project).filter(Project.project_id.in_(project_ids)).count()
        if existing_project_count != len(project_ids):
            raise HTTPException(status_code=400, detail="유효하지 않은 과제가 포함되어 있습니다.")


def _set_permissions(db: Session, user_id: int, batch_ids: list[int], project_ids: list[int]):
    _validate_permission_ids(db, batch_ids, project_ids)
    db.query(UserBatchAccess).filter(UserBatchAccess.user_id == user_id).delete()
    db.query(UserProjectAccess).filter(UserProjectAccess.user_id == user_id).delete()
    for batch_id in batch_ids:
        db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    for project_id in project_ids:
        db.add(UserProjectAccess(user_id=user_id, project_id=project_id))


def _collect_hard_delete_references(db: Session, user_id: int) -> list[str]:
    checks = [
        ("코칭노트", db.query(CoachingNote).filter(CoachingNote.author_id == user_id).count()),
        ("코칭의견/메모", db.query(CoachingComment).filter(CoachingComment.author_id == user_id).count()),
        ("과제기록 문서", db.query(ProjectDocument).filter(ProjectDocument.created_by == user_id).count()),
        ("게시글", db.query(BoardPost).filter(BoardPost.author_id == user_id).count()),
        ("게시글 댓글", db.query(PostComment).filter(PostComment.author_id == user_id).count()),
        ("세션", db.query(CoachingSession).filter(CoachingSession.created_by == user_id).count()),
        ("세션 참석자", db.query(SessionAttendee).filter(SessionAttendee.user_id == user_id).count()),
        ("세션 출석 로그", db.query(AttendanceLog).filter(AttendanceLog.user_id == user_id).count()),
        ("코칭 시간 로그", db.query(CoachingTimeLog).filter(CoachingTimeLog.coach_user_id == user_id).count()),
        ("일정", db.query(ProgramSchedule).filter(ProgramSchedule.created_by == user_id).count()),
        ("과제 Task 생성기록", db.query(ProjectTask).filter(ProjectTask.created_by == user_id).count()),
        ("코칭노트 템플릿", db.query(CoachingNoteTemplate).filter(CoachingNoteTemplate.owner_id == user_id).count()),
        ("AI 생성 콘텐츠", db.query(AIGeneratedContent).filter(AIGeneratedContent.generated_by == user_id).count()),
        ("알림", db.query(Notification).filter(Notification.user_id == user_id).count()),
        ("콘텐츠 이력", db.query(ContentVersion).filter(ContentVersion.changed_by == user_id).count()),
        ("코칭 계획", db.query(CoachDailyPlan).filter(CoachDailyPlan.coach_user_id == user_id).count()),
        ("코칭 계획 생성자 기록", db.query(CoachDailyPlan).filter(CoachDailyPlan.created_by == user_id).count()),
        ("코칭 실적 보정", db.query(CoachActualOverride).filter(CoachActualOverride.coach_user_id == user_id).count()),
        ("코칭 실적 보정 수정자", db.query(CoachActualOverride).filter(CoachActualOverride.updated_by == user_id).count()),
    ]
    return [f"{label} {count}건" for label, count in checks if count > 0]


def list_users(db: Session, include_inactive: bool = False):
    q = db.query(User)
    if not include_inactive:
        q = q.filter(User.is_active == True)
    return q.order_by(User.user_id).all()


def create_user(db: Session, data: UserCreate) -> User:
    normalized_role = _normalize_role_or_raise(data.role)

    existing = db.query(User).filter(User.emp_id == data.emp_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 존재하는 Knox ID(emp_id)입니다.")

    email = (data.email or "").strip() or _default_email(data.emp_id)
    user = User(
        emp_id=data.emp_id,
        name=data.name,
        department=data.department,
        role=normalized_role,
        email=email,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data: UserUpdate, current_user: User) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    if "role" in payload:
        payload["role"] = _normalize_role_or_raise(payload["role"])

    if "emp_id" in payload:
        next_emp_id = (payload.get("emp_id") or "").strip()
        if not next_emp_id:
            raise HTTPException(status_code=400, detail="Knox ID(emp_id)는 비워둘 수 없습니다.")
        existing = db.query(User).filter(User.emp_id == next_emp_id, User.user_id != user_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="이미 사용 중인 Knox ID(emp_id)입니다.")
        payload["emp_id"] = next_emp_id

    if user.user_id == current_user.user_id:
        next_role = payload.get("role", user.role)
        next_active = payload.get("is_active", user.is_active)
        if next_role != "admin" or next_active is False:
            raise HTTPException(status_code=400, detail="본인 관리자 계정의 권한/활성 상태는 변경할 수 없습니다.")

    next_role = payload.get("role", user.role)
    next_active = payload.get("is_active", user.is_active)
    _ensure_not_last_admin_change(db, user, next_role, next_active)

    for key, value in payload.items():
        setattr(user, key, value)
    if "role" in payload and not _can_have_project_scope(user.role):
        # 외부코치가 아닌 경우 권한 제한 스코프를 초기화한다.
        _set_permissions(db, user.user_id, [], [])
    if "emp_id" in payload and ("email" not in payload or not (payload.get("email") or "").strip()):
        user.email = _default_email(user.emp_id)
    if "email" in payload and not (payload.get("email") or "").strip():
        user.email = _default_email(user.emp_id)
    db.commit()
    db.refresh(user)
    return user


def bulk_upsert_users(db: Session, data: UserBulkUpsertRequest) -> UserBulkUpsertResult:
    created = 0
    updated = 0
    reactivated = 0
    errors: list[str] = []

    for index, item in enumerate(data.rows, start=1):
        emp_id = (item.emp_id or "").strip()
        name = (item.name or "").strip()
        role = _canonicalize_role((item.role or "").strip())
        if not emp_id or not name:
            errors.append(f"{index}행: Knox ID와 이름은 필수입니다.")
            continue
        if role not in ALLOWED_ROLES:
            errors.append(f"{index}행: 역할 값이 올바르지 않습니다. ({role})")
            continue
        email = _default_email(emp_id)

        existing = db.query(User).filter(User.emp_id == emp_id).first()
        if not existing:
            user = User(
                emp_id=emp_id,
                name=name,
                department=(item.department or None),
                role=role,
                email=email,
                is_active=True,
            )
            db.add(user)
            created += 1
            continue

        existing.name = name
        existing.department = item.department or None
        existing.role = role
        existing.email = email
        if not _can_have_project_scope(existing.role):
            _set_permissions(db, existing.user_id, [], [])
        if not existing.is_active and data.reactivate_inactive:
            existing.is_active = True
            reactivated += 1
        updated += 1

    db.commit()
    return UserBulkUpsertResult(
        created=created,
        updated=updated,
        reactivated=reactivated,
        failed=len(errors),
        errors=errors,
    )


def get_user_permissions(db: Session, user_id: int) -> UserPermissionOut:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    if not _can_have_project_scope(user.role):
        return UserPermissionOut(user_id=user_id, batch_ids=[], project_ids=[])

    batch_ids = [
        row[0]
        for row in db.query(UserBatchAccess.batch_id)
        .filter(UserBatchAccess.user_id == user_id)
        .all()
    ]
    project_ids = [
        row[0]
        for row in db.query(UserProjectAccess.project_id)
        .filter(UserProjectAccess.user_id == user_id)
        .all()
    ]
    return UserPermissionOut(user_id=user_id, batch_ids=batch_ids, project_ids=project_ids)


def update_user_permissions(db: Session, user_id: int, data: UserPermissionUpdate) -> UserPermissionOut:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    if not _can_have_project_scope(user.role):
        _set_permissions(db, user_id, [], [])
        db.commit()
        return UserPermissionOut(user_id=user_id, batch_ids=[], project_ids=[])

    batch_ids = sorted({int(v) for v in (data.batch_ids or []) if int(v) > 0})
    project_ids = sorted({int(v) for v in (data.project_ids or []) if int(v) > 0})

    _set_permissions(db, user_id, batch_ids, project_ids)
    db.commit()
    return UserPermissionOut(user_id=user_id, batch_ids=batch_ids, project_ids=project_ids)


def delete_user(db: Session, user_id: int, current_user: User):
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="본인 계정은 삭제할 수 없습니다.")

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    if user.role == "admin" and user.is_active:
        admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="마지막 관리자 계정은 삭제할 수 없습니다.")

    references = _collect_hard_delete_references(db, user_id)
    if references:
        raise HTTPException(
            status_code=400,
            detail=f"연관 데이터가 있어 완전 삭제할 수 없습니다. ({', '.join(references[:4])}{' ...' if len(references) > 4 else ''})",
        )

    db.query(UserBatchAccess).filter(UserBatchAccess.user_id == user_id).delete()
    db.query(UserProjectAccess).filter(UserProjectAccess.user_id == user_id).delete()
    db.query(ProjectMember).filter(ProjectMember.user_id == user_id).delete()
    db.query(ProjectTask).filter(ProjectTask.assigned_to == user_id).update({"assigned_to": None})
    db.query(SiteContent).filter(SiteContent.updated_by == user_id).update({"updated_by": None})
    db.query(Coach).filter(Coach.user_id == user_id).update({"user_id": None})
    db.delete(user)
    db.commit()


def restore_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.is_active:
        raise HTTPException(status_code=409, detail="이미 활성 상태인 사용자입니다.")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


def bulk_delete_users(db: Session, data: UserBulkDeleteRequest, current_user: User) -> UserBulkDeleteResult:
    deleted = 0
    errors: list[str] = []
    user_ids = sorted({int(v) for v in data.user_ids if int(v) > 0})
    if not user_ids:
        raise HTTPException(status_code=400, detail="삭제할 사용자 ID가 없습니다.")

    for user_id in user_ids:
        try:
            delete_user(db, user_id, current_user)
            deleted += 1
        except HTTPException as exc:
            errors.append(f"{user_id}: {exc.detail}")

    return UserBulkDeleteResult(deleted=deleted, failed=len(errors), errors=errors)


def bulk_update_users(db: Session, data: UserBulkUpdateRequest, current_user: User) -> UserBulkUpdateResult:
    user_ids = sorted({int(v) for v in data.user_ids if int(v) > 0})
    if not user_ids:
        raise HTTPException(status_code=400, detail="수정할 사용자 ID가 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    editable_fields = [k for k in ("department", "role", "batch_ids", "project_ids") if k in payload]
    if not editable_fields:
        raise HTTPException(status_code=400, detail="일괄 수정할 항목이 없습니다.")

    role_value = payload.get("role")
    if role_value is not None:
        role_value = _normalize_role_or_raise(role_value)
        payload["role"] = role_value
        if role_value != "admin":
            active_admin_ids = {
                row[0]
                for row in db.query(User.user_id)
                .filter(User.role == "admin", User.is_active == True)
                .all()
            }
            demote_targets = {
                row[0]
                for row in db.query(User.user_id)
                .filter(User.user_id.in_(user_ids), User.role == "admin", User.is_active == True)
                .all()
            }
            if active_admin_ids and not (active_admin_ids - demote_targets):
                raise HTTPException(status_code=400, detail="마지막 관리자 계정은 일괄 변경할 수 없습니다.")

    batch_ids = None
    if "batch_ids" in payload:
        batch_ids = sorted({int(v) for v in (payload.get("batch_ids") or []) if int(v) > 0})
    project_ids = None
    if "project_ids" in payload:
        project_ids = sorted({int(v) for v in (payload.get("project_ids") or []) if int(v) > 0})
    if batch_ids is not None or project_ids is not None:
        _validate_permission_ids(db, batch_ids or [], project_ids or [])

    updated = 0
    errors: list[str] = []
    for user in db.query(User).filter(User.user_id.in_(user_ids)).all():
        if user.user_id == current_user.user_id:
            errors.append(f"{user.user_id}: 본인 계정은 일괄 수정 대상에서 제외됩니다.")
            continue
        try:
            if "department" in payload:
                user.department = payload.get("department") or None
            if "role" in payload and payload.get("role") is not None:
                _ensure_not_last_admin_change(db, user, payload["role"], user.is_active)
                user.role = payload["role"]
            if batch_ids is not None or project_ids is not None:
                current_perm = get_user_permissions(db, user.user_id)
                next_batch_ids = batch_ids if batch_ids is not None else current_perm.batch_ids
                next_project_ids = project_ids if project_ids is not None else current_perm.project_ids
                _set_permissions(db, user.user_id, next_batch_ids, next_project_ids)
            if not _can_have_project_scope(user.role):
                _set_permissions(db, user.user_id, [], [])
            updated += 1
        except HTTPException as exc:
            errors.append(f"{user.user_id}: {exc.detail}")

    db.commit()
    return UserBulkUpdateResult(updated=updated, failed=len(errors), errors=errors)


