"""일자 기반 입실/퇴실 API 라우터입니다."""

from datetime import date
from typing import List

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.attendance import (
    DailyAttendanceOut,
    DailyAutoCheckinResultOut,
    MyDailyAttendanceStatusOut,
)
from app.services import attendance_service

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


@router.get("/my-status", response_model=MyDailyAttendanceStatusOut)
def get_my_status(
    request: Request,
    work_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_date = work_date or date.today()
    return attendance_service.get_my_daily_attendance_status(
        target_date,
        current_user.user_id,
        _get_client_ip(request),
        db,
    )


@router.post("/checkin", response_model=DailyAttendanceOut)
def check_in_today(
    request: Request,
    work_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_date = work_date or date.today()
    return attendance_service.check_in_today(
        target_date,
        current_user.user_id,
        _get_client_ip(request),
        db,
    )


@router.post("/checkout", response_model=DailyAttendanceOut)
def check_out_today(
    request: Request,
    work_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_date = work_date or date.today()
    return attendance_service.check_out_today(
        target_date,
        current_user.user_id,
        _get_client_ip(request),
        db,
    )


@router.post("/auto-checkin-today", response_model=DailyAutoCheckinResultOut)
def auto_checkin_today(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return attendance_service.auto_checkin_today_daily(
        date.today(),
        current_user.user_id,
        current_user.role,
        _get_client_ip(request),
        db,
    )


@router.get("", response_model=List[DailyAttendanceOut])
def list_daily_attendance(
    work_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        return []
    return attendance_service.list_daily_attendance(work_date, db)

