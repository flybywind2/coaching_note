import json
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.coaching_note import CoachingNote
from app.models.project import Project
from app.models.ai_content import AIGeneratedContent
from app.services.ai_client import AIClient
from app.config import settings


class AIService:
    def __init__(self, db: Session):
        self.db = db

    def _get_existing(self, project_id: int, content_type: str) -> Optional[Dict]:
        rec = (
            self.db.query(AIGeneratedContent)
            .filter(
                AIGeneratedContent.project_id == project_id,
                AIGeneratedContent.content_type == content_type,
                AIGeneratedContent.is_active == True,
            )
            .order_by(AIGeneratedContent.created_at.desc())
            .first()
        )
        if rec:
            return {"content_id": rec.content_id, "content": rec.content,
                    "title": rec.title, "model_used": rec.model_used,
                    "created_at": rec.created_at}
        return None

    def _save(self, project_id: int, content_type: str, title: str, content: str,
              model_used: str, source_notes: List[int], generated_by: int) -> AIGeneratedContent:
        # deactivate previous
        self.db.query(AIGeneratedContent).filter(
            AIGeneratedContent.project_id == project_id,
            AIGeneratedContent.content_type == content_type,
        ).update({"is_active": False})

        rec = AIGeneratedContent(
            project_id=project_id,
            content_type=content_type,
            title=title,
            content=content,
            model_used=model_used,
            source_notes=json.dumps(source_notes),
            generated_by=generated_by,
        )
        self.db.add(rec)
        self.db.commit()
        self.db.refresh(rec)
        return rec

    def _format_notes(self, notes: List[CoachingNote]) -> str:
        parts = []
        for n in notes:
            parts.append(
                f"[{n.coaching_date}] {n.week_number or '?'}주차\n"
                f"상태: {n.current_status or '-'}\n"
                f"진행률: {n.progress_rate or 0}%\n"
                f"당면 문제: {n.main_issue or '-'}\n"
                f"다음 액션: {n.next_action or '-'}\n"
            )
        return "\n---\n".join(parts)

    def generate_summary(self, project_id: int, user_id: str, force: bool = False) -> Dict[str, Any]:
        if not settings.AI_FEATURES_ENABLED:
            raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다.")
        if not force:
            existing = self._get_existing(project_id, "summary")
            if existing:
                return existing

        notes = (
            self.db.query(CoachingNote)
            .filter(CoachingNote.project_id == project_id)
            .order_by(CoachingNote.coaching_date)
            .all()
        )
        if not notes:
            raise HTTPException(status_code=400, detail="요약할 코칭노트가 없습니다.")

        project = self.db.query(Project).filter(Project.project_id == project_id).first()
        notes_text = self._format_notes(notes)

        system_prompt = (
            "당신은 AI 과제 코칭 프로그램의 전문 분석가입니다.\n"
            "주어진 코칭노트들을 분석하여 다음 형식으로 요약해주세요:\n\n"
            "1. **과제 개요**: 과제의 목표와 현재 상태 (2-3문장)\n"
            "2. **주요 진행 경과**: 핵심 마일스톤과 성과 (bullet points)\n"
            "3. **핵심 기술 이슈**: 주요 기술적 문제와 해결 방안 (bullet points)\n"
            "4. **성장 포인트**: 참여자들이 배운 핵심 내용 (bullet points)\n"
            "5. **다음 단계 제안**: 향후 진행 방향 권고 (2-3문장)"
        )
        prompt = f"다음은 '{project.project_name}' 과제의 코칭노트입니다.\n\n=== 코칭노트 ===\n{notes_text}"

        client = AIClient.get_client("summary", user_id)
        summary_text = client.invoke(prompt, system_prompt)

        rec = self._save(
            project_id=project_id,
            content_type="summary",
            title=f"{project.project_name} - AI 요약",
            content=summary_text,
            model_used=client.model_name,
            source_notes=[n.note_id for n in notes],
            generated_by=int(user_id) if user_id.isdigit() else 0,
        )
        # update project ai_summary shortcut
        project.ai_summary = summary_text[:500]
        self.db.commit()

        return {"content_id": rec.content_id, "content": rec.content,
                "title": rec.title, "model_used": rec.model_used, "created_at": rec.created_at}

    def generate_qa_set(self, project_id: int, user_id: str, force: bool = False) -> Dict[str, Any]:
        if not settings.AI_FEATURES_ENABLED:
            raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다.")
        if not force:
            existing = self._get_existing(project_id, "qa_set")
            if existing:
                return existing

        notes = (
            self.db.query(CoachingNote)
            .filter(CoachingNote.project_id == project_id)
            .order_by(CoachingNote.coaching_date)
            .all()
        )
        if not notes:
            raise HTTPException(status_code=400, detail="코칭노트가 없습니다.")

        project = self.db.query(Project).filter(Project.project_id == project_id).first()
        notes_text = self._format_notes(notes)

        system_prompt = (
            "당신은 코칭 기록에서 핵심 Q&A를 추출하는 전문가입니다.\n"
            "코칭 과정에서 나온 주요 질문과 답변을 JSON 배열로 추출해주세요.\n"
            "형식: [{\"question\": \"질문\", \"answer\": \"답변\", \"category\": \"카테고리\"}]\n"
            "카테고리 예: 기술적 문제, 프로세스, 팀 협업, 데이터, 기타"
        )
        prompt = f"'{project.project_name}' 과제 코칭노트에서 Q&A를 추출해주세요.\n\n{notes_text}"

        client = AIClient.get_client("qa", user_id)
        qa_text = client.invoke(prompt, system_prompt)

        rec = self._save(
            project_id=project_id,
            content_type="qa_set",
            title=f"{project.project_name} - Q&A Set",
            content=qa_text,
            model_used=client.model_name,
            source_notes=[n.note_id for n in notes],
            generated_by=int(user_id) if user_id.isdigit() else 0,
        )
        return {"content_id": rec.content_id, "content": rec.content,
                "title": rec.title, "model_used": rec.model_used, "created_at": rec.created_at}

    def get_contents(self, project_id: int, content_type: str) -> List[AIGeneratedContent]:
        return (
            self.db.query(AIGeneratedContent)
            .filter(
                AIGeneratedContent.project_id == project_id,
                AIGeneratedContent.content_type == content_type,
                AIGeneratedContent.is_active == True,
            )
            .order_by(AIGeneratedContent.created_at.desc())
            .all()
        )
