"""AI Content 도메인의 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AIGeneratedContent(Base):
    __tablename__ = "ai_generated_content"

    content_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    content_type = Column(String(30), nullable=False)  # summary/qa_set/insight
    week_number = Column(Integer, nullable=True)
    title = Column(String(200))
    content = Column(Text, nullable=False)             # JSON or text
    model_used = Column(String(50))
    source_notes = Column(Text)                        # JSON list of note_ids
    generated_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_active = Column(Boolean, default=True)

    project = relationship("Project", back_populates="ai_contents")
    generator = relationship("User", back_populates="ai_contents")

    __table_args__ = (
        Index("idx_ai_content_project", "project_id", "content_type"),
        Index("idx_ai_content_project_week", "project_id", "content_type", "week_number", "is_active"),
    )


