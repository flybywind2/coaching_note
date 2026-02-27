"""[FEEDBACK7] 과제 조사(의견 취합) API 라우터입니다."""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.project_research import (
    ProjectResearchBatchOut,
    ProjectResearchDetailOut,
    ProjectResearchItemCreate,
    ProjectResearchItemOut,
    ProjectResearchItemUpdate,
    ProjectResearchQuestionCreate,
    ProjectResearchQuestionOut,
    ProjectResearchQuestionUpdate,
    ProjectResearchResponseUpsert,
)
from app.services import project_research_service

router = APIRouter(prefix="/api/project-research", tags=["project-research"])


@router.get("/batches", response_model=List[ProjectResearchBatchOut])
def list_accessible_batches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = project_research_service.list_accessible_batches(db, current_user)
    return [{"batch_id": int(row.batch_id), "batch_name": row.batch_name} for row in rows]


@router.get("/items", response_model=List[ProjectResearchItemOut])
def list_items(
    batch_id: int = Query(..., ge=1),
    include_hidden: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.list_items(
        db,
        batch_id=batch_id,
        include_hidden=include_hidden,
        current_user=current_user,
    )


@router.post("/items", response_model=ProjectResearchItemOut)
def create_item(
    data: ProjectResearchItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.create_item(db, data, current_user)


@router.put("/items/{item_id}", response_model=ProjectResearchItemOut)
def update_item(
    item_id: int,
    data: ProjectResearchItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.update_item(
        db,
        item_id=item_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_research_service.delete_item(db, item_id=item_id, current_user=current_user)
    return {"message": "삭제되었습니다."}


@router.post("/items/{item_id}/questions", response_model=ProjectResearchQuestionOut)
def create_question(
    item_id: int,
    data: ProjectResearchQuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.create_question(
        db,
        item_id=item_id,
        data=data,
        current_user=current_user,
    )


@router.put("/questions/{question_id}", response_model=ProjectResearchQuestionOut)
def update_question(
    question_id: int,
    data: ProjectResearchQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.update_question(
        db,
        question_id=question_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project_research_service.delete_question(db, question_id=question_id, current_user=current_user)
    return {"message": "삭제되었습니다."}


@router.get("/items/{item_id}/detail", response_model=ProjectResearchDetailOut)
def get_detail(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.get_detail(db, item_id=item_id, current_user=current_user)


@router.put("/items/{item_id}/responses", response_model=ProjectResearchDetailOut)
def upsert_responses(
    item_id: int,
    data: ProjectResearchResponseUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return project_research_service.upsert_responses(
        db,
        item_id=item_id,
        data=data,
        current_user=current_user,
    )

