from __future__ import annotations

import hashlib
import json
import platform
import secrets
import hmac
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import AppSetting, LicenseKey

ACTIVATION_STORE_KEY = "license_activation"
PLAN_LABELS = {
    "friend": "亲友版",
    "monthly": "月度会员",
    "yearly": "年度会员",
    "lifetime": "终身会员",
}


def normalize_license_key(raw: str) -> str:
    return raw.strip().upper().replace(" ", "")


def hash_license_key(raw: str) -> str:
    return hashlib.sha256(normalize_license_key(raw).encode("utf-8")).hexdigest()


def format_license_key() -> str:
    parts = [secrets.token_hex(2).upper() for _ in range(3)]
    return f"JA-{'-'.join(parts)}"


def get_machine_id() -> str:
    node = uuid.getnode()
    host = platform.node() or "unknown"
    raw = f"{host}:{node}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _load_activation(db: Session) -> dict[str, Any] | None:
    row = db.query(AppSetting).filter(AppSetting.key == ACTIVATION_STORE_KEY).first()
    if not row:
        return None
    try:
        data = json.loads(row.value_json)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _save_activation(db: Session, data: dict[str, Any]) -> None:
    payload = json.dumps(data, ensure_ascii=False)
    row = db.query(AppSetting).filter(AppSetting.key == ACTIVATION_STORE_KEY).first()
    if row:
        row.value_json = payload
    else:
        db.add(AppSetting(key=ACTIVATION_STORE_KEY, value_json=payload))
    db.commit()


def _plan_expires_at(plan: str, days: int | None = None) -> datetime | None:
    if plan in ("friend", "lifetime"):
        return None
    if plan == "monthly":
        return utc_now() + timedelta(days=days or 30)
    if plan == "yearly":
        return utc_now() + timedelta(days=days or 365)
    if days:
        return utc_now() + timedelta(days=days)
    return None


def get_license_status(db: Session) -> dict[str, Any]:
    activation = _load_activation(db)
    if not activation:
        return {
            "active": False,
            "plan": "",
            "plan_label": "",
            "expires_at": None,
            "message": "未激活，请在设置页输入会员 Key",
        }

    license_row = db.query(LicenseKey).filter(LicenseKey.id == activation.get("license_id")).first()
    if not license_row or license_row.is_revoked:
        return {
            "active": False,
            "plan": "",
            "plan_label": "",
            "expires_at": None,
            "message": "Key 已失效，请联系管理员获取新 Key",
        }

    now = utc_now()
    if license_row.expires_at and license_row.expires_at < now:
        return {
            "active": False,
            "plan": license_row.plan,
            "plan_label": PLAN_LABELS.get(license_row.plan, license_row.plan),
            "expires_at": license_row.expires_at.isoformat(),
            "message": "会员已过期，请续费或更换 Key",
        }

    return {
        "active": True,
        "plan": license_row.plan,
        "plan_label": PLAN_LABELS.get(license_row.plan, license_row.plan),
        "label": license_row.label,
        "expires_at": license_row.expires_at.isoformat() if license_row.expires_at else None,
        "message": "",
    }



def activate_license(db: Session, raw_key: str) -> dict[str, Any]:
    normalized = normalize_license_key(raw_key)
    if not normalized:
        raise HTTPException(400, "请输入有效的 Key")

    license_row = db.query(LicenseKey).filter(LicenseKey.key_hash == hash_license_key(normalized)).first()
    if not license_row:
        raise HTTPException(400, "Key 无效，请检查后重试")
    if license_row.is_revoked:
        raise HTTPException(400, "Key 已被停用")

    now = utc_now()
    if license_row.expires_at and license_row.expires_at < now:
        raise HTTPException(400, "Key 已过期")

    machine_id = get_machine_id()
    activation = _load_activation(db)
    if activation and activation.get("license_id") == license_row.id:
        _save_activation(
            db,
            {
                "license_id": license_row.id,
                "machine_id": machine_id,
                "activated_at": now.isoformat(),
            },
        )
        return get_license_status(db)

    if license_row.activation_count >= license_row.max_activations:
        raise HTTPException(400, "Key 激活次数已达上限")

    license_row.activation_count += 1
    _save_activation(
        db,
        {
            "license_id": license_row.id,
            "machine_id": machine_id,
            "activated_at": now.isoformat(),
        },
    )
    db.commit()
    return get_license_status(db)


def deactivate_license(db: Session) -> dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == ACTIVATION_STORE_KEY).first()
    if row:
        db.delete(row)
        db.commit()
    return get_license_status(db)


def generate_license_keys(
    db: Session,
    *,
    plan: str,
    count: int,
    note: str = "",
    label: str = "",
    days: int | None = None,
    max_activations: int = 1,
) -> list[str]:
    if plan not in PLAN_LABELS:
        raise ValueError(f"无效套餐：{plan}")
    if count < 1 or count > 100:
        raise ValueError("单次最多生成 100 个 Key")

    expires_at = _plan_expires_at(plan, days)
    issued: list[str] = []
    for _ in range(count):
        plain = format_license_key()
        row = LicenseKey(
            key_hash=hash_license_key(plain),
            plan=plan,
            label=label or PLAN_LABELS.get(plan, plan),
            note=note,
            expires_at=expires_at,
            max_activations=max_activations,
        )
        db.add(row)
        issued.append(plain)
    db.commit()
    return issued


def verify_admin_secret(secret: str) -> None:
    if not settings.license_admin_secret:
        raise HTTPException(503, "未配置 LICENSE_ADMIN_SECRET，无法生成 Key")
    if not hmac.compare_digest(secret, settings.license_admin_secret):
        raise HTTPException(403, "管理员密钥错误")
