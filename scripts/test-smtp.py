#!/usr/bin/env python3
"""测试云端 SMTP 发信。在服务器上执行：
  cd /www/wwwroot/job-assistant
  .venv/bin/python scripts/test-smtp.py 你的邮箱@example.com

若虚拟环境在 /opt/job-assistant-venv：
  /opt/job-assistant-venv/bin/python scripts/test-smtp.py 你的邮箱@example.com
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.core.config import settings  # noqa: E402
from app.services.email_service import send_verification_email  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("用法: python scripts/test-smtp.py <收件邮箱>")
        sys.exit(1)

    target = sys.argv[1].strip()
    print("SMTP_HOST:", settings.smtp_host or "(空)")
    print("SMTP_USER:", settings.smtp_user or "(空)")
    print("SMTP_CONFIGURED:", settings.smtp_configured)
    if not settings.smtp_configured:
        print("错误: 请在 .env 中配置 SMTP_HOST / SMTP_USER / SMTP_PASSWORD")
        sys.exit(1)

    code = "123456"
    print(f"正在向 {target} 发送测试验证码 {code} ...")
    send_verification_email(target, code)
    print("发送成功，请查收邮箱（含垃圾箱）")


if __name__ == "__main__":
    main()
