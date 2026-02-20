"""소개 페이지 API 동작 검증 테스트입니다."""

from tests.conftest import auth_headers


def test_get_about_content_default(client, seed_users):
    headers = auth_headers(client, "user001")
    resp = client.get("/api/about/content?key=ssp_intro", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["content_key"] == "ssp_intro"
    assert data["title"] == "SSP+ 소개"
    assert data["content"]


def test_update_about_content_admin_only(client, seed_users):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    forbidden_resp = client.put(
        "/api/about/content/ssp_intro",
        json={"content": "<p>참여자 수정 시도</p>"},
        headers=participant_headers,
    )
    assert forbidden_resp.status_code == 403

    update_resp = client.put(
        "/api/about/content/ssp_intro",
        json={"content": "<p>관리자 수정 콘텐츠</p>"},
        headers=admin_headers,
    )
    assert update_resp.status_code == 200
    assert "관리자 수정 콘텐츠" in update_resp.json()["content"]

    get_resp = client.get("/api/about/content?key=ssp_intro", headers=participant_headers)
    assert get_resp.status_code == 200
    assert "관리자 수정 콘텐츠" in get_resp.json()["content"]


def test_list_coaches_fallback_from_users(client, seed_users):
    headers = auth_headers(client, "admin001")
    resp = client.get("/api/about/coaches", headers=headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert any(row["name"] == "Coach" for row in rows)
