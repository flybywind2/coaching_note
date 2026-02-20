"""User Service 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.access_scope import UserBatchAccess, UserProjectAccess
from app.models.batch import Batch
from app.models.project import Project
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserBulkUpsertRequest,
    UserBulkUpsertResult,
    UserPermissionUpdate,
    UserPermissionOut,
)

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


def update_user(db: Session, user_id: int, data: UserUpdate, current_user: User) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    if "role" in payload and payload["role"] not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="유효하지 않은 역할입니다.")

    if "emp_id" in payload:
        next_emp_id = (payload.get("emp_id") or "").strip()
        if not next_emp_id:
            raise HTTPException(status_code=400, detail="Knox ID(emp_id)는 비워둘 수 없습니다.")
        existing = db.query(User).filter(User.emp_id == next_emp_id, User.user_id != user_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="이미 사용 중인 Knox ID(emp_id)입니다.")
        payload["emp_id"] = next_emp_id

    if user.user_id == current_user.user_id:
        next_role = payload.get("role", user.role)
        next_active = payload.get("is_active", user.is_active)
        if next_role != "admin" or next_active is False:
            raise HTTPException(status_code=400, detail="본인 관리자 계정의 권한/활성 상태는 변경할 수 없습니다.")

    next_role = payload.get("role", user.role)
    next_active = payload.get("is_active", user.is_active)
    is_admin_leaving = user.role == "admin" and (next_role != "admin" or next_active is False)
    if is_admin_leaving:
        admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="마지막 관리자 계정은 변경할 수 없습니다.")

    for key, value in payload.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def bulk_upsert_users(db: Session, data: UserBulkUpsertRequest) -> UserBulkUpsertResult:
    created = 0
    updated = 0
    reactivated = 0
    errors: list[str] = []

    for index, item in enumerate(data.rows, start=1):
        emp_id = (item.emp_id or "").strip()
        name = (item.name or "").strip()
        role = (item.role or "").strip()
        if not emp_id or not name:
            errors.append(f"{index}행: Knox ID와 이름은 필수입니다.")
            continue
        if role not in ALLOWED_ROLES:
            errors.append(f"{index}행: 역할 값이 올바르지 않습니다. ({role})")
            continue

        existing = db.query(User).filter(User.emp_id == emp_id).first()
        if not existing:
            user = User(
                emp_id=emp_id,
                name=name,
                department=(item.department or None),
                role=role,
                email=(item.email or None),
                is_active=True,
            )
            db.add(user)
            created += 1
            continue

        existing.name = name
        existing.department = item.department or None
        existing.role = role
        existing.email = item.email or None
        if not existing.is_active and data.reactivate_inactive:
            existing.is_active = True
            reactivated += 1
        updated += 1

    db.commit()
    return UserBulkUpsertResult(
        created=created,
        updated=updated,
        reactivated=reactivated,
        failed=len(errors),
        errors=errors,
    )


def get_user_permissions(db: Session, user_id: int) -> UserPermissionOut:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    batch_ids = [
        row[0]
        for row in db.query(UserBatchAccess.batch_id)
        .filter(UserBatchAccess.user_id == user_id)
        .all()
    ]
    project_ids = [
        row[0]
        for row in db.query(UserProjectAccess.project_id)
        .filter(UserProjectAccess.user_id == user_id)
        .all()
    ]
    return UserPermissionOut(user_id=user_id, batch_ids=batch_ids, project_ids=project_ids)


def update_user_permissions(db: Session, user_id: int, data: UserPermissionUpdate) -> UserPermissionOut:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    batch_ids = sorted({int(v) for v in (data.batch_ids or []) if int(v) > 0})
    project_ids = sorted({int(v) for v in (data.project_ids or []) if int(v) > 0})

    if batch_ids:
        existing_batch_count = db.query(Batch).filter(Batch.batch_id.in_(batch_ids)).count()
        if existing_batch_count != len(batch_ids):
            raise HTTPException(status_code=400, detail="유효하지 않은 차수 권한이 포함되어 있습니다.")

    if project_ids:
        existing_project_count = db.query(Project).filter(Project.project_id.in_(project_ids)).count()
        if existing_project_count != len(project_ids):
            raise HTTPException(status_code=400, detail="유효하지 않은 과제 권한이 포함되어 있습니다.")

    db.query(UserBatchAccess).filter(UserBatchAccess.user_id == user_id).delete()
    db.query(UserProjectAccess).filter(UserProjectAccess.user_id == user_id).delete()

    for batch_id in batch_ids:
        db.add(UserBatchAccess(user_id=user_id, batch_id=batch_id))
    for project_id in project_ids:
        db.add(UserProjectAccess(user_id=user_id, project_id=project_id))

    db.commit()
    return UserPermissionOut(user_id=user_id, batch_ids=batch_ids, project_ids=project_ids)


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


