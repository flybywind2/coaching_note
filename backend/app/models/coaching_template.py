"""코칭노트 템플릿 저장을 위한 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.sql import func

from app.database import Base


class CoachingNoteTemplate(Base):
    __tablename__ = "coaching_note_template"

    template_id = Column(Integer, primary_key=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    template_name = Column(String(120), nullable=False)
    week_number = Column(Integer)
    progress_rate = Column(Integer)
    current_status = Column(Text)
    main_issue = Column(Text)
    next_action = Column(Text)
    is_shared = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    __table_args__ = (
        Index("idx_note_template_owner", "owner_id", "is_shared", "created_at"),
    )

