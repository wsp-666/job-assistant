#!/usr/bin/env python3
"""生成会员激活 Key（仅管理员使用）。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal, init_db  # noqa: E402
from app.services.license_service import PLAN_LABELS, generate_license_keys  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="生成求职助手会员 Key")
    parser.add_argument("--plan", default="friend", choices=list(PLAN_LABELS.keys()))
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--note", default="", help="备注，如：给朋友张三")
    parser.add_argument("--label", default="", help="显示名称")
    parser.add_argument("--days", type=int, default=None, help="自定义有效天数")
    parser.add_argument("--max-activations", type=int, default=1)
    parser.add_argument("--admin-secret", default=os.environ.get("LICENSE_ADMIN_SECRET", ""))
    args = parser.parse_args()

    if not settings.license_admin_secret:
        print("请先在 .env 中设置 LICENSE_ADMIN_SECRET", file=sys.stderr)
        sys.exit(1)
    if args.admin_secret != settings.license_admin_secret:
        print("管理员密钥错误", file=sys.stderr)
        sys.exit(1)
    init_db()
    db = SessionLocal()
    try:
        keys = generate_license_keys(
            db,
            plan=args.plan,
            count=args.count,
            note=args.note,
            label=args.label,
            days=args.days,
            max_activations=args.max_activations,
        )
    finally:
        db.close()

    print(f"已生成 {len(keys)} 个 {PLAN_LABELS[args.plan]} Key：")
    for key in keys:
        print(key)
    if args.note:
        print(f"备注：{args.note}")


if __name__ == "__main__":
    main()
