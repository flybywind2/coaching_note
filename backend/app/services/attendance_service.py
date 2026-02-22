"""Attendance Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import ipaddress
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.session import AttendanceLog, CoachingTimeLog
from app.models.attendance import DailyAttendanceLog
from app.models.allowed_ip import AllowedIPRange
from app.utils.permissions import COACH_ROLES


def validate_ip(client_ip: str, db: Session) -> bool:
    """Check if client_ip is within any active allowed IP range."""
    ranges = db.query(AllowedIPRange).filter(AllowedIPRange.is_active == True).all()
    if not ranges:
        return True  # No restrictions configured — allow all
    try:
        addr = ipaddress.ip_address(client_ip)
        return any(addr in ipaddress.ip_network(r.cidr, strict=False) for r in ranges)
    except ValueError:
        return False


def get_daily_attendance_log(work_date: date, user_id: int, db: Session) -> Optional[DailyAttendanceLog]:
    return (
        db.query(DailyAttendanceLog)
        .filter(
            DailyAttendanceLog.work_date == work_date,
            DailyAttendanceLog.user_id == user_id,
        )
        .first()
    )


def get_my_daily_attendance_status(work_date: date, user_id: int, client_ip: str, db: Session) -> dict:
    ip_allowed = validate_ip(client_ip, db)
    log = get_daily_attendance_log(work_date, user_id, db)
    return {
        "user_id": user_id,
        "work_date": work_date,
        "ip_allowed": ip_allowed,
        "can_checkin": ip_allowed and log is None,
        "can_checkout": ip_allowed and log is not None and log.check_out_time is None,
        "attendance_log": log,
    }


def check_in_today(work_date: date, user_id: int, client_ip: str, db: Session) -> DailyAttendanceLog:
    if not validate_ip(client_ip, db):
        raise HTTPException(status_code=403, detail="허용되지 않은 IP 대역에서의 접근입니다.")

    existing = get_daily_attendance_log(work_date, user_id, db)
    if existing:
        raise HTTPException(status_code=409, detail="이미 오늘 입실 처리되었습니다.")

    log = DailyAttendanceLog(
        user_id=user_id,
        work_date=work_date,
        check_in_time=datetime.now(timezone.utc),
        check_in_ip=client_ip,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def check_out_today(work_date: date, user_id: int, client_ip: str, db: Session) -> DailyAttendanceLog:
    if not validate_ip(client_ip, db):
        raise HTTPException(status_code=403, detail="허용되지 않은 IP 대역에서의 접근입니다.")

    log = get_daily_attendance_log(work_date, user_id, db)
    if not log:
        raise HTTPException(status_code=404, detail="오늘 입실 기록이 없습니다.")
    if log.check_out_time:
        raise HTTPException(status_code=409, detail="이미 오늘 퇴실 처리되었습니다.")

    log.check_out_time = datetime.now(timezone.utc)
    log.check_out_ip = client_ip
    db.commit()
    db.refresh(log)
    return log


def cancel_check_out_today(work_date: date, user_id: int, client_ip: str, db: Session) -> DailyAttendanceLog:
    if not validate_ip(client_ip, db):
        raise HTTPException(status_code=403, detail="허용되지 않은 IP 대역에서의 접근입니다.")

    log = get_daily_attendance_log(work_date, user_id, db)
    if not log:
        raise HTTPException(status_code=404, detail="오늘 입실 기록이 없습니다.")
    if not log.check_out_time:
        raise HTTPException(status_code=409, detail="퇴실 기록이 없어 취소할 수 없습니다.")

    log.check_out_time = None
    log.check_out_ip = None
    db.commit()
    db.refresh(log)
    return log


def auto_checkin_today_daily(work_date: date, user_id: int, role: str, client_ip: str, db: Session) -> dict:
    if role not in (*COACH_ROLES, "participant"):
        return {"checked_in": 0, "skipped": 0}

    if not validate_ip(client_ip, db):
        return {"checked_in": 0, "skipped": 1}

    existing = get_daily_attendance_log(work_date, user_id, db)
    if existing:
        return {"checked_in": 0, "skipped": 1}

    check_in_today(work_date, user_id, client_ip, db)
    return {"checked_in": 1, "skipped": 0}


def list_daily_attendance(work_date: date, db: Session) -> list[DailyAttendanceLog]:
    return (
        db.query(DailyAttendanceLog)
        .filter(DailyAttendanceLog.work_date == work_date)
        .order_by(DailyAttendanceLog.check_in_time.asc())
        .all()
    )


def check_in(session_id: int, user_id: int, client_ip: str, db: Session) -> AttendanceLog:
    if not validate_ip(client_ip, db):
        raise HTTPException(status_code=403, detail="허용되지 않은 IP 대역에서의 접근입니다.")

    existing = db.query(AttendanceLog).filter(
        AttendanceLog.session_id == session_id,
        AttendanceLog.user_id == user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 입실 처리되었습니다.")

    log = AttendanceLog(
        session_id=session_id,
        user_id=user_id,
        check_in_time=datetime.now(timezone.utc),
        check_in_ip=client_ip,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_attendance_log(session_id: int, user_id: int, db: Session) -> Optional[AttendanceLog]:
    return db.query(AttendanceLog).filter(
        AttendanceLog.session_id == session_id,
        AttendanceLog.user_id == user_id,
    ).first()


def get_my_attendance_status(session_id: int, user_id: int, client_ip: str, db: Session) -> dict:
    ip_allowed = validate_ip(client_ip, db)
    log = get_attendance_log(session_id, user_id, db)
    return {
        "session_id": session_id,
        "user_id": user_id,
        "ip_allowed": ip_allowed,
        "can_checkin": ip_allowed and log is None,
        "can_checkout": ip_allowed and log is not None and log.check_out_time is None,
        "attendance_log": log,
    }


def check_out(session_id: int, user_id: int, client_ip: str, db: Session) -> AttendanceLog:
    if not validate_ip(client_ip, db):
        raise HTTPException(status_code=403, detail="허용되지 않은 IP 대역에서의 접근입니다.")

    log = db.query(AttendanceLog).filter(
        AttendanceLog.session_id == session_id,
        AttendanceLog.user_id == user_id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="입실 기록이 없습니다.")
    if log.check_out_time:
        raise HTTPException(status_code=409, detail="이미 퇴실 처리되었습니다.")

    log.check_out_time = datetime.now(timezone.utc)
    log.check_out_ip = client_ip
    db.commit()
    db.refresh(log)
    return log


def coaching_start(session_id: int, coach_user_id: int, db: Session) -> CoachingTimeLog:
    existing = db.query(CoachingTimeLog).filter(
        CoachingTimeLog.session_id == session_id,
        CoachingTimeLog.coach_user_id == coach_user_id,
        CoachingTimeLog.ended_at == None,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 코칭이 시작되었습니다.")

    log = CoachingTimeLog(
        session_id=session_id,
        coach_user_id=coach_user_id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def coaching_end(session_id: int, coach_user_id: int, db: Session) -> CoachingTimeLog:
    log = db.query(CoachingTimeLog).filter(
        CoachingTimeLog.session_id == session_id,
        CoachingTimeLog.coach_user_id == coach_user_id,
        CoachingTimeLog.ended_at == None,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="진행 중인 코칭 기록이 없습니다.")

    now = datetime.now(timezone.utc)
    log.ended_at = now
    # Calculate duration in minutes
    started = log.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    delta = now - started
    log.duration_minutes = int(delta.total_seconds() / 60)
    db.commit()
    db.refresh(log)
    return log


