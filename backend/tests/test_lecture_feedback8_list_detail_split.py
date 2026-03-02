"""[feedback8] 강의 리스트 카드 데이터(참여자 신청 상태) 검증 테스트."""

from datetime import date, timedelta

from app.models.project import Project, ProjectMember
from tests.conftest import auth_headers


def _seed_participant_project(db, *, batch_id: int, participant_user_id: int) -> Project:
    project = Project(
        batch_id=batch_id,
        project_name="피드백8 과제",
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


def _create_open_lecture(client, admin_headers: dict, batch_id: int, title: str) -> int:
    # [feedback8] 리스트 카드 지표/신청 상태 검증용 강의를 생성합니다.
    resp = client.post(
        "/api/lectures",
        json={
            "batch_id": batch_id,
            "title": title,
            "summary": "요약",
            "description": "설명",
            "instructor": "강사",
            "location": "강의실",
            "start_datetime": f"{date.today()}T10:00:00",
            "end_datetime": f"{date.today()}T11:00:00",
            "apply_start_date": str(date.today() - timedelta(days=1)),
            "apply_end_date": str(date.today() + timedelta(days=3)),
            "capacity_total": 30,
            "capacity_team": 3,
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    return int(resp.json()["lecture_id"])


def test_lecture_list_includes_my_registration_status_for_participant(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    project = _seed_participant_project(
        db,
        batch_id=seed_batch.batch_id,
        participant_user_id=seed_users["participant"].user_id,
    )
    lecture_id = _create_open_lecture(client, admin_headers, seed_batch.batch_id, "신청상태 테스트 강의")

    register_resp = client.post(
        f"/api/lectures/{lecture_id}/register",
        json={
            "project_id": project.project_id,
            "member_user_ids": [seed_users["participant"].user_id],
        },
        headers=participant_headers,
    )
    assert register_resp.status_code == 200, register_resp.text
    assert register_resp.json()["approval_status"] == "pending"

    list_resp = client.get(
        f"/api/lectures?batch_id={seed_batch.batch_id}",
        headers=participant_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    row = next((item for item in list_resp.json() if int(item["lecture_id"]) == lecture_id), None)
    assert row is not None
    assert row["my_registration_status"] == "pending"


def test_lecture_list_hides_my_registration_status_for_non_participant(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    coach_headers = auth_headers(client, "coach001")
    lecture_id = _create_open_lecture(client, admin_headers, seed_batch.batch_id, "권한 테스트 강의")

    list_resp = client.get(
        f"/api/lectures?batch_id={seed_batch.batch_id}",
        headers=coach_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    row = next((item for item in list_resp.json() if int(item["lecture_id"]) == lecture_id), None)
    assert row is not None
    assert row["my_registration_status"] is None
