from __future__ import annotations

import json
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models.models import AppSetting, User, UserOAuth
from app.core.time import utc_now


def _oauth_state_key(state: str) -> str:
    return f"oauth_state:{state}"


def save_oauth_state(db: Session, state: str, provider: str) -> None:
    payload = json.dumps({"provider": provider, "exp": (utc_now() + timedelta(minutes=10)).isoformat()})
    key = _oauth_state_key(state)
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value_json = payload
    else:
        db.add(AppSetting(key=key, value_json=payload))
    db.commit()


def pop_oauth_state(db: Session, state: str, provider: str) -> bool:
    key = _oauth_state_key(state)
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        return False
    try:
        data = json.loads(row.value_json)
    except json.JSONDecodeError:
        db.delete(row)
        db.commit()
        return False
    if data.get("provider") != provider:
        return False
    db.delete(row)
    db.commit()
    return True


def find_or_create_oauth_user(
    db: Session,
    *,
    provider: str,
    open_id: str,
    union_id: str = "",
    nickname: str = "",
    avatar_url: str = "",
) -> User:
    oauth = (
        db.query(UserOAuth)
        .filter(UserOAuth.provider == provider, UserOAuth.open_id == open_id)
        .first()
    )
    if oauth:
        user = db.query(User).filter(User.id == oauth.user_id).first()
        if user:
            if nickname and not user.nickname:
                user.nickname = nickname
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url
            db.commit()
            return user

    user = User(nickname=nickname or f"{provider}用户", avatar_url=avatar_url)
    db.add(user)
    db.flush()
    db.add(
        UserOAuth(
            user_id=user.id,
            provider=provider,
            open_id=open_id,
            union_id=union_id or "",
        )
    )
    db.commit()
    db.refresh(user)
    return user
