from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.models.schedule import ProgramSchedule
from app.models.session import CoachingSession
from app.models.task import ProjectTask
from app.models.project import Project
from app.utils.permissions import is_admin_or_coach

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

EVENT_COLORS = {
    "program": "#4CAF50",
    "session": "#2196F3",
    "milestone": "#9C27B0",
    "task": "#9C27B0",
}


@router.get("")
def get_calendar(
    batch_id: int,
    start: date = Query(...),
    end: date = Query(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = []
    project_map = {
        p.project_id: p.project_name
        for p in db.query(Project).filter(Project.batch_id == batch_id).all()
    }

    # 1. Program schedules
    schedules = (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.batch_id == batch_id,
            ProgramSchedule.start_datetime >= datetime.combine(start, datetime.min.time()),
            ProgramSchedule.start_datetime <= datetime.combine(end, datetime.max.time()),
        )
        .all()
    )
    for s in schedules:
        events.append({
            "event_type": "program",
            "id": s.schedule_id,
            "title": s.title,
            "start": s.start_datetime.isoformat(),
            "end": s.end_datetime.isoformat() if s.end_datetime else None,
            "color": EVENT_COLORS["program"],
            "location": s.location,
            "schedule_type": s.schedule_type,
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
    if not is_admin_or_coach(current_user):
        from app.models.project import ProjectMember
        member_project_ids = [
            m.project_id for m in db.query(ProjectMember).filter(
                ProjectMember.user_id == current_user.user_id
            ).all()
        ]
        sessions_q = sessions_q.filter(CoachingSession.project_id.in_(member_project_ids))

    for s in sessions_q.all():
        project_name = project_map.get(s.project_id, f"프로젝트 {s.project_id}")
        events.append({
            "event_type": "session",
            "id": s.session_id,
            "title": f"[{project_name}] 코칭 세션",
            "start": f"{s.session_date}T{s.start_time}",
            "end": f"{s.session_date}T{s.end_time}",
            "color": EVENT_COLORS["session"],
            "location": s.location,
            "session_status": s.session_status,
            "project_id": s.project_id,
            "project_name": project_name,
        })

    # 3. Milestones / tasks with due dates
    tasks_q = (
        db.query(ProjectTask)
        .join(ProjectTask.project)
        .filter(
            ProjectTask.project.has(batch_id=batch_id),
            ProjectTask.due_date >= start,
            ProjectTask.due_date <= end,
            ProjectTask.is_milestone == True,
        )
    )
    if project_id:
        tasks_q = tasks_q.filter(ProjectTask.project_id == project_id)

    if not is_admin_or_coach(current_user):
        from app.models.project import ProjectMember
        member_project_ids = [
            m.project_id for m in db.query(ProjectMember).filter(
                ProjectMember.user_id == current_user.user_id
            ).all()
        ]
        tasks_q = tasks_q.filter(ProjectTask.project_id.in_(member_project_ids))

    for t in tasks_q.all():
        project_name = project_map.get(t.project_id, f"프로젝트 {t.project_id}")
        events.append({
            "event_type": "milestone",
            "id": t.task_id,
            "title": f"[{project_name}] {t.title}",
            "start": t.due_date.isoformat(),
            "end": t.due_date.isoformat(),
            "color": EVENT_COLORS["milestone"],
            "status": t.status,
            "project_id": t.project_id,
            "project_name": project_name,
            "milestone_order": t.milestone_order,
        })

    events.sort(key=lambda e: e["start"])
    return {"events": events, "count": len(events)}
