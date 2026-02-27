"""[chatbot] 챗봇 API 스키마입니다."""

from typing import List, Optional

from pydantic import BaseModel, Field


class ChatbotAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    num_result_doc: int = Field(default=5, ge=1, le=20)


class ChatbotReferenceOut(BaseModel):
    doc_id: Optional[str] = None
    title: str
    score: Optional[float] = None
    source_type: Optional[str] = None
    batch_id: Optional[int] = None


class ChatbotAskResponse(BaseModel):
    answer: str
    references: List[ChatbotReferenceOut] = Field(default_factory=list)


class ChatbotConfigResponse(BaseModel):
    enabled: bool
