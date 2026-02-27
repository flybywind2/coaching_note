"""Board Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from sqlalchemy.orm import Session
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from app.models.board import Board, BoardPost, PostComment, BoardPostView
from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.access_scope import UserBatchAccess
from app.models.user import User
from app.schemas.board import BoardPostCreate, BoardPostUpdate, PostCommentCreate, PostCommentUpdate
from app.services import mention_service, version_service
from app.services import notification_service
from app.services.chatbot_service import ChatbotService  # [chatbot] 게시글 RAG 동기화
from typing import List
from app.utils.permissions import is_admin_or_coach, is_participant

STANDARD_BOARDS = (
    {"board_type": "notice", "board_name": "공지사항", "description": "프로그램 공지사항"},
    {"board_type": "question", "board_name": "질문", "description": "질문과 답변"},
    {"board_type": "tip", "board_name": "팁공유", "description": "운영/기술 팁 공유"},
    {"board_type": "chat", "board_name": "잡담", "description": "자유 소통"},
)

BOARD_TYPE_ALIASES = {
    "notice": {"notice", "공지", "공지사항"},
    "question": {"question", "qna", "qa", "질문"},
    "tip": {"tip", "tips", "share", "팁공유"},
    "chat": {"chat", "free", "잡담", "자유게시판"},
}

BOARD_PRIORITY = {
    "notice": 0,
    "question": 1,
    "tip": 2,
    "chat": 3,
}


def _ensure_not_observer(current_user: User):
    if current_user.role == "observer":
        raise HTTPException(status_code=403, detail="참관자는 작성 권한이 없습니다.")


def _ensure_notice_board_admin(board: Board, current_user: User):
    if board.board_type == "notice" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="공지사항 게시판 작성은 관리자만 가능합니다.")


def _resolve_batch_id_or_none(db: Session, requested_batch_id: int | None) -> int | None:
    # [FEEDBACK7] 기존 데이터(차수 미지정)와 호환하기 위해 배치가 없으면 None 허용
    if requested_batch_id is not None:
        batch = db.query(Batch.batch_id).filter(Batch.batch_id == int(requested_batch_id)).first()
        if not batch:
            raise HTTPException(status_code=400, detail="존재하지 않는 차수입니다.")
        return int(requested_batch_id)
    first_batch = db.query(Batch.batch_id).order_by(Batch.batch_id.asc()).first()
    return int(first_batch[0]) if first_batch else None


def _participant_batch_ids(db: Session, current_user: User) -> set[int]:
    direct_scope = {
        int(row[0])
        for row in db.query(UserBatchAccess.batch_id)
        .filter(UserBatchAccess.user_id == current_user.user_id)
        .all()
    }
    if direct_scope:
        return direct_scope
    # [FEEDBACK7] 권한 데이터가 없는 기존 계정은 소속 과제의 batch로 추론
    membership_scope = {
        int(row[0])
        for row in db.query(Project.batch_id)
        .join(ProjectMember, ProjectMember.project_id == Project.project_id)
        .filter(ProjectMember.user_id == current_user.user_id)
        .all()
    }
    return membership_scope


def _ensure_can_write_batch(db: Session, current_user: User, batch_id: int | None):
    if batch_id is None:
        return
    if is_admin_or_coach(current_user):
        return
    if not is_participant(current_user):
        raise HTTPException(status_code=403, detail="해당 차수에 작성 권한이 없습니다.")
    if batch_id not in _participant_batch_ids(db, current_user):
        raise HTTPException(status_code=403, detail="참여자는 본인 차수에만 작성할 수 있습니다.")


def _can_view_post(db: Session, post: BoardPost, current_user: User, participant_batches: set[int] | None = None) -> bool:
    if not bool(post.is_batch_private):
        return True
    if is_admin_or_coach(current_user):
        return True
    if current_user.role == "observer":
        return False
    if not is_participant(current_user):
        return False
    if participant_batches is None:
        participant_batches = _participant_batch_ids(db, current_user)
    return post.batch_id is not None and int(post.batch_id) in participant_batches


def _ensure_can_view_post(db: Session, post: BoardPost, current_user: User, participant_batches: set[int] | None = None):
    if not _can_view_post(db, post, current_user, participant_batches=participant_batches):
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")


def _canonical_board_type(board_type: str | None, board_name: str | None = None) -> str:
    value = str(board_type or "").strip().lower()
    name = str(board_name or "").strip().lower()
    for canonical, aliases in BOARD_TYPE_ALIASES.items():
        if value in aliases or name in aliases:
            return canonical
    return value


def _board_priority_expr():
    return case(
        (Board.board_type == "notice", 0),
        (Board.board_type == "question", 1),
        (Board.board_type == "tip", 2),
        (Board.board_type == "chat", 3),
        else_=99,
    )


def _post_notice_order_expr():
    return case((BoardPost.is_notice == True, 0), else_=1)  # noqa: E712


def _sync_standard_boards(db: Session) -> List[Board]:
    rows = db.query(Board).order_by(Board.board_id.asc()).all()
    by_type: dict[str, list[Board]] = {row["board_type"]: [] for row in STANDARD_BOARDS}
    dirty = False

    for board in rows:
        canonical_type = _canonical_board_type(board.board_type, board.board_name)
        if canonical_type in by_type:
            by_type[canonical_type].append(board)

    for config in STANDARD_BOARDS:
        canonical_type = config["board_type"]
        candidates = by_type.get(canonical_type, [])
        if not candidates:
            created = Board(
                board_type=canonical_type,
                board_name=config["board_name"],
                description=config.get("description"),
            )
            db.add(created)
            dirty = True
            continue

        primary = candidates[0]
        if primary.board_type != canonical_type:
            primary.board_type = canonical_type
            dirty = True
        if primary.board_name != config["board_name"]:
            primary.board_name = config["board_name"]
            dirty = True
        if not (primary.description or "").strip():
            primary.description = config.get("description")
            dirty = True

        for extra in candidates[1:]:
            db.query(BoardPost).filter(BoardPost.board_id == extra.board_id).update(
                {"board_id": primary.board_id},
                synchronize_session=False,
            )
            db.delete(extra)
            dirty = True

    if dirty:
        db.commit()

    target_types = [row["board_type"] for row in STANDARD_BOARDS]
    return (
        db.query(Board)
        .filter(Board.board_type.in_(target_types))
        .order_by(_board_priority_expr(), Board.board_id.asc())
        .all()
    )


def get_boards(db: Session) -> List[Board]:
    return _sync_standard_boards(db)


def get_board(db: Session, board_id: int) -> Board:
    _sync_standard_boards(db)
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
    setattr(post, "post_no", None if bool(post.is_notice) else int(post.post_id))
    return post


def _serialize_comment(comment: PostComment, author_name: str | None = None) -> PostComment:
    if author_name is not None:
        setattr(comment, "author_name", author_name)
    elif getattr(comment, "author", None) is not None:
        setattr(comment, "author_name", comment.author.name)
    return comment


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


def get_posts(
    db: Session,
    board_id: int,
    current_user: User,
    skip: int = 0,
    limit: int = 20,
    batch_id: int | None = None,
) -> List[BoardPost]:
    _sync_standard_boards(db)
    query = _posts_query(db).filter(BoardPost.board_id == board_id)
    if batch_id is not None:
        query = query.filter(BoardPost.batch_id == int(batch_id))
    rows = query.order_by(BoardPost.created_at.desc()).offset(skip).limit(limit).all()
    participant_batches = _participant_batch_ids(db, current_user) if is_participant(current_user) else None
    result = []
    for post, board_name, board_type, author_name, comment_count in rows:
        if not _can_view_post(db, post, current_user, participant_batches=participant_batches):
            continue
        result.append(_serialize_post(post, board_name, board_type, author_name, comment_count))
    return result


def get_all_posts(
    db: Session,
    current_user: User,
    skip: int = 0,
    limit: int = 20,
    category: str | None = None,
    search_q: str | None = None,
    batch_id: int | None = None,
) -> List[BoardPost]:
    _sync_standard_boards(db)
    query = _posts_query(db)
    if batch_id is not None:
        query = query.filter(BoardPost.batch_id == int(batch_id))
    if category:
        normalized_category = _canonical_board_type(category, category)
        if normalized_category in BOARD_PRIORITY:
            query = query.filter(Board.board_type == normalized_category)
        else:
            query = query.filter(or_(Board.board_type == category, Board.board_name == category))
    if search_q and search_q.strip():
        keyword = f"%{search_q.strip()}%"
        query = query.filter(
            or_(
                BoardPost.title.ilike(keyword),
                BoardPost.content.ilike(keyword),
                User.name.ilike(keyword),
                Board.board_name.ilike(keyword),
            )
        )
    rows = (
        query.order_by(_post_notice_order_expr(), BoardPost.post_id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    participant_batches = _participant_batch_ids(db, current_user) if is_participant(current_user) else None
    result = []
    for post, board_name, board_type, author_name, comment_count in rows:
        if not _can_view_post(db, post, current_user, participant_batches=participant_batches):
            continue
        result.append(_serialize_post(post, board_name, board_type, author_name, comment_count))
    return result


def get_post(db: Session, post_id: int) -> BoardPost:
    post = db.query(BoardPost).filter(BoardPost.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return post


def get_post_with_meta(db: Session, post_id: int, current_user: User | None = None) -> BoardPost:
    row = (
        _posts_query(db)
        .filter(BoardPost.post_id == post_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    post, board_name, board_type, author_name, comment_count = row
    if current_user is not None:
        participant_batches = _participant_batch_ids(db, current_user) if is_participant(current_user) else None
        _ensure_can_view_post(db, post, current_user, participant_batches=participant_batches)
    return _serialize_post(post, board_name, board_type, author_name, comment_count)


def _post_snapshot(post: BoardPost) -> dict:
    return {
        "title": post.title,
        "content": post.content,
        "is_notice": bool(post.is_notice),
        "batch_id": int(post.batch_id) if post.batch_id is not None else None,  # [FEEDBACK7]
        "is_batch_private": bool(post.is_batch_private),  # [FEEDBACK7]
    }


def create_post(db: Session, board_id: int, data: BoardPostCreate, current_user: User) -> BoardPost:
    _ensure_not_observer(current_user)
    board = get_board(db, board_id)
    _ensure_notice_board_admin(board, current_user)
    payload = data.model_dump()
    requested_batch_id = payload.pop("batch_id", None)
    resolved_batch_id = _resolve_batch_id_or_none(db, requested_batch_id)
    _ensure_can_write_batch(db, current_user, resolved_batch_id)
    payload["is_notice"] = board.board_type == "notice"
    payload["batch_id"] = resolved_batch_id
    payload["is_batch_private"] = bool(payload.get("is_batch_private", False))
    post = BoardPost(board_id=board_id, author_id=current_user.user_id, **payload)
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
    if post.is_notice:
        _notify_notice_post(db, post, current_user)
    # [chatbot] 게시글 신규 등록 시 RAG 입력
    ChatbotService(db).safe_sync_board_post(
        post_id=int(post.post_id),
        user_id=str(current_user.user_id),
        event_type="create",
    )
    return get_post_with_meta(db, post.post_id, current_user=current_user)


def update_post(db: Session, post_id: int, data: BoardPostUpdate, current_user: User) -> BoardPost:
    post = get_post(db, post_id)
    _ensure_notice_board_admin(post.board, current_user)
    before_texts = [post.title, post.content]
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 수정 가능합니다.")
    _ensure_can_write_batch(db, current_user, post.batch_id)
    payload = data.model_dump(exclude_none=True)
    next_board_id = payload.pop("board_id", None)
    next_batch_id = payload.pop("batch_id", None)
    payload.pop("is_notice", None)
    if next_board_id is not None and int(next_board_id) != int(post.board_id):
        next_board = get_board(db, int(next_board_id))
        if post.board.board_type == "notice":
            raise HTTPException(status_code=400, detail="공지사항 게시글은 분류를 변경할 수 없습니다.")
        if next_board.board_type == "notice":
            raise HTTPException(status_code=400, detail="수정 화면에서 공지사항으로 분류를 변경할 수 없습니다.")
        _ensure_notice_board_admin(next_board, current_user)
        post.board_id = next_board.board_id
    if next_batch_id is not None:
        resolved_batch_id = _resolve_batch_id_or_none(db, int(next_batch_id))
        _ensure_can_write_batch(db, current_user, resolved_batch_id)
        post.batch_id = resolved_batch_id
    for k, v in payload.items():
        setattr(post, k, v)
    post.is_notice = post.board.board_type == "notice"
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
    if post.is_notice:
        _notify_notice_post(db, post, current_user)
    # [chatbot] 게시글 수정 시 RAG 입력 갱신
    ChatbotService(db).safe_sync_board_post(
        post_id=int(post.post_id),
        user_id=str(current_user.user_id),
        event_type="update",
    )
    return get_post_with_meta(db, post.post_id, current_user=current_user)


def delete_post(db: Session, post_id: int, current_user: User):
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 게시글 또는 관리자만 삭제 가능합니다.")
    _ensure_can_write_batch(db, current_user, post.batch_id)
    db.delete(post)
    db.commit()


def increment_view(db: Session, post_id: int, user_id: int):
    if not db.query(BoardPost.post_id).filter(BoardPost.post_id == post_id).first():
        return
    exists = (
        db.query(BoardPostView.view_id)
        .filter(
            BoardPostView.post_id == post_id,
            BoardPostView.user_id == user_id,
        )
        .first()
    )
    if exists:
        return
    db.add(BoardPostView(post_id=post_id, user_id=user_id))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return
    db.query(BoardPost).filter(BoardPost.post_id == post_id).update(
        {"view_count": BoardPost.view_count + 1}
    )
    db.commit()


def get_comments(db: Session, post_id: int, current_user: User) -> List[PostComment]:
    post = get_post(db, post_id)
    participant_batches = _participant_batch_ids(db, current_user) if is_participant(current_user) else None
    _ensure_can_view_post(db, post, current_user, participant_batches=participant_batches)
    rows = (
        db.query(PostComment, User.name.label("author_name"))
        .join(User, User.user_id == PostComment.author_id)
        .filter(PostComment.post_id == post_id)
        .order_by(PostComment.created_at)
        .all()
    )
    return [_serialize_comment(comment, author_name) for comment, author_name in rows]


def create_comment(db: Session, post_id: int, data: PostCommentCreate, current_user: User) -> PostComment:
    _ensure_not_observer(current_user)
    post = get_post(db, post_id)
    participant_batches = _participant_batch_ids(db, current_user) if is_participant(current_user) else None
    _ensure_can_view_post(db, post, current_user, participant_batches=participant_batches)
    _ensure_can_write_batch(db, current_user, post.batch_id)
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
    # [chatbot] 게시글 댓글 등록 시 같은 doc_id 문서를 댓글 포함 내용으로 재동기화
    ChatbotService(db).safe_sync_board_post(
        post_id=int(post_id),
        user_id=str(current_user.user_id),
        event_type="comment_create",
    )
    return _serialize_comment(comment)


def update_comment(db: Session, comment_id: int, data: PostCommentUpdate, current_user: User) -> PostComment:
    _ensure_not_observer(current_user)
    comment = db.query(PostComment).filter(PostComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 수정 가능합니다.")
    _ensure_can_write_batch(db, current_user, comment.post.batch_id)
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
    # [chatbot] 게시글 댓글 수정 시 같은 doc_id 문서를 댓글 포함 내용으로 재동기화
    ChatbotService(db).safe_sync_board_post(
        post_id=int(comment.post_id),
        user_id=str(current_user.user_id),
        event_type="comment_update",
    )
    return _serialize_comment(comment)


def delete_comment(db: Session, comment_id: int, current_user: User):
    comment = db.query(PostComment).filter(PostComment.comment_id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.author_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="본인 댓글 또는 관리자만 삭제 가능합니다.")
    _ensure_can_write_batch(db, current_user, comment.post.batch_id)
    post_id = int(comment.post_id)
    db.delete(comment)
    db.commit()
    # [chatbot] 게시글 댓글 삭제 시 같은 doc_id 문서를 댓글 포함 내용으로 재동기화
    ChatbotService(db).safe_sync_board_post(
        post_id=post_id,
        user_id=str(current_user.user_id),
        event_type="comment_delete",
    )


def get_post_versions(db: Session, post_id: int, current_user: User) -> List[dict]:
    post = get_post(db, post_id)
    if post.author_id != current_user.user_id and not is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="게시글 이력 조회 권한이 없습니다.")
    versions = version_service.list_versions(db, entity_type="board_post", entity_id=post_id)
    return [version_service.to_response(row) for row in versions]


def restore_post_version(db: Session, post_id: int, version_id: int, current_user: User) -> BoardPost:
    post = get_post(db, post_id)
    _ensure_notice_board_admin(post.board, current_user)
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
    post.is_notice = post.board.board_type == "notice"
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
    # [chatbot] 게시글 복원 시 같은 doc_id 문서를 복원 상태로 재동기화
    ChatbotService(db).safe_sync_board_post(
        post_id=int(post.post_id),
        user_id=str(current_user.user_id),
        event_type="restore",
    )
    return get_post_with_meta(db, post.post_id, current_user=current_user)


def list_mention_candidates(db: Session, q: str | None, limit: int = 8) -> list[dict]:
    keyword = (q or "").strip()
    if not keyword:
        return []
    if keyword.startswith("@"):
        keyword = keyword[1:]
    if not keyword:
        return []
    like = f"%{keyword}%"
    rows = (
        db.query(User)
        .filter(
            User.is_active == True,  # noqa: E712
            or_(User.emp_id.ilike(like), User.name.ilike(like)),
        )
        .order_by(User.name.asc(), User.emp_id.asc())
        .limit(max(1, min(limit, 20)))
        .all()
    )
    return [
        {
            "user_id": int(row.user_id),
            "emp_id": row.emp_id,
            "name": row.name,
            "department": row.department,
            "role": row.role,
        }
        for row in rows
    ]


def _notify_notice_post(db: Session, post: BoardPost, actor: User):
    targets = (
        db.query(User.user_id)
        .filter(
            User.is_active == True,  # noqa: E712
            User.user_id != actor.user_id,
        )
        .all()
    )
    for (target_user_id,) in targets:
        notification_service.create_notification(
            db=db,
            user_id=int(target_user_id),
            noti_type="board_notice",
            title="공지사항 등록",
            message=f"{actor.name}님이 공지사항을 등록했습니다.",
            link_url=f"#/board/{post.board_id}/post/{post.post_id}",
        )


