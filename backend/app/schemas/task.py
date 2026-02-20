"""Task 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class ProjectTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = "medium"
    status: str = "todo"
    assigned_to: Optional[int] = None
    is_milestone: bool = False
    milestone_order: Optional[int] = None


class ProjectTaskCreate(ProjectTaskBase):
    pass


class ProjectTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[int] = None
    is_milestone: Optional[bool] = None
    milestone_order: Optional[int] = None


class ProjectTaskOut(ProjectTaskBase):
    task_id: int
    project_id: int
    assignee_name: Optional[str] = None
    assignee_emp_id: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


