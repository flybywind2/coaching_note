"""Task Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
from app.models.project import Project, ProjectMember
from app.models.task import ProjectTask
from app.models.user import User
from app.schemas.task import ProjectTaskCreate, ProjectTaskUpdate
from app.utils.permissions import can_view_project, is_admin_or_coach
from typing import List


def _get_accessible_project(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    if not can_view_project(db, project, current_user):
        raise HTTPException(status_code=403, detail="이 과제에 접근할 권한이 없습니다.")
    return project


def _ensure_not_observer(current_user: User):
    if current_user.role == "observer":
        raise HTTPException(status_code=403, detail="참관자는 수정 권한이 없습니다.")


def _ensure_participant_member(db: Session, project_id: int, current_user: User):
    if current_user.role != "participant":
        return
    is_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.user_id,
        )
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="참여자는 본인 과제의 일정만 수정할 수 있습니다.")


def _validate_assignee_in_project(db: Session, project_id: int, assigned_to: int | None):
    if assigned_to is None:
        return
    exists = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == assigned_to,
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail="담당자는 해당 과제 팀원으로 등록되어야 합니다.")


def get_tasks(db: Session, project_id: int, current_user: User) -> List[ProjectTask]:
    _get_accessible_project(db, project_id, current_user)
    return (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.is_milestone.desc(), ProjectTask.milestone_order, ProjectTask.created_at)
        .all()
    )


def get_task(db: Session, task_id: int, current_user: User) -> ProjectTask:
    task = db.query(ProjectTask).filter(ProjectTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다.")
    _get_accessible_project(db, task.project_id, current_user)
    return task


def create_task(db: Session, project_id: int, data: ProjectTaskCreate, current_user: User) -> ProjectTask:
    _get_accessible_project(db, project_id, current_user)
    _ensure_not_observer(current_user)
    _ensure_participant_member(db, project_id, current_user)
    _validate_assignee_in_project(db, project_id, data.assigned_to)
    payload = data.model_dump()
    if payload.get("status") == "completed":
        payload["completed_at"] = datetime.utcnow()
    task = ProjectTask(project_id=project_id, created_by=current_user.user_id, **payload)
    db.add(task)
    db.commit()
    db.refresh(task)
    _recalculate_progress(db, project_id)
    return task


def update_task(db: Session, task_id: int, data: ProjectTaskUpdate, current_user: User) -> ProjectTask:
    task = get_task(db, task_id, current_user)
    _ensure_not_observer(current_user)
    _ensure_participant_member(db, task.project_id, current_user)
    # Only admin/coach can change milestone order
    if data.milestone_order is not None and not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="마일스톤 순서 변경은 관리자/코치만 가능합니다.")

    updates = data.model_dump(exclude_none=True)
    if "assigned_to" in data.model_fields_set:
        updates["assigned_to"] = data.assigned_to
    if "description" in data.model_fields_set:
        updates["description"] = data.description
    if "due_date" in data.model_fields_set:
        updates["due_date"] = data.due_date

    if "assigned_to" in updates:
        _validate_assignee_in_project(db, task.project_id, updates["assigned_to"])

    if updates.get("status") == "completed" and task.status != "completed":
        updates["completed_at"] = datetime.utcnow()
    elif updates.get("status") and updates["status"] != "completed":
        updates["completed_at"] = None

    for k, v in updates.items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    _recalculate_progress(db, task.project_id)
    return task


def delete_task(db: Session, task_id: int, current_user: User):
    task = get_task(db, task_id, current_user)
    _ensure_not_observer(current_user)
    _ensure_participant_member(db, task.project_id, current_user)
    project_id = task.project_id
    db.delete(task)
    db.commit()
    _recalculate_progress(db, project_id)


def _recalculate_progress(db: Session, project_id: int):
    from app.models.project import Project
    milestones = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id, ProjectTask.is_milestone == True)
        .all()
    )
    if not milestones:
        return
    completed = sum(1 for m in milestones if m.status == "completed")
    rate = int(completed / len(milestones) * 100)
    db.query(Project).filter(Project.project_id == project_id).update({"progress_rate": rate})
    db.commit()


