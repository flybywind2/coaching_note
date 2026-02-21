"""Batch Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.batch import Batch
from app.models.project import Project
from app.models.session import CoachingSession
from app.models.schedule import ProgramSchedule
from app.schemas.batch import BatchCreate, BatchUpdate
from app.models.user import User
from app.utils.permissions import can_view_batch


def get_batches(db: Session, current_user: User):
    rows = db.query(Batch).order_by(Batch.created_at.desc()).all()
    return [row for row in rows if can_view_batch(db, row.batch_id, current_user)]


def get_batch(db: Session, batch_id: int) -> Batch:
    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")
    return batch


def create_batch(db: Session, data: BatchCreate) -> Batch:
    payload = data.model_dump()
    if not payload.get("coaching_start_date"):
        payload["coaching_start_date"] = payload.get("start_date")
    batch = Batch(**payload)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def update_batch(db: Session, batch_id: int, data: BatchUpdate) -> Batch:
    batch = get_batch(db, batch_id)
    payload = data.model_dump(exclude_none=True)
    if "start_date" in payload and "coaching_start_date" not in payload and not batch.coaching_start_date:
        payload["coaching_start_date"] = payload["start_date"]
    for k, v in payload.items():
        setattr(batch, k, v)
    db.commit()
    db.refresh(batch)
    return batch


def delete_batch(db: Session, batch_id: int):
    batch = get_batch(db, batch_id)
    sessions = db.query(CoachingSession).filter(CoachingSession.batch_id == batch_id).all()
    for session in sessions:
        db.delete(session)

    schedules = db.query(ProgramSchedule).filter(ProgramSchedule.batch_id == batch_id).all()
    for schedule in schedules:
        db.delete(schedule)

    projects = db.query(Project).filter(Project.batch_id == batch_id).all()
    for project in projects:
        db.delete(project)

    db.delete(batch)
    db.commit()


