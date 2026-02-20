"""Session 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class CoachingSessionBase(BaseModel):
    project_id: int
    session_date: date
    start_time: str
    end_time: str
    location: Optional[str] = None
    note: Optional[str] = None


class CoachingSessionCreate(CoachingSessionBase):
    batch_id: int


class CoachingSessionUpdate(BaseModel):
    session_date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    session_status: Optional[str] = None
    note: Optional[str] = None


class CoachingSessionOut(CoachingSessionBase):
    session_id: int
    batch_id: int
    session_status: str
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SessionAttendeeBase(BaseModel):
    user_id: int
    attendee_role: str  # coach/participant


class SessionAttendeeCreate(SessionAttendeeBase):
    pass


class SessionAttendeeUpdate(BaseModel):
    attendance_status: str


class SessionAttendeeOut(SessionAttendeeBase):
    attendee_id: int
    session_id: int
    attendance_status: str

    model_config = {"from_attributes": True}


class AttendanceLogOut(BaseModel):
    log_id: int
    session_id: int
    user_id: int
    check_in_time: datetime
    check_in_ip: str
    check_out_time: Optional[datetime] = None
    check_out_ip: Optional[str] = None

    model_config = {"from_attributes": True}


class MyAttendanceStatusOut(BaseModel):
    session_id: int
    user_id: int
    ip_allowed: bool
    can_checkin: bool
    can_checkout: bool
    attendance_log: Optional[AttendanceLogOut] = None


class AutoCheckinResultOut(BaseModel):
    checked_in: int
    skipped: int


class CoachingTimeLogCreate(BaseModel):
    note: Optional[str] = None


class CoachingTimeLogOut(BaseModel):
    log_id: int
    session_id: int
    coach_user_id: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    note: Optional[str] = None

    model_config = {"from_attributes": True}


