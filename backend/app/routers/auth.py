"""Auth 기능 API 라우터입니다. 요청을 검증하고 서비스 레이어로 비즈니스 로직을 위임합니다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.user import LoginRequest, TokenResponse, UserOut
from app.services.auth_service import create_access_token, mock_sso_login
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = mock_sso_login(db, request.emp_id)
    token = create_access_token(user.user_id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "로그아웃 되었습니다."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


