"""Feedback6 P2 게시판 정책 회귀 테스트입니다."""

from tests.conftest import auth_headers


def test_post_view_count_counts_once_per_user(client, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    admin_headers = auth_headers(client, "admin001")
    board_id = seed_boards[2].board_id  # tip

    create_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "조회수 정책", "content": "본문", "is_notice": False},
        headers=coach_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    first_view = client.get(f"/api/boards/posts/{post_id}", headers=coach_headers)
    assert first_view.status_code == 200, first_view.text
    assert first_view.json()["view_count"] == 1

    second_view = client.get(f"/api/boards/posts/{post_id}", headers=coach_headers)
    assert second_view.status_code == 200, second_view.text
    assert second_view.json()["view_count"] == 1

    third_view = client.get(f"/api/boards/posts/{post_id}", headers=admin_headers)
    assert third_view.status_code == 200, third_view.text
    assert third_view.json()["view_count"] == 2


def test_update_post_cannot_change_category_to_notice(client, seed_users, seed_boards):
    coach_headers = auth_headers(client, "coach001")
    tip_board_id = seed_boards[2].board_id
    notice_board_id = seed_boards[0].board_id

    create_resp = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={"title": "일반 게시글", "content": "본문", "is_notice": False},
        headers=coach_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    update_resp = client.put(
        f"/api/boards/posts/{post_id}",
        json={"board_id": notice_board_id},
        headers=coach_headers,
    )
    assert update_resp.status_code == 400
    assert "공지사항" in update_resp.json()["detail"]


def test_notice_post_cannot_change_category(client, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    notice_board_id = seed_boards[0].board_id
    tip_board_id = seed_boards[2].board_id

    create_resp = client.post(
        f"/api/boards/{notice_board_id}/posts",
        json={"title": "공지 게시글", "content": "본문", "is_notice": True},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    update_resp = client.put(
        f"/api/boards/posts/{post_id}",
        json={"board_id": tip_board_id},
        headers=admin_headers,
    )
    assert update_resp.status_code == 400
    assert "공지사항 게시글" in update_resp.json()["detail"]
