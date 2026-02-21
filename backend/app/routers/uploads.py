"""Uploads 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User
from app.config import settings
from app.schemas.upload import EditorImageCleanupOut, UploadedFileOut
from app.services import editor_image_service
from app.utils.helpers import save_upload

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif"}
ALLOWED_FILE_EXTENSIONS = {ext.lower() for ext in settings.ALLOWED_EXTENSIONS}
ALLOWED_SCOPES = {"document", "note", "comment", "board_post", "board_comment", "about", "general"}


@router.post("/images", response_model=UploadedFileOut)
async def upload_image(
    file: UploadFile = File(...),
    scope: str = Form("general"),
    project_id: int | None = Form(None),
    board_id: int | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    _ = current_user  # authenticated users only
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="이미지 파일(jpg, jpeg, png, gif)만 업로드 가능합니다.")
    if scope not in ALLOWED_SCOPES:
        raise HTTPException(status_code=400, detail="유효하지 않은 업로드 scope 입니다.")

    subfolder = _build_subfolder(scope=scope, project_id=project_id, board_id=board_id, category="editor_images")
    return await save_upload(file, subfolder=subfolder)


@router.post("/files", response_model=UploadedFileOut)
async def upload_file(
    file: UploadFile = File(...),
    scope: str = Form("general"),
    project_id: int | None = Form(None),
    board_id: int | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    _ = current_user  # authenticated users only
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 파일 형식입니다. 허용 확장자: {', '.join(sorted(ALLOWED_FILE_EXTENSIONS))}",
        )
    if scope not in ALLOWED_SCOPES:
        raise HTTPException(status_code=400, detail="유효하지 않은 업로드 scope 입니다.")

    subfolder = _build_subfolder(scope=scope, project_id=project_id, board_id=board_id, category="editor_files")
    return await save_upload(file, subfolder=subfolder)


@router.post("/editor-images/cleanup", response_model=EditorImageCleanupOut)
def cleanup_editor_images(
    dry_run: bool = True,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles("admin")),
):
    return editor_image_service.cleanup_orphan_editor_images(db, dry_run=dry_run)


def _build_subfolder(scope: str, project_id: int | None, board_id: int | None, category: str) -> str:
    if scope in {"document", "note", "comment"}:
        if project_id is None or project_id <= 0:
            raise HTTPException(status_code=400, detail="project_id가 필요합니다.")
        return f"{category}/projects/{project_id}/{scope}"

    if scope in {"board_post", "board_comment"}:
        if board_id is None or board_id <= 0:
            raise HTTPException(status_code=400, detail="board_id가 필요합니다.")
        return f"{category}/boards/{board_id}/{scope}"

    if scope == "about":
        return f"{category}/about"

    return f"{category}/general"


