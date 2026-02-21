"""Project 도메인의 SQLAlchemy 모델 정의입니다."""

import json

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    project_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    project_name = Column(String(200), nullable=False)
    organization = Column(String(100), nullable=False)
    representative = Column(String(50))
    category = Column(String(50))
    visibility = Column(String(20), default="public")  # public/restricted
    project_type = Column(String(20), default="primary")  # primary/associate
    progress_rate = Column(Integer, default=0)
    status = Column(String(20), default="preparing")
    ai_summary = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    batch = relationship("Batch", back_populates="projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    coaching_notes = relationship("CoachingNote", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")
    sessions = relationship("CoachingSession", back_populates="project")
    tasks = relationship("ProjectTask", back_populates="project", cascade="all, delete-orphan")
    ai_contents = relationship("AIGeneratedContent", back_populates="project", cascade="all, delete-orphan")
    profile = relationship("ProjectProfile", back_populates="project", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_project_batch", "batch_id"),
    )

    @property
    def ai_tech_category(self):
        if self.profile and self.profile.ai_tech_category:
            return self.profile.ai_tech_category
        return self.category

    @property
    def ai_tech_used(self):
        if self.profile and self.profile.ai_tech_used:
            return self.profile.ai_tech_used
        return None

    @property
    def project_summary(self):
        if self.profile and self.profile.project_summary:
            return self.profile.project_summary
        return self.ai_summary

    @property
    def github_repos(self):
        if not self.profile or not self.profile.github_repos:
            return []
        try:
            parsed = json.loads(self.profile.github_repos)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            return []
        return []

    @property
    def is_my_project(self):
        return bool(getattr(self, "_is_my_project", False))


class ProjectMember(Base):
    __tablename__ = "project_member"

    member_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    role = Column(String(20), default="member")  # leader/member
    is_representative = Column(Boolean, default=False)
    joined_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")

    @property
    def user_name(self):
        return self.user.name if self.user else None

    @property
    def user_emp_id(self):
        return self.user.emp_id if self.user else None

    @property
    def user_role(self):
        return self.user.role if self.user else None


