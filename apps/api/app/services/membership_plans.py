from __future__ import annotations

from typing import Any

PLAN_LABELS: dict[str, str] = {
    "friend": "亲友版",
    "monthly": "月度会员",
    "yearly": "年度会员",
    "lifetime": "终身会员",
}

MEMBERSHIP_PLANS: dict[str, dict[str, Any]] = {
    "monthly": {
        "label": "月度会员",
        "days": 30,
        "price_cents": 2900,
        "description": "30 天 AI 打分、话术、简历改写、官网抓取",
    },
    "yearly": {
        "label": "年度会员",
        "days": 365,
        "price_cents": 19900,
        "description": "全年畅享，折合更优惠",
    },
    "lifetime": {
        "label": "终身会员",
        "days": None,
        "price_cents": 39900,
        "description": "一次购买，长期使用",
    },
}
