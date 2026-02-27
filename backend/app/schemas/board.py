"""Board 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BoardOut(BaseModel):
    board_id: int
    board_name: str
    board_type: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class BoardPostBase(BaseModel):
    title: str
    content: str
    is_notice: bool = False
    batch_id: Optional[int] = None  # [FEEDBACK7] 차수 분리 운영
    is_batch_private: bool = False  # [FEEDBACK7] 해당 차수에게만 공개


class BoardPostCreate(BoardPostBase):
    pass


class BoardPostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_notice: Optional[bool] = None
    board_id: Optional[int] = None
    batch_id: Optional[int] = None
    is_batch_private: Optional[bool] = None


class BoardPostOut(BoardPostBase):
    post_id: int
    board_id: int
    author_id: int
    attachments: Optional[str] = None
    view_count: int
    created_at: datetime
    updated_at: Optional[datetime]
    board_name: Optional[str] = None
    board_type: Optional[str] = None
    author_name: Optional[str] = None
    comment_count: Optional[int] = None
    post_no: Optional[int] = None

    model_config = {"from_attributes": True}


class PostCommentBase(BaseModel):
    content: str


class PostCommentCreate(PostCommentBase):
    pass


class PostCommentUpdate(BaseModel):
    content: str


class PostCommentOut(PostCommentBase):
    comment_id: int
    post_id: int
    author_id: int
    created_at: datetime
    author_name: Optional[str] = None

    model_config = {"from_attributes": True}


class MentionCandidateOut(BaseModel):
    user_id: int
    emp_id: str
    name: str
    department: Optional[str] = None
    role: str


