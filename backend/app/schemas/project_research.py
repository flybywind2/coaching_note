"""[FEEDBACK7] 과제 조사(의견 취합) API 스키마입니다."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


QUESTION_TYPES = {"subjective", "objective"}


class ProjectResearchItemBase(BaseModel):
    batch_id: int
    title: str = Field(min_length=1, max_length=200)
    purpose: Optional[str] = None
    start_date: date
    end_date: date
    is_visible: bool = False


class ProjectResearchItemCreate(ProjectResearchItemBase):
    pass


class ProjectResearchItemUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    purpose: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_visible: Optional[bool] = None


class ProjectResearchItemOut(ProjectResearchItemBase):
    item_id: int
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProjectResearchQuestionBase(BaseModel):
    question_text: str = Field(min_length=1, max_length=300)
    question_type: str = "subjective"
    options: List[str] = []
    display_order: int = 1


class ProjectResearchQuestionCreate(ProjectResearchQuestionBase):
    pass


class ProjectResearchQuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1, max_length=300)
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    display_order: Optional[int] = None


class ProjectResearchQuestionOut(ProjectResearchQuestionBase):
    question_id: int
    item_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProjectResearchBatchOut(BaseModel):
    batch_id: int
    batch_name: str


class ProjectResearchRowOut(BaseModel):
    project_id: int
    project_name: str
    representative: Optional[str] = None
    is_my_project: bool = False
    can_edit: bool = False
    answers: dict[str, str] = {}


class ProjectResearchDetailOut(BaseModel):
    item: ProjectResearchItemOut
    questions: List[ProjectResearchQuestionOut]
    rows: List[ProjectResearchRowOut]
    can_manage: bool = False
    can_answer: bool = False


class ProjectResearchAnswerInput(BaseModel):
    question_id: int
    answer_text: Optional[str] = None


class ProjectResearchResponseUpsert(BaseModel):
    project_id: int
    answers: List[ProjectResearchAnswerInput]

