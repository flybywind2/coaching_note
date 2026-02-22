"""Test Projects 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

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

    # Observer sees both (조회 전용 전체 열람)
    obs_headers = auth_headers(client, "obs001")
    resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=obs_headers)
    assert len(resp.json()) == 2


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


def test_update_project_status_by_coach_forbidden(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    coach_headers = auth_headers(client, "coach001")

    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Status Test", "organization": "Org"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    update_resp = client.put(
        f"/api/projects/{project_id}",
        json={"status": "completed"},
        headers=coach_headers,
    )
    assert update_resp.status_code == 403


def test_update_project_status_participant_forbidden(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Status Forbidden", "organization": "Org"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    update_resp = client.put(
        f"/api/projects/{project_id}",
        json={"status": "in_progress"},
        headers=participant_headers,
    )
    assert update_resp.status_code == 403


def test_project_member_management_admin(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")

    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Member Manage", "organization": "Org"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    add_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": seed_users["participant"].user_id, "role": "leader", "is_representative": True},
        headers=admin_headers,
    )
    assert add_resp.status_code == 200

    list_resp = client.get(f"/api/projects/{project_id}/members", headers=admin_headers)
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["user_name"] == "Participant"
    assert rows[0]["user_emp_id"] == "user001"
    assert rows[0]["is_representative"] is True

    remove_resp = client.delete(
        f"/api/projects/{project_id}/members/{seed_users['participant'].user_id}",
        headers=admin_headers,
    )
    assert remove_resp.status_code == 200
    list_resp = client.get(f"/api/projects/{project_id}/members", headers=admin_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 0


def test_project_member_add_forbidden_for_non_admin(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    coach_headers = auth_headers(client, "coach001")

    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Member Forbidden", "organization": "Org"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    add_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": seed_users["participant"].user_id, "role": "member", "is_representative": False},
        headers=coach_headers,
    )
    assert add_resp.status_code == 403


def test_task_assignee_must_be_project_member_and_unassign_on_member_remove(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")

    create_project_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Task Assign", "organization": "Org"},
        headers=admin_headers,
    )
    assert create_project_resp.status_code == 200
    project_id = create_project_resp.json()["project_id"]

    create_task_fail_resp = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "비멤버 배정 실패",
            "assigned_to": seed_users["participant"].user_id,
            "priority": "medium",
            "is_milestone": False,
        },
        headers=admin_headers,
    )
    assert create_task_fail_resp.status_code == 400

    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": seed_users["participant"].user_id, "role": "member", "is_representative": False},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    create_task_resp = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "팀원 배정 성공",
            "assigned_to": seed_users["participant"].user_id,
            "priority": "medium",
            "is_milestone": False,
        },
        headers=admin_headers,
    )
    assert create_task_resp.status_code == 200
    task = create_task_resp.json()
    assert task["assigned_to"] == seed_users["participant"].user_id
    assert task["assignee_name"] == "Participant"

    update_fail_resp = client.put(
        f"/api/tasks/{task['task_id']}",
        json={"assigned_to": seed_users["coach"].user_id},
        headers=admin_headers,
    )
    assert update_fail_resp.status_code == 400

    remove_member_resp = client.delete(
        f"/api/projects/{project_id}/members/{seed_users['participant'].user_id}",
        headers=admin_headers,
    )
    assert remove_member_resp.status_code == 200

    get_task_resp = client.get(f"/api/tasks/{task['task_id']}", headers=admin_headers)
    assert get_task_resp.status_code == 200
    assert get_task_resp.json()["assigned_to"] is None


def test_project_profile_fields_and_my_project_flag(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    coach_headers = auth_headers(client, "coach001")

    create_resp = client.post(
        f"/api/batches/{seed_batch.batch_id}/projects",
        json={"project_name": "Profile Test", "organization": "AI Team"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["project_id"]

    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": seed_users["participant"].user_id, "role": "member", "is_representative": False},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    participant_list_resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=participant_headers)
    assert participant_list_resp.status_code == 200
    participant_row = next((p for p in participant_list_resp.json() if p["project_id"] == project_id), None)
    assert participant_row is not None
    assert participant_row["is_my_project"] is True

    coach_list_resp = client.get(f"/api/batches/{seed_batch.batch_id}/projects", headers=coach_headers)
    assert coach_list_resp.status_code == 200
    coach_row = next((p for p in coach_list_resp.json() if p["project_id"] == project_id), None)
    assert coach_row is not None
    assert coach_row["is_my_project"] is False

    update_resp = client.put(
        f"/api/projects/{project_id}",
        headers=coach_headers,
        json={
            "ai_tech_category": "생성형AI",
            "ai_tech_used": "GPT-4o, LangGraph",
            "project_summary": "프로젝트 요약 테스트",
            "github_repos": ["https://github.com/example/app", "https://github.com/example/api"],
            "progress_rate": 35,
        },
    )
    assert update_resp.status_code == 403


