import pytest
from tests.conftest import auth_headers


def test_login_success(client, seed_users):
    resp = client.post("/api/auth/login", json={"emp_id": "admin001"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"


def test_login_invalid_emp_id(client, seed_users):
    resp = client.post("/api/auth/login", json={"emp_id": "nonexistent"})
    assert resp.status_code == 401


def test_me_authenticated(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["emp_id"] == "admin001"


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code in (401, 403)  # HTTPBearer raises 401 or 403 depending on version


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_logout(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.post("/api/auth/logout", headers=headers)
    assert resp.status_code == 200
