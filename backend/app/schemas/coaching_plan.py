"""코칭 계획/실적 페이지 요청/응답 스키마입니다."""

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class CoachingPlanUpsert(BaseModel):
    batch_id: int
    coach_user_id: Optional[int] = None
    plan_date: date
    planned_project_id: Optional[int] = None
    is_all_day: bool = True
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    plan_note: Optional[str] = None


class CoachingActualOverrideUpsert(BaseModel):
    batch_id: int
    coach_user_id: int
    work_date: date
    actual_minutes: int = Field(ge=0, le=24 * 60)
    reason: Optional[str] = None
    actual_project_ids: List[int] = Field(default_factory=list)


class CoachingPlanCell(BaseModel):
    date: date
    plan_id: Optional[int] = None
    planned_project_id: Optional[int] = None
    project_name: Optional[str] = None
    is_all_day: bool = True
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    plan_note: Optional[str] = None
    plan_updated_at: Optional[str] = None
    entered_previous_day: bool = False
    auto_minutes: int = 0
    override_minutes: Optional[int] = None
    final_minutes: int = 0
    actual_source: str = "none"  # none/auto/override
    override_reason: Optional[str] = None
    actual_project_ids: List[int] = Field(default_factory=list)
    actual_project_names: List[str] = Field(default_factory=list)
    actual_start_time: Optional[str] = None
    actual_end_time: Optional[str] = None


class CoachingPlanRow(BaseModel):
    coach_user_id: int
    coach_emp_id: str
    coach_name: str
    department: Optional[str] = None
    cells: List[CoachingPlanCell]


class CoachingPlanGridOut(BaseModel):
    batch_id: int
    start: date
    end: date
    dates: List[date]
    global_schedule_dates: List[date] = []
    rows: List[CoachingPlanRow]
