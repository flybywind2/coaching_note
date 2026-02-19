import pytest
from tests.conftest import auth_headers
from app.models.project import Project, ProjectMember


def test_create_project_admin(client, seed_users, seed_batch):
    headers = auth_headers(client, "admin001")
    resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Test Project", "organization": "Dev Team", "visibility": "public"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_name"] == "Test Project"
    assert data["progress_rate"] == 0


def test_create_project_participant_forbidden(client, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Forbidden Project", "organization": "Dev"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_list_projects(client, seed_users, seed_batch, db):
    # Create a public and a restricted project
    pub = Project(batch_id=seed_batch.batch_id, project_name="Public", organization="Org", visibility="public")
    res = Project(batch_id=seed_batch.batch_id, project_name="Restricted", organization="Org", visibility="restricted")
    db.add_all([pub, res])
    db.commit()

    # Admin sees both
    headers = auth_headers(client, "admin001")
    resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    # Observer sees only public
    obs_headers = auth_headers(client, "obs001")
    resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=obs_headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["visibility"] == "public"


def test_progress_rate_auto_calc(client, seed_users, seed_batch, db):
    headers = auth_headers(client, "admin001")
    # Create project
    resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Milestone Test", "organization": "Org"},
        headers=headers,
    )
    pid = resp.json()["project_id"]

    # Create 2 milestones
    for i in range(2):
        client.post(f"/api/projects/{pid}/tasks", headers=headers, json={
            "title": f"M{i+1}", "is_milestone": True, "milestone_order": i + 1
        })

    # Complete first milestone
    tasks_resp = client.get(f"/api/projects/{pid}/tasks", headers=headers)
    task_id = tasks_resp.json()[0]["task_id"]
    client.put(f"/api/tasks/{task_id}", headers=headers, json={"status": "completed"})

    # Check progress
    proj_resp = client.get(f"/api/projects/{pid}", headers=headers)
    assert proj_resp.json()["progress_rate"] == 50
