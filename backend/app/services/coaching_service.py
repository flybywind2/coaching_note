"""Coaching Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.project import Project
from app.models.user import User
from app.schemas.coaching_note import CoachingNoteCreate, CoachingNoteUpdate, CoachingCommentCreate
from app.utils.permissions import can_view_project, can_write_coaching_note, can_view_coach_only_comment
from typing import List


def _get_accessible_project(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    if not can_view_project(db, project, current_user):
        raise HTTPException(status_code=403, detail="이 과제에 접근할 권한이 없습니다.")
    return project


def get_notes(db: Session, project_id: int, current_user: User) -> List[CoachingNote]:
    _get_accessible_project(db, project_id, current_user)
    return (
        db.query(CoachingNote)
        .filter(CoachingNote.project_id == project_id)
        .order_by(CoachingNote.coaching_date.desc())
        .all()
    )


def get_note(db: Session, note_id: int, current_user: User) -> CoachingNote:
    note = db.query(CoachingNote).filter(CoachingNote.note_id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다.")
    _get_accessible_project(db, note.project_id, current_user)
    return note


def create_note(db: Session, project_id: int, data: CoachingNoteCreate, current_user: User) -> CoachingNote:
    _get_accessible_project(db, project_id, current_user)
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 작성은 관리자/코치만 가능합니다.")
    note = CoachingNote(project_id=project_id, author_id=current_user.user_id, **data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note_id: int, data: CoachingNoteUpdate, current_user: User) -> CoachingNote:
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 수정은 관리자/코치만 가능합니다.")
    note = get_note(db, note_id, current_user)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(note, k, v)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note_id: int, current_user: User):
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    note = get_note(db, note_id, current_user)
    db.delete(note)
    db.commit()


def get_comments(db: Session, note_id: int, current_user: User) -> List[CoachingComment]:
    get_note(db, note_id, current_user)
    comments = (
        db.query(CoachingComment)
        .filter(CoachingComment.note_id == note_id)
        .order_by(CoachingComment.created_at)
        .all()
    )
    if not can_view_coach_only_comment(current_user):
        comments = [c for c in comments if not c.is_coach_only]
    return comments


def create_comment(db: Session, note_id: int, data: CoachingCommentCreate, current_user: User) -> CoachingComment:
    if current_user.role == "observer":
        raise HTTPException(status_code=403, detail="참관자는 작성 권한이 없습니다.")
    get_note(db, note_id, current_user)
    # is_coach_only can only be set by admin/coach
    if data.is_coach_only and not can_view_coach_only_comment(current_user):
        raise HTTPException(status_code=403, detail="코치 전용 메모는 관리자/코치만 작성할 수 있습니다.")
    comment = CoachingComment(note_id=note_id, author_id=current_user.user_id, **data.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment_id: int, current_user: User):
    comment = db.query(CoachingComment).filter(CoachingComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    note = db.query(CoachingNote).filter(CoachingNote.note_id == comment.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다.")
    _get_accessible_project(db, note.project_id, current_user)
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 삭제 가능합니다.")
    db.delete(comment)
    db.commit()


