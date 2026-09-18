from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.schemas import LicenseGenerateOut, LicenseGenerateRequest
from app.services.license_service import PLAN_LABELS, generate_license_keys, verify_admin_secret

router = APIRouter(prefix="/api/license", tags=["license"])


@router.post("/admin/generate", response_model=LicenseGenerateOut)
def license_admin_generate(
    payload: LicenseGenerateRequest,
    db: Session = Depends(get_db),
    x_license_admin_secret: str = Header(default=""),
):
    """管理员生成 Key（仅存档/线下发放，用户侧已改为登录后在线购买会员）。"""
    verify_admin_secret(x_license_admin_secret)
    keys = generate_license_keys(
        db,
        plan=payload.plan,
        count=payload.count,
        note=payload.note,
        label=payload.label,
        days=payload.days,
        max_activations=payload.max_activations,
    )
    return LicenseGenerateOut(
        keys=keys,
        plan=payload.plan,
        plan_label=PLAN_LABELS.get(payload.plan, payload.plan),
    )
