"""[FEEDBACK7] 강의/수강신청 서비스 레이어입니다."""

import json
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.lecture import Lecture, LectureRegistration
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.schemas.lecture import (
    APPROVAL_STATUSES,
    LectureBulkUpdate,
    LectureCreate,
    LectureRegistrationCreate,
    LectureUpdate,
)
from app.utils.permissions import is_admin, is_participant


def _validate_ranges(
    *,
    start_datetime: datetime,
    end_datetime: datetime,
    apply_start_date: date,
    apply_end_date: date,
):
    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="강의 종료 시각은 시작 시각보다 이후여야 합니다.")
    # [feedback8] 강의 시작/종료 시각은 10분 단위만 허용합니다.
    if (
        start_datetime.minute % 10 != 0
        or end_datetime.minute % 10 != 0
        or start_datetime.second != 0
        or end_datetime.second != 0
        or start_datetime.microsecond != 0
        or end_datetime.microsecond != 0
    ):
        raise HTTPException(status_code=400, detail="강의 시간은 10분 단위로 설정해야 합니다.")
    if apply_end_date < apply_start_date:
        raise HTTPException(status_code=400, detail="신청 종료일은 신청 시작일보다 이전일 수 없습니다.")


def _ensure_batch_exists(db: Session, batch_id: int):
    row = db.query(Batch).filter(Batch.batch_id == int(batch_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="차수를 찾을 수 없습니다.")


def _normalize_member_ids(values: list[int]) -> list[int]:
    seen = set()
    rows: list[int] = []
    for raw in values or []:
        try:
            user_id = int(raw)
        except (TypeError, ValueError):
            continue
        if user_id in seen:
            continue
        seen.add(user_id)
        rows.append(user_id)
    return rows


def _parse_member_ids(row: LectureRegistration) -> list[int]:
    try:
        parsed = json.loads(row.member_user_ids_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [int(v) for v in parsed if isinstance(v, int) or str(v).isdigit()]


def _active_registration_query(db: Session, lecture_id: int):
    return db.query(LectureRegistration).filter(
        LectureRegistration.lecture_id == int(lecture_id),
        LectureRegistration.approval_status.in_(["pending", "approved"]),
    )


def _stats_map(db: Session, lecture_ids: list[int]) -> dict[int, dict[str, int]]:
    if not lecture_ids:
        return {}
    rows = (
        db.query(LectureRegistration)
        .filter(
            LectureRegistration.lecture_id.in_(lecture_ids),
            LectureRegistration.approval_status.in_(["pending", "approved"]),
        )
        .all()
    )
    payload: dict[int, dict[str, int]] = {}
    for row in rows:
        lecture_id = int(row.lecture_id)
        target = payload.setdefault(lecture_id, {"registered_count": 0, "approved_count": 0})
        member_count = int(row.member_count or 0)
        target["registered_count"] += member_count
        if row.approval_status == "approved":
            target["approved_count"] += member_count
    return payload


def _attach_stats(lecture: Lecture, stats: dict[str, int]):
    setattr(lecture, "registered_count", int(stats.get("registered_count", 0)))
    setattr(lecture, "approved_count", int(stats.get("approved_count", 0)))
    return lecture


def _participant_registration_status_map(
    db: Session,
    *,
    lecture_ids: list[int],
    current_user: User,
) -> dict[int, str]:
    # [feedback8] 참여자 강의리스트에서 강의별 신청 여부/상태를 카드에 표시하기 위한 매핑입니다.
    if not lecture_ids or not is_participant(current_user):
        return {}
    my_project_ids = {
        int(row[0])
        for row in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == current_user.user_id)
        .all()
    }
    if not my_project_ids:
        return {}
    rows = (
        db.query(LectureRegistration)
        .filter(
            LectureRegistration.lecture_id.in_(lecture_ids),
            LectureRegistration.project_id.in_(my_project_ids),
        )
        .all()
    )
    if not rows:
        return {}
    priority = {"approved": 4, "pending": 3, "rejected": 2, "cancelled": 1}
    payload: dict[int, str] = {}
    for row in rows:
        lecture_id = int(row.lecture_id)
        status = str(row.approval_status or "").strip().lower()
        if not status:
            continue
        existing = payload.get(lecture_id)
        if existing is None or priority.get(status, 0) > priority.get(existing, 0):
            payload[lecture_id] = status
    return payload


def _attach_my_registration_status(lecture: Lecture, status: str | None):
    # [feedback8] 리스트 응답 모델(LectureOut) 직렬화를 위해 동적 속성으로 주입합니다.
    setattr(lecture, "my_registration_status", status if status else None)
    return lecture


def list_lectures(
    db: Session,
    *,
    current_user: User,
    batch_id: int | None = None,
    include_hidden: bool = False,
) -> list[Lecture]:
    query = db.query(Lecture)
    if batch_id is not None:
        query = query.filter(Lecture.batch_id == int(batch_id))
    if not is_admin(current_user) or not include_hidden:
        query = query.filter(Lecture.is_visible == True)  # noqa: E712
    rows = query.order_by(Lecture.start_datetime.asc(), Lecture.lecture_id.asc()).all()
    lecture_ids = [int(row.lecture_id) for row in rows]
    stats = _stats_map(db, lecture_ids)
    my_status_map = _participant_registration_status_map(
        db,
        lecture_ids=lecture_ids,
        current_user=current_user,
    )
    return [
        _attach_my_registration_status(
            _attach_stats(row, stats.get(int(row.lecture_id), {})),
            my_status_map.get(int(row.lecture_id)),
        )
        for row in rows
    ]


def _get_lecture(db: Session, lecture_id: int) -> Lecture:
    row = db.query(Lecture).filter(Lecture.lecture_id == int(lecture_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
    return row


def create_lecture(db: Session, data: LectureCreate, current_user: User) -> Lecture:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="강의 관리는 관리자만 가능합니다.")
    _ensure_batch_exists(db, data.batch_id)
    _validate_ranges(
        start_datetime=data.start_datetime,
        end_datetime=data.end_datetime,
        apply_start_date=data.apply_start_date,
        apply_end_date=data.apply_end_date,
    )
    row = Lecture(
        **data.model_dump(),
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _attach_stats(row, {})


def update_lecture(
    db: Session,
    *,
    lecture_id: int,
    data: LectureUpdate,
    current_user: User,
) -> Lecture:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="강의 관리는 관리자만 가능합니다.")
    row = _get_lecture(db, lecture_id)
    payload = data.model_dump(exclude_none=True)
    next_start = payload.get("start_datetime", row.start_datetime)
    next_end = payload.get("end_datetime", row.end_datetime)
    next_apply_start = payload.get("apply_start_date", row.apply_start_date)
    next_apply_end = payload.get("apply_end_date", row.apply_end_date)
    _validate_ranges(
        start_datetime=next_start,
        end_datetime=next_end,
        apply_start_date=next_apply_start,
        apply_end_date=next_apply_end,
    )
    for key, value in payload.items():
        setattr(row, key, value)
    row.updated_by = current_user.user_id
    db.commit()
    db.refresh(row)
    stats = _stats_map(db, [int(row.lecture_id)]).get(int(row.lecture_id), {})
    return _attach_stats(row, stats)


def delete_lecture(db: Session, *, lecture_id: int, current_user: User):
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="강의 관리는 관리자만 가능합니다.")
    row = _get_lecture(db, lecture_id)
    db.delete(row)
    db.commit()


def bulk_update_lectures(db: Session, data: LectureBulkUpdate, current_user: User) -> int:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="강의 관리는 관리자만 가능합니다.")
    lecture_ids = sorted({int(v) for v in data.lecture_ids if int(v) > 0})
    if not lecture_ids:
        return 0
    rows = db.query(Lecture).filter(Lecture.lecture_id.in_(lecture_ids)).all()
    payload = data.model_dump(exclude_none=True, exclude={"lecture_ids"})
    if not payload:
        return 0
    for row in rows:
        next_start = payload.get("start_datetime", row.start_datetime)
        next_end = payload.get("end_datetime", row.end_datetime)
        next_apply_start = payload.get("apply_start_date", row.apply_start_date)
        next_apply_end = payload.get("apply_end_date", row.apply_end_date)
        _validate_ranges(
            start_datetime=next_start,
            end_datetime=next_end,
            apply_start_date=next_apply_start,
            apply_end_date=next_apply_end,
        )
        for key, value in payload.items():
            setattr(row, key, value)
        row.updated_by = current_user.user_id
    db.commit()
    return len(rows)


def _to_registration_out(row: LectureRegistration, *, project_name: str | None = None) -> dict:
    return {
        "registration_id": int(row.registration_id),
        "lecture_id": int(row.lecture_id),
        "project_id": int(row.project_id),
        "project_name": project_name,
        "applicant_user_id": int(row.applicant_user_id),
        "member_user_ids": _parse_member_ids(row),
        "member_count": int(row.member_count or 0),
        "approval_status": row.approval_status,
        "approved_by": row.approved_by,
        "approved_at": row.approved_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _registration_rows(db: Session, lecture_id: int) -> list[LectureRegistration]:
    return (
        db.query(LectureRegistration)
        .filter(LectureRegistration.lecture_id == int(lecture_id))
        .order_by(LectureRegistration.created_at.asc(), LectureRegistration.registration_id.asc())
        .all()
    )


def _candidate_projects(db: Session, *, lecture: Lecture, current_user: User) -> list[dict]:
    if not is_participant(current_user):
        return []
    project_rows = (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.project_id)
        .filter(
            Project.batch_id == int(lecture.batch_id),
            ProjectMember.user_id == current_user.user_id,
        )
        .all()
    )
    if not project_rows:
        return []
    payload = []
    for project in project_rows:
        member_rows = (
            db.query(User.user_id, User.name)
            .join(ProjectMember, ProjectMember.user_id == User.user_id)
            .filter(ProjectMember.project_id == int(project.project_id))
            .order_by(User.name.asc(), User.user_id.asc())
            .all()
        )
        payload.append(
            {
                "project_id": int(project.project_id),
                "project_name": project.project_name,
                "members": [{"user_id": int(row.user_id), "user_name": row.name} for row in member_rows],
            }
        )
    return payload


def get_lecture_detail(db: Session, *, lecture_id: int, current_user: User) -> dict:
    lecture = _get_lecture(db, lecture_id)
    if not lecture.is_visible and not is_admin(current_user):
        raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
    stats = _stats_map(db, [int(lecture.lecture_id)]).get(int(lecture.lecture_id), {})
    lecture = _attach_stats(lecture, stats)

    registrations = _registration_rows(db, lecture.lecture_id)
    project_rows = db.query(Project.project_id, Project.project_name).all()
    project_name_map = {int(row.project_id): row.project_name for row in project_rows}
    registration_payload = [
        _to_registration_out(row, project_name=project_name_map.get(int(row.project_id)))
        for row in registrations
        if is_admin(current_user) or row.approval_status in ("pending", "approved")
    ]
    my_registration = None
    if is_participant(current_user):
        my_project_ids = {
            int(row[0])
            for row in db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.user_id)
            .all()
        }
        for row in registration_payload:
            if int(row["project_id"]) in my_project_ids:
                my_registration = row
                break

    today = date.today()
    can_register = bool(
        is_participant(current_user)
        and lecture.is_visible
        and lecture.apply_start_date <= today <= lecture.apply_end_date
        and _candidate_projects(db, lecture=lecture, current_user=current_user)
    )
    return {
        "lecture": lecture,
        "registrations": registration_payload,
        "my_registration": my_registration,
        "candidate_projects": _candidate_projects(db, lecture=lecture, current_user=current_user),
        "can_manage": is_admin(current_user),
        "can_register": can_register,
    }


def list_registrations(db: Session, *, lecture_id: int, current_user: User) -> list[dict]:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="신청 현황은 관리자만 조회할 수 있습니다.")
    _get_lecture(db, lecture_id)
    rows = _registration_rows(db, lecture_id)
    project_rows = db.query(Project.project_id, Project.project_name).all()
    project_name_map = {int(row.project_id): row.project_name for row in project_rows}
    return [
        _to_registration_out(row, project_name=project_name_map.get(int(row.project_id)))
        for row in rows
    ]


def _ensure_participant_project_member(
    db: Session,
    *,
    lecture: Lecture,
    project_id: int,
    current_user: User,
) -> Project:
    project = (
        db.query(Project)
        .filter(
            Project.project_id == int(project_id),
            Project.batch_id == int(lecture.batch_id),
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")
    is_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == int(project_id),
            ProjectMember.user_id == current_user.user_id,
        )
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="참여자는 본인 과제만 신청할 수 있습니다.")
    return project


def _validate_registration_window(lecture: Lecture):
    today = date.today()
    if today < lecture.apply_start_date or today > lecture.apply_end_date:
        raise HTTPException(status_code=403, detail="신청 기간이 아닙니다.")
    if not lecture.is_visible:
        raise HTTPException(status_code=403, detail="공개된 강의만 신청할 수 있습니다.")


def _validate_member_selection(
    db: Session,
    *,
    project_id: int,
    current_user: User,
    selected_member_ids: list[int],
) -> list[int]:
    project_member_ids = {
        int(row[0])
        for row in db.query(ProjectMember.user_id)
        .filter(ProjectMember.project_id == int(project_id))
        .all()
    }
    if not project_member_ids:
        raise HTTPException(status_code=400, detail="과제 팀원 정보가 없습니다.")
    if int(current_user.user_id) not in project_member_ids:
        raise HTTPException(status_code=403, detail="참여자는 본인 과제만 신청할 수 있습니다.")
    normalized = _normalize_member_ids(selected_member_ids)
    if not normalized:
        normalized = [int(current_user.user_id)]
    if int(current_user.user_id) not in normalized:
        normalized.insert(0, int(current_user.user_id))
        normalized = _normalize_member_ids(normalized)
    for member_id in normalized:
        if member_id not in project_member_ids:
            raise HTTPException(status_code=400, detail="선택한 팀원 정보가 올바르지 않습니다.")
    return normalized


def _ensure_capacity_available(
    db: Session,
    *,
    lecture: Lecture,
    project_id: int,
    member_count: int,
    exclude_registration_id: int | None = None,
):
    query = _active_registration_query(db, lecture.lecture_id)
    if exclude_registration_id is not None:
        query = query.filter(LectureRegistration.registration_id != int(exclude_registration_id))
    rows = query.all()
    total_used = sum(int(row.member_count or 0) for row in rows)
    project_used = sum(int(row.member_count or 0) for row in rows if int(row.project_id) == int(project_id))

    if lecture.capacity_total is not None and total_used + member_count > int(lecture.capacity_total):
        raise HTTPException(status_code=400, detail="전체 정원을 초과했습니다.")
    if lecture.capacity_team is not None and project_used + member_count > int(lecture.capacity_team):
        raise HTTPException(status_code=400, detail="팀별 정원을 초과했습니다.")


def register_lecture(
    db: Session,
    *,
    lecture_id: int,
    data: LectureRegistrationCreate,
    current_user: User,
) -> dict:
    if not is_participant(current_user):
        raise HTTPException(status_code=403, detail="수강신청은 참여자만 가능합니다.")
    lecture = _get_lecture(db, lecture_id)
    _validate_registration_window(lecture)
    _ensure_participant_project_member(
        db,
        lecture=lecture,
        project_id=data.project_id,
        current_user=current_user,
    )
    member_ids = _validate_member_selection(
        db,
        project_id=data.project_id,
        current_user=current_user,
        selected_member_ids=data.member_user_ids,
    )
    existing = (
        db.query(LectureRegistration)
        .filter(
            LectureRegistration.lecture_id == int(lecture_id),
            LectureRegistration.project_id == int(data.project_id),
        )
        .first()
    )
    _ensure_capacity_available(
        db,
        lecture=lecture,
        project_id=data.project_id,
        member_count=len(member_ids),
        exclude_registration_id=int(existing.registration_id) if existing else None,
    )

    if existing:
        existing.applicant_user_id = current_user.user_id
        existing.member_user_ids_json = json.dumps(member_ids, ensure_ascii=False)
        existing.member_count = len(member_ids)
        existing.approval_status = "pending"
        existing.approved_by = None
        existing.approved_at = None
        db.commit()
        db.refresh(existing)
        return _to_registration_out(existing)

    row = LectureRegistration(
        lecture_id=int(lecture_id),
        project_id=int(data.project_id),
        applicant_user_id=current_user.user_id,
        member_user_ids_json=json.dumps(member_ids, ensure_ascii=False),
        member_count=len(member_ids),
        approval_status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_registration_out(row)


def cancel_registration(
    db: Session,
    *,
    lecture_id: int,
    project_id: int,
    current_user: User,
) -> dict:
    if not is_participant(current_user):
        raise HTTPException(status_code=403, detail="수강신청 취소는 참여자만 가능합니다.")
    lecture = _get_lecture(db, lecture_id)
    _validate_registration_window(lecture)
    _ensure_participant_project_member(
        db,
        lecture=lecture,
        project_id=project_id,
        current_user=current_user,
    )
    row = (
        db.query(LectureRegistration)
        .filter(
            LectureRegistration.lecture_id == int(lecture_id),
            LectureRegistration.project_id == int(project_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="수강신청 정보를 찾을 수 없습니다.")
    row.approval_status = "cancelled"
    row.approved_by = None
    row.approved_at = None
    db.commit()
    db.refresh(row)
    return _to_registration_out(row)


def set_registration_approval(
    db: Session,
    *,
    registration_id: int,
    approval_status: str,
    current_user: User,
) -> dict:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="입과 승인은 관리자만 가능합니다.")
    status_text = str(approval_status or "").strip().lower()
    if status_text not in APPROVAL_STATUSES:
        raise HTTPException(status_code=400, detail="지원하지 않는 승인 상태입니다.")
    row = db.query(LectureRegistration).filter(LectureRegistration.registration_id == int(registration_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="수강신청 정보를 찾을 수 없습니다.")
    row.approval_status = status_text
    if status_text in {"approved", "rejected"}:
        row.approved_by = current_user.user_id
        row.approved_at = datetime.now()
    else:
        row.approved_by = None
        row.approved_at = None
    db.commit()
    db.refresh(row)
    return _to_registration_out(row)
