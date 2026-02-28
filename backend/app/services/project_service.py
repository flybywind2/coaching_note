"""Project Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import json

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.project import Project, ProjectMember
from app.models.project_profile import ProjectProfile
from app.models.task import ProjectTask
from app.models.session import CoachingSession
from app.models.user import User
from app.models.access_scope import UserProjectAccess
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberCreate
from app.utils.permissions import can_view_project, can_view_batch
from app.utils.permissions import PARTICIPANT
from typing import List, Optional


ALLOWED_PROJECT_TYPES = {"primary", "associate"}
ALLOWED_PROJECT_STATUSES = {"preparing", "in_progress", "completed", "drop"}
MEMBER_ROLE = "member"
LEADER_ROLE = "leader"


def _normalize_project_type(value: str | None) -> str:
    text = (value or "primary").strip().lower()
    if text not in ALLOWED_PROJECT_TYPES:
        return "primary"
    return text


def _normalize_project_status(value: str | None, fallback: str = "preparing") -> str:
    normalized_fallback = (fallback or "preparing").strip().lower() or "preparing"
    if normalized_fallback not in ALLOWED_PROJECT_STATUSES:
        normalized_fallback = "preparing"
    text = (value or normalized_fallback).strip().lower()
    if text not in ALLOWED_PROJECT_STATUSES:
        return normalized_fallback
    return text


def _normalize_member_role(value: str | None) -> str:
    return LEADER_ROLE if str(value or "").strip().lower() == LEADER_ROLE else MEMBER_ROLE


def get_projects(db: Session, batch_id: int, current_user: User) -> List[Project]:
    if not can_view_batch(db, batch_id, current_user):
        return []
    projects = db.query(Project).filter(Project.batch_id == batch_id).all()
    visible = [
        p
        for p in projects
        if _normalize_project_status(getattr(p, "status", None)) != "drop"
        and can_view_project(db, p, current_user)
    ]
    member_project_ids = {
        row[0]
        for row in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == current_user.user_id)
        .all()
    }
    for p in visible:
        p._is_my_project = p.project_id in member_project_ids
    return visible


def get_project(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    if not can_view_project(db, project, current_user):
        raise HTTPException(status_code=403, detail="이 과제에 접근할 권한이 없습니다.")
    project._is_my_project = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.user_id)
        .first()
        is not None
    )
    return project


def create_project(db: Session, batch_id: int, data: ProjectCreate) -> Project:
    payload = data.model_dump()
    payload["project_type"] = _normalize_project_type(payload.get("project_type"))
    payload["status"] = _normalize_project_status(payload.get("status"))
    project = Project(batch_id=batch_id, **payload)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _get_or_create_profile(db: Session, project_id: int) -> ProjectProfile:
    profile = db.query(ProjectProfile).filter(ProjectProfile.project_id == project_id).first()
    if profile:
        return profile
    profile = ProjectProfile(project_id=project_id)
    db.add(profile)
    db.flush()
    return profile


def update_project(db: Session, project_id: int, data: ProjectUpdate, current_user: User) -> Project:
    project = get_project(db, project_id, current_user)
    payload = data.model_dump(exclude_none=True)
    if "project_type" in payload:
        payload["project_type"] = _normalize_project_type(payload.get("project_type"))
    if "status" in payload:
        payload["status"] = _normalize_project_status(
            payload.get("status"),
            fallback=_normalize_project_status(getattr(project, "status", None)),
        )
    profile_keys = {"ai_tech_category", "ai_tech_used", "project_summary", "github_repos"}
    profile_payload = {k: payload.pop(k) for k in list(payload.keys()) if k in profile_keys}

    for k, v in payload.items():
        setattr(project, k, v)

    if profile_payload:
        profile = _get_or_create_profile(db, project_id)
        if "ai_tech_category" in profile_payload:
            profile.ai_tech_category = profile_payload["ai_tech_category"]
            project.category = profile_payload["ai_tech_category"] or project.category
        if "ai_tech_used" in profile_payload:
            profile.ai_tech_used = profile_payload["ai_tech_used"]
        if "project_summary" in profile_payload:
            profile.project_summary = profile_payload["project_summary"]
        if "github_repos" in profile_payload:
            repos = [item.strip() for item in profile_payload["github_repos"] if str(item).strip()]
            profile.github_repos = json.dumps(repos, ensure_ascii=False)

    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: int, current_user: User):
    project = get_project(db, project_id, current_user)
    sessions = db.query(CoachingSession).filter(CoachingSession.project_id == project_id).all()
    for session in sessions:
        db.delete(session)
    db.delete(project)
    db.commit()


def recalculate_progress(db: Session, project_id: int):
    milestones = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id, ProjectTask.is_milestone == True)
        .order_by(ProjectTask.milestone_order)
        .all()
    )
    if not milestones:
        return
    completed = sum(1 for m in milestones if m.status == "completed")
    rate = int(completed / len(milestones) * 100)
    db.query(Project).filter(Project.project_id == project_id).update({"progress_rate": rate})
    db.commit()


def get_members(db: Session, project_id: int, current_user: User) -> List[ProjectMember]:
    get_project(db, project_id, current_user)
    return db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()


def _sync_project_representative(db: Session, project_id: int):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        return
    members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.asc(), ProjectMember.member_id.asc())
        .all()
    )
    if not members:
        project.representative = None
        return

    leader_member = next((m for m in members if _normalize_member_role(m.role) == LEADER_ROLE), None)
    if leader_member is None:
        leader_member = next((m for m in members if bool(m.is_representative)), None)

    for member in members:
        is_leader = leader_member is not None and member.member_id == leader_member.member_id
        member.role = LEADER_ROLE if is_leader else MEMBER_ROLE
        member.is_representative = bool(is_leader)

    if not leader_member:
        project.representative = None
        return
    representative_user = db.query(User).filter(User.user_id == leader_member.user_id).first()
    project.representative = representative_user.name if representative_user else None


def get_member_candidates(db: Session, project_id: int, current_user: User) -> List[User]:
    get_project(db, project_id, current_user)
    member_ids = {
        row[0]
        for row in db.query(ProjectMember.user_id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    }
    q = db.query(User).filter(User.is_active == True)  # noqa: E712
    if member_ids:
        q = q.filter(~User.user_id.in_(member_ids))
    return q.order_by(User.name.asc(), User.emp_id.asc(), User.user_id.asc()).all()


def add_member(db: Session, project_id: int, data: ProjectMemberCreate) -> ProjectMember:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == data.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 과제 멤버입니다.")
    payload = data.model_dump()
    normalized_role = _normalize_member_role(payload.get("role"))
    wants_leader = normalized_role == LEADER_ROLE or bool(payload.get("is_representative"))
    if wants_leader:
        db.query(ProjectMember).filter(ProjectMember.project_id == project_id).update(
            {"role": MEMBER_ROLE, "is_representative": False},
            synchronize_session=False,
        )
    payload["role"] = LEADER_ROLE if wants_leader else MEMBER_ROLE
    payload["is_representative"] = bool(wants_leader)
    member = ProjectMember(project_id=project_id, **payload)
    db.add(member)
    user = db.query(User).filter(User.user_id == data.user_id).first()
    if user and user.role == PARTICIPANT:
        exists_access = (
            db.query(UserProjectAccess)
            .filter(
                UserProjectAccess.user_id == data.user_id,
                UserProjectAccess.project_id == project_id,
            )
            .first()
        )
        if not exists_access:
            db.add(UserProjectAccess(user_id=data.user_id, project_id=project_id))
    _sync_project_representative(db, project_id)
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, project_id: int, user_id: int):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")
    # 팀원 제거 시 담당자로 지정된 과제 내 Task는 자동으로 미배정 처리합니다.
    db.query(ProjectTask).filter(
        ProjectTask.project_id == project_id,
        ProjectTask.assigned_to == user_id,
    ).update({"assigned_to": None})
    user = db.query(User).filter(User.user_id == user_id).first()
    if user and user.role == PARTICIPANT:
        db.query(UserProjectAccess).filter(
            UserProjectAccess.user_id == user_id,
            UserProjectAccess.project_id == project_id,
        ).delete()
    db.delete(member)
    _sync_project_representative(db, project_id)
    db.commit()


def set_representative(db: Session, project_id: int, user_id: int) -> ProjectMember:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="해당 사용자는 과제 팀원이 아닙니다.")

    db.query(ProjectMember).filter(ProjectMember.project_id == project_id).update(
        {"role": MEMBER_ROLE, "is_representative": False},
        synchronize_session=False,
    )
    member.role = LEADER_ROLE
    member.is_representative = True
    _sync_project_representative(db, project_id)
    db.commit()
    db.refresh(member)
    return member


