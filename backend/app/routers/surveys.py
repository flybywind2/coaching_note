"""[FEEDBACK7] 설문 API 라우터입니다."""

from typing import List

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.survey import (
    SurveyBatchOut,
    SurveyCreate,
    SurveyDetailOut,
    SurveyOut,
    SurveyQuestionCreate,
    SurveyQuestionOut,
    SurveyQuestionUpdate,
    SurveyResponseUpsert,
    SurveyStatsOut,
    SurveyUpdate,
)
from app.services import survey_service

router = APIRouter(prefix="/api/surveys", tags=["surveys"])


@router.get("/batches", response_model=List[SurveyBatchOut])
def list_accessible_batches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = survey_service.list_accessible_batches(db, current_user)
    return [{"batch_id": int(row.batch_id), "batch_name": row.batch_name} for row in rows]


@router.get("", response_model=List[SurveyOut])
def list_surveys(
    batch_id: int = Query(..., ge=1),
    include_hidden: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.list_surveys(
        db,
        batch_id=batch_id,
        include_hidden=include_hidden,
        current_user=current_user,
    )


@router.post("", response_model=SurveyOut)
def create_survey(
    data: SurveyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.create_survey(db, data, current_user)


@router.put("/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: int,
    data: SurveyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.update_survey(
        db,
        survey_id=survey_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/{survey_id}")
def delete_survey(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey_service.delete_survey(db, survey_id=survey_id, current_user=current_user)
    return {"message": "삭제되었습니다."}


@router.post("/{survey_id}/questions", response_model=SurveyQuestionOut)
def create_question(
    survey_id: int,
    data: SurveyQuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.create_question(
        db,
        survey_id=survey_id,
        data=data,
        current_user=current_user,
    )


@router.put("/questions/{question_id}", response_model=SurveyQuestionOut)
def update_question(
    question_id: int,
    data: SurveyQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.update_question(
        db,
        question_id=question_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    survey_service.delete_question(db, question_id=question_id, current_user=current_user)
    return {"message": "삭제되었습니다."}


@router.get("/{survey_id}/detail", response_model=SurveyDetailOut)
def get_detail(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.get_detail(db, survey_id=survey_id, current_user=current_user)


@router.put("/{survey_id}/responses", response_model=SurveyDetailOut)
def upsert_responses(
    survey_id: int,
    data: SurveyResponseUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.upsert_responses(
        db,
        survey_id=survey_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/{survey_id}/responses", response_model=SurveyDetailOut)
def cancel_responses(
    survey_id: int,
    project_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.cancel_responses(
        db,
        survey_id=survey_id,
        project_id=project_id,
        current_user=current_user,
    )


@router.get("/{survey_id}/stats", response_model=SurveyStatsOut)
def get_stats(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return survey_service.get_stats(db, survey_id=survey_id, current_user=current_user)


@router.get("/{survey_id}/export.csv")
def export_csv(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    csv_text = survey_service.export_csv(db, survey_id=survey_id, current_user=current_user)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="survey_{survey_id}.csv"'},
    )
