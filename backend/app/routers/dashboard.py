from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.coaching_note import CoachingNote
from app.models.session import CoachingSession
from app.models.task import ProjectTask

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    batch_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="대시보드는 관리자/코치만 접근 가능합니다.")

    q = db.query(Project)
    if batch_id:
        q = q.filter(Project.batch_id == batch_id)
    projects = q.all()

    total = len(projects)
    status_counts = {}
    progress_dist = {"0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0}
    for p in projects:
        status_counts[p.status] = status_counts.get(p.status, 0) + 1
        r = p.progress_rate
        if r <= 25:
            progress_dist["0-25"] += 1
        elif r <= 50:
            progress_dist["26-50"] += 1
        elif r <= 75:
            progress_dist["51-75"] += 1
        else:
            progress_dist["76-100"] += 1

    project_ids = [p.project_id for p in projects]

    note_count = db.query(CoachingNote).filter(CoachingNote.project_id.in_(project_ids)).count() if project_ids else 0

    sessions = db.query(CoachingSession).filter(CoachingSession.project_id.in_(project_ids)).all() if project_ids else []
    session_stats = {
        "total": len(sessions),
        "completed": sum(1 for s in sessions if s.session_status == "completed"),
        "scheduled": sum(1 for s in sessions if s.session_status == "scheduled"),
    }

    tasks = db.query(ProjectTask).filter(ProjectTask.project_id.in_(project_ids)).all() if project_ids else []
    task_stats = {
        "total": len(tasks),
        "completed": sum(1 for t in tasks if t.status == "completed"),
        "in_progress": sum(1 for t in tasks if t.status == "in_progress"),
        "todo": sum(1 for t in tasks if t.status == "todo"),
    }

    return {
        "total_projects": total,
        "status_breakdown": status_counts,
        "progress_distribution": progress_dist,
        "coaching_note_count": note_count,
        "session_stats": session_stats,
        "task_stats": task_stats,
        "projects": [
            {"project_id": p.project_id, "project_name": p.project_name,
             "progress_rate": p.progress_rate, "status": p.status}
            for p in projects
        ],
    }
