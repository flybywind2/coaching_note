from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProgramScheduleBase(BaseModel):
    title: str
    description: Optional[str] = None
    schedule_type: str
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: bool = False


class ProgramScheduleCreate(ProgramScheduleBase):
    batch_id: int


class ProgramScheduleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    schedule_type: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: Optional[bool] = None


class ProgramScheduleOut(ProgramScheduleBase):
    schedule_id: int
    batch_id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}
