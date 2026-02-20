"""문서/노트/게시글의 변경 이력을 저장하는 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.sql import func

from app.database import Base


class ContentVersion(Base):
    __tablename__ = "content_version"

    version_id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(30), nullable=False)  # coaching_note/document/board_post
    entity_id = Column(Integer, nullable=False)
    version_no = Column(Integer, nullable=False)
    change_type = Column(String(20), nullable=False)  # create/update/restore
    snapshot = Column(Text, nullable=False)  # JSON string
    changed_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_content_version_entity", "entity_type", "entity_id", "version_no"),
    )

