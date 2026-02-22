"""Feedback5 P2 게시판 요구사항 회귀 테스트입니다."""

from app.models.notification import Notification
from app.models.user import User
from tests.conftest import auth_headers


def test_board_update_can_change_category_without_recreate(client, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    from_board_id = seed_boards[2].board_id  # tip
    to_board_id = seed_boards[1].board_id  # question

    create_resp = client.post(
        f"/api/boards/{from_board_id}/posts",
        json={"title": "분류 변경 테스트", "content": "본문", "is_notice": False},
        headers=coach_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    update_resp = client.put(
        f"/api/boards/posts/{post_id}",
        json={"title": "분류 변경 완료", "content": "본문 수정", "board_id": to_board_id},
        headers=coach_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["board_id"] == to_board_id
    assert update_resp.json()["board_type"] == "question"


def test_board_all_posts_notice_first_and_post_no_desc(client, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    coach_headers = auth_headers(client, "coach001")
    notice_board_id = seed_boards[0].board_id
    tip_board_id = seed_boards[2].board_id

    notice_resp = client.post(
        f"/api/boards/{notice_board_id}/posts",
        json={"title": "공지", "content": "notice", "is_notice": True},
        headers=admin_headers,
    )
    assert notice_resp.status_code == 200

    first_free = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={"title": "일반1", "content": "a", "is_notice": False},
        headers=coach_headers,
    )
    assert first_free.status_code == 200
    second_free = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={"title": "일반2", "content": "b", "is_notice": False},
        headers=coach_headers,
    )
    assert second_free.status_code == 200

    list_resp = client.get("/api/boards/posts?limit=20", headers=coach_headers)
    assert list_resp.status_code == 200, list_resp.text
    rows = list_resp.json()
    assert rows[0]["is_notice"] is True
    free_rows = [row for row in rows if not row["is_notice"]]
    assert free_rows
    post_nos = [int(row["post_no"]) for row in free_rows if row.get("post_no") is not None]
    assert post_nos == sorted(post_nos, reverse=True)


def test_board_comment_includes_author_name(client, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    board_id = seed_boards[2].board_id
    create_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "댓글 작성자 표시", "content": "본문", "is_notice": False},
        headers=coach_headers,
    )
    assert create_resp.status_code == 200
    post_id = create_resp.json()["post_id"]

    comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "댓글"},
        headers=coach_headers,
    )
    assert comment_resp.status_code == 200
    assert comment_resp.json()["author_name"] == seed_users["coach"].name

    list_resp = client.get(f"/api/boards/posts/{post_id}/comments", headers=coach_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["author_name"] == seed_users["coach"].name


def test_notice_post_creates_board_notice_notifications(client, db, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    notice_board_id = seed_boards[0].board_id

    create_resp = client.post(
        f"/api/boards/{notice_board_id}/posts",
        json={"title": "공지 알림 테스트", "content": "notice", "is_notice": True},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200

    rows = db.query(Notification).filter(Notification.noti_type == "board_notice").all()
    assert rows
    notified_user_ids = {row.user_id for row in rows}
    assert seed_users["admin"].user_id not in notified_user_ids
    assert seed_users["coach"].user_id in notified_user_ids
    assert seed_users["participant"].user_id in notified_user_ids


def test_board_mention_candidates_can_distinguish_same_name(client, db, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    db.add_all([
        User(emp_id="same001", name="동명이인", role="participant", department="A"),
        User(emp_id="same002", name="동명이인", role="participant", department="B"),
    ])
    db.commit()

    resp = client.get("/api/boards/mention-candidates?q=동명이인", headers=coach_headers)
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) >= 2
    emp_ids = {row["emp_id"] for row in rows}
    assert "same001" in emp_ids
    assert "same002" in emp_ids
