"""[FEEDBACK7] 캘린더-강의일정 연동 테스트입니다."""

from datetime import date

from tests.conftest import auth_headers


def _create_lecture(client, headers, batch_id: int, title: str):
    resp = client.post(
        "/api/lectures",
        json={
            "batch_id": batch_id,
            "title": title,
            "summary": "강의 요약",
            "description": "강의 상세",
            "instructor": "강사",
            "location": "대강당",
            "start_datetime": "2026-02-12T10:00:00",
            "end_datetime": "2026-02-12T12:00:00",
            "apply_start_date": str(date.today() - date.resolution),
            "apply_end_date": str(date.today().replace(day=min(28, date.today().day + 5))),
            "capacity_total": 40,
            "capacity_team": 4,
            "is_visible": True,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return int(resp.json()["lecture_id"])


def test_calendar_includes_lecture_event_and_link(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    lecture_id = _create_lecture(client, admin_headers, seed_batch.batch_id, "캘린더 연동 강의")

    resp = client.get(
        f"/api/calendar?batch_id={seed_batch.batch_id}&start=2026-02-01&end=2026-02-28",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    rows = [
        ev for ev in resp.json()["events"]
        if ev.get("event_type") == "lecture" and int(ev.get("id")) == lecture_id
    ]
    assert rows
    event = rows[0]
    assert event.get("manage_type") == "lecture"
    assert event.get("link_url")
    assert "course-registration" in str(event.get("link_url"))


def test_calendar_observer_can_see_lecture_event(client, seed_users, seed_batch):
    admin_headers = auth_headers(client, "admin001")
    observer_headers = auth_headers(client, "obs001")
    _create_lecture(client, admin_headers, seed_batch.batch_id, "참관자 노출 강의")

    resp = client.get(
        f"/api/calendar?batch_id={seed_batch.batch_id}&start=2026-02-01&end=2026-02-28",
        headers=observer_headers,
    )
    assert resp.status_code == 200, resp.text
    lecture_events = [ev for ev in resp.json()["events"] if ev.get("event_type") == "lecture"]
    assert lecture_events

