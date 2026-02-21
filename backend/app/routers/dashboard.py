"""대시보드 집계 API 라우터입니다."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.attendance import DailyAttendanceLog
from app.models.batch import Batch
from app.models.coaching_note import CoachingComment, CoachingNote
from app.models.project import Project, ProjectMember
from app.models.schedule import ProgramSchedule
from app.models.user import User
from app.utils.permissions import can_view_project

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _build_date_axis(batch_start: date, batch_end: date, pre_schedule_dates: list[date]) -> list[date]:
    axis = set(pre_schedule_dates)
    cursor = batch_start
    while cursor <= batch_end:
        axis.add(cursor)
        cursor += timedelta(days=1)
    return sorted(axis)


@router.get("")
def get_dashboard(
    batch_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="대시보드는 관리자/코치만 접근 가능합니다.")

    target_batch = None
    if batch_id:
        target_batch = db.query(Batch).filter(Batch.batch_id == batch_id).first()
    else:
        target_batch = db.query(Batch).order_by(Batch.start_date.desc()).first()
    if not target_batch:
        return {
            "batch": None,
            "dates": [],
            "pre_schedule_dates": [],
            "projects": [],
            "attendance_rows": [],
            "note_rows": [],
            "project_daily_attendance": [],
            "project_daily_notes": [],
            "coach_activity": [],
        }

    projects = (
        db.query(Project)
        .filter(Project.batch_id == target_batch.batch_id)
        .order_by(Project.project_name.asc())
        .all()
    )
    projects = [row for row in projects if can_view_project(db, row, current_user)]
    project_ids = [row.project_id for row in projects]

    schedule_rows = (
        db.query(ProgramSchedule.start_datetime)
        .filter(ProgramSchedule.batch_id == target_batch.batch_id)
        .all()
    )
    pre_schedule_dates = sorted({row.start_datetime.date() - timedelta(days=1) for row in schedule_rows})
    axis_dates = _build_date_axis(target_batch.start_date, target_batch.end_date, pre_schedule_dates)
    axis_set = set(axis_dates)

    if not project_ids:
        return {
            "batch": {
                "batch_id": target_batch.batch_id,
                "batch_name": target_batch.batch_name,
                "start_date": target_batch.start_date,
                "end_date": target_batch.end_date,
            },
            "dates": [d.isoformat() for d in axis_dates],
            "pre_schedule_dates": [d.isoformat() for d in pre_schedule_dates if d in axis_set],
            "projects": [],
            "attendance_rows": [],
            "note_rows": [],
            "project_daily_attendance": [],
            "project_daily_notes": [],
            "coach_activity": [],
        }

    axis_start = axis_dates[0]
    axis_end = axis_dates[-1]

    expected_rows = (
        db.query(
            ProjectMember.project_id,
            func.count(func.distinct(ProjectMember.user_id)).label("expected_count"),
        )
        .join(User, User.user_id == ProjectMember.user_id)
        .filter(
            ProjectMember.project_id.in_(project_ids),
            User.is_active == True,  # noqa: E712
            User.role != "observer",
        )
        .group_by(ProjectMember.project_id)
        .all()
    )
    expected_map = {int(row.project_id): int(row.expected_count or 0) for row in expected_rows}

    attendance_rows = (
        db.query(
            ProjectMember.project_id,
            DailyAttendanceLog.work_date,
            func.count(func.distinct(DailyAttendanceLog.user_id)).label("attendance_count"),
        )
        .join(DailyAttendanceLog, DailyAttendanceLog.user_id == ProjectMember.user_id)
        .filter(
            ProjectMember.project_id.in_(project_ids),
            DailyAttendanceLog.work_date >= axis_start,
            DailyAttendanceLog.work_date <= axis_end,
        )
        .group_by(ProjectMember.project_id, DailyAttendanceLog.work_date)
        .all()
    )
    attendance_map: dict[tuple[int, date], int] = {
        (int(row.project_id), row.work_date): int(row.attendance_count or 0)
        for row in attendance_rows
    }

    note_rows = (
        db.query(
            CoachingNote.project_id,
            CoachingNote.coaching_date,
            func.count(CoachingNote.note_id).label("note_count"),
        )
        .filter(
            CoachingNote.project_id.in_(project_ids),
            CoachingNote.coaching_date >= axis_start,
            CoachingNote.coaching_date <= axis_end,
        )
        .group_by(CoachingNote.project_id, CoachingNote.coaching_date)
        .all()
    )
    note_map: dict[tuple[int, date], int] = {
        (int(row.project_id), row.coaching_date): int(row.note_count or 0)
        for row in note_rows
    }

    commenter_rows = (
        db.query(
            CoachingNote.project_id,
            CoachingNote.coaching_date,
            func.count(func.distinct(CoachingComment.author_id)).label("coach_commenter_count"),
        )
        .join(CoachingComment, CoachingComment.note_id == CoachingNote.note_id)
        .join(User, User.user_id == CoachingComment.author_id)
        .filter(
            CoachingNote.project_id.in_(project_ids),
            CoachingNote.coaching_date >= axis_start,
            CoachingNote.coaching_date <= axis_end,
            User.role == "coach",
        )
        .group_by(CoachingNote.project_id, CoachingNote.coaching_date)
        .all()
    )
    commenter_map: dict[tuple[int, date], int] = {
        (int(row.project_id), row.coaching_date): int(row.coach_commenter_count or 0)
        for row in commenter_rows
    }

    progress_rows = []
    attendance_matrix = []
    note_matrix = []
    flat_attendance = []
    flat_notes = []

    for project in projects:
        expected_count = int(expected_map.get(project.project_id, 0))
        progress_rows.append(
            {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "status": project.status,
                "progress_rate": int(project.progress_rate or 0),
                "expected_count": expected_count,
            }
        )

        attendance_cells = []
        total_attended = 0
        total_expected = expected_count * len(axis_dates)
        for day in axis_dates:
            attended = int(attendance_map.get((project.project_id, day), 0))
            total_attended += attended
            rate = round((attended / expected_count) * 100, 1) if expected_count > 0 else 0.0
            attendance_cells.append(
                {
                    "date": day.isoformat(),
                    "attendance_count": attended,
                    "attendance_rate": rate,
                }
            )
            flat_attendance.append(
                {
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "date": day,
                    "attendance_count": attended,
                    "expected_count": expected_count,
                    "attendance_rate": rate,
                }
            )
        total_rate = round((total_attended / total_expected) * 100, 1) if total_expected > 0 else 0.0
        attendance_matrix.append(
            {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "expected_count": expected_count,
                "total_attendance": total_attended,
                "total_expected": total_expected,
                "total_rate": total_rate,
                "cells": attendance_cells,
            }
        )

        note_cells = []
        total_note_count = 0
        total_commenter_count = 0
        for day in axis_dates:
            note_count = int(note_map.get((project.project_id, day), 0))
            commenter_count = int(commenter_map.get((project.project_id, day), 0))
            total_note_count += note_count
            total_commenter_count += commenter_count
            note_cells.append(
                {
                    "date": day.isoformat(),
                    "note_count": note_count,
                    "coach_commenter_count": commenter_count,
                }
            )
            flat_notes.append(
                {
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "date": day,
                    "note_count": note_count,
                    "coach_commenter_count": commenter_count,
                }
            )
        note_matrix.append(
            {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "total_note_count": total_note_count,
                "total_coach_commenter_count": total_commenter_count,
                "cells": note_cells,
            }
        )

    coach_rows = (
        db.query(User.user_id, User.name)
        .filter(User.is_active == True, User.role == "coach")  # noqa: E712
        .order_by(User.name.asc())
        .all()
    )
    coach_ids = [row.user_id for row in coach_rows]
    note_by_coach = {}
    comment_by_coach = {}
    if coach_ids:
        note_by_coach = {
            int(row.author_id): int(row.note_count or 0)
            for row in (
                db.query(CoachingNote.author_id, func.count(CoachingNote.note_id).label("note_count"))
                .filter(
                    CoachingNote.project_id.in_(project_ids),
                    CoachingNote.author_id.in_(coach_ids),
                    CoachingNote.coaching_date >= axis_start,
                    CoachingNote.coaching_date <= axis_end,
                )
                .group_by(CoachingNote.author_id)
                .all()
            )
        }
        comment_by_coach = {
            int(row.author_id): int(row.comment_count or 0)
            for row in (
                db.query(CoachingComment.author_id, func.count(CoachingComment.comment_id).label("comment_count"))
                .join(CoachingNote, CoachingNote.note_id == CoachingComment.note_id)
                .filter(
                    CoachingNote.project_id.in_(project_ids),
                    CoachingComment.author_id.in_(coach_ids),
                    CoachingNote.coaching_date >= axis_start,
                    CoachingNote.coaching_date <= axis_end,
                )
                .group_by(CoachingComment.author_id)
                .all()
            )
        }
    coach_activity = []
    for coach in coach_rows:
        coach_activity.append(
            {
                "coach_user_id": coach.user_id,
                "coach_name": coach.name,
                "note_count": int(note_by_coach.get(coach.user_id, 0)),
                "comment_count": int(comment_by_coach.get(coach.user_id, 0)),
            }
        )
    coach_activity.sort(key=lambda row: (row["note_count"] + row["comment_count"], row["coach_name"]), reverse=True)

    return {
        "batch": {
            "batch_id": target_batch.batch_id,
            "batch_name": target_batch.batch_name,
            "start_date": target_batch.start_date,
            "end_date": target_batch.end_date,
        },
        "dates": [d.isoformat() for d in axis_dates],
        "pre_schedule_dates": [d.isoformat() for d in pre_schedule_dates if d in axis_set],
        "projects": progress_rows,
        "attendance_rows": attendance_matrix,
        "note_rows": note_matrix,
        "project_daily_attendance": flat_attendance,
        "project_daily_notes": flat_notes,
        "coach_activity": coach_activity,
    }
