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


def test_restore_user_success(client, seed_users):
    headers = auth_headers(client, "admin001")
    delete_resp = client.delete("/api/users/2", headers=headers)
    assert delete_resp.status_code == 204

    restore_resp = client.patch("/api/users/2/restore", headers=headers)
    assert restore_resp.status_code == 200
    assert restore_resp.json()["is_active"] is True


def test_restore_active_user_conflict(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.patch("/api/users/2/restore", headers=headers)
    assert resp.status_code == 409
