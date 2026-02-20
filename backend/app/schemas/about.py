"""소개 페이지 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SiteContentOut(BaseModel):
    content_key: str
    title: str
    content: str
    updated_by: Optional[int] = None
    updated_at: Optional[datetime] = None


class SiteContentUpdate(BaseModel):
    content: str


class CoachProfileOut(BaseModel):
    coach_id: Optional[int] = None
    user_id: Optional[int] = None
    name: str
    coach_type: str = "internal"
    department: Optional[str] = None
    affiliation: Optional[str] = None
    specialty: Optional[str] = None
    career: Optional[str] = None
    photo_url: Optional[str] = None
