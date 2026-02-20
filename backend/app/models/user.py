"""User 도메인의 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    emp_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    department = Column(String(100))
    role = Column(String(20), nullable=False)  # admin/coach/participant/observer
    email = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    project_memberships = relationship("ProjectMember", back_populates="user")
    coaching_notes = relationship("CoachingNote", back_populates="author")
    coaching_comments = relationship("CoachingComment", back_populates="author")
    project_documents = relationship("ProjectDocument", back_populates="creator")
    project_tasks_created = relationship("ProjectTask", foreign_keys="ProjectTask.created_by", back_populates="creator")
    project_tasks_assigned = relationship("ProjectTask", foreign_keys="ProjectTask.assigned_to", back_populates="assignee")
    session_attendances = relationship("SessionAttendee", back_populates="user")
    board_posts = relationship("BoardPost", back_populates="author")
    post_comments = relationship("PostComment", back_populates="author")
    notifications = relationship("Notification", back_populates="user")
    ai_contents = relationship("AIGeneratedContent", back_populates="generator")
    coach_profile = relationship("Coach", back_populates="user", uselist=False)


class Coach(Base):
    __tablename__ = "coach"

    coach_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    name = Column(String(50), nullable=False)
    photo_url = Column(String(500))
    coach_type = Column(String(20), nullable=False)  # internal/external
    department = Column(String(100))
    affiliation = Column(String(100))
    specialty = Column(String(200))
    career = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="coach_profile")


