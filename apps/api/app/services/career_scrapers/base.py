from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse


@dataclass
class ScrapedJob:
    job_title: str
    company: str
    job_url: str
    jd_text: str = ""
    city: str = ""
    salary: str = ""
    platform: str = "career"


JOB_LINK_HINTS = (
    "/job/",
    "/jobs/",
    "/position/",
    "/positions/",
    "/recruit/",
    "/career/",
    "/careers/",
    "/zhaopin/",
    "/campus/",
    "/intern/",
)


def normalize_job_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        return url.strip()
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def same_site(base_url: str, target_url: str) -> bool:
    base = urlparse(base_url)
    target = urlparse(urljoin(base_url, target_url))
    return base.netloc == target.netloc


def looks_like_job_link(href: str) -> bool:
    lower = href.lower()
    return any(hint in lower for hint in JOB_LINK_HINTS)


def clean_text(text: str, limit: int = 8000) -> str:
    lines = [line.strip() for line in text.splitlines()]
    compact = "\n".join(line for line in lines if line)
    return compact[:limit]
