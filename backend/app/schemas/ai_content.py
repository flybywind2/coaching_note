"""AI Content 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AIContentOut(BaseModel):
    content_id: int
    project_id: int
    content_type: str
    title: Optional[str]
    content: str
    model_used: Optional[str]
    source_notes: Optional[str]
    generated_by: int
    created_at: datetime
    updated_at: Optional[datetime]
    is_active: bool

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class AIGenerateRequest(BaseModel):
    force_regenerate: bool = False


class AINoteEnhanceRequest(BaseModel):
    current_status: Optional[str] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None
    instruction: Optional[str] = None


class AINoteEnhanceResponse(BaseModel):
    current_status: Optional[str] = None
    main_issue: Optional[str] = None
    next_action: Optional[str] = None
    model_used: Optional[str] = None

    model_config = {"protected_namespaces": ()}


