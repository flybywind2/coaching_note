"""Coaching Note 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import date, datetime


class CoachingNoteBase(BaseModel):
    coaching_date: date
    week_number: Optional[int] = None
    current_status: Optional[str] = None
    progress_rate: Optional[int] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None


class CoachingNoteCreate(CoachingNoteBase):
    pass


class CoachingNoteUpdate(BaseModel):
    coaching_date: Optional[date] = None
    week_number: Optional[int] = None
    current_status: Optional[str] = None
    progress_rate: Optional[int] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None


class CoachingNoteOut(CoachingNoteBase):
    note_id: int
    project_id: int
    author_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class CoachingCommentBase(BaseModel):
    content: str
    code_snippet: Optional[str] = None
    is_coach_only: bool = False


class CoachingCommentCreate(CoachingCommentBase):
    pass


class CoachingCommentOut(CoachingCommentBase):
    comment_id: int
    note_id: int
    author_id: int
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    comment_type: Literal["coaching_feedback", "participant_memo"] = "coaching_feedback"
    created_at: datetime

    model_config = {"from_attributes": True}


