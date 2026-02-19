from datetime import date, datetime, timedelta

from app.models.batch import Batch
from app.models.project import Project
from app.models.schedule import ProgramSchedule
from app.models.session import CoachingSession
from tests.conftest import auth_headers


def test_delete_project_removes_sessions(client, db, seed_users, seed_batch):
    headers = auth_headers(client, "admin001")
    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Delete Project", "organization": "QA", "visibility": "public"},
        headers=headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    session_resp = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": project_id,
            "session_date": str(date.today()),
            "start_time": "09:00",
            "end_time": "10:00",
            "location": "회의실 A",
        },
        headers=headers,
    )
    assert session_resp.status_code == 200

    delete_resp = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert delete_resp.status_code == 200

    assert db.query(Project).filter(Project.project_id == project_id).first() is None
    assert db.query(CoachingSession).filter(CoachingSession.project_id == project_id).count() == 0


def test_delete_batch_removes_projects_sessions_schedules(client, db, seed_users):
    headers = auth_headers(client, "admin001")
    admin_id = seed_users["admin"].user_id

    batch = Batch(
        batch_name="Delete Batch",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        status="planned",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    project = Project(
        batch_id=batch.batch_id,
        project_name="Delete Linked Project",
        organization="Ops",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    session = CoachingSession(
        batch_id=batch.batch_id,
        project_id=project.project_id,
        session_date=date.today(),
        start_time="13:00",
        end_time="14:00",
        location="회의실 B",
        created_by=admin_id,
    )
    db.add(session)

    now = datetime.now()
    schedule = ProgramSchedule(
        batch_id=batch.batch_id,
        title="Delete Linked Schedule",
        description="cleanup",
        schedule_type="other",
        start_datetime=now,
        end_datetime=now + timedelta(hours=1),
        location="온라인",
        created_by=admin_id,
    )
    db.add(schedule)
    db.commit()

    delete_resp = client.delete(f"/api/batches/{batch.batch_id}", headers=headers)
    assert delete_resp.status_code == 200

    assert db.query(Batch).filter(Batch.batch_id == batch.batch_id).first() is None
    assert db.query(Project).filter(Project.batch_id == batch.batch_id).count() == 0
    assert db.query(CoachingSession).filter(CoachingSession.batch_id == batch.batch_id).count() == 0
    assert db.query(ProgramSchedule).filter(ProgramSchedule.batch_id == batch.batch_id).count() == 0
