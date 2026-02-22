"""Feedback6 P2 시간 입력 10분 단위 정책 회귀 테스트입니다."""

from datetime import date

from app.models.project import Project
from tests.conftest import auth_headers


def _create_project(db, seed_batch):
    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="시간 정책 테스트 과제",
        organization="DX",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def test_session_time_must_be_10_minute_step(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    project = _create_project(db, seed_batch)

    invalid_resp = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": project.project_id,
            "session_date": str(date.today()),
            "start_time": "09:05",
            "end_time": "10:00",
        },
        headers=admin_headers,
    )
    assert invalid_resp.status_code == 400
    assert "10분" in invalid_resp.json()["detail"]

    all_day_resp = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": project.project_id,
            "session_date": str(date.today()),
            "start_time": "00:00",
            "end_time": "23:59",
        },
        headers=admin_headers,
    )
    assert all_day_resp.status_code == 200, all_day_resp.text


def test_schedule_time_must_be_10_minute_step(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    work_date = seed_batch.start_date

    invalid_resp = client.post(
        "/api/schedules",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "시간 정책 테스트",
            "description": None,
            "schedule_type": "other",
            "visibility_scope": "global",
            "start_datetime": f"{work_date}T10:05:00",
            "end_datetime": f"{work_date}T11:00:00",
            "location": None,
            "is_all_day": False,
            "color": "#4CAF50",
        },
        headers=admin_headers,
    )
    assert invalid_resp.status_code == 400
    assert "10분" in invalid_resp.json()["detail"]

    valid_resp = client.post(
        "/api/schedules",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "시간 정책 정상 케이스",
            "description": None,
            "schedule_type": "other",
            "visibility_scope": "global",
            "start_datetime": f"{work_date}T10:00:00",
            "end_datetime": f"{work_date}T11:00:00",
            "location": None,
            "is_all_day": False,
            "color": "#4CAF50",
        },
        headers=admin_headers,
    )
    assert valid_resp.status_code == 200, valid_resp.text
