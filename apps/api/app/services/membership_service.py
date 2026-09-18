from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.models import User, UserMembership
from app.services.membership_plans import MEMBERSHIP_PLANS, PLAN_LABELS


def _plan_expires_at(plan: str, from_time: datetime | None = None) -> datetime | None:
    base = from_time or utc_now()
    cfg = MEMBERSHIP_PLANS.get(plan)
    if not cfg:
        return None
    days = cfg.get("days")
    if days is None:
        return None
    return base + timedelta(days=int(days))


def get_active_membership(db: Session, user_id: int) -> UserMembership | None:
    now = utc_now()
    rows = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == user_id)
        .order_by(
            case((UserMembership.expires_at.is_(None), 0), else_=1),
            UserMembership.expires_at.desc(),
            UserMembership.id.desc(),
        )
        .all()
    )
    for row in rows:
        if row.expires_at is None or row.expires_at >= now:
            return row
    return None


def get_membership_status(db: Session, user: User | None) -> dict[str, Any]:
    if not user:
        return {
            "active": False,
            "plan": "",
            "plan_label": "",
            "expires_at": None,
            "source": "",
            "message": "请先登录",
        }

    membership = get_active_membership(db, user.id)
    if membership:
        return {
            "active": True,
            "plan": membership.plan,
            "plan_label": PLAN_LABELS.get(membership.plan, membership.plan),
            "expires_at": membership.expires_at.isoformat() if membership.expires_at else None,
            "source": membership.source,
            "message": "",
        }

    return {
        "active": False,
        "plan": "",
        "plan_label": "",
        "expires_at": None,
        "source": "",
        "message": "未开通会员，请购买会员",
    }


def grant_membership(
    db: Session,
    user_id: int,
    plan: str,
    *,
    source: str = "payment",
    days: int | None = None,
) -> UserMembership:
    if plan not in MEMBERSHIP_PLANS and plan not in PLAN_LABELS:
        raise ValueError(f"无效套餐：{plan}")

    now = utc_now()
    active = get_active_membership(db, user_id)
    start = now
    if active and active.expires_at and active.expires_at > now:
        start = active.expires_at

    if plan == "lifetime" or plan == "friend":
        expires_at = None
    elif days is not None:
        expires_at = start + timedelta(days=days)
    else:
        expires_at = _plan_expires_at(plan, start)

    row = UserMembership(
        user_id=user_id,
        plan=plan,
        source=source,
        starts_at=now,
        expires_at=expires_at,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row
