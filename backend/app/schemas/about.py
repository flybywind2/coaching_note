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
    batch_id: Optional[int] = None
    name: str
    coach_type: str = "internal"
    department: Optional[str] = None
    affiliation: Optional[str] = None
    specialty: Optional[str] = None
    career: Optional[str] = None
    photo_url: Optional[str] = None
    is_visible: bool = True
    display_order: int = 0
    layout_column: str = "left"


class CoachProfileCreate(BaseModel):
    user_id: Optional[int] = None
    batch_id: Optional[int] = None
    name: Optional[str] = None
    coach_type: str = "internal"
    department: Optional[str] = None
    affiliation: Optional[str] = None
    specialty: Optional[str] = None
    career: Optional[str] = None
    photo_url: Optional[str] = None
    is_visible: Optional[bool] = None
    display_order: Optional[int] = None
    layout_column: Optional[str] = None


class CoachProfileUpdate(BaseModel):
    user_id: Optional[int] = None
    batch_id: Optional[int] = None
    name: Optional[str] = None
    coach_type: Optional[str] = None
    department: Optional[str] = None
    affiliation: Optional[str] = None
    specialty: Optional[str] = None
    career: Optional[str] = None
    photo_url: Optional[str] = None
    is_visible: Optional[bool] = None
    display_order: Optional[int] = None
    layout_column: Optional[str] = None


class CoachReorderRequest(BaseModel):
    batch_id: int
    coach_ids: list[int] = []
    left_coach_ids: list[int] = []
    right_coach_ids: list[int] = []


class AboutNewsBase(BaseModel):
    title: str
    content: str
    published_at: datetime
    is_visible: bool = True


class AboutNewsCreate(AboutNewsBase):
    pass


class AboutNewsUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    published_at: Optional[datetime] = None
    is_visible: Optional[bool] = None


class AboutNewsOut(AboutNewsBase):
    news_id: int
    created_by: int
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
