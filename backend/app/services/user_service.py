from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate

ALLOWED_ROLES = {"admin", "coach", "participant", "observer"}


def list_users(db: Session, include_inactive: bool = False):
    q = db.query(User)
    if not include_inactive:
        q = q.filter(User.is_active == True)
    return q.order_by(User.user_id).all()


def create_user(db: Session, data: UserCreate) -> User:
    if data.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="유효하지 않은 역할입니다.")

    existing = db.query(User).filter(User.emp_id == data.emp_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 존재하는 사번(emp_id)입니다.")

    user = User(
        emp_id=data.emp_id,
        name=data.name,
        department=data.department,
        role=data.role,
        email=data.email,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int, current_user: User):
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="본인 계정은 삭제할 수 없습니다.")

    user = db.query(User).filter(User.user_id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="활성 사용자를 찾을 수 없습니다.")

    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="마지막 관리자 계정은 삭제할 수 없습니다.")

    user.is_active = False
    db.commit()


def restore_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.is_active:
        raise HTTPException(status_code=409, detail="이미 활성 상태인 사용자입니다.")

    user.is_active = True
    db.commit()
    db.refresh(user)
    return user
