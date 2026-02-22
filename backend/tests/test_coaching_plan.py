"""코칭 계획/실적 API 기능 검증 테스트입니다."""

from datetime import date, datetime, timedelta, timezone

from app.models.attendance import DailyAttendanceLog
from app.models.project import Project
from app.models.schedule import ProgramSchedule
from app.models.session import CoachingSession
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
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    check_in = datetime.now(timezone.utc) - timedelta(minutes=90)
    check_out = datetime.now(timezone.utc) - timedelta(minutes=30)
    log = DailyAttendanceLog(
        user_id=seed_users["coach"].user_id,
        work_date=work_date,
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
    assert len(body["rows"]) >= 1
    coach_row = next((row for row in body["rows"] if row["coach_user_id"] == seed_users["coach"].user_id), None)
    assert coach_row is not None
    cell = coach_row["cells"][0]
    assert cell["auto_minutes"] >= 59
    assert cell["actual_source"] == "auto"
    assert cell["actual_start_time"] is not None
    assert cell["actual_end_time"] is not None


def test_coach_plan_upsert_only_for_self(client, db, seed_users, seed_batch):
    work_date = date.today()
    project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    coach_headers = auth_headers(client, "coach001")
    ok_resp = client.put(
        "/api/coaching-plan/plan",
        json={
            "batch_id": seed_batch.batch_id,
            "plan_date": str(work_date),
            "planned_project_id": project.project_id,
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

    # 계획에서는 과제 선택을 저장하지 않는다.
    grid_resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=coach_headers,
    )
    assert grid_resp.status_code == 200
    cell = grid_resp.json()["rows"][0]["cells"][0]
    assert cell["planned_project_id"] is None


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


def test_admin_can_override_actual_with_multiple_projects(client, db, seed_users, seed_batch):
    work_date = date.today()
    first_project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)
    second_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="코칭 계획 테스트 과제 2",
        organization="DX",
        visibility="public",
    )
    db.add(second_project)
    db.commit()
    db.refresh(second_project)

    admin_headers = auth_headers(client, "admin001")
    override_resp = client.put(
        "/api/coaching-plan/actual-override",
        json={
            "batch_id": seed_batch.batch_id,
            "coach_user_id": seed_users["coach"].user_id,
            "work_date": str(work_date),
            "actual_minutes": 180,
            "reason": "복수 과제 실적",
            "actual_project_ids": [first_project.project_id, second_project.project_id],
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
    assert sorted(cell["actual_project_ids"]) == sorted([first_project.project_id, second_project.project_id])
    assert set(cell["actual_project_names"]) == {first_project.project_name, second_project.project_name}


def test_coach_can_override_own_actual_minutes(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    coach_headers = auth_headers(client, "coach001")
    override_resp = client.put(
        "/api/coaching-plan/actual-override",
        json={
            "batch_id": seed_batch.batch_id,
            "coach_user_id": seed_users["coach"].user_id,
            "work_date": str(work_date),
            "actual_minutes": 150,
            "reason": "코치 직접 입력",
        },
        headers=coach_headers,
    )
    assert override_resp.status_code == 403


def test_coach_cannot_override_other_coach_actual(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)

    coach_headers = auth_headers(client, "coach001")
    forbidden_resp = client.put(
        "/api/coaching-plan/actual-override",
        json={
            "batch_id": seed_batch.batch_id,
            "coach_user_id": seed_users["admin"].user_id,
            "work_date": str(work_date),
            "actual_minutes": 150,
            "reason": "권한 없는 입력",
        },
        headers=coach_headers,
    )
    assert forbidden_resp.status_code == 403


def test_coaching_schedule_links_to_coaching_plan_grid(client, db, seed_users, seed_batch):
    work_date = date.today()
    db.add_all([
        ProgramSchedule(
            batch_id=seed_batch.batch_id,
            title="코칭 일정",
            description=None,
            schedule_type="coaching",
            visibility_scope="coaching",
            start_datetime=datetime.combine(work_date, datetime.min.time()).replace(hour=10),
            end_datetime=datetime.combine(work_date, datetime.min.time()).replace(hour=11),
            created_by=seed_users["admin"].user_id,
        ),
        ProgramSchedule(
            batch_id=seed_batch.batch_id,
            title="공통 일정",
            description=None,
            schedule_type="other",
            visibility_scope="global",
            start_datetime=datetime.combine(work_date, datetime.min.time()).replace(hour=13),
            end_datetime=datetime.combine(work_date, datetime.min.time()).replace(hour=14),
            created_by=seed_users["admin"].user_id,
        ),
    ])
    db.commit()

    coach_headers = auth_headers(client, "coach001")
    resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=coach_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert str(work_date) in [str(d) for d in body.get("global_schedule_dates", [])]
    assert str(work_date) in [str(d) for d in body.get("coaching_schedule_dates", [])]


def test_participant_cannot_access_coaching_plan_grid(client, seed_users, seed_batch):
    participant_headers = auth_headers(client, "user001")
    work_date = date.today()
    resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=participant_headers,
    )
    assert resp.status_code == 403


def test_coach_grid_shows_all_coaches_with_self_first(client, db, seed_users, seed_batch):
    work_date = date.today()
    _project, _session = _create_project_and_session(db, seed_users, seed_batch, work_date)
    coach_headers = auth_headers(client, "coach001")

    resp = client.get(
        f"/api/coaching-plan/grid?batch_id={seed_batch.batch_id}&start={work_date}&end={work_date}",
        headers=coach_headers,
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) >= 2
    assert rows[0]["coach_user_id"] == seed_users["coach"].user_id
