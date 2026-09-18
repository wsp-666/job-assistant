from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.core.config import DATA_DIR, settings

QR_DIR = DATA_DIR / "payment_qr"
ALLOWED_CHANNELS = ("wechat", "alipay")
ALLOWED_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


def _detect_image_suffix(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ".webp"
    return None


def ensure_qr_dir() -> Path:
    QR_DIR.mkdir(parents=True, exist_ok=True)
    return QR_DIR


def personal_qr_enabled() -> bool:
    if settings.payment_mode == "merchant":
        return False
    if settings.payment_mode == "personal_qr":
        return True
    if settings.payment_mode == "mock":
        return False
    has_merchant = bool(settings.wechat_pay_mch_id or settings.alipay_private_key)
    return settings.payment_personal_qr and not has_merchant


def _find_qr_file(channel: str) -> Path | None:
    base = ensure_qr_dir()
    for suffix in ALLOWED_SUFFIXES:
        candidate = base / f"{channel}{suffix}"
        if candidate.is_file():
            return candidate
    return None


def qr_public_url(channel: str) -> str | None:
    if channel not in ALLOWED_CHANNELS:
        return None
    if not _find_qr_file(channel):
        return None
    return f"/api/membership/payment-qr/{channel}"


def get_qr_file(channel: str) -> Path:
    if channel not in ALLOWED_CHANNELS:
        raise HTTPException(404, "无效收款渠道")
    path = _find_qr_file(channel)
    if not path:
        raise HTTPException(404, "尚未上传收款码")
    return path


async def save_qr_file(channel: str, file: UploadFile) -> str:
    if channel not in ALLOWED_CHANNELS:
        raise HTTPException(400, "仅支持 wechat / alipay")
    content = await file.read()
    if not content:
        raise HTTPException(400, "文件为空")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 5MB")

    suffix = _detect_image_suffix(content)
    if not suffix:
        raise HTTPException(400, "文件内容不是有效的 PNG、JPEG 或 WebP 图片")

    ensure_qr_dir()
    target = QR_DIR / f"{channel}{suffix}"
    temporary = QR_DIR / f".{channel}.{uuid4().hex}.tmp"
    temporary.write_bytes(content)
    os.replace(temporary, target)
    for old in QR_DIR.glob(f"{channel}.*"):
        if old != target:
            old.unlink(missing_ok=True)
    return qr_public_url(channel) or ""
