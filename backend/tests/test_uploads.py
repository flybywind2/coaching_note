"""Test Uploads 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

import shutil
from pathlib import Path
from uuid import uuid4

from app.config import settings
from tests.conftest import auth_headers


def _set_test_upload_dir(monkeypatch):
    test_upload_dir = Path("test_uploads_runtime") / uuid4().hex / "uploads"
    test_upload_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(test_upload_dir))
    return test_upload_dir


def test_upload_image_requires_auth(client, seed_users):
    files = {"file": ("test.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    resp = client.post("/api/uploads/images", files=files)
    assert resp.status_code in (401, 403)


def test_upload_image_success(client, seed_users, monkeypatch):
    test_upload_dir = _set_test_upload_dir(monkeypatch)
    headers = auth_headers(client, "admin001")
    files = {"file": ("test.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    try:
        resp = client.post(
            "/api/uploads/images",
            headers=headers,
            files=files,
            data={"scope": "document", "project_id": "101"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["filename"] == "test.png"
        assert data["url"].startswith("/uploads/editor_images/projects/101/document/")
        assert data["size"] > 0
    finally:
        shutil.rmtree(test_upload_dir.parent.parent, ignore_errors=True)


def test_upload_image_rejects_non_image_extension(client, seed_users, monkeypatch):
    test_upload_dir = _set_test_upload_dir(monkeypatch)
    headers = auth_headers(client, "admin001")
    files = {"file": ("test.pdf", b"%PDF-1.4", "application/pdf")}
    try:
        resp = client.post("/api/uploads/images", headers=headers, files=files)
        assert resp.status_code == 400
    finally:
        shutil.rmtree(test_upload_dir.parent.parent, ignore_errors=True)


def test_upload_image_rejects_invalid_scope(client, seed_users, monkeypatch):
    test_upload_dir = _set_test_upload_dir(monkeypatch)
    headers = auth_headers(client, "admin001")
    files = {"file": ("test.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    try:
        resp = client.post("/api/uploads/images", headers=headers, files=files, data={"scope": "unknown"})
        assert resp.status_code == 400
    finally:
        shutil.rmtree(test_upload_dir.parent.parent, ignore_errors=True)


