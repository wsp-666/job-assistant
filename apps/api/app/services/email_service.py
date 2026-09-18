from __future__ import annotations

import smtplib
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

from app.core.config import settings


def _build_from_header() -> str:
    """QQ 邮箱要求 From 地址与 SMTP_USER 完全一致；带中文显示名易触发 550。"""
    login = settings.smtp_user.strip()
    if not login:
        return login

    host = settings.smtp_host.lower()
    if "qq.com" in host:
        return login

    raw_from = settings.smtp_from.strip()
    if not raw_from:
        return login

    display, addr = parseaddr(raw_from)
    if addr:
        email = login if addr.lower() != login.lower() else addr
        if display:
            return formataddr((str(Header(display, "utf-8")), email))
        return email

    return formataddr((str(Header(raw_from, "utf-8")), login))


def send_verification_email(email: str, code: str) -> None:
    if not settings.smtp_configured:
        raise RuntimeError("未配置 SMTP，无法发送验证码邮件")

    envelope_from = settings.smtp_user.strip()
    from_header = _build_from_header()
    subject = "【求职助手】邮箱验证码"
    body = (
        f"您的验证码是：{code}\n\n"
        f"有效期 {settings.email_code_expire_minutes} 分钟，请勿泄露给他人。\n"
        "如非本人操作，请忽略此邮件。"
    )

    msg = MIMEMultipart()
    msg["From"] = from_header
    msg["To"] = email
    msg["Subject"] = str(Header(subject, "utf-8"))
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(envelope_from, [email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(envelope_from, [email], msg.as_string())
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError("SMTP 登录失败，请检查邮箱账号与授权码") from exc
    except smtplib.SMTPException as exc:
        raise RuntimeError(f"SMTP 发送失败：{exc}") from exc
