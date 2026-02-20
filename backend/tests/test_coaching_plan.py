"""코칭 계획/실적 API 기능 검증 테스트입니다."""

from datetime import date, datetime, timedelta, timezone

from app.models.project import Project
from app.models.session import AttendanceLog, CoachingSession
from tests.conftest import auth_headers


def _create_project_and_session(db, seed_users, seed_batch, work_date: date):
    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="코칭 계획 테스트 과제",
        organization="DX",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    session = CoachingSession(
        batch_id=seed_batch.batch_id,
        project_id=project.project_id,
        session_date=work_date,
        start_time="10:00",
        end_time="12:00",
        created_by=seed_users["admin"].user_id,
        note="코칭 계획 테스트 세션",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return project, session


def test_coach_grid_shows_auto_actual_from_attendance(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    check_in = datetime.now(timezone.utc) - timedelta(minutes=90)
    check_out = datetime.now(timezone.utc) - timedelta(minutes=30)
    log = AttendanceLog(
        session_id=session.session_id,
        user_id=seed_users["coach"].user_id,
        check_in_time=check_in,
        check_in_ip="127.0.0.1",
        check_out_time=check_out,
        check_out_ip="127.0.0.1",
    )
    db.add(log)
    db.commit()

    coach_headers = auth_headers(client, "coach001")
    resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=coach_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["rows"]) == 1
    cell = body["rows"][0]["cells"][0]
    assert cell["auto_minutes"] >= 59
    assert cell["actual_source"] == "auto"


def test_coach_plan_upsert_only_for_self(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    coach_headers = auth_headers(client, "coach001")
    ok_resp = client.put(
        "/api/coaching-plan/plan",
        json={
            "batch_id": seed_batch.batch_id,
            "plan_date": str(work_date),
            "start_time": "09:00",
            "end_time": "10:00",
            "plan_note": "사전 준비",
        },
        headers=coach_headers,
    )
    assert ok_resp.status_code == 200, ok_resp.text

    forbidden_resp = client.put(
        "/api/coaching-plan/plan",
        json={
            "batch_id": seed_batch.batch_id,
            "coach_user_id": seed_users["admin"].user_id,
            "plan_date": str(work_date),
            "start_time": "09:00",
            "end_time": "10:00",
        },
        headers=coach_headers,
    )
    assert forbidden_resp.status_code == 403


def test_admin_can_override_actual_minutes(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    admin_headers = auth_headers(client, "admin001")
    override_resp = client.put(
        "/api/coaching-plan/actual-override",
        json={
            "batch_id": seed_batch.batch_id,
            "coach_user_id": seed_users["coach"].user_id,
            "work_date": str(work_date),
            "actual_minutes": 240,
            "reason": "오프라인 코칭 포함",
        },
        headers=admin_headers,
    )
    assert override_resp.status_code == 200, override_resp.text

    grid_resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}&coach_user_id={seed_users['coach'].user_id}",
        headers=admin_headers,
    )
    assert grid_resp.status_code == 200
    cell = grid_resp.json()["rows"][0]["cells"][0]
    assert cell["override_minutes"] == 240
    assert cell["final_minutes"] == 240
    assert cell["actual_source"] == "override"


def test_participant_cannot_access_coaching_plan_grid(client, seed_users, seed_batch):
    participant_headers = auth_headers(client, "user001")
    work_date = date.today()
    resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=participant_headers,
    )
    assert resp.status_code == 403

