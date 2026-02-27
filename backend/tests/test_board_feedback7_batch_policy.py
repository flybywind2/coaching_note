"""[FEEDBACK7] 게시판 차수 분리/비공개 정책 테스트입니다."""

from datetime import date

from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.user import User
from tests.conftest import auth_headers


def _seed_two_batches(db):
    batch1 = Batch(
        batch_name="2026년 1차",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        status="ongoing",
    )
    batch2 = Batch(
        batch_name="2026년 2차",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 12, 31),
        status="ongoing",
    )
    db.add_all([batch1, batch2])
    db.commit()
    db.refresh(batch1)
    db.refresh(batch2)
    return batch1, batch2


def _grant_batch_scope(db, user_id: int, batch_id: int):
    db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    db.commit()


def _create_participant(db, emp_id: str, name: str):
    row = User(emp_id=emp_id, name=name, role="participant", department="Dev")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_participant_can_write_only_own_batch_posts(client, db, seed_users, seed_boards):
    participant_headers = auth_headers(client, "user001")
    tip_board_id = seed_boards[2].board_id
    batch1, batch2 = _seed_two_batches(db)
    _grant_batch_scope(db, seed_users["participant"].user_id, batch1.batch_id)

    my_batch_resp = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={
            "title": "내 차수 글",
            "content": "ok",
            "batch_id": batch1.batch_id,
            "is_batch_private": False,
        },
        headers=participant_headers,
    )
    assert my_batch_resp.status_code == 200, my_batch_resp.text

    other_batch_resp = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={
            "title": "타 차수 글",
            "content": "blocked",
            "batch_id": batch2.batch_id,
            "is_batch_private": False,
        },
        headers=participant_headers,
    )
    assert other_batch_resp.status_code == 403


def test_batch_private_post_hidden_from_observer_and_other_batch_participant(client, db, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    observer_headers = auth_headers(client, "obs001")
    other_participant = _create_participant(db, "user777", "다른차수 참여자")
    other_participant_headers = auth_headers(client, other_participant.emp_id)
    tip_board_id = seed_boards[2].board_id
    batch1, batch2 = _seed_two_batches(db)

    _grant_batch_scope(db, seed_users["participant"].user_id, batch1.batch_id)
    _grant_batch_scope(db, other_participant.user_id, batch2.batch_id)

    create_resp = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={
            "title": "1차 비공개",
            "content": "batch private",
            "batch_id": batch1.batch_id,
            "is_batch_private": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    owner_view = client.get(
        f"/api/boards/posts?batch_id={batch1.batch_id}&limit=50",
        headers=participant_headers,
    )
    assert owner_view.status_code == 200, owner_view.text
    owner_ids = {row["post_id"] for row in owner_view.json()}
    assert post_id in owner_ids

    observer_view = client.get(
        f"/api/boards/posts?batch_id={batch1.batch_id}&limit=50",
        headers=observer_headers,
    )
    assert observer_view.status_code == 200, observer_view.text
    observer_ids = {row["post_id"] for row in observer_view.json()}
    assert post_id not in observer_ids

    other_participant_view = client.get(
        f"/api/boards/posts?batch_id={batch1.batch_id}&limit=50",
        headers=other_participant_headers,
    )
    assert other_participant_view.status_code == 200, other_participant_view.text
    other_ids = {row["post_id"] for row in other_participant_view.json()}
    assert post_id not in other_ids


def test_participant_cannot_comment_on_other_batch_post(client, db, seed_users, seed_boards):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    tip_board_id = seed_boards[2].board_id
    batch1, batch2 = _seed_two_batches(db)

    _grant_batch_scope(db, seed_users["participant"].user_id, batch1.batch_id)

    create_resp = client.post(
        f"/api/boards/{tip_board_id}/posts",
        json={
            "title": "2차 게시글",
            "content": "admin",
            "batch_id": batch2.batch_id,
            "is_batch_private": False,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    post_id = create_resp.json()["post_id"]

    comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "댓글 시도"},
        headers=participant_headers,
    )
    assert comment_resp.status_code == 403

