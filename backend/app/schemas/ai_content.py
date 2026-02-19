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

    model_config = {"from_attributes": True}


class AIGenerateRequest(BaseModel):
    force_regenerate: bool = False
