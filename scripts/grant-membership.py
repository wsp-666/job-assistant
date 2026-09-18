#!/usr/bin/env python3
"""管理员为指定用户开通会员（后门 / 赠送）。"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="为指定用户开通会员")
    parser.add_argument("--user-id", type=int, help="用户 ID")
    parser.add_argument("--nickname", help="用户昵称（与登录昵称一致）")
    parser.add_argument("--plan", default="friend", choices=["friend", "monthly", "yearly", "lifetime"])
    parser.add_argument("--days", type=int, help="自定义天数（覆盖套餐默认）")
    parser.add_argument("--base-url", default=os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000"))
    args = parser.parse_args()

    secret = os.getenv("LICENSE_ADMIN_SECRET", "")
    if not secret:
        env_path = ROOT / ".env"
        if env_path.is_file():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("LICENSE_ADMIN_SECRET="):
                    secret = line.split("=", 1)[1].strip()
                    break
    if not secret:
        print("请设置 LICENSE_ADMIN_SECRET", file=sys.stderr)
        return 1
    if not args.user_id and not args.nickname:
        print("请指定 --user-id 或 --nickname", file=sys.stderr)
        return 1

    payload = {"plan": args.plan}
    if args.user_id:
        payload["user_id"] = args.user_id
    if args.nickname:
        payload["nickname"] = args.nickname
    if args.days is not None:
        payload["days"] = args.days

    url = f"{args.base_url.rstrip('/')}/api/membership/admin/grant"
    res = httpx.post(url, json=payload, headers={"X-License-Admin-Secret": secret}, timeout=30)
    if res.status_code >= 400:
        print(res.text, file=sys.stderr)
        return 1
    data = res.json()
    print("开通成功：", data.get("plan_label"), data.get("expires_at") or "永久")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
