"""Sessions 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.schemas.session import (
    CoachingSessionCreate, CoachingSessionUpdate, CoachingSessionOut,
    SessionAttendeeCreate, SessionAttendeeOut,
    AttendanceLogOut, CoachingTimeLogOut, MyAttendanceStatusOut, AutoCheckinResultOut,
)
from app.models.session import CoachingSession, SessionAttendee
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User
from app.services import attendance_service
from app.models.project import Project, ProjectMember
from app.utils.permissions import can_view_project

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _ensure_project_session_manage_permission(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    if current_user.role == "admin":
        return project
    if current_user.role == "coach":
        if not can_view_project(db, project, current_user):
            raise HTTPException(status_code=403, detail="해당 과제 일정을 관리할 권한이 없습니다.")
        return project
    if current_user.role == "participant":
        is_member = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.user_id,
            )
            .first()
            is not None
        )
        if not is_member:
            raise HTTPException(status_code=403, detail="참여자는 본인 과제 일정만 관리할 수 있습니다.")
        return project
    raise HTTPException(status_code=403, detail="일정 관리 권한이 없습니다.")


@router.get("", response_model=List[CoachingSessionOut])
def list_sessions(
    batch_id: Optional[int] = None,
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CoachingSession)
    if batch_id:
        q = q.filter(CoachingSession.batch_id == batch_id)
    if project_id:
        q = q.filter(CoachingSession.project_id == project_id)
    return q.order_by(CoachingSession.session_date.desc()).all()


@router.post("", response_model=CoachingSessionOut)
def create_session(
    data: CoachingSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _ensure_project_session_manage_permission(db, data.project_id, current_user)
    if project.batch_id != data.batch_id:
        raise HTTPException(status_code=400, detail="과제와 차수가 일치하지 않습니다.")
    session = CoachingSession(**data.model_dump(), created_by=current_user.user_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=CoachingSessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(CoachingSession).filter(CoachingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return s


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(CoachingSession).filter(CoachingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    _ensure_project_session_manage_permission(db, session.project_id, current_user)
    db.delete(session)
    db.commit()
    return {"message": "삭제되었습니다."}


@router.put("/{session_id}", response_model=CoachingSessionOut)
def update_session(
    session_id: int,
    data: CoachingSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(CoachingSession).filter(CoachingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    _ensure_project_session_manage_permission(db, s.project_id, current_user)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{session_id}/attendees", response_model=List[SessionAttendeeOut])
def list_attendees(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(SessionAttendee).filter(SessionAttendee.session_id == session_id).all()


@router.post("/{session_id}/attendees", response_model=SessionAttendeeOut)
def add_attendee(
    session_id: int,
    data: SessionAttendeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    attendee = SessionAttendee(session_id=session_id, **data.model_dump())
    db.add(attendee)
    db.commit()
    db.refresh(attendee)
    return attendee


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


@router.post("/{session_id}/checkin", response_model=AttendanceLogOut)
def checkin(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_ip = _get_client_ip(request)
    return attendance_service.check_in(session_id, current_user.user_id, client_ip, db)


@router.post("/{session_id}/checkout", response_model=AttendanceLogOut)
def checkout(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_ip = _get_client_ip(request)
    return attendance_service.check_out(session_id, current_user.user_id, client_ip, db)


@router.get("/{session_id}/my-attendance-status", response_model=MyAttendanceStatusOut)
def get_my_attendance_status(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(CoachingSession).filter(CoachingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    client_ip = _get_client_ip(request)
    return attendance_service.get_my_attendance_status(session_id, current_user.user_id, client_ip, db)


@router.post("/auto-checkin-today", response_model=AutoCheckinResultOut)
def auto_checkin_today(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("coach", "participant"):
        return {"checked_in": 0, "skipped": 0}

    today = date.today()
    q = db.query(CoachingSession).filter(CoachingSession.session_date == today)
    if current_user.role == "participant":
        member_project_ids = [
            row[0]
            for row in db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.user_id)
            .all()
        ]
        if not member_project_ids:
            return {"checked_in": 0, "skipped": 0}
        q = q.filter(CoachingSession.project_id.in_(member_project_ids))
    else:
        attendee_session_ids = [
            row[0]
            for row in db.query(SessionAttendee.session_id)
            .filter(
                SessionAttendee.user_id == current_user.user_id,
                SessionAttendee.attendee_role == "coach",
            )
            .all()
        ]
        if attendee_session_ids:
            q = q.filter(
                or_(
                    CoachingSession.session_id.in_(attendee_session_ids),
                    CoachingSession.created_by == current_user.user_id,
                )
            )
        else:
            q = q.filter(CoachingSession.created_by == current_user.user_id)

    sessions = q.all()
    if not sessions:
        return {"checked_in": 0, "skipped": 0}

    client_ip = _get_client_ip(request)
    if not attendance_service.validate_ip(client_ip, db):
        return {"checked_in": 0, "skipped": len(sessions)}

    checked_in = 0
    skipped = 0
    for s in sessions:
        existing = attendance_service.get_attendance_log(s.session_id, current_user.user_id, db)
        if existing:
            skipped += 1
            continue
        attendance_service.check_in(s.session_id, current_user.user_id, client_ip, db)
        checked_in += 1
    return {"checked_in": checked_in, "skipped": skipped}


@router.get("/{session_id}/attendance", response_model=List[AttendanceLogOut])
def get_attendance(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="관리자/코치만 조회 가능합니다.")
    from app.models.session import AttendanceLog
    return db.query(AttendanceLog).filter(AttendanceLog.session_id == session_id).all()


@router.post("/{session_id}/coaching-start", response_model=CoachingTimeLogOut)
def coaching_start(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="코치/관리자만 가능합니다.")
    return attendance_service.coaching_start(session_id, current_user.user_id, db)


@router.post("/{session_id}/coaching-end", response_model=CoachingTimeLogOut)
def coaching_end(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="코치/관리자만 가능합니다.")
    return attendance_service.coaching_end(session_id, current_user.user_id, db)


@router.get("/{session_id}/coaching-log", response_model=List[CoachingTimeLogOut])
def get_coaching_log(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.session import CoachingTimeLog
    return db.query(CoachingTimeLog).filter(CoachingTimeLog.session_id == session_id).all()


