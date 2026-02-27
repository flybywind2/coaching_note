"""[FEEDBACK7] 수강신청/강의관리 정책 테스트입니다."""

from datetime import date, datetime, timedelta

from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.user import User
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


def _seed_participant_project(db, *, batch_id: int, participant_user_id: int):
    row = Project(
        batch_id=batch_id,
        project_name="수강신청 과제",
        organization="개발팀",
        representative="참여자",
        visibility="public",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(
        ProjectMember(
            project_id=row.project_id,
            user_id=participant_user_id,
            role="leader",
            is_representative=True,
        )
    )
    db.commit()
    return row


def _ensure_extra_participant(db, emp_id: str = "user002"):
    row = db.query(User).filter(User.emp_id == emp_id).first()
    if row:
        return row
    row = User(emp_id=emp_id, name="추가 참여자", role="participant", department="Dev")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_lecture_list_visible_to_all_roles_all_batches(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    observer_headers = auth_headers(client, "obs001")
    batch2 = _seed_second_batch(db)

    for batch_id, title in [
        (seed_batch.batch_id, "1차 강의"),
        (batch2.batch_id, "2차 강의"),
    ]:
        create_resp = client.post(
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
                "apply_end_date": str(date.today() + timedelta(days=5)),
                "capacity_total": 30,
                "capacity_team": 3,
                "is_visible": True,
            },
            headers=admin_headers,
        )
        assert create_resp.status_code == 200, create_resp.text

    participant_list = client.get("/api/lectures", headers=participant_headers)
    assert participant_list.status_code == 200, participant_list.text
    participant_titles = {row["title"] for row in participant_list.json()}
    assert "1차 강의" in participant_titles
    assert "2차 강의" in participant_titles

    observer_list = client.get("/api/lectures", headers=observer_headers)
    assert observer_list.status_code == 200, observer_list.text
    observer_titles = {row["title"] for row in observer_list.json()}
    assert "1차 강의" in observer_titles
    assert "2차 강의" in observer_titles


def test_lecture_participant_register_with_period_and_quota(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    my_project = _seed_participant_project(
        db,
        batch_id=seed_batch.batch_id,
        participant_user_id=seed_users["participant"].user_id,
    )
    extra_user = _ensure_extra_participant(db, "user002")
    db.add(
        ProjectMember(
            project_id=my_project.project_id,
            user_id=extra_user.user_id,
            role="member",
            is_representative=False,
        )
    )
    db.commit()

    create_resp = client.post(
        "/api/lectures",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "신청가능 강의",
            "summary": "요약",
            "description": "설명",
            "instructor": "강사",
            "location": "강의실",
            "start_datetime": f"{date.today()}T10:00:00",
            "end_datetime": f"{date.today()}T11:00:00",
            "apply_start_date": str(date.today() - timedelta(days=1)),
            "apply_end_date": str(date.today() + timedelta(days=5)),
            "capacity_total": 10,
            "capacity_team": 2,
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    lecture_id = create_resp.json()["lecture_id"]

    register_resp = client.post(
        f"/api/lectures/{lecture_id}/register",
        json={
            "project_id": my_project.project_id,
            "member_user_ids": [seed_users["participant"].user_id, extra_user.user_id],
        },
        headers=participant_headers,
    )
    assert register_resp.status_code == 200, register_resp.text
    assert register_resp.json()["member_count"] == 2

    overflow_resp = client.post(
        f"/api/lectures/{lecture_id}/register",
        json={
            "project_id": my_project.project_id,
            "member_user_ids": [seed_users["participant"].user_id, extra_user.user_id, seed_users["coach"].user_id],
        },
        headers=participant_headers,
    )
    assert overflow_resp.status_code == 400


def test_lecture_participant_register_denied_out_of_period_and_other_project(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    my_project = _seed_participant_project(
        db,
        batch_id=seed_batch.batch_id,
        participant_user_id=seed_users["participant"].user_id,
    )
    other_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="타 과제",
        organization="영업팀",
        representative="타인",
        visibility="public",
    )
    db.add(other_project)
    db.commit()
    db.refresh(other_project)

    create_resp = client.post(
        "/api/lectures",
        json={
            "batch_id": seed_batch.batch_id,
            "title": "기간지난 강의",
            "summary": "요약",
            "description": "설명",
            "instructor": "강사",
            "location": "강의실",
            "start_datetime": f"{date.today()}T14:00:00",
            "end_datetime": f"{date.today()}T15:00:00",
            "apply_start_date": str(date.today() - timedelta(days=8)),
            "apply_end_date": str(date.today() - timedelta(days=1)),
            "capacity_total": 10,
            "capacity_team": 3,
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    lecture_id = create_resp.json()["lecture_id"]

    out_of_period_resp = client.post(
        f"/api/lectures/{lecture_id}/register",
        json={"project_id": my_project.project_id, "member_user_ids": [seed_users["participant"].user_id]},
        headers=participant_headers,
    )
    assert out_of_period_resp.status_code == 403

    open_resp = client.put(
        f"/api/lectures/{lecture_id}",
        json={
            "apply_start_date": str(date.today() - timedelta(days=1)),
            "apply_end_date": str(date.today() + timedelta(days=3)),
        },
        headers=admin_headers,
    )
    assert open_resp.status_code == 200, open_resp.text

    other_project_resp = client.post(
        f"/api/lectures/{lecture_id}/register",
        json={"project_id": other_project.project_id, "member_user_ids": [seed_users["participant"].user_id]},
        headers=participant_headers,
    )
    assert other_project_resp.status_code == 403


def test_lecture_admin_bulk_update_and_approval(client, db, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")
    my_project = _seed_participant_project(
        db,
        batch_id=seed_batch.batch_id,
        participant_user_id=seed_users["participant"].user_id,
    )

    created_ids = []
    for idx in range(2):
        create_resp = client.post(
            "/api/lectures",
            json={
                "batch_id": seed_batch.batch_id,
                "title": f"강의{idx + 1}",
                "summary": "요약",
                "description": "설명",
                "instructor": "강사",
                "location": "기존 장소",
                "start_datetime": f"{date.today()}T09:00:00",
                "end_datetime": f"{date.today()}T10:00:00",
                "apply_start_date": str(date.today() - timedelta(days=1)),
                "apply_end_date": str(date.today() + timedelta(days=3)),
                "capacity_total": 20,
                "capacity_team": 3,
                "is_visible": True,
            },
            headers=admin_headers,
        )
        assert create_resp.status_code == 200, create_resp.text
        created_ids.append(int(create_resp.json()["lecture_id"]))

    register_resp = client.post(
        f"/api/lectures/{created_ids[0]}/register",
        json={"project_id": my_project.project_id, "member_user_ids": [seed_users["participant"].user_id]},
        headers=participant_headers,
    )
    assert register_resp.status_code == 200, register_resp.text
    registration_id = register_resp.json()["registration_id"]

    approve_resp = client.patch(
        f"/api/lectures/registrations/{registration_id}/approval",
        json={"approval_status": "approved"},
        headers=admin_headers,
    )
    assert approve_resp.status_code == 200, approve_resp.text
    assert approve_resp.json()["approval_status"] == "approved"

    bulk_resp = client.put(
        "/api/lectures/bulk-update",
        json={"lecture_ids": created_ids, "location": "변경 장소"},
        headers=admin_headers,
    )
    assert bulk_resp.status_code == 200, bulk_resp.text
    assert bulk_resp.json()["updated"] == 2

    list_resp = client.get(f"/api/lectures?batch_id={seed_batch.batch_id}", headers=admin_headers)
    assert list_resp.status_code == 200, list_resp.text
    rows = [row for row in list_resp.json() if int(row["lecture_id"]) in created_ids]
    assert rows
    assert all(row["location"] == "변경 장소" for row in rows)

