"""Test Coaching Notes 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

import pytest
from tests.conftest import auth_headers
from app.models.project import Project
from datetime import date


@pytest.fixture
def project(db, seed_batch):
    p = Project(batch_id=seed_batch.batch_id, project_name="Test Project",
                organization="Org", visibility="public")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_create_note_coach(client, seed_users, project):
    headers = auth_headers(client, "coach001")
    resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today()), "current_status": "진행 중", "progress_rate": 30},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["progress_rate"] == 30


def test_create_note_uses_project_progress_default(client, seed_users, db, project):
    project.progress_rate = 57
    db.commit()

    headers = auth_headers(client, "coach001")
    resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today()), "current_status": "기본 진행률 연동"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["progress_rate"] == 57


def test_create_note_participant_forbidden(client, seed_users, project):
    headers = auth_headers(client, "user001")
    resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today())},
        headers=headers,
    )
    assert resp.status_code == 403


def test_coach_only_comment_hidden_from_participant(client, seed_users, project):
    # Coach creates note + coach-only comment
    coach_headers = auth_headers(client, "coach001")
    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today())},
        headers=coach_headers,
    )
    note_id = note_resp.json()["note_id"]

    # Coach creates coach-only comment
    client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "코치 전용 메모입니다", "is_coach_only": True},
        headers=coach_headers,
    )
    # Coach creates regular comment
    client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "일반 코멘트입니다", "is_coach_only": False},
        headers=coach_headers,
    )

    # Coach sees both
    resp = client.get(f"/api/notes/{note_id}/comments", headers=coach_headers)
    assert len(resp.json()) == 2

    # Participant sees only regular comment
    participant_headers = auth_headers(client, "user001")
    resp = client.get(f"/api/notes/{note_id}/comments", headers=participant_headers)
    comments = resp.json()
    assert len(comments) == 1
    assert comments[0]["is_coach_only"] == False


def test_admin_sees_coach_only_comments(client, seed_users, project):
    coach_headers = auth_headers(client, "coach001")
    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today())},
        headers=coach_headers,
    )
    note_id = note_resp.json()["note_id"]
    client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "코치 전용", "is_coach_only": True},
        headers=coach_headers,
    )

    admin_headers = auth_headers(client, "admin001")
    resp = client.get(f"/api/notes/{note_id}/comments", headers=admin_headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["is_coach_only"] == True


def test_comment_type_split_by_author_role(client, seed_users, project):
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")
    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today())},
        headers=coach_headers,
    )
    note_id = note_resp.json()["note_id"]

    coach_comment = client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "코칭 의견 1"},
        headers=coach_headers,
    )
    participant_comment = client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "참여자 메모 1"},
        headers=participant_headers,
    )

    assert coach_comment.status_code == 200
    assert participant_comment.status_code == 200
    assert coach_comment.json()["comment_type"] == "coaching_feedback"
    assert participant_comment.json()["comment_type"] == "participant_memo"

    listed = client.get(f"/api/notes/{note_id}/comments", headers=coach_headers)
    assert listed.status_code == 200
    rows = listed.json()
    assert {row["comment_type"] for row in rows} == {"coaching_feedback", "participant_memo"}


