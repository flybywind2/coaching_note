from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.project import Project, ProjectMember
from app.models.task import ProjectTask
from app.models.session import CoachingSession
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberCreate
from app.utils.permissions import can_view_project
from typing import List, Optional


def get_projects(db: Session, batch_id: int, current_user: User) -> List[Project]:
    projects = db.query(Project).filter(Project.batch_id == batch_id).all()
    return [p for p in projects if can_view_project(db, p, current_user)]


def get_project(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    if not can_view_project(db, project, current_user):
        raise HTTPException(status_code=403, detail="이 과제에 접근할 권한이 없습니다.")
    return project


def create_project(db: Session, batch_id: int, data: ProjectCreate) -> Project:
    project = Project(batch_id=batch_id, **data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project_id: int, data: ProjectUpdate, current_user: User) -> Project:
    project = get_project(db, project_id, current_user)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(project, k, v)
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


def add_member(db: Session, project_id: int, data: ProjectMemberCreate) -> ProjectMember:
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == data.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 과제 멤버입니다.")
    member = ProjectMember(project_id=project_id, **data.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, project_id: int, user_id: int):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")
    db.delete(member)
    db.commit()
