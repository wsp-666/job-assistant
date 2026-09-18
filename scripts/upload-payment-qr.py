#!/usr/bin/env python3
"""管理员上传微信/支付宝个人收款码。"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="上传个人收款码")
    parser.add_argument("channel", choices=["wechat", "alipay"], help="收款渠道")
    parser.add_argument("image", type=Path, help="收款码图片路径")
    parser.add_argument("--base-url", default=os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000"))
    args = parser.parse_args()

    if not args.image.is_file():
        print("图片不存在", file=sys.stderr)
        return 1

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

    url = f"{args.base_url.rstrip('/')}/api/membership/admin/upload-qr"
    content = args.image.read_bytes()
    suffix = args.image.suffix.lower() or ".png"
    mime = "image/png"
    if suffix in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif suffix == ".webp":
        mime = "image/webp"

    res = httpx.post(
        url,
        params={"channel": args.channel},
        headers={"X-License-Admin-Secret": secret},
        files={"file": (args.image.name, content, mime)},
        timeout=60,
    )
    if res.status_code >= 400:
        print(res.text, file=sys.stderr)
        return 1
    data = res.json()
    print("上传成功：", data.get("qr_url"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
