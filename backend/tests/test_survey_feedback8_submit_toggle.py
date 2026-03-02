"""[feedback8] 설문 저장/제출/제출취소 summitted 동기화 테스트."""

from datetime import date, timedelta

from app.models.access_scope import UserBatchAccess
from app.models.project import Project, ProjectMember
from tests.conftest import auth_headers


def _grant_batch(db, user_id: int, batch_id: int):
    db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    db.commit()


def _seed_project(db, batch_id: int, participant_user_id: int, name: str = "응답 과제"):
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


def _create_visible_survey(client, seed_batch, admin_headers):
    create_resp = client.post(
        "/api/surveys",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "summitted 테스트 설문",
            "description": "desc",
            "start_date": str(date.today() - timedelta(days=1)),
            "end_date": str(date.today() + timedelta(days=7)),
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    return create_resp.json()["survey_id"]


def _create_question(client, survey_id: int, admin_headers, payload: dict):
    resp = client.post(
        f"/api/surveys/{survey_id}/questions",
        json=payload,
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["question_id"]


def _my_row(detail: dict, project_id: int) -> dict:
    return next(row for row in detail["rows"] if int(row["project_id"]) == int(project_id))


def test_survey_feedback8_save_submit_cancel_keeps_answers(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    _grant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    project = _seed_project(db, seed_batch.batch_id, seed_users["participant"].user_id)
    survey_id = _create_visible_survey(client, seed_batch, admin_headers)

    required_qid = _create_question(
        client,
        survey_id,
        admin_headers,
        {
            "question_text": "필수 주관식",
            "question_type": "subjective",
            "is_required": True,
            "is_multi_select": False,
            "options": [],
            "display_order": 1,
        },
    )
    choice_qid = _create_question(
        client,
        survey_id,
        admin_headers,
        {
            "question_text": "선택 문항",
            "question_type": "objective_choice",
            "is_required": False,
            "is_multi_select": True,
            "options": ["A", "B", "C"],
            "display_order": 2,
        },
    )

    # 저장(초안): 필수 미응답 허용, summitted=false
    save_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": project.project_id,
            "summitted": False,
            "answers": [{"question_id": choice_qid, "selected_options": ["A"]}],
        },
        headers=participant_headers,
    )
    assert save_resp.status_code == 200, save_resp.text
    saved_row = _my_row(save_resp.json(), project.project_id)
    assert saved_row["summitted"] is False
    assert saved_row["multi_answers"][str(choice_qid)] == ["A"]
    assert saved_row["answers"][str(required_qid)] == ""

    # 결과 집계는 제출완료(summitted=true)만 반영
    stats_after_save = client.get(f"/api/surveys/{survey_id}/stats", headers=admin_headers)
    assert stats_after_save.status_code == 200, stats_after_save.text
    rate_after_save = next(
        row for row in stats_after_save.json()["response_rates"] if int(row["project_id"]) == int(project.project_id)
    )
    assert rate_after_save["response_rate"] == 0.0

    # 제출: 필수 응답 필요, summitted=true
    submit_resp = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": project.project_id,
            "summitted": True,
            "answers": [
                {"question_id": required_qid, "answer_text": "필수 응답"},
                {"question_id": choice_qid, "selected_options": ["A", "B"]},
            ],
        },
        headers=participant_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text
    submitted_row = _my_row(submit_resp.json(), project.project_id)
    assert submitted_row["summitted"] is True
    assert submitted_row["answers"][str(required_qid)] == "필수 응답"
    assert submitted_row["multi_answers"][str(choice_qid)] == ["A", "B"]

    stats_after_submit = client.get(f"/api/surveys/{survey_id}/stats", headers=admin_headers)
    assert stats_after_submit.status_code == 200, stats_after_submit.text
    rate_after_submit = next(
        row for row in stats_after_submit.json()["response_rates"] if int(row["project_id"]) == int(project.project_id)
    )
    assert rate_after_submit["response_rate"] == 100.0

    # 제출취소: 응답값 유지 + summitted=false
    cancel_resp = client.delete(
        f"/api/surveys/{survey_id}/responses?project_id={project.project_id}",
        headers=participant_headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    cancelled_row = _my_row(cancel_resp.json(), project.project_id)
    assert cancelled_row["summitted"] is False
    assert cancelled_row["answers"][str(required_qid)] == "필수 응답"
    assert cancelled_row["multi_answers"][str(choice_qid)] == ["A", "B"]

    stats_after_cancel = client.get(f"/api/surveys/{survey_id}/stats", headers=admin_headers)
    assert stats_after_cancel.status_code == 200, stats_after_cancel.text
    rate_after_cancel = next(
        row for row in stats_after_cancel.json()["response_rates"] if int(row["project_id"]) == int(project.project_id)
    )
    assert rate_after_cancel["response_rate"] == 0.0


def test_survey_feedback8_submit_requires_required_questions(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    _grant_batch(db, seed_users["participant"].user_id, seed_batch.batch_id)
    project = _seed_project(db, seed_batch.batch_id, seed_users["participant"].user_id, "필수검증 과제")
    survey_id = _create_visible_survey(client, seed_batch, admin_headers)
    required_qid = _create_question(
        client,
        survey_id,
        admin_headers,
        {
            "question_text": "필수 문항",
            "question_type": "subjective",
            "is_required": True,
            "is_multi_select": False,
            "options": [],
            "display_order": 1,
        },
    )

    submit_fail = client.put(
        f"/api/surveys/{survey_id}/responses",
        json={
            "project_id": project.project_id,
            "summitted": True,
            "answers": [{"question_id": required_qid, "answer_text": ""}],
        },
        headers=participant_headers,
    )
    assert submit_fail.status_code == 400
