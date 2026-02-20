"""과제 확장 메타데이터를 저장하는 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, Text, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectProfile(Base):
    __tablename__ = "project_profile"

    project_id = Column(Integer, ForeignKey("projects.project_id", ondelete="CASCADE"), primary_key=True)
    ai_tech_category = Column(Text)
    ai_tech_used = Column(Text)
    project_summary = Column(Text)
    github_repos = Column(Text)  # JSON array string

    project = relationship("Project", back_populates="profile")

    __table_args__ = (
        Index("idx_project_profile_project", "project_id"),
    )

