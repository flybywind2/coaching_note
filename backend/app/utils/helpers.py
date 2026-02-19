import os
import uuid
from fastapi import UploadFile, HTTPException
from app.config import settings


def validate_file(file: UploadFile) -> None:
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )


async def save_upload(file: UploadFile, subfolder: str = "") -> dict:
    validate_file(file)
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")

    folder = os.path.join(settings.UPLOAD_DIR, subfolder)
    os.makedirs(folder, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(folder, filename)

    with open(path, "wb") as f:
        f.write(content)

    return {
        "filename": file.filename,
        "url": f"/uploads/{subfolder}/{filename}".replace("\\", "/"),
        "size": len(content),
    }
