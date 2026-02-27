"""[FEEDBACK7] 과제 조사(의견 취합) 서비스 레이어입니다."""

import json
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.notification import Notification
from app.models.project import Project, ProjectMember
from app.models.project_research import (
    ProjectResearchItem,
    ProjectResearchQuestion,
    ProjectResearchResponse,
)
from app.models.user import User
from app.schemas.project_research import (
    QUESTION_TYPES,
    ProjectResearchItemCreate,
    ProjectResearchItemUpdate,
    ProjectResearchQuestionCreate,
    ProjectResearchQuestionUpdate,
    ProjectResearchResponseUpsert,
)
from app.services import notification_service
from app.utils.permissions import is_admin, is_admin_or_coach, is_participant


def _ensure_not_observer(current_user: User):
    if current_user.role == "observer":
        raise HTTPException(status_code=403, detail="참관자는 과제 조사 페이지에 접근할 수 없습니다.")


def _normalize_options(values: list[str] | None) -> list[str]:
    rows = []
    seen = set()
    for raw in values or []:
        text = str(raw or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        rows.append(text)
    return rows


def _parse_options(question: ProjectResearchQuestion) -> list[str]:
    raw = question.options_json or "[]"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(v) for v in parsed if str(v).strip()]


def _attach_question_options(question: ProjectResearchQuestion) -> ProjectResearchQuestion:
    setattr(question, "options", _parse_options(question))
    return question


def _validate_date_range(start_date: date, end_date: date):
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="조사 시작일은 종료일보다 이후일 수 없습니다.")


def _participant_batch_ids(db: Session, current_user: User) -> set[int]:
    direct_scope = {
        int(row[0])
        for row in db.query(UserBatchAccess.batch_id)
        .filter(UserBatchAccess.user_id == current_user.user_id)
        .all()
    }
    if direct_scope:
        return direct_scope
    membership_scope = {
        int(row[0])
        for row in db.query(Project.batch_id)
        .join(ProjectMember, ProjectMember.project_id == Project.project_id)
        .filter(ProjectMember.user_id == current_user.user_id)
        .all()
    }
    return membership_scope


def _accessible_batch_ids(db: Session, current_user: User) -> list[int]:
    _ensure_not_observer(current_user)
    if is_admin_or_coach(current_user):
        return [int(row[0]) for row in db.query(Batch.batch_id).order_by(Batch.created_at.desc()).all()]
    if is_participant(current_user):
        return sorted(_participant_batch_ids(db, current_user), reverse=True)
    return []


def _ensure_batch_access(db: Session, batch_id: int, current_user: User):
    if int(batch_id) not in _accessible_batch_ids(db, current_user):
        raise HTTPException(status_code=403, detail="해당 차수의 과제 조사에 접근할 수 없습니다.")


def list_accessible_batches(db: Session, current_user: User) -> list[Batch]:
    batch_ids = _accessible_batch_ids(db, current_user)
    if not batch_ids:
        return []
    rows = db.query(Batch).filter(Batch.batch_id.in_(batch_ids)).all()
    by_id = {int(row.batch_id): row for row in rows}
    return [by_id[bid] for bid in batch_ids if bid in by_id]


def list_items(
    db: Session,
    *,
    batch_id: int,
    current_user: User,
    include_hidden: bool = False,
) -> list[ProjectResearchItem]:
    _ensure_batch_access(db, batch_id, current_user)
    query = db.query(ProjectResearchItem).filter(ProjectResearchItem.batch_id == int(batch_id))
    if not is_admin_or_coach(current_user):
        query = query.filter(ProjectResearchItem.is_visible == True)  # noqa: E712
    elif not is_admin(current_user) or not include_hidden:
        query = query.filter(ProjectResearchItem.is_visible == True)  # noqa: E712
    return query.order_by(ProjectResearchItem.created_at.desc(), ProjectResearchItem.item_id.desc()).all()


def _get_item(db: Session, item_id: int) -> ProjectResearchItem:
    row = db.query(ProjectResearchItem).filter(ProjectResearchItem.item_id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="조사 아이템을 찾을 수 없습니다.")
    return row


def create_item(db: Session, data: ProjectResearchItemCreate, current_user: User) -> ProjectResearchItem:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="조사 아이템 관리는 관리자만 가능합니다.")
    _validate_date_range(data.start_date, data.end_date)
    row = ProjectResearchItem(
        **data.model_dump(),
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if row.is_visible:
        _notify_item_published(db, row, current_user)
    return row


def update_item(
    db: Session,
    *,
    item_id: int,
    data: ProjectResearchItemUpdate,
    current_user: User,
) -> ProjectResearchItem:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="조사 아이템 관리는 관리자만 가능합니다.")
    row = _get_item(db, item_id)
    payload = data.model_dump(exclude_none=True)
    next_start = payload.get("start_date", row.start_date)
    next_end = payload.get("end_date", row.end_date)
    _validate_date_range(next_start, next_end)
    was_visible = bool(row.is_visible)
    for key, value in payload.items():
        setattr(row, key, value)
    row.updated_by = current_user.user_id
    db.commit()
    db.refresh(row)
    if not was_visible and bool(row.is_visible):
        _notify_item_published(db, row, current_user)
    return row


def delete_item(db: Session, *, item_id: int, current_user: User):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="조사 아이템 관리는 관리자만 가능합니다.")
    row = _get_item(db, item_id)
    db.delete(row)
    db.commit()


def _validate_question_payload(question_type: str, options: list[str]) -> list[str]:
    normalized_type = str(question_type or "subjective").strip().lower()
    if normalized_type not in QUESTION_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 문항 유형입니다.")
    normalized_options = _normalize_options(options)
    if normalized_type == "objective" and not normalized_options:
        raise HTTPException(status_code=400, detail="객관식 문항은 최소 1개 이상의 선택지가 필요합니다.")
    if normalized_type == "subjective":
        normalized_options = []
    return normalized_options


def create_question(
    db: Session,
    *,
    item_id: int,
    data: ProjectResearchQuestionCreate,
    current_user: User,
) -> ProjectResearchQuestion:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="문항 관리는 관리자만 가능합니다.")
    _get_item(db, item_id)
    options = _validate_question_payload(data.question_type, data.options)
    row = ProjectResearchQuestion(
        item_id=item_id,
        question_text=data.question_text,
        question_type=str(data.question_type).strip().lower(),
        options_json=json.dumps(options, ensure_ascii=False),
        display_order=max(1, int(data.display_order or 1)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _attach_question_options(row)


def update_question(
    db: Session,
    *,
    question_id: int,
    data: ProjectResearchQuestionUpdate,
    current_user: User,
) -> ProjectResearchQuestion:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="문항 관리는 관리자만 가능합니다.")
    row = db.query(ProjectResearchQuestion).filter(ProjectResearchQuestion.question_id == question_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    payload = data.model_dump(exclude_none=True)
    next_type = str(payload.get("question_type", row.question_type)).strip().lower()
    next_options = payload.get("options", _parse_options(row))
    normalized_options = _validate_question_payload(next_type, next_options)
    if "question_text" in payload:
        row.question_text = payload["question_text"]
    row.question_type = next_type
    row.options_json = json.dumps(normalized_options, ensure_ascii=False)
    if "display_order" in payload:
        row.display_order = max(1, int(payload["display_order"] or 1))
    db.commit()
    db.refresh(row)
    return _attach_question_options(row)


def delete_question(db: Session, *, question_id: int, current_user: User):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="문항 관리는 관리자만 가능합니다.")
    row = db.query(ProjectResearchQuestion).filter(ProjectResearchQuestion.question_id == question_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


def _ensure_item_viewable(db: Session, item: ProjectResearchItem, current_user: User):
    _ensure_batch_access(db, item.batch_id, current_user)
    if not item.is_visible and not is_admin_or_coach(current_user):
        raise HTTPException(status_code=404, detail="조사 아이템을 찾을 수 없습니다.")


def _load_questions(db: Session, item_id: int) -> list[ProjectResearchQuestion]:
    rows = (
        db.query(ProjectResearchQuestion)
        .filter(ProjectResearchQuestion.item_id == item_id)
        .order_by(ProjectResearchQuestion.display_order.asc(), ProjectResearchQuestion.question_id.asc())
        .all()
    )
    return [_attach_question_options(row) for row in rows]


def _participant_project_ids_for_batch(db: Session, current_user: User, batch_id: int) -> set[int]:
    return {
        int(row[0])
        for row in db.query(ProjectMember.project_id)
        .join(Project, Project.project_id == ProjectMember.project_id)
        .filter(
            Project.batch_id == int(batch_id),
            ProjectMember.user_id == current_user.user_id,
        )
        .all()
    }


def get_detail(db: Session, *, item_id: int, current_user: User) -> dict:
    _ensure_not_observer(current_user)
    item = _get_item(db, item_id)
    _ensure_item_viewable(db, item, current_user)

    questions = _load_questions(db, item.item_id)
    projects = (
        db.query(Project)
        .filter(Project.batch_id == item.batch_id)
        .order_by(Project.created_at.asc(), Project.project_id.asc())
        .all()
    )
    responses = (
        db.query(ProjectResearchResponse)
        .filter(ProjectResearchResponse.item_id == item.item_id)
        .all()
    )
    response_map = {
        (int(row.project_id), int(row.question_id)): str(row.answer_text or "")
        for row in responses
    }

    my_project_ids = _participant_project_ids_for_batch(db, current_user, item.batch_id) if is_participant(current_user) else set()
    today = date.today()
    can_answer = bool(
        is_participant(current_user)
        and item.is_visible
        and item.start_date <= today <= item.end_date
        and my_project_ids
    )

    def _project_sort_key(project: Project):
        return (0 if int(project.project_id) in my_project_ids else 1, int(project.project_id))

    ordered_projects = sorted(projects, key=_project_sort_key) if is_participant(current_user) else projects
    rows = []
    for project in ordered_projects:
        answers = {
            str(question.question_id): response_map.get((int(project.project_id), int(question.question_id)), "")
            for question in questions
        }
        rows.append(
            {
                "project_id": int(project.project_id),
                "project_name": project.project_name,
                "representative": project.representative,
                "is_my_project": int(project.project_id) in my_project_ids,
                "can_edit": can_answer and int(project.project_id) in my_project_ids,
                "answers": answers,
            }
        )

    return {
        "item": item,
        "questions": questions,
        "rows": rows,
        "can_manage": is_admin(current_user),
        "can_answer": can_answer,
    }


def upsert_responses(
    db: Session,
    *,
    item_id: int,
    data: ProjectResearchResponseUpsert,
    current_user: User,
) -> dict:
    if not is_participant(current_user):
        raise HTTPException(status_code=403, detail="응답 입력은 참여자만 가능합니다.")
    item = _get_item(db, item_id)
    _ensure_item_viewable(db, item, current_user)
    today = date.today()
    if not item.is_visible:
        raise HTTPException(status_code=403, detail="공개된 조사 아이템만 응답할 수 있습니다.")
    if today < item.start_date or today > item.end_date:
        raise HTTPException(status_code=403, detail="참여자는 본인 차수에만 작성할 수 있습니다.")

    project = (
        db.query(Project)
        .filter(
            Project.project_id == int(data.project_id),
            Project.batch_id == item.batch_id,
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

    is_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.project_id,
            ProjectMember.user_id == current_user.user_id,
        )
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="참여자는 본인 차수에만 작성할 수 있습니다.")

    question_map = {
        int(row.question_id): row
        for row in _load_questions(db, item.item_id)
    }
    if not question_map:
        raise HTTPException(status_code=400, detail="응답할 문항이 없습니다.")

    for answer in data.answers:
        question = question_map.get(int(answer.question_id))
        if not question:
            raise HTTPException(status_code=400, detail="조사 문항 정보가 올바르지 않습니다.")
        normalized_answer = str(answer.answer_text or "").strip()
        if question.question_type == "objective":
            options = set(_parse_options(question))
            if normalized_answer and normalized_answer not in options:
                raise HTTPException(status_code=400, detail="객관식 응답 값이 유효하지 않습니다.")
        existing = (
            db.query(ProjectResearchResponse)
            .filter(
                ProjectResearchResponse.item_id == item.item_id,
                ProjectResearchResponse.question_id == question.question_id,
                ProjectResearchResponse.project_id == project.project_id,
            )
            .first()
        )
        if existing:
            existing.answer_text = normalized_answer
            existing.responded_by = current_user.user_id
            continue
        db.add(
            ProjectResearchResponse(
                item_id=item.item_id,
                question_id=question.question_id,
                project_id=project.project_id,
                answer_text=normalized_answer,
                responded_by=current_user.user_id,
            )
        )
    db.commit()
    return get_detail(db, item_id=item.item_id, current_user=current_user)


def _notify_item_published(db: Session, item: ProjectResearchItem, actor: User):
    member_targets = {
        int(row[0])
        for row in db.query(User.user_id)
        .join(ProjectMember, ProjectMember.user_id == User.user_id)
        .join(Project, Project.project_id == ProjectMember.project_id)
        .filter(
            User.is_active == True,  # noqa: E712
            User.role == "participant",
            Project.batch_id == item.batch_id,
            User.user_id != actor.user_id,
        )
        .all()
    }
    scoped_targets = {
        int(row[0])
        for row in db.query(User.user_id)
        .join(UserBatchAccess, UserBatchAccess.user_id == User.user_id)
        .filter(
            User.is_active == True,  # noqa: E712
            User.role == "participant",
            UserBatchAccess.batch_id == item.batch_id,
            User.user_id != actor.user_id,
        )
        .all()
    }
    for user_id in sorted(member_targets | scoped_targets):
        notification_service.create_notification(
            db=db,
            user_id=int(user_id),
            noti_type="project_research",
            title="과제 조사 공개",
            message=f"{actor.name}님이 '{item.title}' 조사를 공개했습니다.",
            link_url=f"#/project-research?batch_id={item.batch_id}&item_id={item.item_id}",
        )

