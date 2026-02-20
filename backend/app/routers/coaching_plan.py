"""코칭 계획/실적 집계 API 라우터입니다."""

from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.batch import Batch
from app.models.coaching_plan import CoachActualOverride, CoachDailyPlan
from app.models.project import Project
from app.models.session import AttendanceLog, CoachingSession
from app.models.user import User
from app.schemas.coaching_plan import (
    CoachingActualOverrideUpsert,
    CoachingPlanGridOut,
    CoachingPlanRow,
    CoachingPlanCell,
    CoachingPlanUpsert,
)

router = APIRouter(prefix="/api/coaching-plan", tags=["coaching_plan"])


def _ensure_admin_or_coach(current_user: User) -> None:
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="관리자/코치만 접근 가능합니다.")


def _resolve_coach_id(current_user: User, coach_user_id: int | None) -> int | None:
    if current_user.role == "coach":
        if coach_user_id and coach_user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="코치는 본인 계획만 조회/수정할 수 있습니다.")
        return current_user.user_id
    return coach_user_id


def _validate_hhmm(text: str | None, field_name: str) -> None:
    if text is None:
        return
    if len(text) != 5 or text[2] != ":":
        raise HTTPException(status_code=400, detail=f"{field_name} 형식이 올바르지 않습니다. (HH:MM)")
    hh, mm = text.split(":")
    if not (hh.isdigit() and mm.isdigit()):
        raise HTTPException(status_code=400, detail=f"{field_name} 형식이 올바르지 않습니다. (HH:MM)")
    hour = int(hh)
    minute = int(mm)
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=400, detail=f"{field_name} 값이 유효하지 않습니다.")


def _duration_minutes(check_in_time: datetime | None, check_out_time: datetime | None, work_date: date) -> int:
    if not check_in_time:
        return 0

    start_at = check_in_time
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    end_at = check_out_time
    if end_at is None:
        if work_date != date.today():
            return 0
        end_at = datetime.now(timezone.utc)
    elif end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=timezone.utc)

    minutes = int((end_at - start_at).total_seconds() // 60)
    return max(minutes, 0)


@router.get("/grid", response_model=CoachingPlanGridOut)
def get_coaching_plan_grid(
    batch_id: int = Query(...),
    start: date = Query(...),
    end: date = Query(...),
    coach_user_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin_or_coach(current_user)
    target_coach_user_id = _resolve_coach_id(current_user, coach_user_id)

    if end < start:
        raise HTTPException(status_code=400, detail="기간이 올바르지 않습니다.")
    if (end - start).days > 31:
        raise HTTPException(status_code=400, detail="조회 기간은 최대 32일입니다.")

    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")

    coach_q = db.query(User).filter(User.is_active == True, User.role.in_(["admin", "coach"]))  # noqa: E712
    if target_coach_user_id:
        coach_q = coach_q.filter(User.user_id == target_coach_user_id)
    coaches = coach_q.order_by(User.name.asc()).all()
    coach_ids = [c.user_id for c in coaches]

    dates: List[date] = []
    current_day = start
    while current_day <= end:
        dates.append(current_day)
        current_day += timedelta(days=1)

    if not coaches:
        return CoachingPlanGridOut(batch_id=batch_id, start=start, end=end, dates=dates, rows=[])

    project_map = {
        row.project_id: row.project_name
        for row in db.query(Project).filter(Project.batch_id == batch_id).all()
    }

    plans = (
        db.query(CoachDailyPlan)
        .filter(
            CoachDailyPlan.batch_id == batch_id,
            CoachDailyPlan.coach_user_id.in_(coach_ids),
            CoachDailyPlan.plan_date >= start,
            CoachDailyPlan.plan_date <= end,
        )
        .all()
    )
    plan_map: Dict[Tuple[int, date], CoachDailyPlan] = {
        (plan.coach_user_id, plan.plan_date): plan
        for plan in plans
    }

    overrides = (
        db.query(CoachActualOverride)
        .filter(
            CoachActualOverride.batch_id == batch_id,
            CoachActualOverride.coach_user_id.in_(coach_ids),
            CoachActualOverride.work_date >= start,
            CoachActualOverride.work_date <= end,
        )
        .all()
    )
    override_map: Dict[Tuple[int, date], CoachActualOverride] = {
        (row.coach_user_id, row.work_date): row
        for row in overrides
    }

    attendance_rows = (
        db.query(
            CoachingSession.session_date,
            AttendanceLog.user_id,
            AttendanceLog.check_in_time,
            AttendanceLog.check_out_time,
        )
        .join(CoachingSession, AttendanceLog.session_id == CoachingSession.session_id)
        .filter(
            CoachingSession.batch_id == batch_id,
            CoachingSession.session_date >= start,
            CoachingSession.session_date <= end,
            AttendanceLog.user_id.in_(coach_ids),
        )
        .all()
    )

    auto_map: Dict[Tuple[int, date], Dict[str, int]] = {}
    for row in attendance_rows:
        key = (row.user_id, row.session_date)
        if key not in auto_map:
            auto_map[key] = {"minutes": 0, "log_count": 0}
        auto_map[key]["minutes"] += _duration_minutes(row.check_in_time, row.check_out_time, row.session_date)
        auto_map[key]["log_count"] += 1

    result_rows: List[CoachingPlanRow] = []
    for coach in coaches:
        cells: List[CoachingPlanCell] = []
        for day in dates:
            plan = plan_map.get((coach.user_id, day))
            override = override_map.get((coach.user_id, day))
            auto = auto_map.get((coach.user_id, day), {"minutes": 0, "log_count": 0})
            auto_minutes = int(auto["minutes"])
            log_count = int(auto["log_count"])

            if override:
                final_minutes = int(override.actual_minutes or 0)
                source = "override"
            elif auto_minutes > 0:
                final_minutes = auto_minutes
                source = "auto"
            else:
                final_minutes = 0
                source = "none"

            entered_previous_day = False
            plan_updated_at = None
            if plan:
                stamp = plan.updated_at or plan.created_at
                if stamp:
                    entered_previous_day = stamp.date() <= (day - timedelta(days=1))
                    plan_updated_at = stamp.isoformat()

            cells.append(
                CoachingPlanCell(
                    date=day,
                    plan_id=plan.plan_id if plan else None,
                    planned_project_id=plan.planned_project_id if plan else None,
                    project_name=project_map.get(plan.planned_project_id) if plan and plan.planned_project_id else None,
                    start_time=plan.start_time if plan else None,
                    end_time=plan.end_time if plan else None,
                    plan_note=plan.plan_note if plan else None,
                    plan_updated_at=plan_updated_at,
                    entered_previous_day=entered_previous_day,
                    auto_minutes=auto_minutes,
                    override_minutes=override.actual_minutes if override else None,
                    final_minutes=final_minutes,
                    log_count=log_count,
                    actual_source=source,
                    override_reason=override.reason if override else None,
                )
            )

        result_rows.append(
            CoachingPlanRow(
                coach_user_id=coach.user_id,
                coach_emp_id=coach.emp_id,
                coach_name=coach.name,
                department=coach.department,
                cells=cells,
            )
        )

    return CoachingPlanGridOut(
        batch_id=batch_id,
        start=start,
        end=end,
        dates=dates,
        rows=result_rows,
    )


@router.put("/plan")
def upsert_coaching_plan(
    data: CoachingPlanUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin_or_coach(current_user)
    target_coach_user_id = _resolve_coach_id(current_user, data.coach_user_id)
    if target_coach_user_id is None:
        raise HTTPException(status_code=400, detail="coach_user_id가 필요합니다.")

    coach_user = db.query(User).filter(User.user_id == target_coach_user_id, User.is_active == True).first()  # noqa: E712
    if not coach_user or coach_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=404, detail="코치 사용자를 찾을 수 없습니다.")

    _validate_hhmm(data.start_time, "start_time")
    _validate_hhmm(data.end_time, "end_time")
    if data.start_time and data.end_time and data.start_time > data.end_time:
        raise HTTPException(status_code=400, detail="종료 시간은 시작 시간보다 빠를 수 없습니다.")

    row = (
        db.query(CoachDailyPlan)
        .filter(
            CoachDailyPlan.batch_id == data.batch_id,
            CoachDailyPlan.coach_user_id == target_coach_user_id,
            CoachDailyPlan.plan_date == data.plan_date,
        )
        .first()
    )
    if not row:
        row = CoachDailyPlan(
            batch_id=data.batch_id,
            coach_user_id=target_coach_user_id,
            plan_date=data.plan_date,
            created_by=current_user.user_id,
        )
        db.add(row)

    row.planned_project_id = data.planned_project_id
    row.start_time = data.start_time
    row.end_time = data.end_time
    row.plan_note = data.plan_note
    row.updated_by = current_user.user_id

    db.commit()
    db.refresh(row)
    return {"plan_id": row.plan_id, "message": "계획이 저장되었습니다."}


@router.delete("/plan")
def delete_coaching_plan(
    batch_id: int = Query(...),
    coach_user_id: int = Query(...),
    plan_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin_or_coach(current_user)
    target_coach_user_id = _resolve_coach_id(current_user, coach_user_id)
    if target_coach_user_id is None:
        raise HTTPException(status_code=400, detail="coach_user_id가 필요합니다.")

    row = (
        db.query(CoachDailyPlan)
        .filter(
            CoachDailyPlan.batch_id == batch_id,
            CoachDailyPlan.coach_user_id == target_coach_user_id,
            CoachDailyPlan.plan_date == plan_date,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="삭제할 계획이 없습니다.")

    db.delete(row)
    db.commit()
    return {"message": "계획이 삭제되었습니다."}


@router.put("/actual-override")
def upsert_actual_override(
    data: CoachingActualOverrideUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    row = (
        db.query(CoachActualOverride)
        .filter(
            CoachActualOverride.batch_id == data.batch_id,
            CoachActualOverride.coach_user_id == data.coach_user_id,
            CoachActualOverride.work_date == data.work_date,
        )
        .first()
    )
    if not row:
        row = CoachActualOverride(
            batch_id=data.batch_id,
            coach_user_id=data.coach_user_id,
            work_date=data.work_date,
            actual_minutes=data.actual_minutes,
            reason=data.reason,
            updated_by=current_user.user_id,
        )
        db.add(row)
    else:
        row.actual_minutes = data.actual_minutes
        row.reason = data.reason
        row.updated_by = current_user.user_id

    db.commit()
    db.refresh(row)
    return {"override_id": row.override_id, "message": "실적 보정이 저장되었습니다."}


@router.delete("/actual-override")
def delete_actual_override(
    batch_id: int = Query(...),
    coach_user_id: int = Query(...),
    work_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    row = (
        db.query(CoachActualOverride)
        .filter(
            CoachActualOverride.batch_id == batch_id,
            CoachActualOverride.coach_user_id == coach_user_id,
            CoachActualOverride.work_date == work_date,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="삭제할 보정 실적이 없습니다.")

    db.delete(row)
    db.commit()
    return {"message": "실적 보정이 삭제되었습니다."}

