from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.batch import Batch
from app.models.project import Project
from app.models.session import CoachingSession
from app.models.schedule import ProgramSchedule
from app.schemas.batch import BatchCreate, BatchUpdate


def get_batches(db: Session):
    return db.query(Batch).order_by(Batch.created_at.desc()).all()


def get_batch(db: Session, batch_id: int) -> Batch:
    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")
    return batch


def create_batch(db: Session, data: BatchCreate) -> Batch:
    batch = Batch(**data.model_dump())
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def update_batch(db: Session, batch_id: int, data: BatchUpdate) -> Batch:
    batch = get_batch(db, batch_id)
    for k, v in data.model_dump(exclude_none=True).items():
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
