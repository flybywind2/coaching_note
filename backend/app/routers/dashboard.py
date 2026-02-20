"""Dashboard 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.session import CoachingSession, AttendanceLog, SessionAttendee

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    batch_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="대시보드는 관리자/코치만 접근 가능합니다.")

    projects_q = db.query(Project)
    if batch_id:
        projects_q = projects_q.filter(Project.batch_id == batch_id)
    projects = projects_q.order_by(Project.project_name.asc()).all()
    project_ids = [p.project_id for p in projects]
    project_name_map = {p.project_id: p.project_name for p in projects}

    if not project_ids:
        return {
            "projects": [],
            "project_daily_attendance": [],
            "project_daily_notes": [],
            "coach_activity": [],
        }

    attendance_by_session = {
        row.session_id: row.attended_count
        for row in (
            db.query(
                AttendanceLog.session_id,
                func.count(func.distinct(AttendanceLog.user_id)).label("attended_count"),
            )
            .group_by(AttendanceLog.session_id)
            .all()
        )
    }
    attendee_by_session = {
        row.session_id: row.attendee_count
        for row in (
            db.query(
                SessionAttendee.session_id,
                func.count(func.distinct(SessionAttendee.user_id)).label("attendee_count"),
            )
            .group_by(SessionAttendee.session_id)
            .all()
        )
    }
    member_by_project = {
        row.project_id: row.member_count
        for row in (
            db.query(
                ProjectMember.project_id,
                func.count(func.distinct(ProjectMember.user_id)).label("member_count"),
            )
            .group_by(ProjectMember.project_id)
            .all()
        )
    }
    session_rows = (
        db.query(CoachingSession.session_id, CoachingSession.project_id, CoachingSession.session_date)
        .filter(CoachingSession.project_id.in_(project_ids))
        .all()
    )
    attendance_bucket = defaultdict(lambda: {"attended": 0, "expected": 0})
    for session_id, project_id, session_date in session_rows:
        attended_count = int(attendance_by_session.get(session_id, 0) or 0)
        expected_count = int(attendee_by_session.get(session_id, 0) or 0)
        if expected_count <= 0:
            expected_count = int(member_by_project.get(project_id, 0) or 0)
        if expected_count <= 0:
            expected_count = attended_count
        key = (project_id, session_date)
        attendance_bucket[key]["attended"] += attended_count
        attendance_bucket[key]["expected"] += expected_count

    project_daily_attendance = []
    for (project_id, session_date), value in sorted(
        attendance_bucket.items(),
        key=lambda item: (item[0][1], project_name_map.get(item[0][0], "")),
        reverse=True,
    ):
        expected = value["expected"]
        attended = value["attended"]
        rate = round((attended / expected) * 100, 1) if expected else 0.0
        project_daily_attendance.append(
            {
                "project_id": project_id,
                "project_name": project_name_map.get(project_id, f"프로젝트 {project_id}"),
                "date": session_date,
                "attendance_count": attended,
                "expected_count": expected,
                "attendance_rate": rate,
            }
        )

    note_rows = (
        db.query(
            CoachingNote.project_id,
            CoachingNote.coaching_date,
            func.count(CoachingNote.note_id).label("note_count"),
        )
        .filter(CoachingNote.project_id.in_(project_ids))
        .group_by(CoachingNote.project_id, CoachingNote.coaching_date)
        .all()
    )
    comment_rows = (
        db.query(
            CoachingNote.project_id,
            CoachingNote.coaching_date,
            func.count(func.distinct(CoachingComment.author_id)).label("coach_commenters"),
        )
        .join(CoachingComment, CoachingComment.note_id == CoachingNote.note_id)
        .join(User, User.user_id == CoachingComment.author_id)
        .filter(
            CoachingNote.project_id.in_(project_ids),
            User.role == "coach",
        )
        .group_by(CoachingNote.project_id, CoachingNote.coaching_date)
        .all()
    )
    note_bucket = defaultdict(lambda: {"note_count": 0, "coach_commenter_count": 0})
    for project_id, coaching_date, note_count in note_rows:
        note_bucket[(project_id, coaching_date)]["note_count"] = int(note_count or 0)
    for project_id, coaching_date, coach_commenters in comment_rows:
        note_bucket[(project_id, coaching_date)]["coach_commenter_count"] = int(coach_commenters or 0)

    project_daily_notes = []
    for (project_id, coaching_date), value in sorted(
        note_bucket.items(),
        key=lambda item: (item[0][1], project_name_map.get(item[0][0], "")),
        reverse=True,
    ):
        project_daily_notes.append(
            {
                "project_id": project_id,
                "project_name": project_name_map.get(project_id, f"프로젝트 {project_id}"),
                "date": coaching_date,
                "note_count": value["note_count"],
                "coach_commenter_count": value["coach_commenter_count"],
            }
        )

    coaches = db.query(User).filter(User.role == "coach").order_by(User.name.asc()).all()
    coach_ids = [u.user_id for u in coaches]
    note_by_coach = {
        row.author_id: row.note_count
        for row in (
            db.query(CoachingNote.author_id, func.count(CoachingNote.note_id).label("note_count"))
            .filter(CoachingNote.project_id.in_(project_ids), CoachingNote.author_id.in_(coach_ids))
            .group_by(CoachingNote.author_id)
            .all()
        )
    } if coach_ids else {}
    comment_by_coach = {
        row.author_id: row.comment_count
        for row in (
            db.query(CoachingComment.author_id, func.count(CoachingComment.comment_id).label("comment_count"))
            .join(CoachingNote, CoachingNote.note_id == CoachingComment.note_id)
            .filter(CoachingNote.project_id.in_(project_ids), CoachingComment.author_id.in_(coach_ids))
            .group_by(CoachingComment.author_id)
            .all()
        )
    } if coach_ids else {}

    coach_activity = []
    for coach in coaches:
        notes_created = int(note_by_coach.get(coach.user_id, 0) or 0)
        comments_created = int(comment_by_coach.get(coach.user_id, 0) or 0)
        coach_activity.append(
            {
                "coach_user_id": coach.user_id,
                "coach_name": coach.name,
                "note_count": notes_created,
                "comment_count": comments_created,
            }
        )
    coach_activity.sort(key=lambda row: (row["note_count"] + row["comment_count"], row["coach_name"]), reverse=True)

    return {
        "projects": [
            {
                "project_id": p.project_id,
                "project_name": p.project_name,
                "status": p.status,
                "progress_rate": p.progress_rate,
            }
            for p in projects
        ],
        "project_daily_attendance": project_daily_attendance,
        "project_daily_notes": project_daily_notes,
        "coach_activity": coach_activity,
    }


