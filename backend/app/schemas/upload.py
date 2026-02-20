"""Upload 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel


class UploadedFileOut(BaseModel):
    filename: str
    url: str
    size: int


class EditorImageCleanupOut(BaseModel):
    dry_run: bool
    referenced_count: int
    existing_count: int
    orphan_count: int
    deleted_count: int
    orphan_urls: list[str]


