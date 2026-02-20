"""코칭노트 템플릿 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CoachingNoteTemplateBase(BaseModel):
    template_name: str
    week_number: Optional[int] = None
    progress_rate: Optional[int] = None
    current_status: Optional[str] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None
    is_shared: bool = False


class CoachingNoteTemplateCreate(CoachingNoteTemplateBase):
    pass


class CoachingNoteTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    week_number: Optional[int] = None
    progress_rate: Optional[int] = None
    current_status: Optional[str] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None
    is_shared: Optional[bool] = None


class CoachingNoteTemplateOut(CoachingNoteTemplateBase):
    template_id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}

