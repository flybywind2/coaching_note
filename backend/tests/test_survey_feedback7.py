"""[FEEDBACK7] 설문 페이지 정책/동작 테스트입니다."""

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


def _seed_participant_project(db, batch_id: int, participant_user_id: int, name: str = "참여자 과제"):
    project = Project(
        batch_id=batch_id,
        project_name=name,
        organization="개발팀",
        representative="참여자",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    db.add(
        ProjectMember(
            project_id=project.project_id,
            user_id=participant_user_id,
            role="leader",
            is_representative=True,
        )
    )
    db.commit()
    return project


def test_survey_participant_scope_and_visibility(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    batch2 = _seed_second_batch(db)
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)

    visible_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "공개 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert visible_resp.status_code == 200, visible_resp.text
    visible_id = visible_resp.json()["survey_id"]

    hidden_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "비공개 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert hidden_resp.status_code == 200, hidden_resp.text

    other_batch_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": batch2.batch_id,
            "title": "다른차수 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert other_batch_resp.status_code == 200, other_batch_resp.text

    list_resp = client.get(f"/api/surveys?batch_id={seed_batch.batch_id}", headers=participant_headers)
    assert list_resp.status_code == 200, list_resp.text
    ids = {row["survey_id"] for row in list_resp.json()}
    assert visible_id in ids
    assert len(ids) == 1

    forbidden_resp = client.get(f"/api/surveys?batch_id={batch2.batch_id}", headers=participant_headers)
    assert forbidden_resp.status_code == 403


def test_survey_single_visible_constraint(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    create_first = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "첫 공개 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_first.status_code == 200, create_first.text

    create_second = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "중복 공개 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_second.status_code == 400


def test_survey_publish_creates_notifications(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)

    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "공개 전환 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    survey_id = create_resp.json()["survey_id"]

    publish_resp = client.put(
        f"/api/surveys/{survey_id}",
        json={"is_visible": True},
        headers=admin_headers,
    )
    assert publish_resp.status_code == 200, publish_resp.text

    rows = db.query(Notification).filter(Notification.noti_type == "survey").all()
    assert rows
    notified_user_ids = {row.user_id for row in rows}
    assert seed_users["participant"].user_id in notified_user_ids


def test_survey_required_submit_cancel_and_period(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    my_project = _seed_participant_project(db, seed_batch.batch_id, seed_users["participant"].user_id)

    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "응답 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    survey_id = create_resp.json()["survey_id"]

    q1_resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json={
            "question_text": "필수 주관식",
            "question_type": "subjective",
            "is_required": True,
            "is_multi_select": False,
            "options": [],
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert q1_resp.status_code == 200, q1_resp.text
    q1_id = q1_resp.json()["question_id"]

    q2_resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json={
            "question_text": "필수 항목형",
            "question_type": "objective_choice",
            "is_required": True,
            "is_multi_select": True,
            "options": ["A", "B", "C"],
            "display_order": 2,
        },
        headers=admin_headers,
    )
    assert q2_resp.status_code == 200, q2_resp.text
    q2_id = q2_resp.json()["question_id"]

    missing_required = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [{"question_id": q2_id, "selected_options": ["A"]}],
        },
        headers=participant_headers,
    )
    assert missing_required.status_code == 400

    submit_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [
                {"question_id": q1_id, "answer_text": "주관식 답변"},
                {"question_id": q2_id, "selected_options": ["A", "B"]},
            ],
        },
        headers=participant_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text

    detail_resp = client.get(f"/api/surveys/{survey_id}/detail", headers=participant_headers)
    assert detail_resp.status_code == 200, detail_resp.text
    rows = detail_resp.json()["rows"]
    my_row = next(row for row in rows if int(row["project_id"]) == int(my_project.project_id))
    assert my_row["answers"][str(q1_id)] == "주관식 답변"
    assert my_row["multi_answers"][str(q2_id)] == ["A", "B"]

    cancel_resp = client.delete(
        f"/api/surveys/{survey_id}/responses?project_id={my_project.project_id}",
        headers=participant_headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    cancelled_row = next(
        row
        for row in cancel_resp.json()["rows"]
        if int(row["project_id"]) == int(my_project.project_id)
    )
    assert cancelled_row["answers"][str(q1_id)] == ""
    assert cancelled_row["multi_answers"][str(q2_id)] == []

    close_resp = client.put(
        f"/api/surveys/{survey_id}",
        json={
            "start_date": str(date.today() - timedelta(days=9)),
            "end_date": str(date.today() - timedelta(days=3)),
        },
        headers=admin_headers,
    )
    assert close_resp.status_code == 200, close_resp.text

    out_of_period_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [{"question_id": q1_id, "answer_text": "기간외"}],
        },
        headers=participant_headers,
    )
    assert out_of_period_resp.status_code == 403


def test_survey_stats_and_csv_export(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    _grant_participant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    my_project = _seed_participant_project(db, seed_batch.batch_id, seed_users["participant"].user_id, "통계 과제")

    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "통계 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    survey_id = create_resp.json()["survey_id"]

    score_q_resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json={
            "question_text": "점수형 평가",
            "question_type": "objective_score",
            "is_required": True,
            "is_multi_select": False,
            "options": ["1", "2", "3", "4", "5"],
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert score_q_resp.status_code == 200, score_q_resp.text
    score_q_id = score_q_resp.json()["question_id"]

    submit_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": my_project.project_id,
            "answers": [{"question_id": score_q_id, "answer_text": "5"}],
        },
        headers=participant_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text

    stats_resp = client.get(f"/api/surveys/{survey_id}/stats", headers=admin_headers)
    assert stats_resp.status_code == 200, stats_resp.text
    stats = stats_resp.json()
    assert stats["overall_score_average"] == 5.0
    my_rate = next(
        row
        for row in stats["response_rates"]
        if int(row["project_id"]) == int(my_project.project_id)
    )
    assert my_rate["response_rate"] == 100.0

    csv_resp = client.get(f"/api/surveys/{survey_id}/export.csv", headers=admin_headers)
    assert csv_resp.status_code == 200, csv_resp.text
    assert "text/csv" in csv_resp.headers.get("content-type", "")
    assert "통계 과제" in csv_resp.text
    assert "점수형 평가" in csv_resp.text
