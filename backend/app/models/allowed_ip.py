"""Allowed IP 도메인의 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class AllowedIPRange(Base):
    __tablename__ = "allowed_ip_ranges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cidr = Column(String(50), nullable=False, unique=True)
    description = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


