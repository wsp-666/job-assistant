import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.services.career_scrapers.base import (
    ScrapedJob,
    clean_text,
    looks_like_job_link,
    normalize_job_url,
    same_site,
)
from app.services.career_scrapers.campus_filter import is_campus_recruitment_job
from app.services.career_scrapers.http_client import fetch_text, polite_pause
from app.services.career_scrapers.jd_quality import validate_scraped_job
from app.services.career_scrapers.log import LogFn

TITLE_HINTS = (
    "工程师",
    "经理",
    "实习",
    "专员",
    "开发",
    "产品",
    "运营",
    "设计",
    "算法",
    "分析师",
    "顾问",
    "总监",
    "主管",
    "助理",
    "校招",
    "社招",
)


def _pick_title(soup: BeautifulSoup) -> str:
    for selector in ("h1", "h2", ".job-title", ".position-title", "[class*='job-title']"):
        node = soup.select_one(selector)
        if node:
            text = node.get_text(" ", strip=True)
            if text:
                return text[:200]
    if soup.title:
        return soup.title.get_text(" ", strip=True)[:200]
    return "未知岗位"


def _strip_noise(soup: BeautifulSoup) -> None:
    for tag in soup.find_all(["nav", "footer", "header", "script", "style", "noscript"]):
        tag.decompose()
    for selector in (".header", ".footer", ".nav", ".navbar", ".breadcrumb", "#header", "#footer"):
        for node in soup.select(selector):
            node.decompose()


def _pick_body(soup: BeautifulSoup) -> str:
    _strip_noise(soup)
    for selector in (
        ".job-detail",
        ".job-description",
        ".position-detail",
        "[class*='job-desc']",
        "[class*='job-detail']",
        "[class*='position-detail']",
        "[class*='description']",
        "article",
        "main",
    ):
        node = soup.select_one(selector)
        if node:
            text = node.get_text("\n", strip=True)
            if len(text) > 80:
                return clean_text(text)
    return ""


def _link_score(text: str, href: str) -> int:
    score = 0
    if looks_like_job_link(href):
        score += 2
    clean = text.strip()
    if 4 <= len(clean) <= 48:
        score += 2
    for hint in TITLE_HINTS:
        if hint in clean:
            score += 3
    if re.search(r"(工程师|经理|实习|开发|产品)", clean):
        score += 2
    return score


def _extract_json_ld_jobs(soup: BeautifulSoup, company: str, list_url: str) -> list[ScrapedJob]:
    jobs: list[ScrapedJob] = []
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw or "JobPosting" not in raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("@type") != "JobPosting":
                continue
            title = (item.get("title") or "").strip()
            if not title:
                continue
            candidate = ScrapedJob(
                job_title=title,
                company=company,
                job_url=normalize_job_url(item.get("url") or list_url),
                jd_text=clean_text(item.get("description") or ""),
                platform="career:generic",
            )
            ok, _ = validate_scraped_job(candidate)
            if ok:
                jobs.append(candidate)
    return jobs


async def scrape_generic(
    list_url: str,
    company: str,
    max_jobs: int = 25,
    on_log: LogFn | None = None,
) -> list[ScrapedJob]:
    def log(msg: str) -> None:
        if on_log:
            on_log(msg)

    log("请求招聘列表页…")
    html = await fetch_text(list_url)
    soup = BeautifulSoup(html, "html.parser")

    json_jobs = _extract_json_ld_jobs(soup, company, list_url)
    if json_jobs:
        log(f"从页面结构化数据解析到 {len(json_jobs)} 个岗位")
        return json_jobs[:max_jobs]

    candidates: list[tuple[int, str, str]] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        text = anchor.get_text(" ", strip=True)
        if not looks_like_job_link(href) and _link_score(text, href) < 3:
            continue
        if "campus" in list_url.lower() and any(
            hint in href.lower() for hint in ("/social", "social-recruitment", "/experienced")
        ):
            continue
        absolute = urljoin(list_url, href)
        if not same_site(list_url, absolute):
            continue
        normalized = normalize_job_url(absolute)
        if normalized in seen:
            continue
        seen.add(normalized)
        candidates.append((_link_score(text, href), normalized, text))

    candidates.sort(key=lambda item: item[0], reverse=True)
    links = candidates[: max_jobs * 2]
    log(f"发现 {len(links)} 条候选岗位链接，开始抓取详情…")

    jobs: list[ScrapedJob] = []
    for index, (_, link, link_text) in enumerate(links, 1):
        if len(jobs) >= max_jobs:
            break
        try:
            await polite_pause()
            log(f"[{index}/{len(links)}] 抓取 {link_text or link}")
            detail_html = await fetch_text(link)
            detail_soup = BeautifulSoup(detail_html, "html.parser")
            title = _pick_title(detail_soup)
            if title == "未知岗位" and link_text:
                title = link_text[:200]
            jd_text = _pick_body(detail_soup)
            candidate = ScrapedJob(
                job_title=title,
                company=company,
                job_url=link,
                jd_text=jd_text,
                platform="career:generic",
            )
            ok, reason = validate_scraped_job(candidate)
            if not ok:
                log(f"  跳过：{reason}")
                continue
            if not is_campus_recruitment_job(candidate, list_url):
                log(f"  跳过：非校招岗位")
                continue
            jobs.append(candidate)
            log(f"  已收录：{title}")
        except Exception as exc:
            log(f"  失败：{exc}")
            continue

    if not jobs:
        log("未匹配到有效岗位（已过滤导航页/商品页等噪声）")

    return jobs


def detect_adapter(list_url: str) -> str:
    host = urlparse(list_url).netloc.lower()
    if "mokahr.com" in host:
        return "moka"
    if "zhiye.com" in host:
        return "zhiye"
    if "feishu.cn" in host or "larkoffice.com" in host:
        return "feishu"
    return "generic"
