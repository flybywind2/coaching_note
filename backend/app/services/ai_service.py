"""AI Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import json
import re
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.coaching_note import CoachingNote
from app.models.project import Project
from app.models.document import ProjectDocument
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

    def _strip_html(self, text: Optional[str]) -> str:
        raw = str(text or "")
        no_tag = re.sub(r"<[^>]+>", " ", raw)
        return re.sub(r"\s+", " ", no_tag).strip()

    def _truncate(self, text: Optional[str], limit: int) -> str:
        plain = self._strip_html(text)
        if len(plain) <= limit:
            return plain
        return plain[: max(0, limit - 1)].rstrip() + "…"

    def _format_project_records(self, project_id: int, limit: int = 6) -> str:
        docs = (
            self.db.query(ProjectDocument)
            .filter(ProjectDocument.project_id == project_id)
            .order_by(ProjectDocument.updated_at.desc(), ProjectDocument.created_at.desc())
            .limit(limit)
            .all()
        )
        if not docs:
            return "없음"

        doc_type_labels = {
            "application": "지원서",
            "basic_consulting": "기초컨설팅 산출물",
            "workshop_result": "공동워크샵 산출물",
            "mid_presentation": "중간 발표 자료",
            "final_presentation": "최종 발표 자료",
            "other_material": "기타 자료",
        }
        lines = []
        for doc in docs:
            label = doc_type_labels.get(doc.doc_type, doc.doc_type or "기타")
            title = self._truncate(doc.title or "-", 80) or "-"
            content = self._truncate(doc.content or "-", 320) or "-"
            lines.append(f"- [{label}] {title}\n  내용 요약: {content}")
        return "\n".join(lines)

    def _format_existing_notes_for_reference(
        self,
        project_id: int,
        current_note_id: int,
        limit: int = 8,
    ) -> str:
        notes = (
            self.db.query(CoachingNote)
            .filter(
                CoachingNote.project_id == project_id,
                CoachingNote.note_id != current_note_id,
            )
            .order_by(CoachingNote.coaching_date.desc(), CoachingNote.note_id.desc())
            .limit(limit)
            .all()
        )
        if not notes:
            return "없음"

        lines = []
        for row in notes:
            lines.append(
                f"- [{row.coaching_date}] {row.week_number or '?'}주차 / 진행률 {row.progress_rate or 0}%\n"
                f"  상태: {self._truncate(row.current_status or '-', 220) or '-'}\n"
                f"  이슈: {self._truncate(row.main_issue or '-', 220) or '-'}\n"
                f"  액션: {self._truncate(row.next_action or '-', 220) or '-'}"
            )
        return "\n".join(lines)

    def _parse_json_object(self, raw_text: str) -> Dict[str, Any]:
        text = (raw_text or "").strip()
        if not text:
            return {}

        # Try raw JSON first.
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # Strip markdown code fences if present.
        fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
        if fenced:
            try:
                parsed = json.loads(fenced.group(1))
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        # Fallback: first JSON-looking object block.
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            candidate = text[start:end + 1]
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
        return {}

    def enhance_note_sections(
        self,
        note: CoachingNote,
        user_id: str,
        current_status: Optional[str],
        main_issue: Optional[str],
        next_action: Optional[str],
        instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not settings.AI_FEATURES_ENABLED:
            raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다.")

        project = self.db.query(Project).filter(Project.project_id == note.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

        base_current = current_status if current_status is not None else note.current_status
        base_issue = main_issue if main_issue is not None else note.main_issue
        base_action = next_action if next_action is not None else note.next_action
        extra_instruction = (instruction or "").strip()
        record_context = self._format_project_records(project.project_id)
        existing_note_context = self._format_existing_notes_for_reference(project.project_id, note.note_id)

        system_prompt = (
            "당신은 기업 코칭노트 편집을 돕는 전문 코치입니다.\n"
            "입력된 내용을 과장 없이 명확하고 실행 가능하게 보완하세요.\n"
            "HTML 태그가 있으면 가능한 유지하되, 가독성을 개선하세요.\n"
            "반드시 아래 JSON 객체만 반환하세요. 다른 설명은 금지합니다.\n"
            "{\"current_status\":\"...\", \"main_issue\":\"...\", \"next_action\":\"...\"}"
        )
        prompt = (
            f"과제명: {project.project_name}\n"
            f"코칭노트 ID: {note.note_id}\n\n"
            f"[과제기록 참고]\n{record_context}\n\n"
            f"[기존 코칭노트 참고]\n{existing_note_context}\n\n"
            f"[현재 상태]\n{base_current or '-'}\n\n"
            f"[당면 문제]\n{base_issue or '-'}\n\n"
            f"[다음 액션]\n{base_action or '-'}\n\n"
            f"[보완 지시사항]\n{extra_instruction or '없음'}\n"
        )

        client = AIClient.get_client("general", user_id)
        raw = client.invoke(prompt, system_prompt)
        parsed = self._parse_json_object(raw)

        enhanced_current = parsed.get("current_status")
        enhanced_issue = parsed.get("main_issue")
        enhanced_action = parsed.get("next_action")

        return {
            "current_status": (enhanced_current if isinstance(enhanced_current, str) else base_current),
            "main_issue": (enhanced_issue if isinstance(enhanced_issue, str) else base_issue),
            "next_action": (enhanced_action if isinstance(enhanced_action, str) else base_action),
            "model_used": client.model_name,
        }

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


