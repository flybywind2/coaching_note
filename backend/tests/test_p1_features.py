"""P1 기능(출결/게시판/세션관리) 회귀 검증 테스트입니다."""

from datetime import date
from tests.conftest import auth_headers
from app.models.project import Project, ProjectMember


def test_auto_checkin_today_for_participant(client, db, seed_users, seed_batch):
    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="출결 테스트 과제",
        organization="DX",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    member = ProjectMember(project_id=project.project_id, user_id=seed_users["participant"].user_id, role="member")
    db.add(member)
    db.commit()

    admin_headers = auth_headers(client, "admin001")
    create_resp = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": project.project_id,
            "session_date": str(date.today()),
            "start_time": "10:00",
            "end_time": "11:00",
            "location": "회의실 A",
            "note": "자동입실 테스트",
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    session_id = create_resp.json()["session_id"]

    participant_headers = auth_headers(client, "user001")
    auto_resp = client.post("/api/sessions/auto-checkin-today", headers=participant_headers)
    assert auto_resp.status_code == 200, auto_resp.text
    result = auto_resp.json()
    assert result["checked_in"] == 1

    status_resp = client.get(f"/api/sessions/{session_id}/my-attendance-status", headers=participant_headers)
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["ip_allowed"] is True
    assert status["attendance_log"] is not None
    assert status["can_checkout"] is True


def test_board_all_posts_and_comment_update(client, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    board_id = seed_boards[0].board_id

    post_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "통합 게시판 테스트", "content": "본문", "is_notice": False},
        headers=coach_headers,
    )
    assert post_resp.status_code == 200, post_resp.text
    post_id = post_resp.json()["post_id"]

    comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "기존 댓글"},
        headers=coach_headers,
    )
    assert comment_resp.status_code == 200
    comment_id = comment_resp.json()["comment_id"]

    update_comment_resp = client.put(
        f"/api/boards/comments/{comment_id}",
        json={"content": "수정된 댓글"},
        headers=coach_headers,
    )
    assert update_comment_resp.status_code == 200
    assert update_comment_resp.json()["content"] == "수정된 댓글"

    list_resp = client.get("/api/boards/posts", headers=coach_headers)
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert rows
    assert "board_name" in rows[0]
    assert "author_name" in rows[0]
    assert "comment_count" in rows[0]


def test_session_delete_by_coach(client, db, seed_users, seed_batch):
    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="세션 삭제 테스트",
        organization="DX",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    admin_headers = auth_headers(client, "admin001")
    create_resp = client.post(
        "/api/sessions",
        json={
            "batch_id": seed_batch.batch_id,
            "project_id": project.project_id,
            "session_date": str(date.today()),
            "start_time": "14:00",
            "end_time": "15:00",
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["session_id"]

    coach_headers = auth_headers(client, "coach001")
    delete_resp = client.delete(f"/api/sessions/{session_id}", headers=coach_headers)
    assert delete_resp.status_code == 200

    get_resp = client.get(f"/api/sessions/{session_id}", headers=coach_headers)
    assert get_resp.status_code == 404
