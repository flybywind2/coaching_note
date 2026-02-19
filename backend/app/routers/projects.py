from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectMemberCreate, ProjectMemberOut
from app.services import project_service
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User

router = APIRouter(tags=["projects"])


@router.get("/api/batches/{batch_id}/projects", response_model=List[ProjectOut])
def list_projects(batch_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return project_service.get_projects(db, batch_id, current_user)


@router.post("/api/batches/{batch_id}/projects", response_model=ProjectOut)
def create_project(
    batch_id: int,
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    return project_service.create_project(db, batch_id, data)


@router.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return project_service.get_project(db, project_id, current_user)


@router.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.utils.permissions import is_admin_or_coach
    from fastapi import HTTPException
    if not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="관리자/코치만 수정 가능합니다.")
    return project_service.update_project(db, project_id, data, current_user)


@router.delete("/api/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    project_service.delete_project(db, project_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/api/projects/{project_id}/members", response_model=List[ProjectMemberOut])
def get_members(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return project_service.get_members(db, project_id, current_user)


@router.post("/api/projects/{project_id}/members", response_model=ProjectMemberOut)
def add_member(
    project_id: int,
    data: ProjectMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    return project_service.add_member(db, project_id, data)


@router.delete("/api/projects/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    project_service.remove_member(db, project_id, user_id)
    return {"message": "멤버가 제거되었습니다."}
