import pytest
from unittest.mock import patch, MagicMock
from tests.conftest import auth_headers
from app.models.project import Project
from app.models.coaching_note import CoachingNote
from datetime import date


@pytest.fixture
def project_with_notes(db, seed_batch, seed_users):
    p = Project(batch_id=seed_batch.batch_id, project_name="AI Test Project",
                organization="Org", visibility="public")
    db.add(p)
    db.commit()
    db.refresh(p)

    note = CoachingNote(
        project_id=p.project_id,
        author_id=seed_users["coach"].user_id,
        coaching_date=date.today(),
        current_status="진행 중",
        progress_rate=50,
        main_issue="AI 모델 선택",
        next_action="데이터 수집",
    )
    db.add(note)
    db.commit()
    return p


def test_get_summary_not_found(client, seed_users, project_with_notes):
    headers = auth_headers(client, "admin001")
    resp = client.get(f"/api/projects/{project_with_notes.project_id}/summary", headers=headers)
    assert resp.status_code == 404


def test_generate_summary_participant_forbidden(client, seed_users, project_with_notes):
    headers = auth_headers(client, "user001")
    resp = client.post(
        f"/api/projects/{project_with_notes.project_id}/summary",
        json={"force_regenerate": False},
        headers=headers,
    )
    assert resp.status_code == 403


def test_generate_summary_mocked(client, seed_users, project_with_notes):
    """Test AI summary generation with mocked LLM call."""
    with patch("app.services.ai_service.AIClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.model_name = "gpt-oss"
        mock_instance.invoke.return_value = "## 요약\n테스트 요약 내용입니다."
        MockClient.get_client.return_value = mock_instance

        headers = auth_headers(client, "admin001")
        resp = client.post(
            f"/api/projects/{project_with_notes.project_id}/summary",
            json={"force_regenerate": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert "content" in resp.json()


def test_dashboard_forbidden_for_participant(client, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=headers)
    assert resp.status_code == 403


def test_dashboard_accessible_for_admin(client, seed_users, seed_batch):
    headers = auth_headers(client, "admin001")
    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_projects" in data
    assert "session_stats" in data
