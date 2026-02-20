"""Editor Image Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import os
import re
from typing import Iterable

from sqlalchemy.orm import Session

from app.config import settings
from app.models.board import BoardPost, PostComment
from app.models.coaching_note import CoachingComment, CoachingNote
from app.models.document import ProjectDocument

EDITOR_IMAGE_URL_RE = re.compile(r"/uploads/editor_images/[^\s\"'<>)]*")


def _extract_editor_image_urls(text: str | None) -> set[str]:
    if not text:
        return set()
    return set(EDITOR_IMAGE_URL_RE.findall(text))


def _collect_from_texts(texts: Iterable[str | None]) -> set[str]:
    found: set[str] = set()
    for text in texts:
        found.update(_extract_editor_image_urls(text))
    return found


def collect_referenced_editor_image_urls(db: Session) -> set[str]:
    referenced: set[str] = set()

    referenced.update(_collect_from_texts(row[0] for row in db.query(ProjectDocument.content).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(CoachingNote.current_status).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(CoachingNote.main_issue).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(CoachingNote.next_action).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(CoachingComment.content).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(BoardPost.content).all()))
    referenced.update(_collect_from_texts(row[0] for row in db.query(PostComment.content).all()))

    return referenced


def collect_existing_editor_image_urls() -> set[str]:
    root = os.path.join(settings.UPLOAD_DIR, "editor_images")
    if not os.path.exists(root):
        return set()

    existing: set[str] = set()
    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, settings.UPLOAD_DIR).replace("\\", "/")
            existing.add(f"/uploads/{rel_path}")
    return existing


def cleanup_orphan_editor_images(db: Session, dry_run: bool = True):
    referenced = collect_referenced_editor_image_urls(db)
    existing = collect_existing_editor_image_urls()
    orphan_urls = sorted(existing - referenced)

    deleted_count = 0
    if not dry_run:
        for url in orphan_urls:
            rel_path = url.replace("/uploads/", "", 1).replace("/", os.sep)
            abs_path = os.path.join(settings.UPLOAD_DIR, rel_path)
            if os.path.exists(abs_path):
                os.remove(abs_path)
                deleted_count += 1

        _remove_empty_dirs(os.path.join(settings.UPLOAD_DIR, "editor_images"))

    return {
        "dry_run": dry_run,
        "referenced_count": len(referenced),
        "existing_count": len(existing),
        "orphan_count": len(orphan_urls),
        "deleted_count": deleted_count,
        "orphan_urls": orphan_urls,
    }


def _remove_empty_dirs(root: str):
    if not os.path.exists(root):
        return
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        if dirnames or filenames:
            continue
        try:
            os.rmdir(dirpath)
        except OSError:
            pass



