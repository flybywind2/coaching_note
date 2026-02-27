"""[FEEDBACK7] 강의/수강신청 도메인 SQLAlchemy 모델입니다."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Lecture(Base):
    __tablename__ = "lecture"

    lecture_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    title = Column(String(200), nullable=False)
    summary = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    instructor = Column(String(100), nullable=True)
    location = Column(String(200), nullable=True)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    apply_start_date = Column(Date, nullable=False)
    apply_end_date = Column(Date, nullable=False)
    capacity_total = Column(Integer, nullable=True)
    capacity_team = Column(Integer, nullable=True)
    is_visible = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    registrations = relationship(
        "LectureRegistration",
        back_populates="lecture",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_lecture_batch_start", "batch_id", "start_datetime"),
    )


class LectureRegistration(Base):
    __tablename__ = "lecture_registration"

    registration_id = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(Integer, ForeignKey("lecture.lecture_id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    applicant_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    member_user_ids_json = Column(Text, nullable=False, default="[]")
    member_count = Column(Integer, nullable=False, default=1)
    approval_status = Column(String(20), nullable=False, default="pending")  # pending/approved/rejected/cancelled
    approved_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    lecture = relationship("Lecture", back_populates="registrations")

    __table_args__ = (
        UniqueConstraint("lecture_id", "project_id", name="uq_lecture_registration_project"),
        Index("idx_lecture_registration_lecture_status", "lecture_id", "approval_status"),
    )
