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
