"""Schedules 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.schedule import ProgramScheduleCreate, ProgramScheduleUpdate, ProgramScheduleOut
from app.models.schedule import ProgramSchedule
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("", response_model=List[ProgramScheduleOut])
def list_schedules(
    batch_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ProgramSchedule)
    if batch_id:
        q = q.filter(ProgramSchedule.batch_id == batch_id)
    return q.order_by(ProgramSchedule.start_datetime).all()


@router.post("", response_model=ProgramScheduleOut)
def create_schedule(
    data: ProgramScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    schedule = ProgramSchedule(**data.model_dump(), created_by=current_user.user_id)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/{schedule_id}", response_model=ProgramScheduleOut)
def get_schedule(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(ProgramSchedule).filter(ProgramSchedule.schedule_id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    return s


@router.put("/{schedule_id}", response_model=ProgramScheduleOut)
def update_schedule(
    schedule_id: int,
    data: ProgramScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    s = db.query(ProgramSchedule).filter(ProgramSchedule.schedule_id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    s = db.query(ProgramSchedule).filter(ProgramSchedule.schedule_id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    db.delete(s)
    db.commit()
    return {"message": "삭제되었습니다."}


