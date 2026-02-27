"""[FEEDBACK7] 설문 도메인 SQLAlchemy 모델입니다."""

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


class Survey(Base):
    __tablename__ = "survey"

    survey_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_visible = Column(Boolean, nullable=False, default=False)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    questions = relationship(
        "SurveyQuestion",
        back_populates="survey",
        cascade="all, delete-orphan",
        order_by="SurveyQuestion.display_order.asc(), SurveyQuestion.question_id.asc()",
    )
    responses = relationship(
        "SurveyResponse",
        back_populates="survey",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_survey_batch_created", "batch_id", "created_at"),
    )


class SurveyQuestion(Base):
    __tablename__ = "survey_question"

    question_id = Column(Integer, primary_key=True, autoincrement=True)
    survey_id = Column(Integer, ForeignKey("survey.survey_id", ondelete="CASCADE"), nullable=False)
    question_text = Column(String(300), nullable=False)
    question_type = Column(String(30), nullable=False, default="subjective")
    is_required = Column(Boolean, nullable=False, default=False)
    is_multi_select = Column(Boolean, nullable=False, default=False)
    options_json = Column(Text, nullable=False, default="[]")
    display_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    survey = relationship("Survey", back_populates="questions")
    responses = relationship(
        "SurveyResponse",
        back_populates="question",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_survey_question_survey_order", "survey_id", "display_order"),
    )


class SurveyResponse(Base):
    __tablename__ = "survey_response"

    response_id = Column(Integer, primary_key=True, autoincrement=True)
    survey_id = Column(Integer, ForeignKey("survey.survey_id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("survey_question.question_id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    answer_text = Column(Text, nullable=True)
    answer_json = Column(Text, nullable=True)
    responded_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    survey = relationship("Survey", back_populates="responses")
    question = relationship("SurveyQuestion", back_populates="responses")

    __table_args__ = (
        UniqueConstraint("survey_id", "question_id", "project_id", name="uq_survey_response_scope"),
        Index("idx_survey_response_survey_project", "survey_id", "project_id"),
    )
