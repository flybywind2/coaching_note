"""Board Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.board import Board, BoardPost, PostComment
from app.models.user import User
from app.schemas.board import BoardPostCreate, BoardPostUpdate, PostCommentCreate
from typing import List


def _ensure_not_observer(current_user: User):
    if current_user.role == "observer":
        raise HTTPException(status_code=403, detail="참관자는 작성 권한이 없습니다.")


def get_boards(db: Session) -> List[Board]:
    return db.query(Board).all()


def get_board(db: Session, board_id: int) -> Board:
    board = db.query(Board).filter(Board.board_id == board_id).first()
    if not board:
        raise HTTPException(status_code=404, detail="게시판을 찾을 수 없습니다.")
    return board


def get_posts(db: Session, board_id: int, skip: int = 0, limit: int = 20) -> List[BoardPost]:
    return (
        db.query(BoardPost)
        .filter(BoardPost.board_id == board_id)
        .order_by(BoardPost.is_notice.desc(), BoardPost.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_post(db: Session, post_id: int) -> BoardPost:
    post = db.query(BoardPost).filter(BoardPost.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return post


def create_post(db: Session, board_id: int, data: BoardPostCreate, current_user: User) -> BoardPost:
    _ensure_not_observer(current_user)
    if data.is_notice and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="공지 등록은 관리자만 가능합니다.")
    post = BoardPost(board_id=board_id, author_id=current_user.user_id, **data.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def update_post(db: Session, post_id: int, data: BoardPostUpdate, current_user: User) -> BoardPost:
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 수정 가능합니다.")
    if data.is_notice and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="공지 설정은 관리자만 가능합니다.")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(post, k, v)
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, post_id: int, current_user: User):
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 삭제 가능합니다.")
    db.delete(post)
    db.commit()


def increment_view(db: Session, post_id: int):
    db.query(BoardPost).filter(BoardPost.post_id == post_id).update(
        {"view_count": BoardPost.view_count + 1}
    )
    db.commit()


def get_comments(db: Session, post_id: int) -> List[PostComment]:
    return (
        db.query(PostComment)
        .filter(PostComment.post_id == post_id)
        .order_by(PostComment.created_at)
        .all()
    )


def create_comment(db: Session, post_id: int, data: PostCommentCreate, current_user: User) -> PostComment:
    _ensure_not_observer(current_user)
    comment = PostComment(post_id=post_id, author_id=current_user.user_id, **data.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment_id: int, current_user: User):
    comment = db.query(PostComment).filter(PostComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 삭제 가능합니다.")
    db.delete(comment)
    db.commit()


