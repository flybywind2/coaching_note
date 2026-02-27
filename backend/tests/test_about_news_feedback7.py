"""[FEEDBACK7] 소개 > 소식(news) API 동작 검증 테스트입니다."""

from tests.conftest import auth_headers


def test_about_news_list_sorted_by_published_at_desc(client, seed_users):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    create_old = client.post(
        "/api/about/news",
        json={
            "title": "이전 소식",
            "content": "<p>old</p>",
            "published_at": "2026-01-10T09:00:00",
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_old.status_code == 200, create_old.text

    create_new = client.post(
        "/api/about/news",
        json={
            "title": "최신 소식",
            "content": "<p>new</p>",
            "published_at": "2026-02-01T09:00:00",
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_new.status_code == 200, create_new.text

    list_resp = client.get("/api/about/news", headers=participant_headers)
    assert list_resp.status_code == 200, list_resp.text
    rows = list_resp.json()
    assert len(rows) == 2
    assert rows[0]["title"] == "최신 소식"
    assert rows[1]["title"] == "이전 소식"


def test_about_news_create_update_admin_only(client, seed_users):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    forbidden_create = client.post(
        "/api/about/news",
        json={
            "title": "참여자 작성 시도",
            "content": "<p>forbidden</p>",
            "published_at": "2026-02-01T09:00:00",
            "is_visible": True,
        },
        headers=participant_headers,
    )
    assert forbidden_create.status_code == 403

    create_resp = client.post(
        "/api/about/news",
        json={
            "title": "관리자 소식",
            "content": "<p>admin</p>",
            "published_at": "2026-02-01T09:00:00",
            "is_visible": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    news_id = create_resp.json()["news_id"]

    forbidden_update = client.put(
        f"/api/about/news/{news_id}",
        json={"title": "참여자 수정"},
        headers=participant_headers,
    )
    assert forbidden_update.status_code == 403

    update_resp = client.put(
        f"/api/about/news/{news_id}",
        json={"title": "관리자 수정 완료"},
        headers=admin_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["title"] == "관리자 수정 완료"

