"""Notification 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NotificationOut(BaseModel):
    noti_id: int
    user_id: int
    noti_type: str
    title: str
    message: Optional[str]
    link_url: Optional[str]
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


