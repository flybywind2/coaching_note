"""콘텐츠 버전 이력 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from datetime import datetime
from typing import Any, Dict

from pydantic import BaseModel


class ContentVersionOut(BaseModel):
    version_id: int
    entity_type: str
    entity_id: int
    version_no: int
    change_type: str
    snapshot: Dict[str, Any]
    changed_by: int
    created_at: datetime


class ContentRestoreResult(BaseModel):
    message: str
    restored_version_id: int

