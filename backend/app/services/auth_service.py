"""Auth Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from datetime import datetime, timedelta
from jose import jwt
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User
from app.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def mock_sso_login(db: Session, emp_id: str) -> User:
    user = db.query(User).filter(User.emp_id == emp_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"사번 '{emp_id}'에 해당하는 활성 사용자를 찾을 수 없습니다.",
        )
    return user


