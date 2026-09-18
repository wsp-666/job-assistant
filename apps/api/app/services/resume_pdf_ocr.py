"""简历 PDF 专用 OCR（百度）。禁止用于其他业务场景。"""

import base64
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import RESUMES_DIR, settings
from app.services.api_profiles import get_active_profile
from app.services.baidu_ocr import BaiduOcrError, is_baidu_ocr_configured, ocr_image_base64

ALLOWED_CALLER = "resume_upload"


class ResumeOcrError(Exception):
    pass


def _assert_resume_pdf_only(path: Path, caller: str) -> None:
    if caller != ALLOWED_CALLER:
        raise ResumeOcrError("OCR 仅允许在简历上传流程中调用")

    if not settings.resume_ocr_enabled:
        raise ResumeOcrError("简历 OCR 功能未启用")

    resolved = path.resolve()
    resumes_root = RESUMES_DIR.resolve()
    if resumes_root not in resolved.parents and resolved.parent != resumes_root:
        raise ResumeOcrError("OCR 仅允许处理 data/resumes 目录下的简历文件")

    if resolved.suffix.lower() != ".pdf":
        raise ResumeOcrError("OCR 仅支持简历 PDF 文件")

    if not resolved.is_file():
        raise ResumeOcrError("简历文件不存在")

    size_mb = resolved.stat().st_size / (1024 * 1024)
    if size_mb > settings.resume_pdf_max_mb:
        raise ResumeOcrError(f"简历 PDF 超过大小限制（{settings.resume_pdf_max_mb}MB）")


def _pdf_to_images_base64(path: Path, max_pages: int) -> list[str]:
    import fitz

    doc = fitz.open(str(path))
    images: list[str] = []
    try:
        page_count = min(len(doc), max_pages)
        if page_count == 0:
            raise ResumeOcrError("PDF 无有效页面")
        for i in range(page_count):
            pix = doc[i].get_pixmap(dpi=150)
            images.append(base64.b64encode(pix.tobytes("png")).decode("ascii"))
    finally:
        doc.close()
    return images


async def ocr_resume_pdf(path: Path, *, caller: str, db: Session) -> str:
    _assert_resume_pdf_only(path, caller)

    profile = get_active_profile(db, "vision")
    if not profile:
        raise ResumeOcrError("扫描版简历 PDF 需要识图 API。请在设置页添加并选择识图服务")
    provider = profile.get("provider", "")
    if provider != "baidu_ocr":
        label = {"tencent_ocr": "腾讯云 OCR", "aliyun_ocr": "阿里云 OCR", "custom_vision": "自定义识图"}.get(
            provider, provider
        )
        raise ResumeOcrError(f"当前选择的「{label}」尚未接入，请改用百度 OCR 或等待版本更新")
    if not is_baidu_ocr_configured(profile):
        raise ResumeOcrError("当前识图 API 未配置完整的 Key，请在设置页填写")

    images = _pdf_to_images_base64(path, settings.resume_ocr_max_pages)
    parts: list[str] = []
    for idx, img_b64 in enumerate(images, start=1):
        try:
            page_text = await ocr_image_base64(img_b64, profile)
        except BaiduOcrError as exc:
            raise ResumeOcrError(f"第 {idx} 页 OCR 失败: {exc}") from exc
        if page_text.strip():
            parts.append(page_text.strip())

    text = "\n\n".join(parts).strip()
    if not text:
        raise ResumeOcrError("百度 OCR 未识别到有效文字，请检查 PDF 是否清晰")
    return text


def is_resume_ocr_available(db: Session) -> bool:
    if not settings.resume_ocr_enabled:
        return False
    profile = get_active_profile(db, "vision")
    return bool(
        profile
        and profile.get("provider") == "baidu_ocr"
        and is_baidu_ocr_configured(profile)
    )
