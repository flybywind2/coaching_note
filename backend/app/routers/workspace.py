"""사용자 홈/통합 검색 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.board import BoardPost
from app.models.coaching_note import CoachingNote
from app.models.document import ProjectDocument
from app.models.project import Project, ProjectMember
from app.models.session import CoachingSession
from app.models.task import ProjectTask
from app.models.user import User
from app.utils.permissions import is_admin_or_coach

router = APIRouter(prefix="/api", tags=["workspace"])

ALLOWED_SEARCH_TYPES = {"project", "note", "document", "board"}


def _member_project_ids(db: Session, user_id: int) -> List[int]:
    return [
        row[0]
        for row in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == user_id)
        .all()
    ]


def _strip_html(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", " ", text).strip()


def _excerpt(text: Optional[str], limit: int = 160) -> str:
    plain = re.sub(r"\s+", " ", _strip_html(text))
    if len(plain) <= limit:
        return plain
    return plain[: limit - 1].rstrip() + "…"


def _parse_types(raw: Optional[str]) -> Set[str]:
    if not raw:
        return set(ALLOWED_SEARCH_TYPES)
    parsed = {item.strip() for item in raw.split(",") if item.strip()}
    valid = {item for item in parsed if item in ALLOWED_SEARCH_TYPES}
    return valid or set(ALLOWED_SEARCH_TYPES)


@router.get("/home")
def get_home(
    batch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    end_day = today + timedelta(days=7)

    projects_q = db.query(Project)
    if batch_id:
        projects_q = projects_q.filter(Project.batch_id == batch_id)

    member_ids: List[int] = []
    if not is_admin_or_coach(current_user):
        member_ids = _member_project_ids(db, current_user.user_id)
        if member_ids:
            projects_q = projects_q.filter(
                or_(
                    Project.visibility == "public",
                    Project.project_id.in_(member_ids),
                )
            )
        else:
            projects_q = projects_q.filter(Project.visibility == "public")

    projects = projects_q.order_by(Project.created_at.desc()).limit(12).all()
    project_ids = [p.project_id for p in projects]
    project_name_map = {p.project_id: p.project_name for p in projects}

    if not project_ids:
        return {
            "today": today,
            "projects": [],
            "today_tasks": [],
            "upcoming_sessions": [],
            "stats": {
                "project_count": 0,
                "today_task_count": 0,
                "overdue_task_count": 0,
                "upcoming_session_count": 0,
            },
        }

    task_q = db.query(ProjectTask).filter(
        ProjectTask.project_id.in_(project_ids),
        ProjectTask.status != "completed",
    )
    if current_user.role in ("participant", "observer"):
        task_q = task_q.filter(
            or_(
                ProjectTask.assigned_to == current_user.user_id,
                ProjectTask.created_by == current_user.user_id,
            )
        )

    today_tasks = (
        task_q.filter(ProjectTask.due_date == today)
        .order_by(ProjectTask.is_milestone.desc(), ProjectTask.created_at.desc())
        .limit(20)
        .all()
    )
    overdue_task_count = task_q.filter(ProjectTask.due_date < today).count()

    sessions_q = db.query(CoachingSession).filter(
        CoachingSession.project_id.in_(project_ids),
        CoachingSession.session_date >= today,
        CoachingSession.session_date <= end_day,
    )
    upcoming_sessions = (
        sessions_q.order_by(CoachingSession.session_date.asc(), CoachingSession.start_time.asc())
        .limit(20)
        .all()
    )

    return {
        "today": today,
        "projects": [
            {
                "project_id": p.project_id,
                "project_name": p.project_name,
                "status": p.status,
                "progress_rate": p.progress_rate,
                "batch_id": p.batch_id,
            }
            for p in projects
        ],
        "today_tasks": [
            {
                "task_id": t.task_id,
                "project_id": t.project_id,
                "project_name": project_name_map.get(t.project_id, f"프로젝트 {t.project_id}"),
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "is_milestone": t.is_milestone,
                "due_date": t.due_date,
            }
            for t in today_tasks
        ],
        "upcoming_sessions": [
            {
                "session_id": s.session_id,
                "project_id": s.project_id,
                "project_name": project_name_map.get(s.project_id, f"프로젝트 {s.project_id}"),
                "session_date": s.session_date,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "location": s.location,
                "session_status": s.session_status,
            }
            for s in upcoming_sessions
        ],
        "stats": {
            "project_count": len(projects),
            "today_task_count": len(today_tasks),
            "overdue_task_count": overdue_task_count,
            "upcoming_session_count": len(upcoming_sessions),
        },
    }


@router.get("/search")
def search_workspace(
    q: str = Query("", description="검색어"),
    types: Optional[str] = Query(None, description="project,note,document,board"),
    batch_id: Optional[int] = None,
    author_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(40, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    keyword = (q or "").strip()
    if len(keyword) < 2:
        return {"query": keyword, "count": 0, "results": []}

    search_types = _parse_types(types)
    like = f"%{keyword}%"
    results: List[Dict[str, Any]] = []

    member_ids: List[int] = []
    if not is_admin_or_coach(current_user):
        member_ids = _member_project_ids(db, current_user.user_id)

    def apply_project_visibility(q_obj):
        if is_admin_or_coach(current_user):
            return q_obj
        if member_ids:
            return q_obj.filter(
                or_(
                    Project.visibility == "public",
                    Project.project_id.in_(member_ids),
                )
            )
        return q_obj.filter(Project.visibility == "public")

    if "project" in search_types:
        projects_q = db.query(Project)
        if batch_id:
            projects_q = projects_q.filter(Project.batch_id == batch_id)
        projects_q = apply_project_visibility(projects_q).filter(
            or_(
                Project.project_name.ilike(like),
                Project.organization.ilike(like),
                Project.representative.ilike(like),
                Project.category.ilike(like),
            )
        )
        for p in projects_q.order_by(Project.created_at.desc()).limit(limit).all():
            results.append(
                {
                    "type": "project",
                    "id": p.project_id,
                    "title": p.project_name,
                    "snippet": _excerpt(" ".join(filter(None, [p.organization, p.category, p.representative]))),
                    "route": f"#/project/{p.project_id}",
                    "created_at": p.created_at,
                    "project_id": p.project_id,
                    "project_name": p.project_name,
                }
            )

    if "note" in search_types:
        notes_q = (
            db.query(CoachingNote, Project, User)
            .join(Project, CoachingNote.project_id == Project.project_id)
            .join(User, CoachingNote.author_id == User.user_id)
        )
        if batch_id:
            notes_q = notes_q.filter(Project.batch_id == batch_id)
        if author_id:
            notes_q = notes_q.filter(CoachingNote.author_id == author_id)
        if start_date:
            notes_q = notes_q.filter(CoachingNote.coaching_date >= start_date)
        if end_date:
            notes_q = notes_q.filter(CoachingNote.coaching_date <= end_date)
        notes_q = apply_project_visibility(notes_q).filter(
            or_(
                CoachingNote.current_status.ilike(like),
                CoachingNote.main_issue.ilike(like),
                CoachingNote.next_action.ilike(like),
            )
        )
        for note, project, author in notes_q.order_by(CoachingNote.created_at.desc()).limit(limit).all():
            merged = " ".join(
                filter(None, [note.current_status or "", note.main_issue or "", note.next_action or ""])
            )
            results.append(
                {
                    "type": "note",
                    "id": note.note_id,
                    "title": f"{project.project_name} 코칭노트 ({note.coaching_date})",
                    "snippet": _excerpt(merged),
                    "route": f"#/project/{project.project_id}/notes/{note.note_id}",
                    "created_at": note.created_at or note.coaching_date,
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "author_id": author.user_id,
                    "author_name": author.name,
                }
            )

    if "document" in search_types:
        docs_q = (
            db.query(ProjectDocument, Project, User)
            .join(Project, ProjectDocument.project_id == Project.project_id)
            .join(User, ProjectDocument.created_by == User.user_id)
        )
        if batch_id:
            docs_q = docs_q.filter(Project.batch_id == batch_id)
        if author_id:
            docs_q = docs_q.filter(ProjectDocument.created_by == author_id)
        if start_date:
            docs_q = docs_q.filter(ProjectDocument.created_at >= start_date)
        if end_date:
            docs_q = docs_q.filter(ProjectDocument.created_at <= end_date + timedelta(days=1))
        docs_q = apply_project_visibility(docs_q).filter(
            or_(
                ProjectDocument.title.ilike(like),
                ProjectDocument.content.ilike(like),
            )
        )
        for doc, project, author in docs_q.order_by(ProjectDocument.created_at.desc()).limit(limit).all():
            results.append(
                {
                    "type": "document",
                    "id": doc.doc_id,
                    "title": doc.title or f"{project.project_name} 문서",
                    "snippet": _excerpt(doc.content),
                    "route": f"#/project/{project.project_id}",
                    "created_at": doc.created_at,
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "author_id": author.user_id,
                    "author_name": author.name,
                }
            )

    if "board" in search_types:
        posts_q = db.query(BoardPost, User).join(User, BoardPost.author_id == User.user_id)
        if author_id:
            posts_q = posts_q.filter(BoardPost.author_id == author_id)
        if start_date:
            posts_q = posts_q.filter(BoardPost.created_at >= start_date)
        if end_date:
            posts_q = posts_q.filter(BoardPost.created_at <= end_date + timedelta(days=1))
        posts_q = posts_q.filter(
            or_(
                BoardPost.title.ilike(like),
                BoardPost.content.ilike(like),
            )
        )
        for post, author in posts_q.order_by(BoardPost.created_at.desc()).limit(limit).all():
            results.append(
                {
                    "type": "board",
                    "id": post.post_id,
                    "title": post.title,
                    "snippet": _excerpt(post.content),
                    "route": f"#/board/{post.board_id}/post/{post.post_id}",
                    "created_at": post.created_at,
                    "author_id": author.user_id,
                    "author_name": author.name,
                }
            )

    def _sort_key(item: Dict[str, Any]) -> datetime:
        value = item.get("created_at")
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        return datetime.min

    results.sort(key=_sort_key, reverse=True)
    clipped = results[:limit]
    return {
        "query": keyword,
        "count": len(clipped),
        "results": clipped,
    }
