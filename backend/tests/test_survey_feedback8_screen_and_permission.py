"""[feedback8] 설문 결과 권한 확장/질문 재활용 API 테스트."""

from datetime import date, timedelta

from app.models.access_scope import UserBatchAccess
from app.models.project import Project, ProjectMember
from tests.conftest import auth_headers


def _grant_batch(db, user_id: int, batch_id: int):
    db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    db.commit()


def _seed_project(db, batch_id: int, participant_user_id: int, name: str = "설문 과제"):
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


def test_survey_feedback8_coach_can_view_results_only(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")
    _grant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    project = _seed_project(db, seed_batch.batch_id, seed_users["participant"].user_id)

    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "코치 조회 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    survey_id = create_resp.json()["survey_id"]

    question_resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json={
            "question_text": "점수형 문항",
            "question_type": "objective_score",
            "is_required": True,
            "is_multi_select": False,
            "options": ["1", "2", "3", "4", "5"],
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert question_resp.status_code == 200, question_resp.text
    question_id = question_resp.json()["question_id"]

    submit_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": project.project_id,
            "summitted": True,
            "answers": [{"question_id": question_id, "answer_text": "4"}],
        },
        headers=participant_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text

    coach_list = client.get(f"/api/surveys?batch_id={seed_batch.batch_id}", headers=coach_headers)
    assert coach_list.status_code == 200, coach_list.text
    assert any(int(row["survey_id"]) == int(survey_id) for row in coach_list.json())

    coach_detail = client.get(f"/api/surveys/{survey_id}/detail", headers=coach_headers)
    assert coach_detail.status_code == 200, coach_detail.text
    assert coach_detail.json()["stats"] is not None

    coach_stats = client.get(f"/api/surveys/{survey_id}/stats", headers=coach_headers)
    assert coach_stats.status_code == 200, coach_stats.text
    assert coach_stats.json()["overall_score_average"] == 4.0

    coach_csv = client.get(f"/api/surveys/{survey_id}/export.csv", headers=coach_headers)
    assert coach_csv.status_code == 200, coach_csv.text
    assert "text/csv" in coach_csv.headers.get("content-type", "")

    coach_create_forbidden = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "코치 생성 금지",
            "description": "",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=1)),
            "is_visible": False,
        },
        headers=coach_headers,
    )
    assert coach_create_forbidden.status_code == 403


def test_survey_feedback8_question_bank_admin_only(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "질문 뱅크 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": False,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    survey_id = create_resp.json()["survey_id"]

    question_resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json={
            "question_text": "기존 질문",
            "question_type": "objective_choice",
            "is_required": True,
            "is_multi_select": True,
            "options": ["A", "B"],
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert question_resp.status_code == 200, question_resp.text

    bank_resp = client.get(f"/api/surveys/question-bank?batch_id={seed_batch.batch_id}", headers=admin_headers)
    assert bank_resp.status_code == 200, bank_resp.text
    rows = bank_resp.json()
    assert any(row["question_text"] == "기존 질문" and int(row["survey_id"]) == int(survey_id) for row in rows)

    forbidden_resp = client.get(f"/api/surveys/question-bank?batch_id={seed_batch.batch_id}", headers=participant_headers)
    assert forbidden_resp.status_code == 403
