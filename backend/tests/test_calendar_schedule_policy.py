"""캘린더 공통 일정 정책(하루 1개, 반복 일정 일괄 수정/삭제) 회귀 테스트."""

from datetime import datetime

from tests.conftest import auth_headers


def _create_schedule(client, headers, payload):
    return client.post("/api/schedules", json=payload, headers=headers)


def test_global_schedule_one_per_day_limit(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    target_date = "2026-02-10"

    first_resp = _create_schedule(
        client,
        admin_headers,
        {
            "batch_id": seed_batch.batch_id,
            "title": "공통 일정 1",
            "description": None,
            "schedule_type": "other",
            "start_datetime": f"{target_date}T10:00:00",
            "end_datetime": f"{target_date}T11:00:00",
            "location": "회의실",
            "is_all_day": False,
            "color": "#4CAF50",
        },
    )
    assert first_resp.status_code == 200, first_resp.text

    second_resp = _create_schedule(
        client,
        admin_headers,
        {
            "batch_id": seed_batch.batch_id,
            "title": "공통 일정 2",
            "description": None,
            "schedule_type": "other",
            "start_datetime": f"{target_date}T14:00:00",
            "end_datetime": f"{target_date}T15:00:00",
            "location": "온라인",
            "is_all_day": False,
            "color": "#00AA88",
        },
    )
    assert second_resp.status_code == 400
    assert "하루에 1개" in second_resp.json()["detail"]


def test_schedule_series_update_and_delete(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    repeat_group_id = "series-test-001"

    first_resp = _create_schedule(
        client,
        admin_headers,
        {
            "batch_id": seed_batch.batch_id,
            "title": "반복 일정 A",
            "description": None,
            "schedule_type": "other",
            "start_datetime": "2026-03-01T09:00:00",
            "end_datetime": "2026-03-01T10:00:00",
            "location": "A실",
            "is_all_day": False,
            "color": "#4CAF50",
            "repeat_group_id": repeat_group_id,
            "repeat_sequence": 1,
        },
    )
    second_resp = _create_schedule(
        client,
        admin_headers,
        {
            "batch_id": seed_batch.batch_id,
            "title": "반복 일정 A",
            "description": None,
            "schedule_type": "other",
            "start_datetime": "2026-03-08T09:00:00",
            "end_datetime": "2026-03-08T10:00:00",
            "location": "A실",
            "is_all_day": False,
            "color": "#4CAF50",
            "repeat_group_id": repeat_group_id,
            "repeat_sequence": 2,
        },
    )
    assert first_resp.status_code == 200, first_resp.text
    assert second_resp.status_code == 200, second_resp.text

    seed_id = first_resp.json()["schedule_id"]
    update_resp = client.put(
        f"/api/schedules/{seed_id}/series",
        json={
            "title": "반복 일정 B",
            "start_datetime": "2026-03-02T09:00:00",
            "end_datetime": "2026-03-02T10:00:00",
            "color": "#112233",
        },
        headers=admin_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["updated"] == 2

    list_resp = client.get(f"/api/schedules?batch_id={seed_batch.batch_id}", headers=admin_headers)
    assert list_resp.status_code == 200, list_resp.text
    series_rows = [row for row in list_resp.json() if row["repeat_group_id"] == repeat_group_id]
    assert len(series_rows) == 2
    start_values = sorted(datetime.fromisoformat(row["start_datetime"]).date().isoformat() for row in series_rows)
    assert start_values == ["2026-03-02", "2026-03-09"]
    assert all(row["title"] == "반복 일정 B" for row in series_rows)
    assert all(row["color"] == "#112233" for row in series_rows)

    delete_resp = client.delete(f"/api/schedules/{seed_id}/series", headers=admin_headers)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["deleted"] == 2
