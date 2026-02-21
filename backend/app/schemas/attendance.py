"""일자 기반 출석 요청/응답 스키마입니다."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class DailyAttendanceOut(BaseModel):
    log_id: int
    user_id: int
    work_date: date
    check_in_time: datetime
    check_in_ip: str
    check_out_time: Optional[datetime] = None
    check_out_ip: Optional[str] = None

    model_config = {"from_attributes": True}


class MyDailyAttendanceStatusOut(BaseModel):
    user_id: int
    work_date: date
    ip_allowed: bool
    can_checkin: bool
    can_checkout: bool
    attendance_log: Optional[DailyAttendanceOut] = None


class DailyAutoCheckinResultOut(BaseModel):
    checked_in: int
    skipped: int

