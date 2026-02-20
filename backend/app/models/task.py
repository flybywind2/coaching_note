"""Task 도메인의 SQLAlchemy 모델 정의입니다."""

from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    task_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    due_date = Column(Date)
    priority = Column(String(10), default="medium")  # high/medium/low
    status = Column(String(20), default="todo")       # todo/in_progress/completed/cancelled
    is_milestone = Column(Boolean, default=False)
    milestone_order = Column(Integer)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    completed_at = Column(DateTime)

    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="project_tasks_assigned")
    creator = relationship("User", foreign_keys=[created_by], back_populates="project_tasks_created")

    @property
    def assignee_name(self):
        return self.assignee.name if self.assignee else None

    @property
    def assignee_emp_id(self):
        return self.assignee.emp_id if self.assignee else None

    __table_args__ = (
        Index("idx_task_project", "project_id"),
        Index("idx_task_milestone", "project_id", "is_milestone", "milestone_order"),
        Index("idx_task_due_date", "due_date"),
        Index("idx_task_assigned", "assigned_to"),
    )


