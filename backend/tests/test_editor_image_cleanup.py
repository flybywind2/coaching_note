from pathlib import Path
import shutil
from uuid import uuid4

from app.config import settings
from app.models.document import ProjectDocument
from app.models.project import Project
from tests.conftest import auth_headers


def _set_test_upload_dir(monkeypatch):
    test_upload_dir = Path("test_uploads_runtime") / uuid4().hex / "uploads"
    test_upload_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(test_upload_dir))
    return test_upload_dir


def _write_file(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"test")


def test_cleanup_editor_images_dry_run_and_apply(client, db, seed_users, seed_batch, monkeypatch):
    upload_root = _set_test_upload_dir(monkeypatch)
    headers = auth_headers(client, "admin001")

    try:
        project = Project(
            batch_id=seed_batch.batch_id,
            project_name="Cleanup Project",
            organization="Org",
            visibility="public",
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        used_url = f"/uploads/editor_images/projects/{project.project_id}/document/used.png"
        orphan_url = f"/uploads/editor_images/projects/{project.project_id}/document/orphan.png"

        _write_file(upload_root / used_url.replace("/uploads/", ""))
        _write_file(upload_root / orphan_url.replace("/uploads/", ""))

        doc = ProjectDocument(
            project_id=project.project_id,
            doc_type="application",
            title="Doc",
            content=f'<p><img src="{used_url}" /></p>',
            created_by=seed_users["admin"].user_id,
        )
        db.add(doc)
        db.commit()

        dry_resp = client.post("/api/uploads/editor-images/cleanup?dry_run=true", headers=headers)
        assert dry_resp.status_code == 200
        dry = dry_resp.json()
        assert dry["orphan_count"] == 1
        assert dry["deleted_count"] == 0
        assert orphan_url in dry["orphan_urls"]

        apply_resp = client.post("/api/uploads/editor-images/cleanup?dry_run=false", headers=headers)
        assert apply_resp.status_code == 200
        applied = apply_resp.json()
        assert applied["orphan_count"] == 1
        assert applied["deleted_count"] == 1

        assert (upload_root / used_url.replace("/uploads/", "")).exists()
        assert not (upload_root / orphan_url.replace("/uploads/", "")).exists()
    finally:
        shutil.rmtree(upload_root.parent.parent, ignore_errors=True)


def test_cleanup_editor_images_admin_only(client, seed_users):
    headers = auth_headers(client, "user001")
    resp = client.post("/api/uploads/editor-images/cleanup?dry_run=true", headers=headers)
    assert resp.status_code == 403
