"""Project 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ProjectBase(BaseModel):
    project_name: str
    organization: str
    representative: Optional[str] = None
    category: Optional[str] = None
    visibility: str = "public"
    project_type: str = "primary"
    status: str = "preparing"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    organization: Optional[str] = None
    representative: Optional[str] = None
    category: Optional[str] = None
    visibility: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    progress_rate: Optional[int] = None
    ai_tech_category: Optional[str] = None
    ai_tech_used: Optional[str] = None
    project_summary: Optional[str] = None
    github_repos: Optional[List[str]] = None


class ProjectOut(ProjectBase):
    project_id: int
    batch_id: int
    progress_rate: int
    ai_summary: Optional[str]
    ai_tech_category: Optional[str] = None
    ai_tech_used: Optional[str] = None
    project_summary: Optional[str] = None
    github_repos: List[str] = Field(default_factory=list)
    is_my_project: bool = False
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
    user_name: Optional[str] = None
    user_emp_id: Optional[str] = None
    user_role: Optional[str] = None
    joined_at: datetime

    model_config = {"from_attributes": True}


class ProjectMemberCandidateOut(BaseModel):
    user_id: int
    emp_id: str
    name: str
    department: Optional[str] = None
    role: str

    model_config = {"from_attributes": True}


