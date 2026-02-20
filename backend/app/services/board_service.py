"""Board Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException
from app.models.board import Board, BoardPost, PostComment
from app.models.user import User
from app.schemas.board import BoardPostCreate, BoardPostUpdate, PostCommentCreate, PostCommentUpdate
from app.services import mention_service, version_service
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


def _serialize_post(
    post: BoardPost,
    board_name: str | None = None,
    board_type: str | None = None,
    author_name: str | None = None,
    comment_count: int | None = None,
) -> BoardPost:
    if board_name is not None:
        setattr(post, "board_name", board_name)
    if board_type is not None:
        setattr(post, "board_type", board_type)
    if author_name is not None:
        setattr(post, "author_name", author_name)
    if comment_count is not None:
        setattr(post, "comment_count", int(comment_count))
    return post


def _posts_query(db: Session):
    return (
        db.query(
            BoardPost,
            Board.board_name,
            Board.board_type,
            User.name.label("author_name"),
            func.count(PostComment.comment_id).label("comment_count"),
        )
        .join(Board, Board.board_id == BoardPost.board_id)
        .join(User, User.user_id == BoardPost.author_id)
        .outerjoin(PostComment, PostComment.post_id == BoardPost.post_id)
        .group_by(BoardPost.post_id, Board.board_name, Board.board_type, User.name)
    )


def get_posts(db: Session, board_id: int, skip: int = 0, limit: int = 20) -> List[BoardPost]:
    rows = (
        _posts_query(db)
        .filter(BoardPost.board_id == board_id)
        .order_by(BoardPost.is_notice.desc(), BoardPost.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialize_post(post, board_name, board_type, author_name, comment_count) for post, board_name, board_type, author_name, comment_count in rows]


def get_all_posts(db: Session, skip: int = 0, limit: int = 20, category: str | None = None) -> List[BoardPost]:
    q = _posts_query(db)
    if category:
        q = q.filter(or_(Board.board_type == category, Board.board_name == category))
    rows = (
        q.order_by(BoardPost.is_notice.desc(), BoardPost.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialize_post(post, board_name, board_type, author_name, comment_count) for post, board_name, board_type, author_name, comment_count in rows]


def get_post(db: Session, post_id: int) -> BoardPost:
    post = db.query(BoardPost).filter(BoardPost.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return post


def get_post_with_meta(db: Session, post_id: int) -> BoardPost:
    row = (
        _posts_query(db)
        .filter(BoardPost.post_id == post_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    post, board_name, board_type, author_name, comment_count = row
    return _serialize_post(post, board_name, board_type, author_name, comment_count)


def _post_snapshot(post: BoardPost) -> dict:
    return {
        "title": post.title,
        "content": post.content,
        "is_notice": bool(post.is_notice),
    }


def create_post(db: Session, board_id: int, data: BoardPostCreate, current_user: User) -> BoardPost:
    _ensure_not_observer(current_user)
    if data.is_notice and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="공지 등록은 관리자만 가능합니다.")
    post = BoardPost(board_id=board_id, author_id=current_user.user_id, **data.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    version_service.create_content_version(
        db,
        entity_type="board_post",
        entity_id=post.post_id,
        changed_by=current_user.user_id,
        change_type="create",
        snapshot=_post_snapshot(post),
    )
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="게시글",
        link_url=f"#/board/{post.board_id}/post/{post.post_id}",
        new_texts=[post.title, post.content],
    )
    return get_post_with_meta(db, post.post_id)


def update_post(db: Session, post_id: int, data: BoardPostUpdate, current_user: User) -> BoardPost:
    post = get_post(db, post_id)
    before_texts = [post.title, post.content]
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 수정 가능합니다.")
    if data.is_notice and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="공지 설정은 관리자만 가능합니다.")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(post, k, v)
    db.commit()
    db.refresh(post)
    version_service.create_content_version(
        db,
        entity_type="board_post",
        entity_id=post.post_id,
        changed_by=current_user.user_id,
        change_type="update",
        snapshot=_post_snapshot(post),
    )
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="게시글",
        link_url=f"#/board/{post.board_id}/post/{post.post_id}",
        new_texts=[post.title, post.content],
        previous_texts=before_texts,
    )
    return get_post_with_meta(db, post.post_id)


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
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="게시글 댓글",
        link_url=f"#/board/{comment.post.board_id}/post/{post_id}",
        new_texts=[comment.content],
    )
    return comment


def update_comment(db: Session, comment_id: int, data: PostCommentUpdate, current_user: User) -> PostComment:
    _ensure_not_observer(current_user)
    comment = db.query(PostComment).filter(PostComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 수정 가능합니다.")
    previous = comment.content
    comment.content = data.content
    db.commit()
    db.refresh(comment)
    mention_service.notify_mentions(
        db,
        actor=current_user,
        context_title="게시글 댓글",
        link_url=f"#/board/{comment.post.board_id}/post/{comment.post_id}",
        new_texts=[comment.content],
        previous_texts=[previous],
    )
    return comment


def delete_comment(db: Session, comment_id: int, current_user: User):
    comment = db.query(PostComment).filter(PostComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 삭제 가능합니다.")
    db.delete(comment)
    db.commit()


def get_post_versions(db: Session, post_id: int, current_user: User) -> List[dict]:
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and current_user.role not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="게시글 이력 조회 권한이 없습니다.")
    versions = version_service.list_versions(db, entity_type="board_post", entity_id=post_id)
    return [version_service.to_response(row) for row in versions]


def restore_post_version(db: Session, post_id: int, version_id: int, current_user: User) -> BoardPost:
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 복원 가능합니다.")
    row = version_service.get_version(
        db,
        entity_type="board_post",
        entity_id=post_id,
        version_id=version_id,
    )
    snapshot = version_service.parse_snapshot(row)
    post.title = snapshot.get("title") or post.title
    post.content = snapshot.get("content") or post.content
    if "is_notice" in snapshot:
        if snapshot.get("is_notice") and current_user.role != "admin":
            raise HTTPException(status_code=403, detail="공지 설정은 관리자만 가능합니다.")
        post.is_notice = bool(snapshot.get("is_notice"))
    db.commit()
    db.refresh(post)
    version_service.create_content_version(
        db,
        entity_type="board_post",
        entity_id=post.post_id,
        changed_by=current_user.user_id,
        change_type="restore",
        snapshot=_post_snapshot(post),
    )
    return post


