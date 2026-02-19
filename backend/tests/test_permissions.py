from datetime import date

from app.models.project import Project
from tests.conftest import auth_headers


def test_observer_cannot_write_board_post_or_comment(client, db, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    observer_headers = auth_headers(client, "obs001")
    board_id = seed_boards[0].board_id

    post_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "admin post", "content": "seed", "is_notice": False},
        headers=admin_headers,
    )
    assert post_resp.status_code == 200
    post_id = post_resp.json()["post_id"]

    create_post_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "observer post", "content": "blocked", "is_notice": False},
        headers=observer_headers,
    )
    assert create_post_resp.status_code == 403

    create_comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "observer comment"},
        headers=observer_headers,
    )
    assert create_comment_resp.status_code == 403


def test_restricted_project_notes_and_tasks_not_exposed_to_observer(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    observer_headers = auth_headers(client, "obs001")

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="Restricted Project",
        organization="Org",
        visibility="restricted",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today()), "current_status": "secret"},
        headers=admin_headers,
    )
    assert note_resp.status_code == 200
    note_id = note_resp.json()["note_id"]

    task_resp = client.post(
        f"/api/projects/{project.project_id}/tasks",
        json={"title": "secret task", "is_milestone": False, "priority": "medium"},
        headers=admin_headers,
    )
    assert task_resp.status_code == 200
    task_id = task_resp.json()["task_id"]

    assert client.get(f"/api/projects/{project.project_id}", headers=observer_headers).status_code == 403
    assert client.get(f"/api/projects/{project.project_id}/notes", headers=observer_headers).status_code == 403
    assert client.get(f"/api/projects/{project.project_id}/tasks", headers=observer_headers).status_code == 403
    assert client.get(f"/api/notes/{note_id}", headers=observer_headers).status_code == 403
    assert client.get(f"/api/tasks/{task_id}", headers=observer_headers).status_code == 403


def test_observer_cannot_write_public_project_notes_or_tasks(client, db, seed_users, seed_batch):
    coach_headers = auth_headers(client, "coach001")
    observer_headers = auth_headers(client, "obs001")

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="Public Project",
        organization="Org",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today())},
        headers=coach_headers,
    )
    assert note_resp.status_code == 200
    note_id = note_resp.json()["note_id"]

    comment_resp = client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "observer comment"},
        headers=observer_headers,
    )
    assert comment_resp.status_code == 403

    task_resp = client.post(
        f"/api/projects/{project.project_id}/tasks",
        json={"title": "observer task", "is_milestone": False, "priority": "medium"},
        headers=observer_headers,
    )
    assert task_resp.status_code == 403

