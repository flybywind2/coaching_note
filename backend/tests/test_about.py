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


def test_coach_profile_crud_admin_only(client, seed_users):
    admin_headers = auth_headers(client, "admin001")
    participant_headers = auth_headers(client, "user001")

    forbidden_create = client.post(
        "/api/about/coaches",
        json={"name": "외부 코치", "coach_type": "external"},
        headers=participant_headers,
    )
    assert forbidden_create.status_code == 403

    create_resp = client.post(
        "/api/about/coaches",
        json={
            "name": "외부 코치",
            "coach_type": "external",
            "affiliation": "파트너사",
            "specialty": "MLOps",
            "career": "10년",
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    coach = create_resp.json()
    coach_id = coach["coach_id"]
    assert coach["name"] == "외부 코치"
    assert coach["coach_type"] == "external"

    update_resp = client.put(
        f"/api/about/coaches/{coach_id}",
        json={"specialty": "MLOps/LLMOps", "department": "AI Lab"},
        headers=admin_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["specialty"] == "MLOps/LLMOps"
    assert updated["department"] == "AI Lab"

    list_resp = client.get("/api/about/coaches", headers=admin_headers)
    assert list_resp.status_code == 200
    assert any(row["coach_id"] == coach_id for row in list_resp.json())

    forbidden_delete = client.delete(f"/api/about/coaches/{coach_id}", headers=participant_headers)
    assert forbidden_delete.status_code == 403

    delete_resp = client.delete(f"/api/about/coaches/{coach_id}", headers=admin_headers)
    assert delete_resp.status_code == 200

    list_after_delete = client.get("/api/about/coaches", headers=admin_headers)
    assert list_after_delete.status_code == 200
    assert all(row.get("coach_id") != coach_id for row in list_after_delete.json())
