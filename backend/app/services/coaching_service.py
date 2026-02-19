from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.user import User
from app.schemas.coaching_note import CoachingNoteCreate, CoachingNoteUpdate, CoachingCommentCreate
from app.utils.permissions import can_write_coaching_note, can_view_coach_only_comment
from typing import List


def get_notes(db: Session, project_id: int, current_user: User) -> List[CoachingNote]:
    return (
        db.query(CoachingNote)
        .filter(CoachingNote.project_id == project_id)
        .order_by(CoachingNote.coaching_date.desc())
        .all()
    )


def get_note(db: Session, note_id: int) -> CoachingNote:
    note = db.query(CoachingNote).filter(CoachingNote.note_id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다.")
    return note


def create_note(db: Session, project_id: int, data: CoachingNoteCreate, current_user: User) -> CoachingNote:
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
    note = get_note(db, note_id)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(note, k, v)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note_id: int, current_user: User):
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    note = get_note(db, note_id)
    db.delete(note)
    db.commit()


def get_comments(db: Session, note_id: int, current_user: User) -> List[CoachingComment]:
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
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 삭제 가능합니다.")
    db.delete(comment)
    db.commit()
