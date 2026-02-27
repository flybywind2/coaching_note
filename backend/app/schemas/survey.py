"""[FEEDBACK7] 설문 API 스키마입니다."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


QUESTION_TYPES = {"subjective", "objective_choice", "objective_score"}


class SurveyBase(BaseModel):
    batch_id: int
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: date
    end_date: date
    is_visible: bool = False


class SurveyCreate(SurveyBase):
    pass


class SurveyUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_visible: Optional[bool] = None


class SurveyOut(SurveyBase):
    survey_id: int
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SurveyQuestionBase(BaseModel):
    question_text: str = Field(min_length=1, max_length=300)
    question_type: str = "subjective"
    is_required: bool = False
    is_multi_select: bool = False
    options: List[str] = Field(default_factory=list)
    display_order: int = 1


class SurveyQuestionCreate(SurveyQuestionBase):
    pass


class SurveyQuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1, max_length=300)
    question_type: Optional[str] = None
    is_required: Optional[bool] = None
    is_multi_select: Optional[bool] = None
    options: Optional[List[str]] = None
    display_order: Optional[int] = None


class SurveyQuestionOut(SurveyQuestionBase):
    question_id: int
    survey_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SurveyBatchOut(BaseModel):
    batch_id: int
    batch_name: str


class SurveyProjectRowOut(BaseModel):
    project_id: int
    project_name: str
    representative: Optional[str] = None
    is_my_project: bool = False
    can_edit: bool = False
    answers: dict[str, str] = Field(default_factory=dict)
    multi_answers: dict[str, List[str]] = Field(default_factory=dict)


class SurveyResponseRateOut(BaseModel):
    project_id: int
    project_name: str
    answered_required: int
    required_question_count: int
    response_rate: float


class SurveyScoreAverageOut(BaseModel):
    project_id: int
    project_name: str
    average_score: Optional[float] = None


class SurveyStatsOut(BaseModel):
    response_rates: List[SurveyResponseRateOut] = Field(default_factory=list)
    overall_score_average: Optional[float] = None
    project_score_averages: List[SurveyScoreAverageOut] = Field(default_factory=list)


class SurveyDetailOut(BaseModel):
    survey: SurveyOut
    questions: List[SurveyQuestionOut] = Field(default_factory=list)
    rows: List[SurveyProjectRowOut] = Field(default_factory=list)
    can_manage: bool = False
    can_answer: bool = False
    stats: Optional[SurveyStatsOut] = None


class SurveyAnswerInput(BaseModel):
    question_id: int
    answer_text: Optional[str] = None
    selected_options: List[str] = Field(default_factory=list)


class SurveyResponseUpsert(BaseModel):
    project_id: int
    answers: List[SurveyAnswerInput] = Field(default_factory=list)
