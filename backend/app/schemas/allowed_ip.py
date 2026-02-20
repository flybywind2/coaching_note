"""Allowed IP 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AllowedIPRangeCreate(BaseModel):
    cidr: str
    description: Optional[str] = None
    is_active: bool = True


class AllowedIPRangeOut(BaseModel):
    id: int
    cidr: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


