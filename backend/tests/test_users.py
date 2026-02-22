"""Test Users 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

from datetime import date

from app.models.batch import Batch
from app.models.project import Project
from tests.conftest import auth_headers


def test_list_users_admin_success(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 4


def test_list_users_forbidden_for_non_admin(client, seed_users):
    headers = auth_headers(client, "user001")
    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 403


def test_create_user_admin_success(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.post(
        "/api/users",
        headers=headers,
        json={
            "emp_id": "user999",
            "name": "New User",
            "department": "QA",
            "role": "participant",
            "email": "new@company.com",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["emp_id"] == "user999"
    assert data["is_active"] is True


def test_create_user_duplicate_emp_id_conflict(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.post(
        "/api/users",
        headers=headers,
        json={
            "emp_id": "user001",
            "name": "Duplicate",
            "department": "QA",
            "role": "participant",
            "email": "dup@company.com",
        },
    )
    assert resp.status_code == 409


def test_delete_user_soft_delete(client, seed_users):
    headers = auth_headers(client, "admin001")
    delete_resp = client.delete("/api/users/2", headers=headers)  # coach001
    assert delete_resp.status_code == 204

    users_resp = client.get("/api/users", headers=headers)
    assert users_resp.status_code == 200
    emp_ids = [u["emp_id"] for u in users_resp.json()]
    assert "coach001" not in emp_ids


def test_delete_self_forbidden(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.delete("/api/users/1", headers=headers)
    assert resp.status_code == 400


def test_restore_deleted_user_not_found(client, seed_users):
    headers = auth_headers(client, "admin001")
    delete_resp = client.delete("/api/users/2", headers=headers)
    assert delete_resp.status_code == 204

    restore_resp = client.patch("/api/users/2/restore", headers=headers)
    assert restore_resp.status_code == 404


def test_restore_active_user_conflict(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.patch("/api/users/2/restore", headers=headers)
    assert resp.status_code == 409


def test_update_user_admin_success(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.put(
        "/api/users/2",
        headers=headers,
        json={
            "emp_id": "coach002",
            "name": "Updated Coach",
            "department": "Strategy",
            "role": "coach",
            "email": "coach2@company.com",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["emp_id"] == "coach002"
    assert data["name"] == "Updated Coach"


def test_bulk_upsert_users_admin_success(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.post(
        "/api/users/bulk-upsert",
        headers=headers,
        json={
            "rows": [
                {"emp_id": "bulk001", "name": "Bulk A", "department": "QA", "role": "participant"},
                {"emp_id": "user001", "name": "Participant Updated", "department": "DX", "role": "participant"},
            ],
            "reactivate_inactive": True,
        },
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["created"] == 1
    assert result["updated"] >= 1
    assert result["failed"] == 0


def test_user_permissions_update_and_batch_filter(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    external_headers = auth_headers(client, "obs001")
    seed_users["observer"].role = "external_coach"
    db.commit()
    db.refresh(seed_users["observer"])

    second_batch = Batch(
        batch_name="2026년 2차",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 12, 31),
        status="planned",
    )
    db.add(second_batch)
    db.commit()
    db.refresh(second_batch)

    p1 = Project(batch_id=seed_batch.batch_id, project_name="P1", organization="Org", visibility="public")
    p2 = Project(batch_id=second_batch.batch_id, project_name="P2", organization="Org", visibility="public")
    db.add_all([p1, p2])
    db.commit()

    update_resp = client.put(
        f"/api/users/{seed_users['observer'].user_id}/permissions",
        headers=admin_headers,
        json={"batch_ids": [seed_batch.batch_id], "project_ids": [p1.project_id]},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["batch_ids"] == [seed_batch.batch_id]
    assert update_resp.json()["project_ids"] == [p1.project_id]

    list_resp = client.get("/api/batches", headers=external_headers)
    assert list_resp.status_code == 200
    visible_batch_ids = [row["batch_id"] for row in list_resp.json()]
    assert visible_batch_ids == [seed_batch.batch_id]

    allowed_projects_resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=external_headers)
    assert allowed_projects_resp.status_code == 200
    assert [row["project_id"] for row in allowed_projects_resp.json()] == [p1.project_id]

    blocked_projects_resp = client.get(f"/api/batches/{second_batch.batch_id}/projects", headers=external_headers)
    assert blocked_projects_resp.status_code == 200
    assert blocked_projects_resp.json() == []


def test_user_permissions_project_grant_allows_restricted_project(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    external_headers = auth_headers(client, "obs001")
    seed_users["observer"].role = "external_coach"
    db.commit()
    db.refresh(seed_users["observer"])

    restricted = Project(
        batch_id=seed_batch.batch_id,
        project_name="Restricted by Grant",
        organization="Org",
        visibility="restricted",
    )
    db.add(restricted)
    db.commit()
    db.refresh(restricted)

    grant_resp = client.put(
        f"/api/users/{seed_users['observer'].user_id}/permissions",
        headers=admin_headers,
        json={"batch_ids": [seed_batch.batch_id], "project_ids": [restricted.project_id]},
    )
    assert grant_resp.status_code == 200, grant_resp.text

    get_resp = client.get(f"/api/projects/{restricted.project_id}", headers=external_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["project_id"] == restricted.project_id

    list_resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=external_headers)
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["project_id"] == restricted.project_id


