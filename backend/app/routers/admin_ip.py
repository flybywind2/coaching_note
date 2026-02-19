from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.allowed_ip import AllowedIPRange
from app.schemas.allowed_ip import AllowedIPRangeCreate, AllowedIPRangeOut
from app.middleware.auth_middleware import require_roles

router = APIRouter(prefix="/api/admin/ip-ranges", tags=["admin-ip"])


@router.get("", response_model=List[AllowedIPRangeOut])
def list_ip_ranges(
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    return db.query(AllowedIPRange).order_by(AllowedIPRange.id).all()


@router.post("", response_model=AllowedIPRangeOut)
def create_ip_range(
    data: AllowedIPRangeCreate,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    import ipaddress
    try:
        ipaddress.ip_network(data.cidr, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 CIDR 형식입니다.")
    existing = db.query(AllowedIPRange).filter(AllowedIPRange.cidr == data.cidr).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 등록된 CIDR입니다.")
    ip_range = AllowedIPRange(**data.model_dump())
    db.add(ip_range)
    db.commit()
    db.refresh(ip_range)
    return ip_range


@router.delete("/{ip_id}", status_code=204)
def delete_ip_range(
    ip_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    ip_range = db.query(AllowedIPRange).filter(AllowedIPRange.id == ip_id).first()
    if not ip_range:
        raise HTTPException(status_code=404, detail="IP 대역을 찾을 수 없습니다.")
    db.delete(ip_range)
    db.commit()
