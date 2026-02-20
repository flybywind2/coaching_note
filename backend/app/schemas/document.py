"""Document 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class ProjectDocumentBase(BaseModel):
    doc_type: str
    title: Optional[str] = None
    content: Optional[str] = None


class ProjectDocumentCreate(ProjectDocumentBase):
    pass


class ProjectDocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ProjectDocumentOut(ProjectDocumentBase):
    doc_id: int
    project_id: int
    attachments: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


