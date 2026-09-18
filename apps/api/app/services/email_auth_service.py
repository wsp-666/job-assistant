from __future__ import annotations

import hashlib
import re
import secrets
from datetime import timedelta

import bcrypt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.models import EmailVerificationCode, User
from app.services.email_service import send_verification_email

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_VERIFY_ATTEMPTS = 5


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized or not _EMAIL_RE.match(normalized):
        raise HTTPException(400, "邮箱格式不正确")
    return normalized


def hash_password(password: str) -> str:
    if len(password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _hash_code(code: str) -> str:
    raw = f"{code}:{settings.jwt_secret}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email, User.is_active.is_(True)).first()


def send_email_code(db: Session, email: str, purpose: str) -> dict:
    if not settings.email_login_available:
        raise HTTPException(503, "邮箱服务未配置，请在服务器 .env 中配置 SMTP")

    email = validate_email(email)
    if purpose not in ("register", "reset"):
        raise HTTPException(400, "无效的验证码用途")

    user = get_user_by_email(db, email)
    has_password = bool(user and user.password_hash)

    if purpose == "register" and has_password:
        raise HTTPException(400, "该邮箱已注册，请直接登录")
    if purpose == "reset" and not has_password:
        raise HTTPException(400, "该邮箱尚未注册")

    now = utc_now()
    latest = (
        db.query(EmailVerificationCode)
        .filter(EmailVerificationCode.email == email, EmailVerificationCode.purpose == purpose)
        .order_by(EmailVerificationCode.id.desc())
        .first()
    )
    if latest and (now - latest.created_at).total_seconds() < settings.email_code_cooldown_seconds:
        raise HTTPException(429, f"请 {settings.email_code_cooldown_seconds} 秒后再试")

    code = _generate_code()
    row = EmailVerificationCode(
        email=email,
        code_hash=_hash_code(code),
        purpose=purpose,
        expires_at=now + timedelta(minutes=settings.email_code_expire_minutes),
    )
    db.add(row)
    db.commit()

    try:
        send_verification_email(email, code)
    except Exception as exc:
        db.delete(row)
        db.commit()
        raise HTTPException(503, f"邮件发送失败：{exc}") from exc

    return {"ok": True, "message": "验证码已发送，请查收邮箱（含垃圾箱）"}


def _get_valid_code_row(db: Session, email: str, code: str, purpose: str) -> EmailVerificationCode:
    email = validate_email(email)
    code = code.strip()
    if not code:
        raise HTTPException(400, "请输入验证码")

    row = (
        db.query(EmailVerificationCode)
        .filter(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.expires_at >= utc_now(),
        )
        .order_by(EmailVerificationCode.id.desc())
        .first()
    )
    if not row:
        raise HTTPException(400, "验证码无效或已过期")

    if row.attempts >= _MAX_VERIFY_ATTEMPTS:
        db.delete(row)
        db.commit()
        raise HTTPException(400, "验证码错误次数过多，请重新获取")

    if row.code_hash != _hash_code(code):
        row.attempts += 1
        db.commit()
        raise HTTPException(400, "验证码错误")

    return row


def register_or_reset_password(db: Session, email: str, code: str, password: str, purpose: str) -> User:
    email = validate_email(email)
    row = _get_valid_code_row(db, email, code, purpose)
    password_hash = hash_password(password)

    user = get_user_by_email(db, email)
    if purpose == "register":
        if user and user.password_hash:
            raise HTTPException(400, "该邮箱已注册，请直接登录")
        if not user:
            nickname = email.split("@")[0][:20] or "用户"
            user = User(email=email, nickname=nickname, email_verified=True)
            db.add(user)
            db.flush()
        user.password_hash = password_hash
        user.email_verified = True
    else:
        if not user:
            raise HTTPException(400, "该邮箱尚未注册")
        user.password_hash = password_hash
        user.email_verified = True

    db.delete(row)
    db.commit()
    db.refresh(user)
    return user


def login_with_email(db: Session, email: str, password: str) -> User:
    email = validate_email(email)
    user = get_user_by_email(db, email)
    if not user or not user.password_hash:
        raise HTTPException(401, "邮箱或密码错误")
    if not verify_password(password, user.password_hash):
        raise HTTPException(401, "邮箱或密码错误")
    return user
