"""참여자 캘린더 접근/관리 권한을 검증하는 테스트입니다."""

from datetime import date, datetime

from app.models.project import Project, ProjectMember
from app.models.schedule import ProgramSchedule
from app.models.session import CoachingSession
from app.models.task import ProjectTask
from tests.conftest import auth_headers


def _seed_projects_for_participant(db, seed_batch, seed_users):
    my_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="My Project",
        organization="Org",
        visibility="public",
    )
    other_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="Other Project",
        organization="Org",
        visibility="public",
    )
    db.add_all([my_project, other_project])
    db.commit()
    db.refresh(my_project)
    db.refresh(other_project)

    member = ProjectMember(
        project_id=my_project.project_id,
        user_id=seed_users["participant"].user_id,
        role="member",
    )
    db.add(member)
    db.commit()
    return my_project, other_project


def test_participant_calendar_sees_only_own_project_events(client, db, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    my_project, other_project = _seed_projects_for_participant(db, seed_batch, seed_users)

    db.add_all([
        CoachingSession(
            batch_id=seed_batch.batch_id,
            project_id=my_project.project_id,
            session_date=date(2026, 2, 10),
            start_time="10:00",
            end_time="11:00",
            note="my session",
            created_by=seed_users["admin"].user_id,
        ),
        CoachingSession(
            batch_id=seed_batch.batch_id,
            project_id=other_project.project_id,
            session_date=date(2026, 2, 11),
            start_time="10:00",
            end_time="11:00",
            note="other session",
            created_by=seed_users["admin"].user_id,
        ),
    ])
    db.commit()

    resp = client.get(
        f"/api/calendar?batch_id={seed_batch.batch_id}&start=2026-02-01&end=2026-02-28",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    events = resp.json()["events"]
    session_events = [ev for ev in events if ev.get("event_type") == "session"]
    assert session_events
    assert all(ev.get("project_id") == my_project.project_id for ev in session_events)


def test_participant_can_manage_only_own_project_sessions(client, db, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    my_project, other_project = _seed_projects_for_participant(db, seed_batch, seed_users)

    create_my = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": my_project.project_id,
            "session_date": "2026-02-15",
            "start_time": "09:00",
            "end_time": "10:00",
            "location": "회의실 A",
            "note": "참여자 작성",
        },
        headers=headers,
    )
    assert create_my.status_code == 200, create_my.text
    created_session_id = create_my.json()["session_id"]

    update_my = client.put(
        f"/api/sessions/{created_session_id}",
        json={"note": "참여자 수정"},
        headers=headers,
    )
    assert update_my.status_code == 200, update_my.text

    delete_my = client.delete(f"/api/sessions/{created_session_id}", headers=headers)
    assert delete_my.status_code == 200

    create_other = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": other_project.project_id,
            "session_date": "2026-02-16",
            "start_time": "09:00",
            "end_time": "10:00",
            "location": "회의실 B",
            "note": "권한 없음",
        },
        headers=headers,
    )
    assert create_other.status_code == 403

    other_session = CoachingSession(
        batch_id=seed_batch.batch_id,
        project_id=other_project.project_id,
        session_date=date(2026, 2, 17),
        start_time="09:00",
        end_time="10:00",
        note="admin created",
        created_by=seed_users["admin"].user_id,
    )
    db.add(other_session)
    db.commit()
    db.refresh(other_session)

    update_other = client.put(
        f"/api/sessions/{other_session.session_id}",
        json={"note": "참여자 수정 시도"},
        headers=headers,
    )
    assert update_other.status_code == 403

    delete_other = client.delete(f"/api/sessions/{other_session.session_id}", headers=headers)
    assert delete_other.status_code == 403


def test_participant_can_update_only_own_project_tasks(client, db, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    my_project, other_project = _seed_projects_for_participant(db, seed_batch, seed_users)

    my_task = ProjectTask(
        project_id=my_project.project_id,
        title="my milestone",
        is_milestone=True,
        status="todo",
        created_by=seed_users["admin"].user_id,
    )
    other_task = ProjectTask(
        project_id=other_project.project_id,
        title="other milestone",
        is_milestone=True,
        status="todo",
        created_by=seed_users["admin"].user_id,
    )
    db.add_all([my_task, other_task])
    db.commit()
    db.refresh(my_task)
    db.refresh(other_task)

    update_my = client.put(
        f"/api/tasks/{my_task.task_id}",
        json={"title": "my milestone edited", "status": "in_progress"},
        headers=headers,
    )
    assert update_my.status_code == 200, update_my.text

    delete_my = client.delete(f"/api/tasks/{my_task.task_id}", headers=headers)
    assert delete_my.status_code == 200

    update_other = client.put(
        f"/api/tasks/{other_task.task_id}",
        json={"title": "hacked", "status": "completed"},
        headers=headers,
    )
    assert update_other.status_code == 403

    delete_other = client.delete(f"/api/tasks/{other_task.task_id}", headers=headers)
    assert delete_other.status_code == 403


def test_participant_cannot_edit_global_schedule(client, db, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    schedule = ProgramSchedule(
        batch_id=seed_batch.batch_id,
        title="global schedule",
        description="seed",
        schedule_type="other",
        start_datetime=datetime(2026, 2, 20, 10, 0, 0),
        end_datetime=datetime(2026, 2, 20, 11, 0, 0),
        created_by=seed_users["admin"].user_id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    resp = client.put(
        f"/api/schedules/{schedule.schedule_id}",
        json={"title": "participant edited"},
        headers=headers,
    )
    assert resp.status_code == 403
