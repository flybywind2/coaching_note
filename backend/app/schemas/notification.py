"""Notification 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional, Literal
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


class NotificationPreferenceOut(BaseModel):
    user_id: int
    mention_enabled: bool
    board_enabled: bool
    deadline_enabled: bool
    frequency: Literal["realtime", "daily"]

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    mention_enabled: bool
    board_enabled: bool
    deadline_enabled: bool
    frequency: Literal["realtime", "daily"]


