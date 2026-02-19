from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CoachingNote(Base):
    __tablename__ = "coaching_notes"

    note_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    coaching_date = Column(Date, nullable=False)
    week_number = Column(Integer)
    current_status = Column(Text)
    progress_rate = Column(Integer)
    main_issue = Column(Text)
    next_action = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    project = relationship("Project", back_populates="coaching_notes")
    author = relationship("User", back_populates="coaching_notes")
    comments = relationship("CoachingComment", back_populates="note", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_note_project", "project_id", "coaching_date"),
    )


class CoachingComment(Base):
    __tablename__ = "coaching_comments"

    comment_id = Column(Integer, primary_key=True, autoincrement=True)
    note_id = Column(Integer, ForeignKey("coaching_notes.note_id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    content = Column(Text, nullable=False)
    code_snippet = Column(Text)
    is_coach_only = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    note = relationship("CoachingNote", back_populates="comments")
    author = relationship("User", back_populates="coaching_comments")

    __table_args__ = (
        Index("idx_comment_note", "note_id"),
    )
