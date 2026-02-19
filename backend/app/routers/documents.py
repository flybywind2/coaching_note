import json
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas.document import ProjectDocumentCreate, ProjectDocumentUpdate, ProjectDocumentOut
from app.models.document import ProjectDocument
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.utils.helpers import save_upload
from fastapi import HTTPException

router = APIRouter(tags=["documents"])


@router.get("/api/projects/{project_id}/documents", response_model=List[ProjectDocumentOut])
def list_documents(
    project_id: int,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id)
    if doc_type:
        q = q.filter(ProjectDocument.doc_type == doc_type)
    return q.order_by(ProjectDocument.created_at.desc()).all()


@router.post("/api/projects/{project_id}/documents", response_model=ProjectDocumentOut)
async def create_document(
    project_id: int,
    doc_type: str = Form(...),
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachments = None
    if file and file.filename:
        info = await save_upload(file, subfolder="documents")
        attachments = json.dumps([info])

    doc = ProjectDocument(
        project_id=project_id,
        doc_type=doc_type,
        title=title,
        content=content,
        attachments=attachments,
        created_by=current_user.user_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/api/documents/{doc_id}", response_model=ProjectDocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return doc


@router.put("/api/documents/{doc_id}", response_model=ProjectDocumentOut)
def update_document(
    doc_id: int,
    data: ProjectDocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/api/documents/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    db.delete(doc)
    db.commit()
    return {"message": "삭제되었습니다."}
