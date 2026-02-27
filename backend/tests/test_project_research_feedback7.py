"""[FEEDBACK7] 과제 조사 페이지 정책/동작 테스트입니다."""

from datetime import date, timedelta

from app.models.access_scope import UserBatchAccess
from app.models.batch import Batch
from app.models.notification import Notification
from app.models.project import Project, ProjectMember
from tests.conftest import auth_headers


def _seed_second_batch(db):
    row = Batch(
        batch_name="2026년 2차",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 12, 31),
        status="ongoing",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _grant_participant_batch(db, user_id: int, batch_id: int):
    db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    db.commit()


def _seed_participant_project(db, batch_id: int, participant_user_id: int):
    project = Project(
        batch_id=batch_id,
        project_name="참여자 과제",
        organization="개발팀",
        representative="참여자",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    db.add(ProjectMember(project_id=project.project_id, user_id=participant_user_id, role="leader", is_representative=True))
    db.commit()
    return project


def test_project_research_observer_forbidden(client, seed_users, seed_batch):
    observer_headers = auth_headers(client, "obs001")
    resp = client.get(f"/api/project-research/items?batch_id={seed_batch.batch_id}", headers=observer_headers)
    assert resp.status_code == 403


def test_project_research_participant_sees_only_visible_items_in_own_batch(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    batch2 = _seed_second_batch(db)
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)

    visible_resp = client.post(
        "/api/project-research/items",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "공개 아이템",
            "purpose": "목적",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert visible_resp.status_code == 200, visible_resp.text
    visible_id = visible_resp.json()["item_id"]

    hidden_resp = client.post(
        "/api/project-research/items",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "비공개 아이템",
            "purpose": "목적",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert hidden_resp.status_code == 200, hidden_resp.text

    other_batch_resp = client.post(
        "/api/project-research/items",
        json={
            "batch_id": batch2.batch_id,
            "title": "다른차수 공개",
            "purpose": "목적",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert other_batch_resp.status_code == 200, other_batch_resp.text

    list_resp = client.get(
        f"/api/project-research/items?batch_id={seed_batch.batch_id}",
        headers=participant_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = {row["item_id"] for row in list_resp.json()}
    assert visible_id in ids
    assert len(ids) == 1

    forbidden_resp = client.get(
        f"/api/project-research/items?batch_id={batch2.batch_id}",
        headers=participant_headers,
    )
    assert forbidden_resp.status_code == 403


def test_project_research_publish_creates_notifications(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)

    create_resp = client.post(
        "/api/project-research/items",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "공개 전환 테스트",
            "purpose": "목적",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    item_id = create_resp.json()["item_id"]

    publish_resp = client.put(
        f"/api/project-research/items/{item_id}",
        json={"is_visible": True},
        headers=admin_headers,
    )
    assert publish_resp.status_code == 200, publish_resp.text

    rows = (
        db.query(Notification)
        .filter(Notification.noti_type == "project_research")
        .all()
    )
    assert rows
    notified_user_ids = {row.user_id for row in rows}
    assert seed_users["participant"].user_id in notified_user_ids


def test_project_research_participant_submit_in_period_only(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    my_project = _seed_participant_project(db, seed_batch.batch_id, seed_users["participant"].user_id)

    create_resp = client.post(
        "/api/project-research/items",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "응답 테스트",
            "purpose": "목적",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    item_id = create_resp.json()["item_id"]

    q1_resp = client.post(
        f"/api/project-research/items/{item_id}/questions",
        json={"question_text": "주관식 문항", "question_type": "subjective", "display_order": 1, "options": []},
        headers=admin_headers,
    )
    assert q1_resp.status_code == 200, q1_resp.text
    q1_id = q1_resp.json()["question_id"]

    q2_resp = client.post(
        f"/api/project-research/items/{item_id}/questions",
        json={"question_text": "객관식 문항", "question_type": "objective", "display_order": 2, "options": ["A", "B"]},
        headers=admin_headers,
    )
    assert q2_resp.status_code == 200, q2_resp.text
    q2_id = q2_resp.json()["question_id"]

    submit_resp = client.put(
        f"/api/project-research/items/{item_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [
                {"question_id": q1_id, "answer_text": "주관식 답변"},
                {"question_id": q2_id, "answer_text": "A"},
            ],
        },
        headers=participant_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text

    detail_resp = client.get(
        f"/api/project-research/items/{item_id}/detail",
        headers=participant_headers,
    )
    assert detail_resp.status_code == 200, detail_resp.text
    rows = detail_resp.json()["rows"]
    my_row = next(row for row in rows if int(row["project_id"]) == int(my_project.project_id))
    assert my_row["answers"][str(q1_id)] == "주관식 답변"
    assert my_row["answers"][str(q2_id)] == "A"

    close_resp = client.put(
        f"/api/project-research/items/{item_id}",
        json={
            "start_date": str(date.today() - timedelta(days=7)),
            "end_date": str(date.today() - timedelta(days=1)),
        },
        headers=admin_headers,
    )
    assert close_resp.status_code == 200, close_resp.text

    blocked_resp = client.put(
        f"/api/project-research/items/{item_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [{"question_id": q1_id, "answer_text": "기간외 수정"}],
        },
        headers=participant_headers,
    )
    assert blocked_resp.status_code == 403
