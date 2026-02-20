"""User 요청/응답 계약을 위한 Pydantic 스키마입니다."""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    emp_id: str
    name: str
    department: Optional[str] = None
    role: str
    email: Optional[str] = None


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(UserBase):
    user_id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CoachBase(BaseModel):
    name: str
    coach_type: str
    department: Optional[str] = None
    affiliation: Optional[str] = None
    specialty: Optional[str] = None
    career: Optional[str] = None
    photo_url: Optional[str] = None


class CoachCreate(CoachBase):
    user_id: Optional[int] = None


class CoachOut(CoachBase):
    coach_id: int
    user_id: Optional[int]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    emp_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


