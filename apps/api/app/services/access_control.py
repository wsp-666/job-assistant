from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services.auth_service import authentication_required, get_current_user_optional
from app.services.cloud_client import fetch_membership_status
from app.services.membership_service import get_membership_status

_bearer = HTTPBearer(auto_error=False)


async def require_premium_access(
    db: Session = Depends(get_db),
    user: Any = Depends(get_current_user_optional),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    # 本地阶段不要求账号或会员；云端登录/付费逻辑保留，恢复配置后自动重新启用。
    if settings.is_local_app and not authentication_required():
        return {
            "active": True,
            "plan": "local",
            "plan_label": "本地模式",
            "message": "本地模式无需登录",
        }

    if settings.uses_cloud_membership:
        token = credentials.credentials if credentials and credentials.credentials else ""
        if not token:
            raise HTTPException(401, "请先登录")
        status = await fetch_membership_status(token)
        if not status.get("active"):
            raise HTTPException(403, status.get("message") or "请先开通会员")
        return status

    if not user:
        raise HTTPException(401, "请先登录")
    status = get_membership_status(db, user)
    if not status["active"]:
        raise HTTPException(403, status.get("message") or "请先开通会员")
    return status


async def require_active_license(
    db: Session = Depends(get_db),
    user: Any = Depends(get_current_user_optional),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    return await require_premium_access(db=db, user=user, credentials=credentials)
