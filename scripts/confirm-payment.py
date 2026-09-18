#!/usr/bin/env python3
"""管理员确认用户已付款的订单。"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="确认付款订单并开通会员")
    parser.add_argument("order_id", type=int, help="订单 ID")
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

    url = f"{args.base_url.rstrip('/')}/api/membership/admin/confirm-order/{args.order_id}"
    res = httpx.post(url, headers={"X-License-Admin-Secret": secret}, timeout=30)
    if res.status_code >= 400:
        print(res.text, file=sys.stderr)
        return 1
    data = res.json()
    print("已确认订单", data.get("out_trade_no"), "用户", data.get("nickname") or data.get("user_id"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
