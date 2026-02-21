"""세션 비의존 일자 기반 출석 로그 모델 정의입니다."""

from sqlalchemy import Column, Integer, Date, DateTime, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DailyAttendanceLog(Base):
    __tablename__ = "daily_attendance_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    work_date = Column(Date, nullable=False)
    check_in_time = Column(DateTime, nullable=False)
    check_in_ip = Column(String(64), nullable=False)
    check_out_time = Column(DateTime, nullable=True)
    check_out_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "work_date", name="uq_daily_attendance_user_date"),
    )

