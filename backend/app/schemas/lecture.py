"""[FEEDBACK7] 강의/수강신청 API 스키마입니다."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


APPROVAL_STATUSES = {"pending", "approved", "rejected", "cancelled"}


class LectureBase(BaseModel):
    batch_id: int
    title: str = Field(min_length=1, max_length=200)
    summary: Optional[str] = None
    description: Optional[str] = None
    instructor: Optional[str] = None
    location: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    apply_start_date: date
    apply_end_date: date
    capacity_total: Optional[int] = Field(default=None, ge=1)
    capacity_team: Optional[int] = Field(default=None, ge=1)
    is_visible: bool = True


class LectureCreate(LectureBase):
    pass


class LectureUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    summary: Optional[str] = None
    description: Optional[str] = None
    instructor: Optional[str] = None
    location: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    apply_start_date: Optional[date] = None
    apply_end_date: Optional[date] = None
    capacity_total: Optional[int] = Field(default=None, ge=1)
    capacity_team: Optional[int] = Field(default=None, ge=1)
    is_visible: Optional[bool] = None


class LectureBulkUpdate(BaseModel):
    lecture_ids: List[int] = Field(default_factory=list)
    location: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    apply_start_date: Optional[date] = None
    apply_end_date: Optional[date] = None
    capacity_total: Optional[int] = Field(default=None, ge=1)
    capacity_team: Optional[int] = Field(default=None, ge=1)
    is_visible: Optional[bool] = None


class LectureOut(LectureBase):
    lecture_id: int
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    registered_count: int = 0
    approved_count: int = 0
    my_registration_status: Optional[str] = None  # [feedback8] 참여자 강의리스트 신청 여부/상태 표시용

    model_config = {"from_attributes": True}


class LectureMemberOut(BaseModel):
    user_id: int
    user_name: str


class LectureCandidateProjectOut(BaseModel):
    project_id: int
    project_name: str
    members: List[LectureMemberOut] = Field(default_factory=list)


class LectureRegistrationBase(BaseModel):
    project_id: int
    member_user_ids: List[int] = Field(default_factory=list)


class LectureRegistrationCreate(LectureRegistrationBase):
    pass


class LectureRegistrationOut(BaseModel):
    registration_id: int
    lecture_id: int
    project_id: int
    project_name: Optional[str] = None
    applicant_user_id: int
    member_user_ids: List[int] = Field(default_factory=list)
    member_count: int
    approval_status: str
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LectureApprovalUpdate(BaseModel):
    approval_status: str = "approved"


class LectureDetailOut(BaseModel):
    lecture: LectureOut
    registrations: List[LectureRegistrationOut] = Field(default_factory=list)
    my_registration: Optional[LectureRegistrationOut] = None
    candidate_projects: List[LectureCandidateProjectOut] = Field(default_factory=list)
    can_manage: bool = False
    can_register: bool = False
