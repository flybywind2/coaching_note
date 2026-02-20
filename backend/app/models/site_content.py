"""소개 페이지 콘텐츠를 저장하는 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class SiteContent(Base):
    __tablename__ = "site_content"

    content_key = Column(String(50), primary_key=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
