"""Batch 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class BatchBase(BaseModel):
    batch_name: str
    start_date: date
    end_date: date
    coaching_start_date: Optional[date] = None
    status: str = "planned"


class BatchCreate(BatchBase):
    pass


class BatchUpdate(BaseModel):
    batch_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    coaching_start_date: Optional[date] = None
    status: Optional[str] = None


class BatchOut(BatchBase):
    batch_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


