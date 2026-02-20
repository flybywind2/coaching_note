"""콘텐츠 버전 저장/조회 공용 기능을 제공하는 도메인 서비스입니다."""

import json
from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.content_version import ContentVersion


def create_content_version(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    changed_by: int,
    change_type: str,
    snapshot: Dict[str, Any],
) -> ContentVersion:
    current_max = (
        db.query(func.max(ContentVersion.version_no))
        .filter(
            ContentVersion.entity_type == entity_type,
            ContentVersion.entity_id == entity_id,
        )
        .scalar()
    )
    version_no = (current_max or 0) + 1

    row = ContentVersion(
        entity_type=entity_type,
        entity_id=entity_id,
        version_no=version_no,
        change_type=change_type,
        snapshot=json.dumps(snapshot, ensure_ascii=False),
        changed_by=changed_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_versions(db: Session, *, entity_type: str, entity_id: int) -> List[ContentVersion]:
    return (
        db.query(ContentVersion)
        .filter(
            ContentVersion.entity_type == entity_type,
            ContentVersion.entity_id == entity_id,
        )
        .order_by(ContentVersion.version_no.desc())
        .all()
    )


def get_version(db: Session, *, entity_type: str, entity_id: int, version_id: int) -> ContentVersion:
    row = (
        db.query(ContentVersion)
        .filter(
            ContentVersion.version_id == version_id,
            ContentVersion.entity_type == entity_type,
            ContentVersion.entity_id == entity_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="버전 이력을 찾을 수 없습니다.")
    return row


def parse_snapshot(row: ContentVersion) -> Dict[str, Any]:
    try:
        return json.loads(row.snapshot or "{}")
    except json.JSONDecodeError:
        return {}


def to_response(row: ContentVersion) -> Dict[str, Any]:
    return {
        "version_id": row.version_id,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "version_no": row.version_no,
        "change_type": row.change_type,
        "snapshot": parse_snapshot(row),
        "changed_by": row.changed_by,
        "created_at": row.created_at,
    }

