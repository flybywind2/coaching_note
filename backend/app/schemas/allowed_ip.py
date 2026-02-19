from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AllowedIPRangeCreate(BaseModel):
    cidr: str
    description: Optional[str] = None
    is_active: bool = True


class AllowedIPRangeOut(BaseModel):
    id: int
    cidr: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
