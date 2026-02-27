"""[chatbot] RAG 입력/검색 및 챗봇 답변 서비스를 제공합니다."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.coaching_note import CoachingComment, CoachingNote
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.services.ai_client import AIClient
from app.utils.permissions import is_admin, is_participant

logger = logging.getLogger(__name__)


class ChatbotService:
    """[chatbot] RAG와 LLM을 묶어 챗봇 응답을 생성합니다."""

    _COACH_ROLES = {"coach", "internal_coach", "external_coach"}

    def __init__(self, db: Session):
        self.db = db

    def _is_rag_enabled(self) -> bool:
        return bool(
            settings.CHATBOT_ENABLED
            and settings.RAG_ENABLED
            and str(settings.RAG_BASE_URL or "").strip()
            and str(settings.RAG_API_KEY or "").strip()
            and str(settings.AI_CREDENTIAL_KEY or "").strip()
        )

    def _ensure_rag_ready(self):
        if not self._is_rag_enabled():
            raise HTTPException(status_code=503, detail="RAG 기능이 비활성화되어 있습니다.")

    def _rag_headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-dep-ticket": settings.AI_CREDENTIAL_KEY,
            "api-key": settings.RAG_API_KEY,
        }

    def _rag_url(self, endpoint: str) -> str:
        base = str(settings.RAG_BASE_URL or "").rstrip("/")
        normalized = str(endpoint or "").strip()
        if not normalized.startswith("/"):
            normalized = f"/{normalized}"
        return f"{base}{normalized}"

    def _normalize_text(self, value: str | None) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip())

    def _strip_html(self, value: str | None) -> str:
        raw = str(value or "")
        without_tag = re.sub(r"<[^>]+>", " ", raw)
        return self._normalize_text(without_tag)

    def _truncate(self, value: str | None, limit: int) -> str:
        plain = self._normalize_text(value)
        if len(plain) <= limit:
            return plain
        return plain[: max(0, limit - 1)].rstrip() + "…"

    def _to_iso(self, value: datetime | date | None) -> str:
        if value is None:
            return datetime.now(timezone.utc).isoformat()
        if isinstance(value, datetime):
            dt = value
        else:
            dt = datetime.combine(value, datetime.min.time())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    def _permission_groups_for_batch(self, batch_id: int | None) -> list[str]:
        groups: list[str] = [settings.RAG_PERMISSION_GROUP]
        if batch_id is not None:
            groups.append(f"batch-{int(batch_id)}")
        # [chatbot] 중복 제거 + 순서 유지
        return list(dict.fromkeys(groups))

    def _participant_batch_ids(self, current_user: User) -> set[int]:
        direct_scope = {
            int(row[0])
            for row in self.db.query(UserBatchAccess.batch_id)
            .filter(UserBatchAccess.user_id == current_user.user_id)
            .all()
        }
        if direct_scope:
            return direct_scope
        membership_scope = {
            int(row[0])
            for row in self.db.query(Project.batch_id)
            .join(ProjectMember, ProjectMember.project_id == Project.project_id)
            .filter(ProjectMember.user_id == current_user.user_id)
            .all()
        }
        return membership_scope

    def _permission_groups_for_user(self, current_user: User) -> list[str]:
        groups: list[str] = [settings.RAG_PERMISSION_GROUP]
        batch_ids: set[int] = set()
        if is_admin(current_user) or current_user.role in self._COACH_ROLES:
            batch_ids = {int(row[0]) for row in self.db.query(Batch.batch_id).all()}
        elif is_participant(current_user):
            batch_ids = self._participant_batch_ids(current_user)
        for batch_id in sorted(batch_ids):
            groups.append(f"batch-{int(batch_id)}")
        return list(dict.fromkeys(groups))

    def _latest_comment_iso(self, comments: list[Any]) -> str | None:
        latest = None
        for row in comments:
            created_at = getattr(row, "created_at", None)
            if created_at is None:
                continue
            if latest is None or created_at > latest:
                latest = created_at
        return self._to_iso(latest) if latest is not None else None

    def _build_board_post_content(self, post: Any) -> str:
        # [chatbot] 게시글 본문 + 댓글을 하나의 문서(content)로 합쳐 같은 doc_id에 덮어쓰기
        comments = sorted(
            list(getattr(post, "comments", []) or []),
            key=lambda row: (
                getattr(row, "created_at", None) or datetime.min,
                int(getattr(row, "comment_id", 0) or 0),
            ),
        )
        comment_lines: list[str] = []
        for idx, row in enumerate(comments, start=1):
            text = self._strip_html(getattr(row, "content", None))
            if not text:
                continue
            author = (
                getattr(getattr(row, "author", None), "name", None)
                or f"user:{getattr(row, 'author_id', '-')}"
            )
            created_time = self._to_iso(getattr(row, "created_at", None))
            comment_lines.append(f"{idx}. {author} ({created_time}): {text}")
        comments_block = "\n".join(comment_lines) if comment_lines else "-"
        return (
            f"제목: {post.title or '-'}\n"
            f"본문:\n{self._strip_html(post.content)}\n\n"
            f"댓글({len(comment_lines)}):\n{comments_block}"
        )

    def _build_coaching_note_content(self, note: CoachingNote, project: Project) -> tuple[str, list[CoachingComment], int]:
        # [chatbot] 코칭노트 본문 + 공개 댓글을 한 문서로 합쳐 같은 doc_id에 덮어쓰기
        comments = sorted(
            list(getattr(note, "comments", []) or []),
            key=lambda row: (
                getattr(row, "created_at", None) or datetime.min,
                int(getattr(row, "comment_id", 0) or 0),
            ),
        )
        public_comments = [row for row in comments if not bool(getattr(row, "is_coach_only", False))]
        coach_only_count = len(comments) - len(public_comments)
        comment_lines: list[str] = []
        for idx, row in enumerate(public_comments, start=1):
            text = self._strip_html(getattr(row, "content", None))
            if not text:
                continue
            author = (
                getattr(getattr(row, "author", None), "name", None)
                or f"user:{getattr(row, 'author_id', '-')}"
            )
            created_time = self._to_iso(getattr(row, "created_at", None))
            comment_lines.append(f"{idx}. {author} ({created_time}): {text}")
        comments_block = "\n".join(comment_lines) if comment_lines else "-"
        body = (
            f"과제명: {project.project_name}\n"
            f"코칭일자: {note.coaching_date}\n"
            f"주차: {note.week_number}\n"
            f"현재상태: {note.current_status or '-'}\n"
            f"진행률: {note.progress_rate if note.progress_rate is not None else '-'}\n"
            f"당면문제: {note.main_issue or '-'}\n"
            f"다음액션: {note.next_action or '-'}\n\n"
            f"공개댓글({len(comment_lines)}):\n{comments_block}"
        )
        return body, public_comments, coach_only_count

    def generate_ai_summary(self, *, content: str, source_label: str, user_id: str) -> str:
        # [chatbot] RAG 추가 메타에 들어갈 AI 요약 생성
        plain = self._strip_html(content)
        if not plain:
            return ""
        if not settings.AI_FEATURES_ENABLED:
            return self._truncate(plain, 280)
        try:
            client = AIClient.get_client("general", user_id=user_id)
            system_prompt = (
                "당신은 지식 문서 요약기입니다.\n"
                "핵심만 2~3문장으로 요약하고 과장/추측을 금지하세요."
            )
            prompt = (
                f"문서유형: {source_label}\n"
                "아래 내용을 한국어로 2~3문장 요약하세요.\n\n"
                f"{self._truncate(plain, 4000)}"
            )
            summarized = self._normalize_text(client.invoke(prompt, system_prompt))
            return summarized or self._truncate(plain, 280)
        except Exception:
            return self._truncate(plain, 280)

    def upsert_rag_document(
        self,
        *,
        doc_id: str,
        title: str,
        content: str,
        metadata: dict[str, Any],
        user_id: str,
        ai_summary: str | None = None,
        permission_groups: list[str] | None = None,
        created_time: datetime | date | None = None,
    ) -> None:
        # [chatbot] RAG insert-doc payload 전송
        self._ensure_rag_ready()
        summary = self._normalize_text(ai_summary) or self.generate_ai_summary(
            content=content,
            source_label=str(metadata.get("source_type") or "document"),
            user_id=user_id,
        )
        additional_field = dict(metadata)
        additional_field["ai_summary"] = summary
        payload = {
            "index_name": settings.RAG_INDEX_NAME,
            "data": {
                "doc_id": doc_id,
                "title": self._truncate(title, 200),
                "content": self._truncate(self._strip_html(content), 12000),
                "permission_groups": permission_groups or [settings.RAG_PERMISSION_GROUP],
                "created_time": self._to_iso(created_time),
                "additional_field": json.dumps(additional_field, ensure_ascii=False),
            },
            "chunk_factor": {
                "logic": "fixed_size",
                "chunk_size": 1024,
                "chunk_overlap": 128,
                "separator": " ",
            },
        }
        response = httpx.post(
            self._rag_url(settings.RAG_INSERT_ENDPOINT),
            headers=self._rag_headers(),
            json=payload,
            timeout=float(settings.RAG_TIMEOUT_SECONDS),
        )
        response.raise_for_status()

    def _retrieve_rag_documents(
        self,
        *,
        query_text: str,
        num_result_doc: int,
        permission_groups: list[str],
    ) -> dict[str, Any]:
        self._ensure_rag_ready()
        payload = {
            "index_name": settings.RAG_INDEX_NAME,
            "permission_groups": permission_groups,
            "query_text": query_text,
            "num_result_doc": max(1, min(int(num_result_doc), 20)),
            "fields_exclude": ["v_merge_title_content"],
        }
        response = httpx.post(
            self._rag_url(settings.RAG_RETRIEVE_RRF_ENDPOINT),
            headers=self._rag_headers(),
            json=payload,
            timeout=float(settings.RAG_TIMEOUT_SECONDS),
        )
        response.raise_for_status()
        return response.json()

    def _parse_additional_field(self, raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return {}
        return {}

    def _extract_references(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        hits = payload.get("hits", {}).get("hits", [])
        if not isinstance(hits, list):
            hits = payload.get("result_docs", [])
        refs: list[dict[str, Any]] = []
        for row in hits:
            if not isinstance(row, dict):
                continue
            source = row.get("_source") if isinstance(row.get("_source"), dict) else row
            additional = self._parse_additional_field(source.get("additional_field"))
            raw_batch_id = additional.get("batch_id")
            batch_id: int | None = None
            try:
                batch_id = int(raw_batch_id) if raw_batch_id is not None else None
            except (TypeError, ValueError):
                batch_id = None
            refs.append(
                {
                    "doc_id": source.get("doc_id"),
                    "title": str(source.get("title") or "제목 없음"),
                    "content": self._truncate(source.get("content"), 1200),
                    "score": row.get("_score") or row.get("score"),
                    "source_type": additional.get("source_type"),
                    "batch_id": batch_id,
                }
            )
        return refs

    def answer_with_rag(
        self,
        *,
        current_user: User,
        question: str,
        num_result_doc: int = 5,
    ) -> dict[str, Any]:
        # [chatbot] rag_retrieve + llm을 함께 사용해 답변 생성
        query = self._normalize_text(question)
        if not query:
            raise HTTPException(status_code=400, detail="질문을 입력해주세요.")

        raw = self._retrieve_rag_documents(
            query_text=query,
            num_result_doc=num_result_doc,
            permission_groups=self._permission_groups_for_user(current_user),
        )
        refs = self._extract_references(raw)
        context = "\n\n".join(
            [
                (
                    f"[{idx + 1}] 제목: {row['title']}\n"
                    f"내용: {row['content']}\n"
                    f"source_type: {row.get('source_type') or '-'} / batch_id: {row.get('batch_id')}"
                )
                for idx, row in enumerate(refs[: max(1, min(int(num_result_doc), 20))])
            ]
        )
        if not context:
            context = "검색 결과가 없습니다."

        if settings.AI_FEATURES_ENABLED:
            client = AIClient.get_client("general", user_id=str(current_user.user_id))
            system_prompt = (
                "당신은 사내 지식 기반 어시스턴트입니다.\n"
                "주어진 검색 문맥을 우선 사용해 답변하고, 모르면 모른다고 말하세요."
            )
            prompt = (
                f"[질문]\n{query}\n\n"
                f"[검색 문맥]\n{context}\n\n"
                "답변은 한국어로 작성하고, 필요하면 근거 문서 제목을 함께 언급하세요."
            )
            answer = self._normalize_text(client.invoke(prompt, system_prompt))
        else:
            answer = "AI 기능이 비활성화되어 있어 검색 문맥만 제공합니다."
        if not answer:
            answer = "검색 결과를 바탕으로 답변을 생성하지 못했습니다."
        return {
            "answer": answer,
            "references": [
                {
                    "doc_id": row.get("doc_id"),
                    "title": row.get("title") or "제목 없음",
                    "score": row.get("score"),
                    "source_type": row.get("source_type"),
                    "batch_id": row.get("batch_id"),
                }
                for row in refs[: max(1, min(int(num_result_doc), 20))]
            ],
        }

    def safe_sync_board_post(
        self,
        *,
        post_id: int,
        user_id: str,
        event_type: str,
    ) -> None:
        # [chatbot] 게시글 등록/수정 시 RAG 자동 동기화
        if not self._is_rag_enabled():
            return
        try:
            from app.models.board import BoardPost  # local import to avoid cyclic side effects

            post = self.db.query(BoardPost).filter(BoardPost.post_id == int(post_id)).first()
            if not post:
                return
            batch_name = None
            if post.batch_id is not None:
                batch = self.db.query(Batch).filter(Batch.batch_id == int(post.batch_id)).first()
                batch_name = batch.batch_name if batch else None
            comment_count = len(list(getattr(post, "comments", []) or []))
            metadata = {
                "source_type": "board_post",
                "event_type": str(event_type),
                "doc_schema": "board_post.v2",
                "post_id": int(post.post_id),
                "board_id": int(post.board_id),
                "board_type": getattr(post.board, "board_type", None),
                "board_name": getattr(post.board, "board_name", None),
                "batch_id": int(post.batch_id) if post.batch_id is not None else None,
                "batch_name": batch_name,
                "author_id": int(post.author_id),
                "comment_count": int(comment_count),
                "last_comment_at": self._latest_comment_iso(list(getattr(post, "comments", []) or [])),
                "updated_at": self._to_iso(post.updated_at or post.created_at),
            }
            self.upsert_rag_document(
                doc_id=f"board_post:{int(post.post_id)}",
                title=post.title or "게시글",
                content=self._build_board_post_content(post),
                metadata=metadata,
                user_id=user_id,
                permission_groups=self._permission_groups_for_batch(
                    int(post.batch_id) if post.batch_id is not None else None
                ),
                created_time=post.updated_at or post.created_at,
            )
        except Exception as exc:
            logger.warning("[chatbot] board post RAG sync skipped: %s", exc)

    def safe_sync_coaching_note(
        self,
        *,
        note_id: int,
        user_id: str,
        event_type: str,
    ) -> None:
        # [chatbot] 코칭노트 등록/수정 시 RAG 자동 동기화
        if not self._is_rag_enabled():
            return
        try:
            note = self.db.query(CoachingNote).filter(CoachingNote.note_id == int(note_id)).first()
            if not note:
                return
            project = self.db.query(Project).filter(Project.project_id == int(note.project_id)).first()
            if not project:
                return
            batch = self.db.query(Batch).filter(Batch.batch_id == int(project.batch_id)).first()
            metadata = {
                "source_type": "coaching_note",
                "event_type": str(event_type),
                "doc_schema": "coaching_note.v2",
                "note_id": int(note.note_id),
                "project_id": int(project.project_id),
                "project_name": project.project_name,
                "batch_id": int(project.batch_id),
                "batch_name": batch.batch_name if batch else None,
                "week_number": int(note.week_number) if note.week_number is not None else None,
                "coaching_date": str(note.coaching_date) if note.coaching_date else None,
                "author_id": int(note.author_id),
            }
            content, public_comments, coach_only_count = self._build_coaching_note_content(note, project)
            metadata["public_comment_count"] = int(len(public_comments))
            metadata["coach_only_comment_count"] = int(coach_only_count)
            metadata["last_public_comment_at"] = self._latest_comment_iso(public_comments)
            metadata["updated_at"] = self._to_iso(note.updated_at or note.created_at or note.coaching_date)
            self.upsert_rag_document(
                doc_id=f"coaching_note:{int(note.note_id)}",
                title=f"{project.project_name} 코칭노트 {note.coaching_date}",
                content=content,
                metadata=metadata,
                user_id=user_id,
                permission_groups=self._permission_groups_for_batch(int(project.batch_id)),
                created_time=note.updated_at or note.created_at or note.coaching_date,
            )
        except Exception as exc:
            logger.warning("[chatbot] coaching note RAG sync skipped: %s", exc)
