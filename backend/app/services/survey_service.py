"""[FEEDBACK7] 설문 서비스 레이어입니다."""

import csv
import io
import json
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.survey import Survey, SurveyQuestion, SurveyResponse
from app.models.user import User
from app.schemas.survey import (
    QUESTION_TYPES,
    SurveyCreate,
    SurveyQuestionCreate,
    SurveyQuestionUpdate,
    SurveyResponseUpsert,
    SurveyUpdate,
)
from app.services import notification_service
from app.utils.permissions import is_admin, is_participant


def _ensure_allowed_role(current_user: User):
    if current_user.role not in {"admin", "participant"}:
        raise HTTPException(status_code=403, detail="설문 페이지에 접근할 수 없습니다.")


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


def _parse_options(question: SurveyQuestion) -> list[str]:
    raw = question.options_json or "[]"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(v) for v in parsed if str(v).strip()]


def _attach_question_options(question: SurveyQuestion) -> SurveyQuestion:
    setattr(question, "options", _parse_options(question))
    return question


def _parse_multi_answer(response: SurveyResponse) -> list[str]:
    raw = response.answer_json or "[]"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(v).strip() for v in parsed if str(v).strip()]


def _validate_date_range(start_date: date, end_date: date):
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="설문 시작일은 종료일보다 이후일 수 없습니다.")


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
    _ensure_allowed_role(current_user)
    if is_admin(current_user):
        return [int(row[0]) for row in db.query(Batch.batch_id).order_by(Batch.created_at.desc()).all()]
    return sorted(_participant_batch_ids(db, current_user), reverse=True)


def _ensure_batch_access(db: Session, batch_id: int, current_user: User):
    if int(batch_id) not in _accessible_batch_ids(db, current_user):
        raise HTTPException(status_code=403, detail="해당 차수의 설문에 접근할 수 없습니다.")


def list_accessible_batches(db: Session, current_user: User) -> list[Batch]:
    batch_ids = _accessible_batch_ids(db, current_user)
    if not batch_ids:
        return []
    rows = db.query(Batch).filter(Batch.batch_id.in_(batch_ids)).all()
    by_id = {int(row.batch_id): row for row in rows}
    return [by_id[bid] for bid in batch_ids if bid in by_id]


def list_surveys(
    db: Session,
    *,
    batch_id: int,
    current_user: User,
    include_hidden: bool = False,
) -> list[Survey]:
    _ensure_batch_access(db, batch_id, current_user)
    query = db.query(Survey).filter(Survey.batch_id == int(batch_id))
    if is_participant(current_user):
        query = query.filter(Survey.is_visible == True)  # noqa: E712
    elif not include_hidden:
        query = query.filter(Survey.is_visible == True)  # noqa: E712
    return query.order_by(Survey.created_at.desc(), Survey.survey_id.desc()).all()


def _get_survey(db: Session, survey_id: int) -> Survey:
    row = db.query(Survey).filter(Survey.survey_id == int(survey_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다.")
    return row


def _ensure_single_visible_survey(db: Session, *, exclude_survey_id: int | None = None):
    query = db.query(Survey).filter(Survey.is_visible == True)  # noqa: E712
    if exclude_survey_id is not None:
        query = query.filter(Survey.survey_id != int(exclude_survey_id))
    existing = query.first()
    if existing:
        raise HTTPException(status_code=400, detail="동시에 공개 가능한 설문은 1개입니다.")


def create_survey(db: Session, data: SurveyCreate, current_user: User) -> Survey:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="설문 관리는 관리자만 가능합니다.")
    _validate_date_range(data.start_date, data.end_date)
    if data.is_visible:
        _ensure_single_visible_survey(db)
    row = Survey(
        **data.model_dump(),
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if row.is_visible:
        _notify_survey_published(db, row, current_user)
    return row


def update_survey(
    db: Session,
    *,
    survey_id: int,
    data: SurveyUpdate,
    current_user: User,
) -> Survey:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="설문 관리는 관리자만 가능합니다.")
    row = _get_survey(db, survey_id)
    payload = data.model_dump(exclude_none=True)
    next_start = payload.get("start_date", row.start_date)
    next_end = payload.get("end_date", row.end_date)
    _validate_date_range(next_start, next_end)
    was_visible = bool(row.is_visible)
    if payload.get("is_visible") is True and not was_visible:
        _ensure_single_visible_survey(db, exclude_survey_id=row.survey_id)
    for key, value in payload.items():
        setattr(row, key, value)
    row.updated_by = current_user.user_id
    db.commit()
    db.refresh(row)
    if not was_visible and bool(row.is_visible):
        _notify_survey_published(db, row, current_user)
    return row


def delete_survey(db: Session, *, survey_id: int, current_user: User):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="설문 관리는 관리자만 가능합니다.")
    row = _get_survey(db, survey_id)
    db.delete(row)
    db.commit()


def _validate_question_payload(
    question_type: str,
    *,
    is_multi_select: bool,
    options: list[str],
) -> tuple[str, bool, list[str]]:
    normalized_type = str(question_type or "subjective").strip().lower()
    if normalized_type not in QUESTION_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 문항 유형입니다.")

    normalized_options = _normalize_options(options)
    normalized_multi = bool(is_multi_select)

    if normalized_type == "subjective":
        normalized_multi = False
        normalized_options = []
    elif normalized_type == "objective_choice":
        if not normalized_options:
            raise HTTPException(status_code=400, detail="항목형 문항은 최소 1개 이상의 선택지가 필요합니다.")
    elif normalized_type == "objective_score":
        normalized_multi = False
        if not normalized_options:
            normalized_options = ["1", "2", "3", "4", "5"]
        for value in normalized_options:
            try:
                float(str(value))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="점수형 문항의 선택지는 숫자여야 합니다.") from exc
    return normalized_type, normalized_multi, normalized_options


def create_question(
    db: Session,
    *,
    survey_id: int,
    data: SurveyQuestionCreate,
    current_user: User,
) -> SurveyQuestion:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="질문 관리는 관리자만 가능합니다.")
    _get_survey(db, survey_id)
    question_type, is_multi_select, options = _validate_question_payload(
        data.question_type,
        is_multi_select=data.is_multi_select,
        options=data.options,
    )
    row = SurveyQuestion(
        survey_id=int(survey_id),
        question_text=data.question_text,
        question_type=question_type,
        is_required=bool(data.is_required),
        is_multi_select=is_multi_select,
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
    data: SurveyQuestionUpdate,
    current_user: User,
) -> SurveyQuestion:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="질문 관리는 관리자만 가능합니다.")
    row = db.query(SurveyQuestion).filter(SurveyQuestion.question_id == int(question_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="질문을 찾을 수 없습니다.")
    payload = data.model_dump(exclude_none=True)
    next_type = str(payload.get("question_type", row.question_type)).strip().lower()
    next_multi = bool(payload.get("is_multi_select", row.is_multi_select))
    next_options = payload.get("options", _parse_options(row))
    normalized_type, normalized_multi, normalized_options = _validate_question_payload(
        next_type,
        is_multi_select=next_multi,
        options=next_options,
    )

    if "question_text" in payload:
        row.question_text = payload["question_text"]
    if "is_required" in payload:
        row.is_required = bool(payload["is_required"])
    if "display_order" in payload:
        row.display_order = max(1, int(payload["display_order"] or 1))
    row.question_type = normalized_type
    row.is_multi_select = normalized_multi
    row.options_json = json.dumps(normalized_options, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    return _attach_question_options(row)


def delete_question(db: Session, *, question_id: int, current_user: User):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="질문 관리는 관리자만 가능합니다.")
    row = db.query(SurveyQuestion).filter(SurveyQuestion.question_id == int(question_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="질문을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


def _ensure_survey_viewable(db: Session, survey: Survey, current_user: User):
    _ensure_batch_access(db, survey.batch_id, current_user)
    if not survey.is_visible and not is_admin(current_user):
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다.")


def _load_questions(db: Session, survey_id: int) -> list[SurveyQuestion]:
    rows = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == int(survey_id))
        .order_by(SurveyQuestion.display_order.asc(), SurveyQuestion.question_id.asc())
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


def _to_non_empty_response(answer_text: str | None, multi_answers: list[str] | None) -> bool:
    if multi_answers:
        return True
    return bool(str(answer_text or "").strip())


def _score_value(value: str | None) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _compute_stats(
    db: Session,
    *,
    survey: Survey,
    questions: list[SurveyQuestion],
    projects: list[Project],
    responses: list[SurveyResponse],
) -> dict:
    required_ids = {int(row.question_id) for row in questions if row.is_required}
    responses_by_project: dict[int, dict[int, tuple[str, list[str]]]] = {}
    score_question_ids = {int(row.question_id) for row in questions if row.question_type == "objective_score"}

    for response in responses:
        project_id = int(response.project_id)
        question_id = int(response.question_id)
        proj_map = responses_by_project.setdefault(project_id, {})
        proj_map[question_id] = (str(response.answer_text or ""), _parse_multi_answer(response))

    response_rates = []
    project_score_averages = []
    all_scores = []
    for project in projects:
        project_id = int(project.project_id)
        proj_answers = responses_by_project.get(project_id, {})
        answered_required = 0
        for qid in required_ids:
            answer_text, multi = proj_answers.get(qid, ("", []))
            if _to_non_empty_response(answer_text, multi):
                answered_required += 1
        required_count = len(required_ids)
        rate = 0.0 if required_count == 0 else round((answered_required / required_count) * 100, 2)
        response_rates.append(
            {
                "project_id": project_id,
                "project_name": project.project_name,
                "answered_required": answered_required,
                "required_question_count": required_count,
                "response_rate": rate,
            }
        )

        scores = []
        for qid in score_question_ids:
            answer_text, _ = proj_answers.get(qid, ("", []))
            score = _score_value(answer_text)
            if score is None:
                continue
            scores.append(score)
            all_scores.append(score)
        project_score_averages.append(
            {
                "project_id": project_id,
                "project_name": project.project_name,
                "average_score": round(sum(scores) / len(scores), 2) if scores else None,
            }
        )

    return {
        "response_rates": response_rates,
        "overall_score_average": round(sum(all_scores) / len(all_scores), 2) if all_scores else None,
        "project_score_averages": project_score_averages,
    }


def get_detail(db: Session, *, survey_id: int, current_user: User) -> dict:
    _ensure_allowed_role(current_user)
    survey = _get_survey(db, survey_id)
    _ensure_survey_viewable(db, survey, current_user)

    questions = _load_questions(db, survey.survey_id)
    projects = (
        db.query(Project)
        .filter(Project.batch_id == survey.batch_id)
        .order_by(Project.created_at.asc(), Project.project_id.asc())
        .all()
    )
    responses = db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey.survey_id).all()
    response_map = {
        (int(row.project_id), int(row.question_id)): str(row.answer_text or "")
        for row in responses
    }
    multi_response_map = {
        (int(row.project_id), int(row.question_id)): _parse_multi_answer(row)
        for row in responses
    }

    my_project_ids = (
        _participant_project_ids_for_batch(db, current_user, survey.batch_id)
        if is_participant(current_user)
        else set()
    )
    today = date.today()
    can_answer = bool(
        is_participant(current_user)
        and survey.is_visible
        and survey.start_date <= today <= survey.end_date
        and my_project_ids
    )

    if is_participant(current_user):
        # [FEEDBACK7] 참여자는 설문에서 본인 소속 과제만 노출
        ordered_projects = [row for row in projects if int(row.project_id) in my_project_ids]
    else:
        ordered_projects = projects
    rows = []
    for project in ordered_projects:
        answers = {
            str(question.question_id): response_map.get((int(project.project_id), int(question.question_id)), "")
            for question in questions
        }
        multi_answers = {
            str(question.question_id): multi_response_map.get((int(project.project_id), int(question.question_id)), [])
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
                "multi_answers": multi_answers,
            }
        )

    payload = {
        "survey": survey,
        "questions": questions,
        "rows": rows,
        "can_manage": is_admin(current_user),
        "can_answer": can_answer,
        "stats": _compute_stats(
            db,
            survey=survey,
            questions=questions,
            projects=projects,
            responses=responses,
        )
        if is_admin(current_user)
        else None,
    }
    return payload


def _ensure_participant_can_submit(
    db: Session,
    *,
    survey: Survey,
    project_id: int,
    current_user: User,
) -> Project:
    if not is_participant(current_user):
        raise HTTPException(status_code=403, detail="설문 응답은 참여자만 가능합니다.")
    _ensure_survey_viewable(db, survey, current_user)
    today = date.today()
    if not survey.is_visible or today < survey.start_date or today > survey.end_date:
        raise HTTPException(status_code=403, detail="현재 진행중인 설문이 아닙니다.")

    project = (
        db.query(Project)
        .filter(
            Project.project_id == int(project_id),
            Project.batch_id == survey.batch_id,
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
        raise HTTPException(status_code=403, detail="참여자는 본인 과제 설문만 제출할 수 있습니다.")
    return project


def upsert_responses(
    db: Session,
    *,
    survey_id: int,
    data: SurveyResponseUpsert,
    current_user: User,
) -> dict:
    survey = _get_survey(db, survey_id)
    project = _ensure_participant_can_submit(
        db,
        survey=survey,
        project_id=data.project_id,
        current_user=current_user,
    )

    question_map = {int(row.question_id): row for row in _load_questions(db, survey.survey_id)}
    if not question_map:
        raise HTTPException(status_code=400, detail="응답할 문항이 없습니다.")

    answer_map = {}
    for answer in data.answers:
        qid = int(answer.question_id)
        question = question_map.get(qid)
        if not question:
            raise HTTPException(status_code=400, detail="설문 문항 정보가 올바르지 않습니다.")

        selected_options = _normalize_options(answer.selected_options)
        answer_text = str(answer.answer_text or "").strip()

        if question.question_type == "subjective":
            selected_options = []
        elif question.question_type == "objective_choice":
            options = set(_parse_options(question))
            for opt in selected_options:
                if opt not in options:
                    raise HTTPException(status_code=400, detail="항목형 응답 값이 유효하지 않습니다.")
            if question.is_multi_select:
                answer_text = ", ".join(selected_options)
            else:
                if not answer_text and selected_options:
                    answer_text = selected_options[0]
                if answer_text and answer_text not in options:
                    raise HTTPException(status_code=400, detail="항목형 응답 값이 유효하지 않습니다.")
                selected_options = [answer_text] if answer_text else []
        elif question.question_type == "objective_score":
            options = set(_parse_options(question))
            if not answer_text and selected_options:
                answer_text = selected_options[0]
            if answer_text and answer_text not in options:
                raise HTTPException(status_code=400, detail="점수형 응답 값이 유효하지 않습니다.")
            selected_options = [answer_text] if answer_text else []

        answer_map[qid] = {
            "answer_text": answer_text,
            "selected_options": selected_options,
        }

    required_ids = {qid for qid, row in question_map.items() if row.is_required}
    missing_required = []
    for qid in required_ids:
        row = answer_map.get(qid)
        if not row:
            missing_required.append(qid)
            continue
        if not _to_non_empty_response(row["answer_text"], row["selected_options"]):
            missing_required.append(qid)
    if missing_required:
        raise HTTPException(status_code=400, detail="필수 문항에 모두 응답해야 제출할 수 있습니다.")

    for qid, answer_row in answer_map.items():
        existing = (
            db.query(SurveyResponse)
            .filter(
                SurveyResponse.survey_id == survey.survey_id,
                SurveyResponse.question_id == qid,
                SurveyResponse.project_id == project.project_id,
            )
            .first()
        )
        answer_text = str(answer_row["answer_text"] or "").strip()
        selected_options = answer_row["selected_options"]
        answer_json = json.dumps(selected_options, ensure_ascii=False) if selected_options else None
        if existing:
            existing.answer_text = answer_text
            existing.answer_json = answer_json
            existing.responded_by = current_user.user_id
            continue
        db.add(
            SurveyResponse(
                survey_id=survey.survey_id,
                question_id=qid,
                project_id=project.project_id,
                answer_text=answer_text,
                answer_json=answer_json,
                responded_by=current_user.user_id,
            )
        )
    db.commit()
    return get_detail(db, survey_id=survey.survey_id, current_user=current_user)


def cancel_responses(
    db: Session,
    *,
    survey_id: int,
    project_id: int,
    current_user: User,
) -> dict:
    survey = _get_survey(db, survey_id)
    project = _ensure_participant_can_submit(
        db,
        survey=survey,
        project_id=project_id,
        current_user=current_user,
    )
    db.query(SurveyResponse).filter(
        SurveyResponse.survey_id == survey.survey_id,
        SurveyResponse.project_id == project.project_id,
    ).delete()
    db.commit()
    return get_detail(db, survey_id=survey.survey_id, current_user=current_user)


def get_stats(db: Session, *, survey_id: int, current_user: User) -> dict:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="설문 결과 조회는 관리자만 가능합니다.")
    detail = get_detail(db, survey_id=survey_id, current_user=current_user)
    return detail.get("stats") or {
        "response_rates": [],
        "overall_score_average": None,
        "project_score_averages": [],
    }


def export_csv(db: Session, *, survey_id: int, current_user: User) -> str:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="설문 결과 내보내기는 관리자만 가능합니다.")
    detail = get_detail(db, survey_id=survey_id, current_user=current_user)
    questions = detail["questions"]
    rows = detail["rows"]
    output = io.StringIO()
    writer = csv.writer(output)
    header = ["과제명", "대표자"] + [question.question_text for question in questions]
    writer.writerow(header)
    for row in rows:
        values = [row["project_name"], row["representative"] or ""]
        for question in questions:
            question_id = str(question.question_id)
            if question.is_multi_select:
                value = "|".join(row["multi_answers"].get(question_id, []))
            else:
                value = row["answers"].get(question_id, "")
            values.append(value)
        writer.writerow(values)
    return output.getvalue()


def _notify_survey_published(db: Session, survey: Survey, actor: User):
    member_targets = {
        int(row[0])
        for row in db.query(User.user_id)
        .join(ProjectMember, ProjectMember.user_id == User.user_id)
        .join(Project, Project.project_id == ProjectMember.project_id)
        .filter(
            User.is_active == True,  # noqa: E712
            User.role == "participant",
            Project.batch_id == survey.batch_id,
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
            UserBatchAccess.batch_id == survey.batch_id,
            User.user_id != actor.user_id,
        )
        .all()
    }
    for user_id in sorted(member_targets | scoped_targets):
        notification_service.create_notification(
            db=db,
            user_id=int(user_id),
            noti_type="survey",
            title="설문 공개",
            message=f"{actor.name}님이 '{survey.title}' 설문을 공개했습니다.",
            link_url=f"#/survey?batch_id={survey.batch_id}&survey_id={survey.survey_id}",
        )
