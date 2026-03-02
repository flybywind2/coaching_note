"""[feedback8] 강의 시간 10분 단위 정책 및 수정 경로 검증 테스트."""

from datetime import date, timedelta

from tests.conftest import auth_headers


def _lecture_payload(batch_id: int, *, start_time: str = "10:00:00", end_time: str = "11:00:00") -> dict:
    return {
        "batch_id": batch_id,
        "title": "시간 정책 강의",
        "summary": "요약",
        "description": "설명",
        "instructor": "강사",
        "location": "강의실",
        "start_datetime": f"{date.today()}T{start_time}",
        "end_datetime": f"{date.today()}T{end_time}",
        "apply_start_date": str(date.today() - timedelta(days=1)),
        "apply_end_date": str(date.today() + timedelta(days=2)),
        "capacity_total": 20,
        "capacity_team": 3,
        "is_visible": True,
    }


def test_lecture_create_rejects_non_10_minute_step(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    resp = client.post(
        "/api/lectures",
        json=_lecture_payload(seed_batch.batch_id, start_time="10:05:00", end_time="11:00:00"),
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert "10분 단위" in resp.json().get("detail", "")


def test_lecture_update_rejects_non_10_minute_step(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    create_resp = client.post(
        "/api/lectures",
        json=_lecture_payload(seed_batch.batch_id, start_time="10:00:00", end_time="11:00:00"),
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    lecture_id = int(create_resp.json()["lecture_id"])

    update_resp = client.put(
        f"/api/lectures/{lecture_id}",
        json={"start_datetime": f"{date.today()}T10:11:00"},
        headers=admin_headers,
    )
    assert update_resp.status_code == 400
    assert "10분 단위" in update_resp.json().get("detail", "")


def test_lecture_bulk_update_rejects_non_10_minute_step(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    created_ids = []
    for idx in range(2):
        create_resp = client.post(
            "/api/lectures",
            json=_lecture_payload(seed_batch.batch_id, start_time=f"1{idx}:00:00", end_time=f"1{idx + 1}:00:00"),
            headers=admin_headers,
        )
        assert create_resp.status_code == 200, create_resp.text
        created_ids.append(int(create_resp.json()["lecture_id"]))

    bulk_resp = client.put(
        "/api/lectures/bulk-update",
        json={
            "lecture_ids": created_ids,
            "start_datetime": f"{date.today()}T09:25:00",
        },
        headers=admin_headers,
    )
    assert bulk_resp.status_code == 400
    assert "10분 단위" in bulk_resp.json().get("detail", "")
