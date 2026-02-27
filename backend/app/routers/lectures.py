"""[FEEDBACK7] 강의/수강신청 API 라우터입니다."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.lecture import (
    LectureApprovalUpdate,
    LectureBulkUpdate,
    LectureCreate,
    LectureDetailOut,
    LectureOut,
    LectureRegistrationCreate,
    LectureRegistrationOut,
    LectureUpdate,
)
from app.services import lecture_service

router = APIRouter(prefix="/api/lectures", tags=["lectures"])


@router.get("", response_model=List[LectureOut])
def list_lectures(
    batch_id: Optional[int] = Query(default=None, ge=1),
    include_hidden: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.list_lectures(
        db,
        current_user=current_user,
        batch_id=batch_id,
        include_hidden=include_hidden,
    )


@router.post("", response_model=LectureOut)
def create_lecture(
    data: LectureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.create_lecture(db, data, current_user)


@router.put("/bulk-update")
def bulk_update_lectures(
    data: LectureBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated = lecture_service.bulk_update_lectures(db, data, current_user)
    return {"updated": updated}


@router.get("/{lecture_id}", response_model=LectureDetailOut)
def get_lecture_detail(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.get_lecture_detail(db, lecture_id=lecture_id, current_user=current_user)


@router.put("/{lecture_id}", response_model=LectureOut)
def update_lecture(
    lecture_id: int,
    data: LectureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.update_lecture(
        db,
        lecture_id=lecture_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/{lecture_id}")
def delete_lecture(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lecture_service.delete_lecture(db, lecture_id=lecture_id, current_user=current_user)
    return {"message": "삭제되었습니다."}


@router.get("/{lecture_id}/registrations", response_model=List[LectureRegistrationOut])
def list_registrations(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.list_registrations(db, lecture_id=lecture_id, current_user=current_user)


@router.post("/{lecture_id}/register", response_model=LectureRegistrationOut)
def register_lecture(
    lecture_id: int,
    data: LectureRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.register_lecture(
        db,
        lecture_id=lecture_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/{lecture_id}/register", response_model=LectureRegistrationOut)
def cancel_registration(
    lecture_id: int,
    project_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.cancel_registration(
        db,
        lecture_id=lecture_id,
        project_id=project_id,
        current_user=current_user,
    )


@router.patch("/registrations/{registration_id}/approval", response_model=LectureRegistrationOut)
def set_registration_approval(
    registration_id: int,
    data: LectureApprovalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return lecture_service.set_registration_approval(
        db,
        registration_id=registration_id,
        approval_status=data.approval_status,
        current_user=current_user,
    )
