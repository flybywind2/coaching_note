"""P2-2 대시보드 구조 변경 회귀 테스트입니다."""

from datetime import date, datetime

from app.models.attendance import DailyAttendanceLog
from app.models.coaching_note import CoachingComment, CoachingNote
from app.models.project import Project, ProjectMember
from app.models.schedule import ProgramSchedule
from tests.conftest import auth_headers


def test_dashboard_matrix_shape_and_pre_schedule_date(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="대시보드 테스트 과제",
        organization="DX",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    db.add(ProjectMember(project_id=project.project_id, user_id=seed_users["participant"].user_id, role="member"))
    db.add(
        ProgramSchedule(
            batch_id=seed_batch.batch_id,
            title="개시 일정",
            schedule_type="orientation",
            visibility_scope="global",
            start_datetime=datetime(2026, 1, 1, 10, 0, 0),
            end_datetime=datetime(2026, 1, 1, 12, 0, 0),
            created_by=seed_users["admin"].user_id,
            color="#4CAF50",
        )
    )
    db.add(
        ProgramSchedule(
            batch_id=seed_batch.batch_id,
            title="코칭 일정",
            schedule_type="coaching",
            visibility_scope="coaching",
            start_datetime=datetime(2026, 1, 2, 10, 0, 0),
            end_datetime=datetime(2026, 1, 2, 12, 0, 0),
            created_by=seed_users["admin"].user_id,
            color="#00ACC1",
        )
    )
    db.add(
        DailyAttendanceLog(
            user_id=seed_users["participant"].user_id,
            work_date=date(2026, 1, 1),
            check_in_time=datetime(2026, 1, 1, 9, 0, 0),
            check_in_ip="127.0.0.1",
            check_out_time=datetime(2026, 1, 1, 18, 0, 0),
            check_out_ip="127.0.0.1",
        )
    )
    db.add(
        DailyAttendanceLog(
            user_id=seed_users["coach"].user_id,
            work_date=date(2026, 1, 1),
            check_in_time=datetime(2026, 1, 1, 9, 30, 0),
            check_in_ip="127.0.0.1",
            check_out_time=datetime(2026, 1, 1, 12, 0, 0),
            check_out_ip="127.0.0.1",
        )
    )

    note = CoachingNote(
        project_id=project.project_id,
        author_id=seed_users["coach"].user_id,
        coaching_date=date(2026, 1, 1),
        current_status="상태",
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    db.add(
        CoachingComment(
            note_id=note.note_id,
            author_id=seed_users["coach"].user_id,
            content="코칭 의견",
            is_coach_only=False,
        )
    )
    db.commit()

    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "2025-12-31" in body["dates"]
    assert "2025-12-31" in body["pre_schedule_dates"]
    assert "2026-01-02" in body["coaching_schedule_dates"]
    assert len(body["attendance_rows"]) == 1
    assert len(body["note_rows"]) == 1
    assert len(body["attendance_member_rows"]) == 1
    assert body["attendance_member_rows"][0]["project_id"] == project.project_id
    assert any(member["user_name"] == "Participant" for member in body["attendance_member_rows"][0]["members"])

    assert body["coach_performance"]
    coach_perf = next((row for row in body["coach_performance"] if row["coach_user_id"] == seed_users["coach"].user_id), None)
    assert coach_perf is not None
    assert coach_perf["checkin_count"] >= 1
    assert coach_perf["comment_count"] >= 1

    attendance_row = body["attendance_rows"][0]
    jan1_attendance = next(cell for cell in attendance_row["cells"] if cell["date"] == "2026-01-01")
    assert attendance_row["expected_count"] == 1
    assert jan1_attendance["attendance_count"] == 1

    note_row = body["note_rows"][0]
    jan1_note = next(cell for cell in note_row["cells"] if cell["date"] == "2026-01-01")
    assert jan1_note["note_count"] == 1
    assert jan1_note["coach_commenter_count"] == 1


def test_dashboard_coach_performance_is_admin_only(client, db, seed_users, seed_batch):
    coach_headers = auth_headers(client, "coach001")
    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=coach_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("coach_performance", []) == []
