"""Project 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ProjectBase(BaseModel):
    project_name: str
    organization: str
    representative: Optional[str] = None
    category: Optional[str] = None
    visibility: str = "public"
    status: str = "preparing"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    organization: Optional[str] = None
    representative: Optional[str] = None
    category: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None


class ProjectOut(ProjectBase):
    project_id: int
    batch_id: int
    progress_rate: int
    ai_summary: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ProjectMemberBase(BaseModel):
    user_id: int
    role: str = "member"
    is_representative: bool = False


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberOut(ProjectMemberBase):
    member_id: int
    project_id: int
    joined_at: datetime

    model_config = {"from_attributes": True}


