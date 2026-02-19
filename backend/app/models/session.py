from sqlalchemy import Column, Integer, String, Text, Date, Time, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CoachingSession(Base):
    __tablename__ = "coaching_session"

    session_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    session_date = Column(Date, nullable=False)
    start_time = Column(String(10), nullable=False)  # HH:MM
    end_time = Column(String(10), nullable=False)    # HH:MM
    location = Column(String(200))
    session_status = Column(String(20), default="scheduled")
    # scheduled/completed/cancelled/rescheduled
    note = Column(Text)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    batch = relationship("Batch", back_populates="sessions")
    project = relationship("Project", back_populates="sessions")
    attendees = relationship("SessionAttendee", back_populates="session", cascade="all, delete-orphan")
    attendance_logs = relationship("AttendanceLog", back_populates="session", cascade="all, delete-orphan")
    coaching_time_logs = relationship("CoachingTimeLog", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_session_date", "batch_id", "session_date"),
        Index("idx_session_project", "project_id"),
    )


class SessionAttendee(Base):
    __tablename__ = "session_attendee"

    attendee_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("coaching_session.session_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    attendee_role = Column(String(20), nullable=False)  # coach/participant
    attendance_status = Column(String(20), default="scheduled")
    # scheduled/attended/absent/cancelled

    session = relationship("CoachingSession", back_populates="attendees")
    user = relationship("User", back_populates="session_attendances")

    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_session_attendee"),
    )


class AttendanceLog(Base):
    __tablename__ = "attendance_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("coaching_session.session_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    check_in_time = Column(DateTime, nullable=False)
    check_in_ip = Column(String(50), nullable=False)
    check_out_time = Column(DateTime, nullable=True)
    check_out_ip = Column(String(50), nullable=True)

    session = relationship("CoachingSession", back_populates="attendance_logs")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_attendance_log"),
    )


class CoachingTimeLog(Base):
    __tablename__ = "coaching_time_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("coaching_session.session_id", ondelete="CASCADE"), nullable=False)
    coach_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    note = Column(Text, nullable=True)

    session = relationship("CoachingSession", back_populates="coaching_time_logs")
    coach = relationship("User", foreign_keys=[coach_user_id])
