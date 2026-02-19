from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
from app.models.task import ProjectTask
from app.models.user import User
from app.schemas.task import ProjectTaskCreate, ProjectTaskUpdate
from app.utils.permissions import is_admin_or_coach
from typing import List


def get_tasks(db: Session, project_id: int) -> List[ProjectTask]:
    return (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.is_milestone.desc(), ProjectTask.milestone_order, ProjectTask.created_at)
        .all()
    )


def get_task(db: Session, task_id: int) -> ProjectTask:
    task = db.query(ProjectTask).filter(ProjectTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다.")
    return task


def create_task(db: Session, project_id: int, data: ProjectTaskCreate, current_user: User) -> ProjectTask:
    task = ProjectTask(project_id=project_id, created_by=current_user.user_id, **data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    _recalculate_progress(db, project_id)
    return task


def update_task(db: Session, task_id: int, data: ProjectTaskUpdate, current_user: User) -> ProjectTask:
    task = get_task(db, task_id)
    # Only admin/coach can change milestone order
    if data.milestone_order is not None and not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="마일스톤 순서 변경은 관리자/코치만 가능합니다.")

    updates = data.model_dump(exclude_none=True)
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


def delete_task(db: Session, task_id: int):
    task = get_task(db, task_id)
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
