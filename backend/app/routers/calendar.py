"""Calendar 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
from datetime import date, datetime, timezone
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.models.coaching_plan import CoachActualOverride, CoachDailyPlan
from app.models.lecture import Lecture
from app.models.schedule import ProgramSchedule
from app.models.session import AttendanceLog, CoachingSession, SessionAttendee
from app.models.project import Project
from app.utils.permissions import (
    INTERNAL_COACH_ROLES,
    can_access_calendar,
    can_view_project,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

EVENT_COLORS = {
    "program": "#4CAF50",
    "coaching_schedule": "#00ACC1",
    "session": "#2196F3",
    "lecture": "#8E24AA",
}


def _normalize_schedule_scope(schedule: ProgramSchedule) -> str:
    raw = str(getattr(schedule, "visibility_scope", "") or "").strip().lower()
    if raw in ("global", "coaching"):
        return raw
    if str(schedule.schedule_type or "").strip().lower() == "coaching":
        return "coaching"
    return "global"


def _normalize_dt(value: datetime | None, session_date: date) -> datetime | None:
    if value is None:
        if session_date != date.today():
            return None
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _duration_minutes(check_in_time: datetime | None, check_out_time: datetime | None, session_date: date) -> int:
    if not check_in_time:
        return 0
    start_at = _normalize_dt(check_in_time, session_date)
    end_at = _normalize_dt(check_out_time, session_date)
    if start_at is None or end_at is None:
        return 0
    minutes = int((end_at - start_at).total_seconds() // 60)
    return max(minutes, 0)


@router.get("")
def get_calendar(
    batch_id: int,
    start: date = Query(...),
    end: date = Query(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not can_access_calendar(current_user):
        raise HTTPException(status_code=403, detail="캘린더 접근 권한이 없습니다.")

    events = []
    project_rows = db.query(Project).filter(Project.batch_id == batch_id).all()
    project_map = {p.project_id: p.project_name for p in project_rows}
    observer_visible_project_ids: set[int] = set()
    if current_user.role == "observer":
        observer_visible_project_ids = {
            int(p.project_id)
            for p in project_rows
            if can_view_project(db, p, current_user)
        }

    # 1. Program schedules
    raw_schedules = (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.batch_id == batch_id,
            ProgramSchedule.start_datetime >= datetime.combine(start, datetime.min.time()),
            ProgramSchedule.start_datetime <= datetime.combine(end, datetime.max.time()),
        )
        .order_by(ProgramSchedule.start_datetime.asc())
        .all()
    )
    schedules = []
    for row in raw_schedules:
        scope = _normalize_schedule_scope(row)
        if scope == "coaching" and current_user.role == "participant":
            continue
        schedules.append(row)

    schedule_date_set = {row.start_datetime.date() for row in schedules}
    coach_plan_map = {}
    coach_actual_map = {}
    if schedule_date_set:
        coach_plan_rows = (
            db.query(
                CoachDailyPlan.plan_date,
                CoachDailyPlan.start_time,
                CoachDailyPlan.end_time,
                CoachDailyPlan.is_all_day,
                User.user_id,
                User.name,
            )
            .join(User, CoachDailyPlan.coach_user_id == User.user_id)
            .filter(
                CoachDailyPlan.batch_id == batch_id,
                CoachDailyPlan.plan_date.in_(schedule_date_set),
                User.is_active == True,  # noqa: E712
                User.role.in_(["admin", *INTERNAL_COACH_ROLES]),
            )
            .order_by(CoachDailyPlan.plan_date.asc(), User.name.asc())
            .all()
        )
        for row in coach_plan_rows:
            coach_plan_map.setdefault(row.plan_date, []).append({
                "coach_user_id": row.user_id,
                "coach_name": row.name,
                "is_all_day": bool(row.is_all_day),
                "start_time": row.start_time,
                "end_time": row.end_time,
            })

        coaches = (
            db.query(User.user_id, User.name)
            .filter(
                User.is_active == True,  # noqa: E712
                User.role.in_(["admin", *INTERNAL_COACH_ROLES]),
            )
            .all()
        )
        coach_name_map = {int(row.user_id): row.name for row in coaches}
        coach_ids = [int(row.user_id) for row in coaches]

        auto_map: Dict[Tuple[int, date], int] = {}
        if coach_ids:
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
                    CoachingSession.session_date.in_(schedule_date_set),
                    AttendanceLog.user_id.in_(coach_ids),
                )
                .all()
            )
            for row in attendance_rows:
                key = (int(row.user_id), row.session_date)
                auto_map[key] = int(auto_map.get(key, 0)) + _duration_minutes(
                    row.check_in_time,
                    row.check_out_time,
                    row.session_date,
                )

        override_map: Dict[Tuple[int, date], int] = {}
        if coach_ids:
            override_rows = (
                db.query(
                    CoachActualOverride.coach_user_id,
                    CoachActualOverride.work_date,
                    CoachActualOverride.actual_minutes,
                )
                .filter(
                    CoachActualOverride.batch_id == batch_id,
                    CoachActualOverride.work_date.in_(schedule_date_set),
                    CoachActualOverride.coach_user_id.in_(coach_ids),
                )
                .all()
            )
            for row in override_rows:
                override_map[(int(row.coach_user_id), row.work_date)] = int(row.actual_minutes or 0)

        touched_keys = set(auto_map.keys()) | set(override_map.keys())
        for coach_id, work_date in sorted(touched_keys, key=lambda k: (k[1], coach_name_map.get(k[0], ""))):
            override_minutes = override_map.get((coach_id, work_date))
            auto_minutes = int(auto_map.get((coach_id, work_date), 0))
            if override_minutes is not None:
                final_minutes = int(override_minutes)
                source = "override"
            elif auto_minutes > 0:
                final_minutes = auto_minutes
                source = "auto"
            else:
                continue
            coach_actual_map.setdefault(work_date, []).append({
                "coach_user_id": coach_id,
                "coach_name": coach_name_map.get(coach_id, f"코치#{coach_id}"),
                "final_minutes": final_minutes,
                "actual_source": source,
            })

    for s in schedules:
        scope = _normalize_schedule_scope(s)
        coach_plans = coach_plan_map.get(s.start_datetime.date(), [])
        coach_actuals = coach_actual_map.get(s.start_datetime.date(), [])
        color = s.color or (EVENT_COLORS["coaching_schedule"] if scope == "coaching" else EVENT_COLORS["program"])
        events.append({
            "event_type": "coaching_schedule" if scope == "coaching" else "program",
            "id": s.schedule_id,
            "title": s.title,
            "start": s.start_datetime.isoformat(),
            "end": s.end_datetime.isoformat() if s.end_datetime else None,
            "color": color,
            "location": s.location,
            "schedule_type": s.schedule_type,
            "description": s.description,
            "is_all_day": bool(s.is_all_day),
            "repeat_group_id": s.repeat_group_id,
            "repeat_sequence": s.repeat_sequence,
            "coach_plans": coach_plans,
            "coach_actuals": coach_actuals,
            "manage_type": "schedule",
            "scope": scope,
        })

    # 1.5. Lecture schedules
    lecture_rows = (
        db.query(Lecture)
        .filter(
            Lecture.batch_id == batch_id,
            Lecture.start_datetime >= datetime.combine(start, datetime.min.time()),
            Lecture.start_datetime <= datetime.combine(end, datetime.max.time()),
        )
        .order_by(Lecture.start_datetime.asc(), Lecture.lecture_id.asc())
        .all()
    )
    for lecture in lecture_rows:
        if not lecture.is_visible and current_user.role != "admin":
            continue
        events.append({
            "event_type": "lecture",
            "id": int(lecture.lecture_id),
            "title": lecture.title,
            "start": lecture.start_datetime.isoformat(),
            "end": lecture.end_datetime.isoformat() if lecture.end_datetime else None,
            "color": EVENT_COLORS["lecture"],
            "location": lecture.location,
            "description": lecture.summary or lecture.description,
            "is_all_day": False,
            "manage_type": "lecture",
            "scope": "lecture",
            "link_url": f"#/course-registration?batch_id={lecture.batch_id}&lecture_id={lecture.lecture_id}",
        })

    # 2. Coaching sessions
    sessions_q = db.query(CoachingSession).filter(
        CoachingSession.batch_id == batch_id,
        CoachingSession.session_date >= start,
        CoachingSession.session_date <= end,
    )
    if project_id:
        sessions_q = sessions_q.filter(CoachingSession.project_id == project_id)

    # participant: only their project's sessions
    if current_user.role == "participant":
        from app.models.project import ProjectMember
        member_project_ids = [
            m.project_id for m in db.query(ProjectMember).filter(
                ProjectMember.user_id == current_user.user_id
            ).all()
        ]
        sessions_q = sessions_q.filter(CoachingSession.project_id.in_(member_project_ids))
    elif current_user.role == "observer":
        if observer_visible_project_ids:
            sessions_q = sessions_q.filter(CoachingSession.project_id.in_(observer_visible_project_ids))
        else:
            sessions_q = sessions_q.filter(CoachingSession.project_id.in_([-1]))

    sessions = sessions_q.all()
    coach_map = {}
    if sessions:
        session_ids = [s.session_id for s in sessions]
        coach_rows = (
            db.query(SessionAttendee.session_id, User.name)
            .join(User, SessionAttendee.user_id == User.user_id)
            .filter(
                SessionAttendee.session_id.in_(session_ids),
                SessionAttendee.attendee_role == "coach",
            )
            .all()
        )
        for session_id, coach_name in coach_rows:
            coach_map.setdefault(session_id, []).append(coach_name)

    for s in sessions:
        project_name = project_map.get(s.project_id, f"프로젝트 {s.project_id}")
        event_title = s.note.strip() if s.note else "코칭 세션"
        coach_names = coach_map.get(s.session_id, [])
        events.append({
            "event_type": "session",
            "id": s.session_id,
            "title": f"[{project_name}] {event_title}",
            "start": f"{s.session_date}T{s.start_time}",
            "end": f"{s.session_date}T{s.end_time}",
            "color": EVENT_COLORS["session"],
            "is_all_day": str(s.start_time)[:5] == "00:00" and str(s.end_time)[:5] in ("23:59", "24:00"),
            "location": s.location,
            "session_status": s.session_status,
            "project_id": s.project_id,
            "project_name": project_name,
            "description": s.note,
            "coach_names": coach_names,
            "coach_assigned": len(coach_names) > 0,
            "time_label": f"{s.start_time} ~ {s.end_time}",
            "manage_type": "session",
            "scope": "project",
        })

    events.sort(key=lambda e: e["start"])
    return {"events": events, "count": len(events)}


