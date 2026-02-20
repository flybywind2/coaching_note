"""Permissions 관련 공용 유틸리티 헬퍼입니다."""

from typing import Any, Dict, Set

from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.access_scope import UserBatchAccess, UserProjectAccess
from sqlalchemy.orm import Session


ADMIN = "admin"
COACH = "coach"
PARTICIPANT = "participant"
OBSERVER = "observer"

ADMIN_COACH = (ADMIN, COACH)
ALL_ROLES = (ADMIN, COACH, PARTICIPANT, OBSERVER)


def is_admin(user: User) -> bool:
    return user.role == ADMIN


def is_coach(user: User) -> bool:
    return user.role == COACH


def is_admin_or_coach(user: User) -> bool:
    return user.role in ADMIN_COACH


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
    project_batch_ids: Set[int] = set()
    if project_ids:
        project_batch_ids = {
            int(row[0])
            for row in db.query(Project.batch_id)
            .filter(Project.project_id.in_(project_ids))
            .all()
        }

    payload = {
        "batch_ids": batch_ids,
        "project_ids": project_ids,
        "project_batch_ids": project_batch_ids,
        "has_limits": bool(batch_ids or project_ids),
    }
    setattr(user, "_access_scope_cache", payload)
    return payload


def can_view_batch(db: Session, batch_id: int, user: User) -> bool:
    if is_admin(user):
        return True

    scope = _load_scope_cache(db, user)
    if not scope["has_limits"]:
        return True

    if batch_id in scope["batch_ids"]:
        return True
    if batch_id in scope["project_batch_ids"]:
        return True
    return False


def is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first() is not None


def can_view_project(db: Session, project: Project, user: User) -> bool:
    if is_admin(user):
        return True

    scope = _load_scope_cache(db, user)
    scope_allows = (
        project.batch_id in scope["batch_ids"]
        or project.project_id in scope["project_ids"]
    )

    if is_admin_or_coach(user):
        if not scope["has_limits"]:
            return True
        return scope_allows

    if scope["has_limits"]:
        return scope_allows

    if project.visibility == "public":
        return True
    return is_project_member(db, project.project_id, user.user_id)


def can_write_coaching_note(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_view_coach_only_comment(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_manage_milestone_order(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_manage_program_schedule(user: User) -> bool:
    return user.role == ADMIN


def can_assign_session(user: User) -> bool:
    return user.role == ADMIN


def can_view_dashboard(user: User) -> bool:
    return user.role in ADMIN_COACH


