"""P2(템플릿/버전/멘션) 기능 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

from datetime import date

import pytest

from app.models.project import Project
from tests.conftest import auth_headers


@pytest.fixture
def project(db, seed_batch):
    row = Project(
        batch_id=seed_batch.batch_id,
        project_name="P2 테스트 과제",
        organization="Org",
        visibility="public",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_note_template_crud(client, seed_users):
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")

    create_resp = client.post(
        "/api/note-templates",
        json={
            "template_name": "주간 회고 템플릿",
            "week_number": 3,
            "progress_rate": 40,
            "current_status": "<p>상태</p>",
            "main_issue": "<p>이슈</p>",
            "next_action": "<p>액션</p>",
            "is_shared": False,
        },
        headers=coach_headers,
    )
    assert create_resp.status_code == 200
    template_id = create_resp.json()["template_id"]

    list_resp = client.get("/api/note-templates", headers=coach_headers)
    assert list_resp.status_code == 200
    assert any(t["template_id"] == template_id for t in list_resp.json())

    update_resp = client.put(
        f"/api/note-templates/{template_id}",
        json={"template_name": "업데이트 템플릿"},
        headers=coach_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["template_name"] == "업데이트 템플릿"

    forbidden_resp = client.post(
        "/api/note-templates",
        json={"template_name": "참여자 템플릿"},
        headers=participant_headers,
    )
    assert forbidden_resp.status_code == 403

    delete_resp = client.delete(f"/api/note-templates/{template_id}", headers=coach_headers)
    assert delete_resp.status_code == 200


def test_note_version_restore_and_mention_notification(client, seed_users, project):
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")

    create_note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={
            "coaching_date": str(date.today()),
            "current_status": "초기 상태 @user001",
            "main_issue": "초기 이슈",
            "next_action": "초기 액션",
        },
        headers=coach_headers,
    )
    assert create_note_resp.status_code == 200
    note_id = create_note_resp.json()["note_id"]

    participant_notifications = client.get("/api/notifications", headers=participant_headers)
    assert participant_notifications.status_code == 200
    assert any(
        n["noti_type"] == "mention" and f"/project/{project.project_id}/notes/{note_id}" in (n["link_url"] or "")
        for n in participant_notifications.json()
    )

    update_note_resp = client.put(
        f"/api/notes/{note_id}",
        json={
            "coaching_date": str(date.today()),
            "current_status": "수정 상태",
            "main_issue": "수정 이슈",
            "next_action": "수정 액션",
        },
        headers=coach_headers,
    )
    assert update_note_resp.status_code == 200
    assert update_note_resp.json()["current_status"] == "수정 상태"

    versions_resp = client.get(f"/api/notes/{note_id}/versions", headers=coach_headers)
    assert versions_resp.status_code == 200
    versions = versions_resp.json()
    assert len(versions) >= 2

    create_version = next((v for v in versions if v["change_type"] == "create"), None)
    assert create_version is not None

    restore_resp = client.post(
        f"/api/notes/{note_id}/restore/{create_version['version_id']}",
        headers=coach_headers,
    )
    assert restore_resp.status_code == 200
    assert "@user001" in (restore_resp.json()["current_status"] or "")


def test_document_and_board_version_and_comment_mention(client, seed_users, project, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    admin_headers = auth_headers(client, "admin001")

    create_doc_resp = client.post(
        f"/api/projects/{project.project_id}/documents",
        data={"doc_type": "application", "title": "문서 v1", "content": "초기 본문"},
        headers=coach_headers,
    )
    assert create_doc_resp.status_code == 200
    doc_id = create_doc_resp.json()["doc_id"]

    update_doc_resp = client.put(
        f"/api/documents/{doc_id}",
        json={"title": "문서 v2", "content": "수정 본문"},
        headers=coach_headers,
    )
    assert update_doc_resp.status_code == 200

    doc_versions_resp = client.get(f"/api/documents/{doc_id}/versions", headers=coach_headers)
    assert doc_versions_resp.status_code == 200
    doc_versions = doc_versions_resp.json()
    assert len(doc_versions) >= 2
    doc_v1 = next((v for v in doc_versions if (v["snapshot"] or {}).get("title") == "문서 v1"), None)
    assert doc_v1 is not None

    restore_doc_resp = client.post(
        f"/api/documents/{doc_id}/restore/{doc_v1['version_id']}",
        headers=coach_headers,
    )
    assert restore_doc_resp.status_code == 200
    assert restore_doc_resp.json()["title"] == "문서 v1"

    board_id = seed_boards[0].board_id
    create_post_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "게시글 v1", "content": "본문 @user001", "is_notice": False},
        headers=coach_headers,
    )
    assert create_post_resp.status_code == 200
    post_id = create_post_resp.json()["post_id"]

    update_post_resp = client.put(
        f"/api/boards/posts/{post_id}",
        json={"title": "게시글 v2", "content": "수정 본문", "is_notice": False},
        headers=coach_headers,
    )
    assert update_post_resp.status_code == 200

    post_versions_resp = client.get(f"/api/boards/posts/{post_id}/versions", headers=coach_headers)
    assert post_versions_resp.status_code == 200
    post_versions = post_versions_resp.json()
    assert len(post_versions) >= 2

    post_v1 = next((v for v in post_versions if (v["snapshot"] or {}).get("title") == "게시글 v1"), None)
    assert post_v1 is not None
    restore_post_resp = client.post(
        f"/api/boards/posts/{post_id}/restore/{post_v1['version_id']}",
        headers=coach_headers,
    )
    assert restore_post_resp.status_code == 200
    assert restore_post_resp.json()["title"] == "게시글 v1"

    create_comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "댓글 멘션 @admin001"},
        headers=coach_headers,
    )
    assert create_comment_resp.status_code == 200

    admin_notifications = client.get("/api/notifications", headers=admin_headers)
    assert admin_notifications.status_code == 200
    assert any(
        n["noti_type"] == "mention" and f"/board/{board_id}/post/{post_id}" in (n["link_url"] or "")
        for n in admin_notifications.json()
    )

