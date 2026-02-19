from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.task import ProjectTaskCreate, ProjectTaskUpdate, ProjectTaskOut
from app.services import task_service
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter(tags=["tasks"])


@router.get("/api/projects/{project_id}/tasks", response_model=List[ProjectTaskOut])
def list_tasks(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return task_service.get_tasks(db, project_id)


@router.post("/api/projects/{project_id}/tasks", response_model=ProjectTaskOut)
def create_task(
    project_id: int,
    data: ProjectTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return task_service.create_task(db, project_id, data, current_user)


@router.get("/api/tasks/{task_id}", response_model=ProjectTaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return task_service.get_task(db, task_id)


@router.put("/api/tasks/{task_id}", response_model=ProjectTaskOut)
def update_task(
    task_id: int,
    data: ProjectTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return task_service.update_task(db, task_id, data, current_user)


@router.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task_service.delete_task(db, task_id)
    return {"message": "삭제되었습니다."}
