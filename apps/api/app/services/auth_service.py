from __future__ import annotations

from datetime import timedelta
from typing import Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import User

_bearer = HTTPBearer(auto_error=False)
JWT_ALG = "HS256"


def authentication_required() -> bool:
    """Fail closed in cloud; avoid locking a standalone local app with no login provider."""
    if not settings.auth_enabled:
        return False
    if settings.is_cloud_server or settings.uses_cloud_membership:
        return True
    return bool(
        settings.email_login_available
        or (settings.dev_login_enabled and settings.payment_mock)
        or (
            settings.wechat_oauth_enabled
            and settings.wechat_app_id.strip()
            and settings.wechat_app_secret.strip()
        )
        or (
            settings.alipay_oauth_enabled
            and settings.alipay_app_id.strip()
            and settings.alipay_private_key.strip()
        )
    )


def create_access_token(user_id: int) -> str:
    expire = utc_now() + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": str(user_id), "exp": expire, "iat": utc_now()}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALG)


def decode_access_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALG])
        sub = data.get("sub")
        return int(sub) if sub else None
    except jwt.PyJWTError:
        return None


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials or not credentials.credentials:
        return None
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        return None
    return get_user_by_id(db, user_id)


def get_current_user_required(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    if not user:
        raise HTTPException(401, "请先登录")
    return user


def require_user_if_auth_enabled(
    user: User | None = Depends(get_current_user_optional),
) -> User | None:
    if authentication_required() and not user:
        raise HTTPException(401, "请先登录")
    return user


def user_to_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
