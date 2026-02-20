"""Test AI 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

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


def test_enhance_note_participant_forbidden(client, seed_users, project_with_notes, db):
    note = db.query(CoachingNote).filter(CoachingNote.project_id == project_with_notes.project_id).first()
    headers = auth_headers(client, "user001")
    resp = client.post(
        f"/api/notes/{note.note_id}/enhance",
        json={"instruction": "문장을 더 명확하게"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_enhance_note_mocked(client, seed_users, project_with_notes, db):
    note = db.query(CoachingNote).filter(CoachingNote.project_id == project_with_notes.project_id).first()
    with patch("app.services.ai_service.AIClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.model_name = "qwen3"
        mock_instance.invoke.return_value = (
            '{"current_status":"<p>보완된 현재 상태</p>",'
            '"main_issue":"<p>보완된 당면 문제</p>",'
            '"next_action":"<ul><li>보완된 다음 액션</li></ul>"}'
        )
        MockClient.get_client.return_value = mock_instance

        headers = auth_headers(client, "coach001")
        resp = client.post(
            f"/api/notes/{note.note_id}/enhance",
            json={
                "current_status": "<p>기존 상태</p>",
                "main_issue": "<p>기존 이슈</p>",
                "next_action": "<p>기존 액션</p>",
                "instruction": "실행 단계를 더 구체적으로",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_status"] == "<p>보완된 현재 상태</p>"
        assert data["main_issue"] == "<p>보완된 당면 문제</p>"
        assert "보완된 다음 액션" in data["next_action"]
        assert data["model_used"] == "qwen3"


def test_dashboard_forbidden_for_participant(client, seed_users, seed_batch):
    headers = auth_headers(client, "user001")
    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=headers)
    assert resp.status_code == 403


def test_dashboard_accessible_for_admin(client, seed_users, seed_batch):
    headers = auth_headers(client, "admin001")
    resp = client.get(f"/api/dashboard?batch_id={seed_batch.batch_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "projects" in data
    assert "project_daily_attendance" in data
    assert "project_daily_notes" in data
    assert "coach_activity" in data


