"""Permissions 관련 공용 유틸리티 헬퍼입니다."""

from typing import Any, Dict, Set

from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.access_scope import UserBatchAccess, UserProjectAccess
from sqlalchemy.orm import Session


ADMIN = "admin"
LEGACY_COACH = "coach"
INTERNAL_COACH = "internal_coach"
EXTERNAL_COACH = "external_coach"
PARTICIPANT = "participant"
OBSERVER = "observer"

COACH_ROLES = (LEGACY_COACH, INTERNAL_COACH, EXTERNAL_COACH)
INTERNAL_COACH_ROLES = (LEGACY_COACH, INTERNAL_COACH)
ADMIN_COACH = (ADMIN, *COACH_ROLES)
ADMIN_INTERNAL_COACH = (ADMIN, *INTERNAL_COACH_ROLES)
ALL_ROLES = (ADMIN, *COACH_ROLES, PARTICIPANT, OBSERVER)


def is_admin(user: User) -> bool:
    return user.role == ADMIN


def is_participant(user: User) -> bool:
    return user.role == PARTICIPANT


def is_observer(user: User) -> bool:
    return user.role == OBSERVER


def is_internal_coach(user: User) -> bool:
    return user.role in INTERNAL_COACH_ROLES


def is_external_coach(user: User) -> bool:
    return user.role == EXTERNAL_COACH


def is_coach(user: User) -> bool:
    return user.role in COACH_ROLES


def is_admin_or_coach(user: User) -> bool:
    return user.role in ADMIN_COACH


def is_admin_or_internal_coach(user: User) -> bool:
    return user.role in ADMIN_INTERNAL_COACH


def _load_scope_cache(db: Session, user: User) -> Dict[str, Any]:
    cached = getattr(user, "_access_scope_cache", None)
    if cached is not None:
        return cached

    batch_ids: Set[int] = {
        int(row[0])
        for row in db.query(UserBatchAccess.batch_id)
        .filter(UserBatchAccess.user_id == user.user_id)
        .all()
    }

    project_ids: Set[int] = {
        int(row[0])
        for row in db.query(UserProjectAccess.project_id)
        .filter(UserProjectAccess.user_id == user.user_id)
        .all()
    }

    payload = {
        "batch_ids": batch_ids,
        "has_batch_limits": bool(batch_ids),
        "project_ids": project_ids,
        "has_project_limits": bool(project_ids),
    }
    setattr(user, "_access_scope_cache", payload)
    return payload


def can_view_batch(db: Session, batch_id: int, user: User) -> bool:
    if user.role not in ALL_ROLES:
        return False
    if is_external_coach(user):
        scope = _load_scope_cache(db, user)
        if not scope["has_batch_limits"]:
            return False
        return batch_id in scope["batch_ids"]
    return True


def is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first() is not None


def can_view_project(db: Session, project: Project, user: User) -> bool:
    if is_admin(user):
        return True

    scope = _load_scope_cache(db, user)
    scope_allows = project.project_id in scope["project_ids"]

    # 관리자/사내코치/참여자/참관자는 모든 과제를 조회할 수 있다.
    if is_internal_coach(user) or is_participant(user) or is_observer(user):
        return True

    # 외부코치는 부여된 과제 권한 범위에서만 조회한다.
    if is_external_coach(user):
        if scope["has_batch_limits"] and project.batch_id not in scope["batch_ids"]:
            return False
        if not scope["has_project_limits"]:
            return False
        return scope_allows

    if scope["has_project_limits"]:
        return scope_allows

    if project.visibility == "public":
        return True
    return is_project_member(db, project.project_id, user.user_id)


def can_write_coaching_note(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_view_coach_only_comment(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_manage_milestone_order(user: User) -> bool:
    return user.role in ADMIN_INTERNAL_COACH


def can_manage_program_schedule(user: User) -> bool:
    return user.role == ADMIN


def can_assign_session(user: User) -> bool:
    return user.role == ADMIN


def can_view_dashboard(user: User) -> bool:
    return user.role in ADMIN_INTERNAL_COACH


def can_access_calendar(user: User) -> bool:
    return user.role in (ADMIN, *INTERNAL_COACH_ROLES, PARTICIPANT, OBSERVER)


def can_access_coaching_plan(user: User) -> bool:
    return user.role in ADMIN_INTERNAL_COACH


