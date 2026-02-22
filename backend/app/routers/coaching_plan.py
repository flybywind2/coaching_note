"""코칭 계획/실적 집계 API 라우터입니다."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.batch import Batch
from app.models.coaching_plan import CoachActualOverride, CoachDailyPlan
from app.models.project import Project
from app.models.schedule import ProgramSchedule
from app.models.session import AttendanceLog, CoachingSession
from app.models.user import User
from app.utils.permissions import INTERNAL_COACH_ROLES, can_access_coaching_plan, is_internal_coach
from app.schemas.coaching_plan import (
    CoachingActualOverrideUpsert,
    CoachingPlanGridOut,
    CoachingPlanRow,
    CoachingPlanCell,
    CoachingPlanUpsert,
)

router = APIRouter(prefix="/api/coaching-plan", tags=["coaching_plan"])


def _ensure_admin_or_coach(current_user: User) -> None:
    if not can_access_coaching_plan(current_user):
        raise HTTPException(status_code=403, detail="관리자/코치만 접근 가능합니다.")


def _ensure_admin(current_user: User) -> None:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="실적 보정은 관리자만 가능합니다.")


def _resolve_grid_coach_filter(coach_user_id: int | None) -> int | None:
    if coach_user_id is None:
        return None
    if int(coach_user_id) <= 0:
        raise HTTPException(status_code=400, detail="coach_user_id가 올바르지 않습니다.")
    return int(coach_user_id)


def _resolve_plan_coach_id(current_user: User, coach_user_id: int | None) -> int | None:
    if is_internal_coach(current_user):
        if coach_user_id and coach_user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="코치는 본인 계획만 수정할 수 있습니다.")
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
    if minute % 10 != 0:
        raise HTTPException(status_code=400, detail=f"{field_name}은 10분 단위로 입력하세요.")


def _normalize_dt(value: datetime | None, work_date: date) -> datetime | None:
    if value is None:
        if work_date != date.today():
            return None
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _duration_minutes(check_in_time: datetime | None, check_out_time: datetime | None, work_date: date) -> int:
    if not check_in_time:
        return 0

    start_at = _normalize_dt(check_in_time, work_date)
    end_at = _normalize_dt(check_out_time, work_date)
    if start_at is None or end_at is None:
        return 0

    minutes = int((end_at - start_at).total_seconds() // 60)
    return max(minutes, 0)


def _to_hhmm(value: datetime | None) -> Optional[str]:
    if value is None:
        return None
    local = value.astimezone()
    return f"{local.hour:02d}:{local.minute:02d}"


def _normalize_project_ids(values: Optional[List[int]]) -> List[int]:
    if not values:
        return []
    normalized: List[int] = []
    seen = set()
    for raw in values:
        try:
            project_id = int(raw)
        except (TypeError, ValueError):
            continue
        if project_id <= 0 or project_id in seen:
            continue
        seen.add(project_id)
        normalized.append(project_id)
    return normalized


def _parse_override_payload(raw_reason: Optional[str]) -> Tuple[Optional[str], List[int]]:
    if not raw_reason:
        return None, []

    text = str(raw_reason).strip()
    if not text:
        return None, []

    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return text, []

    if not isinstance(payload, dict):
        return text, []

    if "reason" not in payload and "project_ids" not in payload:
        return text, []

    reason = payload.get("reason")
    clean_reason = str(reason).strip() if isinstance(reason, str) and reason.strip() else None
    project_ids = _normalize_project_ids(payload.get("project_ids"))
    return clean_reason, project_ids


def _build_override_payload(reason: Optional[str], project_ids: List[int]) -> Optional[str]:
    clean_reason = reason.strip() if isinstance(reason, str) and reason.strip() else None
    normalized_project_ids = _normalize_project_ids(project_ids)
    if not normalized_project_ids:
        return clean_reason
    return json.dumps(
        {"reason": clean_reason, "project_ids": normalized_project_ids},
        ensure_ascii=False,
    )


def _resolve_schedule_scope(schedule: ProgramSchedule) -> str:
    raw = str(getattr(schedule, "visibility_scope", "") or "").strip().lower()
    if raw in ("global", "coaching"):
        return raw
    if str(schedule.schedule_type or "").strip().lower() == "coaching":
        return "coaching"
    return "global"


@router.get("/grid", response_model=CoachingPlanGridOut)
def get_coaching_plan_grid(
    batch_id: int = Query(...),
    start: date | None = Query(None),
    end: date | None = Query(None),
    coach_user_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin_or_coach(current_user)
    target_coach_user_id = _resolve_grid_coach_filter(coach_user_id)

    batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")

    query_start = start or batch.start_date
    query_end = end or batch.end_date
    if query_end < query_start:
        raise HTTPException(status_code=400, detail="기간이 올바르지 않습니다.")
    if (query_end - query_start).days > 550:
        raise HTTPException(status_code=400, detail="조회 기간이 너무 깁니다.")

    coach_q = db.query(User).filter(User.is_active == True, User.role.in_(["admin", *INTERNAL_COACH_ROLES]))  # noqa: E712
    if target_coach_user_id:
        coach_q = coach_q.filter(User.user_id == target_coach_user_id)
    coaches = coach_q.order_by(User.name.asc()).all()
    if is_internal_coach(current_user):
        coaches = sorted(
            coaches,
            key=lambda row: (0 if row.user_id == current_user.user_id else 1, row.name or "", row.emp_id or ""),
        )
    coach_ids = [c.user_id for c in coaches]

    dates: List[date] = []
    current_day = query_start
    while current_day <= query_end:
        dates.append(current_day)
        current_day += timedelta(days=1)

    if not coaches:
        return CoachingPlanGridOut(
            batch_id=batch_id,
            start=query_start,
            end=query_end,
            dates=dates,
            global_schedule_dates=[],
            coaching_schedule_dates=[],
            rows=[],
        )

    project_map = {
        row.project_id: row.project_name
        for row in db.query(Project).filter(Project.batch_id == batch_id).all()
    }

    plans = (
        db.query(CoachDailyPlan)
        .filter(
            CoachDailyPlan.batch_id == batch_id,
            CoachDailyPlan.coach_user_id.in_(coach_ids),
            CoachDailyPlan.plan_date >= query_start,
            CoachDailyPlan.plan_date <= query_end,
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
            CoachActualOverride.work_date >= query_start,
            CoachActualOverride.work_date <= query_end,
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
            CoachingSession.session_date >= query_start,
            CoachingSession.session_date <= query_end,
            AttendanceLog.user_id.in_(coach_ids),
        )
        .all()
    )

    auto_map: Dict[Tuple[int, date], Dict[str, datetime | int | None]] = {}
    for row in attendance_rows:
        key = (row.user_id, row.session_date)
        if key not in auto_map:
            auto_map[key] = {"minutes": 0, "actual_start": None, "actual_end": None}
        start_at = _normalize_dt(row.check_in_time, row.session_date)
        end_at = _normalize_dt(row.check_out_time, row.session_date)
        if start_at and (auto_map[key]["actual_start"] is None or start_at < auto_map[key]["actual_start"]):
            auto_map[key]["actual_start"] = start_at
        if end_at and (auto_map[key]["actual_end"] is None or end_at > auto_map[key]["actual_end"]):
            auto_map[key]["actual_end"] = end_at
        auto_map[key]["minutes"] += _duration_minutes(row.check_in_time, row.check_out_time, row.session_date)

    schedule_rows = (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.batch_id == batch_id,
            ProgramSchedule.start_datetime >= datetime.combine(query_start, datetime.min.time()),
            ProgramSchedule.start_datetime <= datetime.combine(query_end, datetime.max.time()),
        )
        .all()
    )
    global_schedule_dates = sorted({
        row.start_datetime.date()
        for row in schedule_rows
        if _resolve_schedule_scope(row) == "global"
    })
    coaching_schedule_dates = sorted({
        row.start_datetime.date()
        for row in schedule_rows
        if _resolve_schedule_scope(row) == "coaching"
    })

    result_rows: List[CoachingPlanRow] = []
    for coach in coaches:
        cells: List[CoachingPlanCell] = []
        for day in dates:
            plan = plan_map.get((coach.user_id, day))
            override = override_map.get((coach.user_id, day))
            auto = auto_map.get((coach.user_id, day), {"minutes": 0, "actual_start": None, "actual_end": None})
            auto_minutes = int(auto["minutes"])
            actual_start = auto.get("actual_start")
            actual_end = auto.get("actual_end")

            if override:
                final_minutes = int(override.actual_minutes or 0)
                source = "override"
            elif auto_minutes > 0:
                final_minutes = auto_minutes
                source = "auto"
            else:
                final_minutes = 0
                source = "none"

            override_reason, override_project_ids = _parse_override_payload(override.reason if override else None)
            override_project_names = [project_map[pid] for pid in override_project_ids if pid in project_map]

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
                    is_all_day=bool(plan.is_all_day) if plan else True,
                    start_time=plan.start_time if plan else None,
                    end_time=plan.end_time if plan else None,
                    plan_note=plan.plan_note if plan else None,
                    plan_updated_at=plan_updated_at,
                    entered_previous_day=entered_previous_day,
                    auto_minutes=auto_minutes,
                    override_minutes=override.actual_minutes if override else None,
                    final_minutes=final_minutes,
                    actual_source=source,
                    override_reason=override_reason,
                    actual_project_ids=override_project_ids,
                    actual_project_names=override_project_names,
                    actual_start_time=_to_hhmm(actual_start),
                    actual_end_time=_to_hhmm(actual_end),
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
        start=query_start,
        end=query_end,
        dates=dates,
        global_schedule_dates=global_schedule_dates,
        coaching_schedule_dates=coaching_schedule_dates,
        rows=result_rows,
    )


@router.put("/plan")
def upsert_coaching_plan(
    data: CoachingPlanUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin_or_coach(current_user)
    target_coach_user_id = _resolve_plan_coach_id(current_user, data.coach_user_id)
    if target_coach_user_id is None:
        raise HTTPException(status_code=400, detail="coach_user_id가 필요합니다.")

    coach_user = db.query(User).filter(User.user_id == target_coach_user_id, User.is_active == True).first()  # noqa: E712
    if not coach_user or coach_user.role not in ("admin", *INTERNAL_COACH_ROLES):
        raise HTTPException(status_code=404, detail="코치 사용자를 찾을 수 없습니다.")

    _validate_hhmm(data.start_time, "start_time")
    _validate_hhmm(data.end_time, "end_time")
    if not data.is_all_day and (not data.start_time or not data.end_time):
        raise HTTPException(status_code=400, detail="종일이 아닌 경우 시작/종료 시간을 입력하세요.")
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

    # 계획에서는 과제 직접 선택을 사용하지 않음
    row.planned_project_id = None
    row.is_all_day = data.is_all_day
    row.start_time = None if data.is_all_day else data.start_time
    row.end_time = None if data.is_all_day else data.end_time
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
    target_coach_user_id = _resolve_plan_coach_id(current_user, coach_user_id)
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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    target_coach_user_id = data.coach_user_id
    if target_coach_user_id is None:
        raise HTTPException(status_code=400, detail="coach_user_id가 필요합니다.")

    project_ids = _normalize_project_ids(data.actual_project_ids)
    if project_ids:
        valid_ids = {
            project_id
            for (project_id,) in db.query(Project.project_id)
            .filter(Project.batch_id == data.batch_id, Project.project_id.in_(project_ids))
            .all()
        }
        invalid_ids = [pid for pid in project_ids if pid not in valid_ids]
        if invalid_ids:
            raise HTTPException(status_code=400, detail="유효하지 않은 과제가 포함되어 있습니다.")

    reason_payload = _build_override_payload(data.reason, project_ids)

    row = (
        db.query(CoachActualOverride)
        .filter(
            CoachActualOverride.batch_id == data.batch_id,
            CoachActualOverride.coach_user_id == target_coach_user_id,
            CoachActualOverride.work_date == data.work_date,
        )
        .first()
    )
    if not row:
        row = CoachActualOverride(
            batch_id=data.batch_id,
            coach_user_id=target_coach_user_id,
            work_date=data.work_date,
            actual_minutes=data.actual_minutes,
            reason=reason_payload,
            updated_by=current_user.user_id,
        )
        db.add(row)
    else:
        row.actual_minutes = data.actual_minutes
        row.reason = reason_payload
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
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    target_coach_user_id = coach_user_id
    if target_coach_user_id is None:
        raise HTTPException(status_code=400, detail="coach_user_id가 필요합니다.")

    row = (
        db.query(CoachActualOverride)
        .filter(
            CoachActualOverride.batch_id == batch_id,
            CoachActualOverride.coach_user_id == target_coach_user_id,
            CoachActualOverride.work_date == work_date,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="삭제할 보정 실적이 없습니다.")

    db.delete(row)
    db.commit()
    return {"message": "실적 보정이 삭제되었습니다."}
