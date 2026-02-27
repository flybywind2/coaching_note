"""Board 도메인의 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Board(Base):
    __tablename__ = "board"

    board_id = Column(Integer, primary_key=True, autoincrement=True)
    board_name = Column(String(100), nullable=False)
    board_type = Column(String(30), nullable=False)  # notice/question/tip/chat
    description = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    posts = relationship("BoardPost", back_populates="board", cascade="all, delete-orphan")


class BoardPost(Base):
    __tablename__ = "board_post"

    post_id = Column(Integer, primary_key=True, autoincrement=True)
    board_id = Column(Integer, ForeignKey("board.board_id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=True)  # [FEEDBACK7] 차수 분리 운영
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    is_notice = Column(Boolean, default=False)
    is_batch_private = Column(Boolean, default=False)  # [FEEDBACK7] 해당 차수에게만 공개
    attachments = Column(Text)  # JSON
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    board = relationship("Board", back_populates="posts")
    author = relationship("User", back_populates="board_posts")
    comments = relationship("PostComment", back_populates="post", cascade="all, delete-orphan")
    views = relationship("BoardPostView", back_populates="post", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_post_board", "board_id", "created_at"),
    )


class PostComment(Base):
    __tablename__ = "post_comment"

    comment_id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(Integer, ForeignKey("board_post.post_id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("BoardPost", back_populates="comments")
    author = relationship("User", back_populates="post_comments")

    __table_args__ = (
        Index("idx_post_comment", "post_id"),
    )


class BoardPostView(Base):
    __tablename__ = "board_post_view"

    view_id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(Integer, ForeignKey("board_post.post_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    viewed_at = Column(DateTime, server_default=func.now(), nullable=False)

    post = relationship("BoardPost", back_populates="views")
    user = relationship("User", back_populates="board_post_views")

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_board_post_view_post_user"),
        Index("idx_board_post_view_post", "post_id"),
        Index("idx_board_post_view_user", "user_id"),
    )


