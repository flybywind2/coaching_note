"""[chatbot] 챗봇 API 라우터입니다."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.chatbot import ChatbotAskRequest, ChatbotAskResponse, ChatbotConfigResponse
from app.services.chatbot_service import ChatbotService

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


@router.get("/config", response_model=ChatbotConfigResponse)
def get_chatbot_config():
    # [chatbot] 프론트 버튼 노출 제어를 위한 기능 토글 정보
    return ChatbotConfigResponse(enabled=bool(settings.CHATBOT_ENABLED))


@router.post("/ask", response_model=ChatbotAskResponse)
def ask_chatbot(
    data: ChatbotAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # [chatbot] .env 토글이 false면 API 자체를 비활성화
    if not settings.CHATBOT_ENABLED:
        raise HTTPException(status_code=503, detail="챗봇 기능이 비활성화되어 있습니다.")
    # [chatbot] rag_retrieve + llm 답변 API
    svc = ChatbotService(db)
    return svc.answer_with_rag(
        current_user=current_user,
        question=data.question,
        num_result_doc=data.num_result_doc,
    )
