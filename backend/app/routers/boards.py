"""Boards 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.board import (
    BoardOut,
    BoardPostCreate,
    BoardPostUpdate,
    BoardPostOut,
    PostCommentCreate,
    PostCommentUpdate,
    PostCommentOut,
    MentionCandidateOut,
)
from app.schemas.version import ContentVersionOut
from app.services import board_service
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("", response_model=List[BoardOut])
def list_boards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return board_service.get_boards(db)


@router.get("/{board_id}/posts", response_model=List[BoardPostOut])
def list_posts(
    board_id: int,
    skip: int = 0,
    limit: int = 20,
    batch_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.get_posts(db, board_id, current_user, skip, limit, batch_id=batch_id)


@router.get("/posts", response_model=List[BoardPostOut])
def list_all_posts(
    skip: int = 0,
    limit: int = 40,
    category: str = None,
    batch_id: int | None = Query(None, ge=1),
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.get_all_posts(db, current_user, skip, limit, category, search_q=q, batch_id=batch_id)


@router.get("/mention-candidates", response_model=List[MentionCandidateOut])
def list_mention_candidates(
    q: str = Query(..., min_length=1, max_length=30),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return board_service.list_mention_candidates(db, q=q, limit=limit)


@router.post("/{board_id}/posts", response_model=BoardPostOut)
def create_post(
    board_id: int,
    data: BoardPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.create_post(db, board_id, data, current_user)


@router.get("/posts/{post_id}", response_model=BoardPostOut)
def get_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    board_service.get_post_with_meta(db, post_id, current_user=current_user)
    board_service.increment_view(db, post_id, current_user.user_id)
    return board_service.get_post_with_meta(db, post_id, current_user=current_user)


@router.put("/posts/{post_id}", response_model=BoardPostOut)
def update_post(
    post_id: int,
    data: BoardPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.update_post(db, post_id, data, current_user)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    board_service.delete_post(db, post_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/posts/{post_id}/comments", response_model=List[PostCommentOut])
def list_comments(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return board_service.get_comments(db, post_id, current_user)


@router.post("/posts/{post_id}/comments", response_model=PostCommentOut)
def create_comment(
    post_id: int,
    data: PostCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.create_comment(db, post_id, data, current_user)


@router.put("/comments/{comment_id}", response_model=PostCommentOut)
def update_comment(
    comment_id: int,
    data: PostCommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.update_comment(db, comment_id, data, current_user)


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    board_service.delete_comment(db, comment_id, current_user)
    return {"message": "삭제되었습니다."}


@router.get("/posts/{post_id}/versions", response_model=List[ContentVersionOut])
def list_post_versions(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return board_service.get_post_versions(db, post_id, current_user)


@router.post("/posts/{post_id}/restore/{version_id}", response_model=BoardPostOut)
def restore_post_version(
    post_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return board_service.restore_post_version(db, post_id, version_id, current_user)


