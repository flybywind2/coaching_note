"""Coaching Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.coaching_template import CoachingNoteTemplate
from app.models.project import Project
from app.models.batch import Batch
from app.models.user import User
from app.schemas.coaching_note import CoachingNoteCreate, CoachingNoteUpdate, CoachingCommentCreate
from app.schemas.coaching_template import CoachingNoteTemplateCreate, CoachingNoteTemplateUpdate
from app.services import mention_service, version_service
from app.utils.permissions import can_view_project, can_write_coaching_note, can_view_coach_only_comment, is_coach
from typing import List
from datetime import date


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


def _note_snapshot(note: CoachingNote) -> dict:
    return {
        "coaching_date": str(note.coaching_date) if note.coaching_date else None,
        "week_number": note.week_number,
        "current_status": note.current_status,
        "progress_rate": note.progress_rate,
        "main_issue": note.main_issue,
        "next_action": note.next_action,
    }


def _calculate_week_number(db: Session, project_id: int, coaching_date: date | None) -> int | None:
    if not coaching_date:
        return None
    row = (
        db.query(Batch.coaching_start_date, Batch.start_date)
        .join(Project, Project.batch_id == Batch.batch_id)
        .filter(Project.project_id == project_id)
        .first()
    )
    if not row:
        return None
    baseline = row[0] or row[1]
    if not baseline:
        return None
    delta_days = (coaching_date - baseline).days
    return (delta_days // 7) + 1 if delta_days >= 0 else 1


def create_note(db: Session, project_id: int, data: CoachingNoteCreate, current_user: User) -> CoachingNote:
    project = _get_accessible_project(db, project_id, current_user)
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 작성은 관리자/코치만 가능합니다.")
    payload = data.model_dump()
    if payload.get("progress_rate") is None:
        payload["progress_rate"] = project.progress_rate
    else:
        project.progress_rate = payload["progress_rate"]
    payload["week_number"] = _calculate_week_number(db, project_id, payload.get("coaching_date"))
    note = CoachingNote(project_id=project_id, author_id=current_user.user_id, **payload)
    db.add(note)
    db.commit()
    db.refresh(note)
    version_service.create_content_version(
        db,
        entity_type="coaching_note",
        entity_id=note.note_id,
        changed_by=current_user.user_id,
        change_type="create",
        snapshot=_note_snapshot(note),
    )
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="코칭노트",
        link_url=f"#/project/{project_id}/notes/{note.note_id}",
        new_texts=[note.current_status, note.main_issue, note.next_action],
    )
    return note


def update_note(db: Session, note_id: int, data: CoachingNoteUpdate, current_user: User) -> CoachingNote:
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 수정은 관리자/코치만 가능합니다.")
    note = get_note(db, note_id, current_user)
    before_texts = [note.current_status, note.main_issue, note.next_action]
    payload = data.model_dump(exclude_none=True)
    effective_date = payload.get("coaching_date", note.coaching_date)
    payload["week_number"] = _calculate_week_number(db, note.project_id, effective_date)
    if "progress_rate" in payload:
        db.query(Project).filter(Project.project_id == note.project_id).update({"progress_rate": payload["progress_rate"]})
    for k, v in payload.items():
        setattr(note, k, v)
    db.commit()
    db.refresh(note)
    version_service.create_content_version(
        db,
        entity_type="coaching_note",
        entity_id=note.note_id,
        changed_by=current_user.user_id,
        change_type="update",
        snapshot=_note_snapshot(note),
    )
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="코칭노트",
        link_url=f"#/project/{note.project_id}/notes/{note.note_id}",
        new_texts=[note.current_status, note.main_issue, note.next_action],
        previous_texts=before_texts,
    )
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
        .options(joinedload(CoachingComment.author))
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
    # `코치들에게만 공유` 옵션은 관리자/코치만 사용할 수 있다.
    if data.is_coach_only and not can_view_coach_only_comment(current_user):
        raise HTTPException(status_code=403, detail="코치들에게만 공유 설정은 관리자/코치만 사용할 수 있습니다.")
    comment = CoachingComment(note_id=note_id, author_id=current_user.user_id, **data.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="코칭 의견" if (current_user.role == "admin" or is_coach(current_user)) else "참여자 메모",
        link_url=f"#/project/{comment.note.project_id}/notes/{note_id}",
        new_texts=[comment.content],
    )
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


def get_note_versions(db: Session, note_id: int, current_user: User) -> List[dict]:
    get_note(db, note_id, current_user)
    versions = version_service.list_versions(db, entity_type="coaching_note", entity_id=note_id)
    return [version_service.to_response(row) for row in versions]


def restore_note_version(db: Session, note_id: int, version_id: int, current_user: User) -> CoachingNote:
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 복원은 관리자/코치만 가능합니다.")
    note = get_note(db, note_id, current_user)
    row = version_service.get_version(
        db,
        entity_type="coaching_note",
        entity_id=note_id,
        version_id=version_id,
    )
    snapshot = version_service.parse_snapshot(row)
    restored_date = snapshot.get("coaching_date")
    if restored_date:
        try:
            note.coaching_date = date.fromisoformat(restored_date)
        except ValueError:
            pass
    note.week_number = snapshot.get("week_number")
    note.current_status = snapshot.get("current_status")
    note.progress_rate = snapshot.get("progress_rate")
    note.main_issue = snapshot.get("main_issue")
    note.next_action = snapshot.get("next_action")
    db.commit()
    db.refresh(note)
    version_service.create_content_version(
        db,
        entity_type="coaching_note",
        entity_id=note.note_id,
        changed_by=current_user.user_id,
        change_type="restore",
        snapshot=_note_snapshot(note),
    )
    return note


def get_templates(db: Session, current_user: User) -> List[CoachingNoteTemplate]:
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 템플릿 권한이 없습니다.")
    return (
        db.query(CoachingNoteTemplate)
        .filter(
            (CoachingNoteTemplate.owner_id == current_user.user_id)
            | (CoachingNoteTemplate.is_shared == True)
        )
        .order_by(CoachingNoteTemplate.created_at.desc())
        .all()
    )


def create_template(db: Session, data: CoachingNoteTemplateCreate, current_user: User) -> CoachingNoteTemplate:
    if not can_write_coaching_note(current_user):
        raise HTTPException(status_code=403, detail="코칭노트 템플릿 생성 권한이 없습니다.")
    row = CoachingNoteTemplate(owner_id=current_user.user_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _get_template(db: Session, template_id: int) -> CoachingNoteTemplate:
    row = db.query(CoachingNoteTemplate).filter(CoachingNoteTemplate.template_id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="코칭노트 템플릿을 찾을 수 없습니다.")
    return row


def update_template(
    db: Session,
    template_id: int,
    data: CoachingNoteTemplateUpdate,
    current_user: User,
) -> CoachingNoteTemplate:
    row = _get_template(db, template_id)
    if row.owner_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 템플릿 또는 관리자만 수정 가능합니다.")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_template(db: Session, template_id: int, current_user: User):
    row = _get_template(db, template_id)
    if row.owner_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 템플릿 또는 관리자만 삭제 가능합니다.")
    db.delete(row)
    db.commit()


