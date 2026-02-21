"""Schedules 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Iterable, List
from app.database import get_db
from app.schemas.schedule import ProgramScheduleCreate, ProgramScheduleUpdate, ProgramScheduleOut
from app.models.batch import Batch
from app.models.schedule import ProgramSchedule
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _validate_schedule_window(db: Session, batch_id: int, start_dt, end_dt):
    if end_dt and end_dt < start_dt:
        raise HTTPException(status_code=400, detail="종료 일시는 시작 일시보다 빠를 수 없습니다.")

    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")
    target_day = start_dt.date()
    if target_day < batch.start_date or target_day > batch.end_date:
        raise HTTPException(status_code=400, detail="일정 날짜는 차수 기간 내에서만 등록할 수 있습니다.")
    return target_day


def _assert_global_one_per_day(
    db: Session,
    batch_id: int,
    target_day,
    exclude_schedule_ids: Iterable[int] | None = None,
):
    q = db.query(ProgramSchedule).filter(
        ProgramSchedule.batch_id == batch_id,
        func.date(ProgramSchedule.start_datetime) == str(target_day),
    )
    exclude_ids = [sid for sid in (exclude_schedule_ids or []) if sid is not None]
    if exclude_ids:
        q = q.filter(~ProgramSchedule.schedule_id.in_(exclude_ids))
    if q.first():
        raise HTTPException(status_code=400, detail="전체 일정은 하루에 1개만 등록할 수 있습니다.")


def _normalize_color(value: str | None) -> str:
    if not value:
        return "#4CAF50"
    text = value.strip()
    if text.startswith("#") and len(text) in (4, 7):
        return text
    return "#4CAF50"


def _apply_schedule_update(target: ProgramSchedule, payload: dict):
    for k, v in payload.items():
        setattr(target, k, v)


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
    payload = data.model_dump()
    payload["schedule_type"] = payload.get("schedule_type") or "other"
    payload["color"] = _normalize_color(payload.get("color"))
    target_day = _validate_schedule_window(db, payload["batch_id"], payload["start_datetime"], payload.get("end_datetime"))
    _assert_global_one_per_day(db, payload["batch_id"], target_day)

    schedule = ProgramSchedule(**payload, created_by=current_user.user_id)
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
    payload = data.model_dump(exclude_none=True)
    next_start = payload.get("start_datetime", s.start_datetime)
    next_end = payload.get("end_datetime", s.end_datetime)
    target_day = _validate_schedule_window(db, s.batch_id, next_start, next_end)
    _assert_global_one_per_day(db, s.batch_id, target_day, exclude_schedule_ids=[s.schedule_id])
    if "color" in payload:
        payload["color"] = _normalize_color(payload.get("color"))
    if "schedule_type" in payload and not payload["schedule_type"]:
        payload["schedule_type"] = "other"
    _apply_schedule_update(s, payload)
    db.commit()
    db.refresh(s)
    return s


@router.put("/{schedule_id}/series")
def update_schedule_series(
    schedule_id: int,
    data: ProgramScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    seed = db.query(ProgramSchedule).filter(ProgramSchedule.schedule_id == schedule_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    if not seed.repeat_group_id:
        raise HTTPException(status_code=400, detail="반복 일정 그룹이 아닙니다.")

    rows = (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.batch_id == seed.batch_id,
            ProgramSchedule.repeat_group_id == seed.repeat_group_id,
        )
        .order_by(ProgramSchedule.start_datetime.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="반복 일정이 없습니다.")

    payload = data.model_dump(exclude_none=True)
    if not payload:
        return {"updated": 0}
    if "color" in payload:
        payload["color"] = _normalize_color(payload.get("color"))
    if "schedule_type" in payload and not payload["schedule_type"]:
        payload["schedule_type"] = "other"

    new_seed_start = payload.get("start_datetime")
    new_seed_end = payload.get("end_datetime")
    original_seed_start = seed.start_datetime
    original_seed_end = seed.end_datetime
    exclude_ids = [row.schedule_id for row in rows]
    updated = 0
    for row in rows:
        row_payload = dict(payload)
        if new_seed_start is not None:
            offset = row.start_datetime - original_seed_start
            row_payload["start_datetime"] = new_seed_start + offset
        if new_seed_end is not None:
            if original_seed_end and row.end_datetime:
                end_offset = row.end_datetime - original_seed_end
                row_payload["end_datetime"] = new_seed_end + end_offset
            else:
                row_payload["end_datetime"] = new_seed_end

        next_start = row_payload.get("start_datetime", row.start_datetime)
        next_end = row_payload.get("end_datetime", row.end_datetime)
        target_day = _validate_schedule_window(db, row.batch_id, next_start, next_end)
        _assert_global_one_per_day(db, row.batch_id, target_day, exclude_schedule_ids=exclude_ids)
        _apply_schedule_update(row, row_payload)
        updated += 1

    db.commit()
    return {"updated": updated}


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


@router.delete("/{schedule_id}/series")
def delete_schedule_series(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    seed = db.query(ProgramSchedule).filter(ProgramSchedule.schedule_id == schedule_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    if not seed.repeat_group_id:
        raise HTTPException(status_code=400, detail="반복 일정 그룹이 아닙니다.")

    rows = (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.batch_id == seed.batch_id,
            ProgramSchedule.repeat_group_id == seed.repeat_group_id,
        )
        .all()
    )
    deleted = 0
    for row in rows:
        db.delete(row)
        deleted += 1
    db.commit()
    return {"deleted": deleted}


