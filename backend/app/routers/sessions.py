from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas.session import (
    CoachingSessionCreate, CoachingSessionUpdate, CoachingSessionOut,
    SessionAttendeeCreate, SessionAttendeeOut,
    AttendanceLogOut, CoachingTimeLogOut,
)
from app.models.session import CoachingSession, SessionAttendee
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User
from app.services import attendance_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


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
    current_user: User = Depends(require_roles("admin")),
):
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


@router.put("/{session_id}", response_model=CoachingSessionOut)
def update_session(
    session_id: int,
    data: CoachingSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="관리자/코치만 수정 가능합니다.")
    s = db.query(CoachingSession).filter(CoachingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
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
