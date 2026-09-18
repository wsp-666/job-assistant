"""官网招聘抓取：仅保留校招 / 实习岗位，过滤社招。"""

import re

from app.services.career_scrapers.base import ScrapedJob

CAMPUS_KEYWORDS = (
    "校招",
    "校园招聘",
    "应届",
    "毕业生",
    "实习",
    "管培",
    "储备生",
    "暑期",
    "寒假",
    "秋招",
    "春招",
)

SOCIAL_KEYWORDS = (
    "社招",
    "社会招聘",
    "经验不限",
    "资深",
    "专家岗",
)

SOCIAL_URL_HINTS = (
    "/social",
    "social-recruitment",
    "/experienced",
    "/society",
    "/social/",
)

EXPERIENCE_YEAR_RE = re.compile(r"[3-9]\d*年|[1-9]\d+年(?![龄级])")


def _text_blob(*parts: str) -> str:
    return "\n".join(part for part in parts if part).strip()


def _has_campus_signal(text: str) -> bool:
    return any(keyword in text for keyword in CAMPUS_KEYWORDS)


def _has_social_signal(title: str, jd_text: str, job_url: str) -> bool:
    blob = _text_blob(title, jd_text)
    if any(keyword in blob for keyword in SOCIAL_KEYWORDS):
        return True
    lower_url = (job_url or "").lower()
    if any(hint in lower_url for hint in SOCIAL_URL_HINTS):
        return True
    if EXPERIENCE_YEAR_RE.search(blob) and "应届" not in blob and "实习" not in blob:
        return True
    if ("高级" in title or "资深" in title) and "实习" not in title and "应届" not in title:
        return True
    return False


def is_campus_zhiye_item(item: dict) -> bool:
    """北森列表项：以标题为准识别校招/实习，不只看 CategoryId。"""
    title = (item.get("JobAdName") or "").strip()
    if _has_social_signal(title, "", ""):
        return False
    return _has_campus_signal(title)


def is_campus_recruitment_job(job: ScrapedJob, list_url: str = "") -> bool:
    """仅保留校招/实习：以岗位标题为主，不因 JD 或列表 URL 单独放行。"""
    title = job.job_title or ""
    jd_text = job.jd_text or ""
    job_url = job.job_url or ""

    if _has_social_signal(title, jd_text, job_url):
        return False

    return _has_campus_signal(title)
