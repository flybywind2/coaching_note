"""Coaching Notes 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.coaching_note import (
    CoachingNoteCreate, CoachingNoteUpdate, CoachingNoteOut,
    CoachingCommentCreate, CoachingCommentOut,
)
from app.schemas.coaching_template import (
    CoachingNoteTemplateCreate,
    CoachingNoteTemplateOut,
    CoachingNoteTemplateUpdate,
)
from app.schemas.version import ContentVersionOut
from app.services import coaching_service
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter(tags=["coaching_notes"])


@router.get("/api/projects/{project_id}/notes", response_model=List[CoachingNoteOut])
def list_notes(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return coaching_service.get_notes(db, project_id, current_user)


@router.post("/api/projects/{project_id}/notes", response_model=CoachingNoteOut)
def create_note(
    project_id: int,
    data: CoachingNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.create_note(db, project_id, data, current_user)


@router.get("/api/notes/{note_id}", response_model=CoachingNoteOut)
def get_note(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return coaching_service.get_note(db, note_id, current_user)


@router.put("/api/notes/{note_id}", response_model=CoachingNoteOut)
def update_note(
    note_id: int,
    data: CoachingNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.update_note(db, note_id, data, current_user)


@router.delete("/api/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    coaching_service.delete_note(db, note_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/api/notes/{note_id}/comments", response_model=List[CoachingCommentOut])
def list_comments(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return coaching_service.get_comments(db, note_id, current_user)


@router.post("/api/notes/{note_id}/comments", response_model=CoachingCommentOut)
def create_comment(
    note_id: int,
    data: CoachingCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.create_comment(db, note_id, data, current_user)


@router.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    coaching_service.delete_comment(db, comment_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/api/note-templates", response_model=List[CoachingNoteTemplateOut])
def list_note_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return coaching_service.get_templates(db, current_user)


@router.post("/api/note-templates", response_model=CoachingNoteTemplateOut)
def create_note_template(
    data: CoachingNoteTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.create_template(db, data, current_user)


@router.put("/api/note-templates/{template_id}", response_model=CoachingNoteTemplateOut)
def update_note_template(
    template_id: int,
    data: CoachingNoteTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.update_template(db, template_id, data, current_user)


@router.delete("/api/note-templates/{template_id}")
def delete_note_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coaching_service.delete_template(db, template_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/api/notes/{note_id}/versions", response_model=List[ContentVersionOut])
def list_note_versions(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return coaching_service.get_note_versions(db, note_id, current_user)


@router.post("/api/notes/{note_id}/restore/{version_id}", response_model=CoachingNoteOut)
def restore_note_version(
    note_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return coaching_service.restore_note_version(db, note_id, version_id, current_user)


