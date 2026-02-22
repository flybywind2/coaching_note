"""AI 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.ai_content import (
    AIContentOut,
    AIGenerateRequest,
    AINoteEnhanceRequest,
    AINoteEnhanceResponse,
)
from app.services.ai_service import AIService
from app.services import coaching_service
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.utils.permissions import is_admin_or_coach

router = APIRouter(tags=["ai"])


@router.post("/api/projects/{project_id}/summary")
def generate_summary(
    project_id: int,
    req: AIGenerateRequest = AIGenerateRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="관리자/코치만 AI 요약을 생성할 수 있습니다.")
    try:
        svc = AIService(db)
        return svc.generate_summary(project_id, str(current_user.user_id), req.force_regenerate)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")


@router.get("/api/projects/{project_id}/summary")
def get_summary(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = AIService(db)
    result = svc._get_existing(project_id, "summary")
    if not result:
        raise HTTPException(status_code=404, detail="AI 요약이 없습니다. 먼저 생성해주세요.")
    return result


@router.post("/api/projects/{project_id}/qa-set")
def generate_qa_set(
    project_id: int,
    req: AIGenerateRequest = AIGenerateRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="관리자/코치만 Q&A Set을 생성할 수 있습니다.")
    try:
        svc = AIService(db)
        return svc.generate_qa_set(project_id, str(current_user.user_id), req.force_regenerate)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")


@router.get("/api/projects/{project_id}/qa-sets", response_model=List[AIContentOut])
def get_qa_sets(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = AIService(db)
    return svc.get_contents(project_id, "qa_set")


@router.post("/api/notes/{note_id}/enhance", response_model=AINoteEnhanceResponse)
def enhance_coaching_note(
    note_id: int,
    req: AINoteEnhanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="관리자/코치만 코칭노트 AI 보완을 사용할 수 있습니다.")

    note = coaching_service.get_note(db, note_id, current_user)
    try:
        svc = AIService(db)
        return svc.enhance_note_sections(
            note=note,
            user_id=str(current_user.user_id),
            current_status=req.current_status,
            main_issue=req.main_issue,
            next_action=req.next_action,
            instruction=req.instruction,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI 서비스 오류: {str(e)}")


