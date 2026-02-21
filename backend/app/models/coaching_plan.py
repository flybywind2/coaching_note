"""코치 계획/실적 집계를 위한 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint, Boolean
from sqlalchemy.sql import func

from app.database import Base


class CoachDailyPlan(Base):
    __tablename__ = "coach_daily_plan"

    plan_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    coach_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    plan_date = Column(Date, nullable=False)
    planned_project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=True)
    is_all_day = Column(Boolean, nullable=False, default=True)
    start_time = Column(String(5), nullable=True)  # HH:MM
    end_time = Column(String(5), nullable=True)  # HH:MM
    plan_note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("batch_id", "coach_user_id", "plan_date", name="uq_coach_daily_plan"),
    )


class CoachActualOverride(Base):
    __tablename__ = "coach_actual_override"

    override_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    coach_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    work_date = Column(Date, nullable=False)
    actual_minutes = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("batch_id", "coach_user_id", "work_date", name="uq_coach_actual_override"),
    )
