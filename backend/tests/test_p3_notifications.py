"""P3 알림 설정 기능(유형별 ON/OFF, 빈도) 동작을 검증하는 테스트입니다."""

from datetime import date

import pytest

from app.models.project import Project
from tests.conftest import auth_headers


@pytest.fixture
def project(db, seed_batch):
    row = Project(
        batch_id=seed_batch.batch_id,
        project_name="알림 테스트 과제",
        organization="Org",
        visibility="public",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_note_with_mention(client, project_id: int, coach_headers: dict, mention_token: str):
    return client.post(
        f"/api/projects/{project_id}/notes",
        json={
            "coaching_date": str(date.today()),
            "current_status": f"상태 @{mention_token}",
            "main_issue": "이슈",
            "next_action": "액션",
        },
        headers=coach_headers,
    )


def test_notification_preferences_get_and_update(client, seed_users):
    participant_headers = auth_headers(client, "user001")

    get_resp = client.get("/api/notifications/preferences", headers=participant_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["mention_enabled"] is True
    assert get_resp.json()["board_enabled"] is True
    assert get_resp.json()["deadline_enabled"] is True
    assert get_resp.json()["frequency"] == "realtime"

    update_resp = client.put(
        "/api/notifications/preferences",
        json={
            "mention_enabled": False,
            "board_enabled": True,
            "deadline_enabled": False,
            "frequency": "daily",
        },
        headers=participant_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["mention_enabled"] is False
    assert update_resp.json()["board_enabled"] is True
    assert update_resp.json()["deadline_enabled"] is False
    assert update_resp.json()["frequency"] == "daily"


def test_mention_notification_respects_preference_toggle(client, seed_users, project):
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")

    pref_update = client.put(
        "/api/notifications/preferences",
        json={
            "mention_enabled": False,
            "board_enabled": True,
            "deadline_enabled": True,
            "frequency": "realtime",
        },
        headers=participant_headers,
    )
    assert pref_update.status_code == 200

    create_resp = _create_note_with_mention(client, project.project_id, coach_headers, "user001")
    assert create_resp.status_code == 200

    noti_resp = client.get("/api/notifications", headers=participant_headers)
    assert noti_resp.status_code == 200
    assert not any(n["noti_type"] == "mention" for n in noti_resp.json())


def test_daily_frequency_merges_same_type_notifications(client, seed_users, project):
    coach_headers = auth_headers(client, "coach001")
    participant_headers = auth_headers(client, "user001")

    pref_update = client.put(
        "/api/notifications/preferences",
        json={
            "mention_enabled": True,
            "board_enabled": True,
            "deadline_enabled": True,
            "frequency": "daily",
        },
        headers=participant_headers,
    )
    assert pref_update.status_code == 200

    first = _create_note_with_mention(client, project.project_id, coach_headers, "user001")
    assert first.status_code == 200
    second = _create_note_with_mention(client, project.project_id, coach_headers, "user001")
    assert second.status_code == 200

    noti_resp = client.get("/api/notifications", headers=participant_headers)
    assert noti_resp.status_code == 200
    mention_items = [n for n in noti_resp.json() if n["noti_type"] == "mention"]
    assert len(mention_items) == 1
