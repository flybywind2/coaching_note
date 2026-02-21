"""Feedback2 P0 요구사항 핵심 동작 회귀 테스트."""

from datetime import date

from app.models.project import Project
from tests.conftest import auth_headers


def test_daily_attendance_checkin_checkout_without_session(client, seed_users):
    participant_headers = auth_headers(client, "user001")

    status_before = client.get("/api/attendance/my-status", headers=participant_headers)
    assert status_before.status_code == 200, status_before.text
    assert status_before.json()["can_checkin"] is True

    checkin_resp = client.post("/api/attendance/checkin", headers=participant_headers)
    assert checkin_resp.status_code == 200, checkin_resp.text
    log = checkin_resp.json()
    assert log["work_date"] == str(date.today())
    assert log["check_out_time"] is None

    status_mid = client.get("/api/attendance/my-status", headers=participant_headers)
    assert status_mid.status_code == 200
    assert status_mid.json()["can_checkout"] is True

    checkout_resp = client.post("/api/attendance/checkout", headers=participant_headers)
    assert checkout_resp.status_code == 200, checkout_resp.text
    assert checkout_resp.json()["check_out_time"] is not None


def test_bulk_upsert_auto_generates_email(client, seed_users):
    admin_headers = auth_headers(client, "admin001")

    resp = client.post(
        "/api/users/bulk-upsert",
        json={
            "rows": [
                {"emp_id": "bulk001", "name": "Bulk User", "department": "AI", "role": "participant"},
            ],
            "reactivate_inactive": True,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 1

    users_resp = client.get("/api/users?include_inactive=true", headers=admin_headers)
    assert users_resp.status_code == 200, users_resp.text
    created = next((u for u in users_resp.json() if u["emp_id"] == "bulk001"), None)
    assert created is not None
    assert created["email"] == "bulk001@samsung.com"


def test_bulk_delete_permanently_removes_user(client, seed_users):
    admin_headers = auth_headers(client, "admin001")

    create_resp = client.post(
        "/api/users",
        json={
            "emp_id": "del001",
            "name": "Delete Target",
            "department": "Ops",
            "role": "observer",
            "email": "",
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    user_id = create_resp.json()["user_id"]

    delete_resp = client.post(
        "/api/users/bulk-delete",
        json={"user_ids": [user_id]},
        headers=admin_headers,
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["deleted"] == 1

    users_resp = client.get("/api/users?include_inactive=true", headers=admin_headers)
    assert users_resp.status_code == 200, users_resp.text
    assert all(u["user_id"] != user_id for u in users_resp.json())


def test_note_week_number_uses_batch_coaching_start_date(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")

    update_batch_resp = client.put(
        f"/api/batches/{seed_batch.batch_id}",
        json={"coaching_start_date": "2026-01-15"},
        headers=admin_headers,
    )
    assert update_batch_resp.status_code == 200, update_batch_resp.text

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="Week Test Project",
        organization="Org",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={
            "coaching_date": "2026-01-22",
            "week_number": 99,
            "current_status": "status",
        },
        headers=admin_headers,
    )
    assert note_resp.status_code == 200, note_resp.text
    assert note_resp.json()["week_number"] == 2

