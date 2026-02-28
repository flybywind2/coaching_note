"""Documents 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

import json
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas.document import ProjectDocumentCreate, ProjectDocumentUpdate, ProjectDocumentOut
from app.schemas.version import ContentVersionOut
from app.models.document import ProjectDocument
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.services import version_service
from app.services.chatbot_service import ChatbotService
from app.utils.helpers import save_upload
from fastapi import HTTPException

router = APIRouter(tags=["documents"])


def _doc_snapshot(doc: ProjectDocument) -> dict:
    return {
        "doc_type": doc.doc_type,
        "title": doc.title,
        "content": doc.content,
        "attachments": doc.attachments,
    }


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
    version_service.create_content_version(
        db,
        entity_type="document",
        entity_id=doc.doc_id,
        changed_by=current_user.user_id,
        change_type="create",
        snapshot=_doc_snapshot(doc),
    )
    # [chatbot] 과제기록 생성 시 RAG 입력 동기화
    ChatbotService(db).safe_sync_project_document(
        doc_id=int(doc.doc_id),
        user_id=str(current_user.user_id),
        event_type="create",
    )
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
    version_service.create_content_version(
        db,
        entity_type="document",
        entity_id=doc.doc_id,
        changed_by=current_user.user_id,
        change_type="update",
        snapshot=_doc_snapshot(doc),
    )
    # [chatbot] 과제기록 수정 시 RAG 입력 갱신
    ChatbotService(db).safe_sync_project_document(
        doc_id=int(doc.doc_id),
        user_id=str(current_user.user_id),
        event_type="update",
    )
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


@router.get("/api/documents/{doc_id}/versions", response_model=List[ContentVersionOut])
def list_document_versions(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    versions = version_service.list_versions(db, entity_type="document", entity_id=doc_id)
    return [version_service.to_response(row) for row in versions]


@router.post("/api/documents/{doc_id}/restore/{version_id}", response_model=ProjectDocumentOut)
def restore_document_version(
    doc_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    row = version_service.get_version(
        db,
        entity_type="document",
        entity_id=doc_id,
        version_id=version_id,
    )
    snapshot = version_service.parse_snapshot(row)
    doc.doc_type = snapshot.get("doc_type") or doc.doc_type
    doc.title = snapshot.get("title")
    doc.content = snapshot.get("content")
    doc.attachments = snapshot.get("attachments")
    db.commit()
    db.refresh(doc)
    version_service.create_content_version(
        db,
        entity_type="document",
        entity_id=doc.doc_id,
        changed_by=current_user.user_id,
        change_type="restore",
        snapshot=_doc_snapshot(doc),
    )
    # [chatbot] 과제기록 복원 시 RAG 입력 갱신
    ChatbotService(db).safe_sync_project_document(
        doc_id=int(doc.doc_id),
        user_id=str(current_user.user_id),
        event_type="restore",
    )
    return doc


@router.post("/api/documents/{doc_id}/rag-sync")
def sync_document_rag(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # [chatbot] 과제기록 수동 RAG 동기화 API
    doc = db.query(ProjectDocument).filter(ProjectDocument.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    ChatbotService(db).safe_sync_project_document(
        doc_id=int(doc.doc_id),
        user_id=str(current_user.user_id),
        event_type="manual_sync",
    )
    return {"message": "RAG 동기화를 완료했습니다.", "doc_id": int(doc.doc_id)}


