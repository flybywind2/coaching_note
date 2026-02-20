"""Batches 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.batch import BatchCreate, BatchUpdate, BatchOut
from app.services import batch_service
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.get("", response_model=List[BatchOut])
def list_batches(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return batch_service.get_batches(db)


@router.post("", response_model=BatchOut)
def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    return batch_service.create_batch(db, data)


@router.get("/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return batch_service.get_batch(db, batch_id)


@router.put("/{batch_id}", response_model=BatchOut)
def update_batch(
    batch_id: int,
    data: BatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    return batch_service.update_batch(db, batch_id, data)


@router.delete("/{batch_id}")
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    batch_service.delete_batch(db, batch_id)
    return {"message": "삭제되었습니다."}


