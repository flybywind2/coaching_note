"""Schedule 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProgramScheduleBase(BaseModel):
    title: str
    description: Optional[str] = None
    schedule_type: str = "other"
    visibility_scope: str = "global"
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: bool = False
    color: str = "#4CAF50"
    repeat_group_id: Optional[str] = None
    repeat_sequence: Optional[int] = None


class ProgramScheduleCreate(ProgramScheduleBase):
    batch_id: int


class ProgramScheduleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    schedule_type: Optional[str] = None
    visibility_scope: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: Optional[bool] = None
    color: Optional[str] = None


class ProgramScheduleOut(ProgramScheduleBase):
    schedule_id: int
    batch_id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


