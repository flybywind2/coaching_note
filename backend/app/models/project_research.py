"""[FEEDBACK7] 과제 조사(의견 취합) 도메인 SQLAlchemy 모델입니다."""

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


class ProjectResearchItem(Base):
    __tablename__ = "project_research_item"

    item_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    title = Column(String(200), nullable=False)
    purpose = Column(Text)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_visible = Column(Boolean, nullable=False, default=False)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    questions = relationship(
        "ProjectResearchQuestion",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ProjectResearchQuestion.display_order.asc(), ProjectResearchQuestion.question_id.asc()",
    )
    responses = relationship(
        "ProjectResearchResponse",
        back_populates="item",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_project_research_item_batch_created", "batch_id", "created_at"),
    )


class ProjectResearchQuestion(Base):
    __tablename__ = "project_research_question"

    question_id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("project_research_item.item_id", ondelete="CASCADE"), nullable=False)
    question_text = Column(String(300), nullable=False)
    question_type = Column(String(20), nullable=False, default="subjective")  # subjective/objective
    options_json = Column(Text, nullable=False, default="[]")
    display_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    item = relationship("ProjectResearchItem", back_populates="questions")
    responses = relationship(
        "ProjectResearchResponse",
        back_populates="question",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_project_research_question_item_order", "item_id", "display_order"),
    )


class ProjectResearchResponse(Base):
    __tablename__ = "project_research_response"

    response_id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("project_research_item.item_id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("project_research_question.question_id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    answer_text = Column(Text, nullable=True)
    responded_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    item = relationship("ProjectResearchItem", back_populates="responses")
    question = relationship("ProjectResearchQuestion", back_populates="responses")

    __table_args__ = (
        UniqueConstraint("item_id", "question_id", "project_id", name="uq_project_research_response_scope"),
        Index("idx_project_research_response_item_project", "item_id", "project_id"),
    )

