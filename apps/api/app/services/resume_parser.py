import re
from pathlib import Path
from typing import Any

from docx import Document
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.resume_pdf_ocr import ResumeOcrError, is_resume_ocr_available, ocr_resume_pdf

RESUME_UPLOAD_PURPOSE = "resume_upload"


def _extract_text_from_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _extract_text_from_docx(path: Path) -> str:
    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_text_from_pdf(path)
    if suffix in {".docx", ".doc"}:
        return _extract_text_from_docx(path)
    raise ValueError("仅支持 PDF 或 Word (.docx) 格式")


def _guess_skills(text: str) -> list[str]:
    common_skills = [
        "Python", "Java", "JavaScript", "TypeScript", "React", "Vue", "Node",
        "Go", "Rust", "C++", "SQL", "MySQL", "PostgreSQL", "Redis", "Docker",
        "Kubernetes", "AWS", "Linux", "Git", "FastAPI", "Spring", "Flutter",
        "产品", "运营", "数据分析", "机器学习", "深度学习", "AI", "NLP",
    ]
    found = []
    lower = text.lower()
    for skill in common_skills:
        if skill.lower() in lower:
            found.append(skill)
    return found[:20]


def _guess_sections(text: str) -> dict[str, str]:
    sections = {
        "summary": "",
        "experience": "",
        "projects": "",
        "education": "",
    }
    patterns = {
        "experience": r"(工作经历|工作经验|任职经历)([\s\S]*?)(?=项目经历|教育经历|技能|$)",
        "projects": r"(项目经历|项目经验)([\s\S]*?)(?=教育经历|工作经历|技能|$)",
        "education": r"(教育经历|教育背景)([\s\S]*?)(?=工作经历|项目经历|技能|$)",
        "summary": r"(自我评价|个人简介|个人总结)([\s\S]*?)(?=工作经历|项目经历|教育经历|$)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            sections[key] = match.group(2).strip()[:2000]
    return sections


def _build_from_text(text: str, parse_method: str = "text") -> dict[str, Any]:
    sections = _guess_sections(text)
    skills = _guess_skills(text)
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    phone_match = re.search(r"1[3-9]\d{9}", text)
    return {
        "raw_text": text[:8000],
        "summary": sections["summary"] or text[:500],
        "experience": sections["experience"],
        "projects": sections["projects"],
        "education": sections["education"],
        "skills": skills,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0) if phone_match else "",
        "parse_method": parse_method,
    }


async def parse_resume(path: Path, *, purpose: str, db: Session) -> dict[str, Any]:
    if purpose != RESUME_UPLOAD_PURPOSE:
        raise ValueError("简历解析仅允许通过上传接口调用")

    text = extract_text(path).strip()
    suffix = path.suffix.lower()

    # 文本层足够：直接解析（不调 OCR）
    if len(text) >= settings.resume_ocr_min_text_chars:
        return _build_from_text(text, "text")

    # 仅扫描版简历 PDF 才调用百度 OCR
    if suffix == ".pdf":
        if is_resume_ocr_available(db):
            try:
                ocr_text = await ocr_resume_pdf(path, caller=purpose, db=db)
                return _build_from_text(ocr_text, "baidu_ocr")
            except ResumeOcrError:
                raise
            except Exception as exc:
                raise ValueError(f"简历 OCR 失败: {exc}") from exc
        raise ValueError(
            "无法从 PDF 提取文字（可能是扫描版简历）。请在设置页添加并选择识图 API（百度 OCR）"
        )

    if not text:
        raise ValueError("无法从简历中提取文本，请检查文件是否可读")
    return _build_from_text(text, "text")
