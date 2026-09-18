import re
from urllib.parse import urlparse

from app.services.career_scrapers.base import ScrapedJob, clean_text, normalize_job_url
from app.services.career_scrapers.campus_filter import is_campus_recruitment_job
from app.services.career_scrapers.http_client import fetch_json, fetch_text, polite_pause
from app.services.career_scrapers.log import LogFn


def _moka_base(list_url: str) -> str | None:
    parsed = urlparse(list_url)
    if "mokahr.com" not in parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _extract_org_id(list_url: str, html: str) -> str:
    patterns = [
        r'"orgId"\s*:\s*"([^"]+)"',
        r'"orgId"\s*:\s*(\d+)',
        r"orgId=([A-Za-z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1)
    path_match = re.search(r"/social-recruitment/[^/]+/(\d+)", list_url)
    if path_match:
        return path_match.group(1)
    return ""


async def scrape_moka(
    list_url: str,
    company: str,
    max_jobs: int = 40,
    on_log: LogFn | None = None,
) -> list[ScrapedJob]:
    def log(msg: str) -> None:
        if on_log:
            on_log(msg)

    base = _moka_base(list_url)
    if not base:
        return []

    log("识别为 Moka 招聘系统，拉取岗位列表…")
    try:
        html = await fetch_text(list_url)
    except Exception as exc:
        log(f"Moka 列表页请求失败：{exc}")
        return []
    org_id = _extract_org_id(list_url, html)
    list_api = f"{base}/api/outer/ats-apply/website/job/list"
    params: dict[str, str | int] = {"page": 1, "pageSize": min(max_jobs, 50)}
    if org_id:
        params["orgId"] = org_id

    jobs: list[ScrapedJob] = []
    try:
        payload = await fetch_json(list_api, params=params)
    except Exception as exc:
        log(f"Moka 列表 API 失败：{exc}")
        return []

    items = (
        payload.get("data", {}).get("jobs")
        or payload.get("data", {}).get("list")
        or payload.get("data", {})
    )
    if isinstance(items, dict):
        items = items.get("jobs") or items.get("list") or []
    if not isinstance(items, list):
        log("Moka 列表为空")
        return []

    list_lower = list_url.lower()
    is_campus_portal = "campus" in list_lower or "校招" in list_url

    log(f"列表共 {len(items)} 条，准备抓取校招详情…")
    for index, item in enumerate(items[: max_jobs * 3], 1):
        if len(jobs) >= max_jobs:
            break
        if not isinstance(item, dict):
            continue
        job_id = str(item.get("id") or item.get("jobId") or "")
        title = (item.get("title") or item.get("jobName") or "").strip()
        if not title:
            continue

        detail_url = ""
        if job_id:
            recruit_path = "campus-recruitment" if is_campus_portal else "social-recruitment"
            detail_url = f"{base}/{recruit_path}/position/{job_id}"
            if org_id:
                detail_url = f"{base}/{recruit_path}/position/{org_id}/{job_id}"

        jd_text = ""
        city = (item.get("location") or item.get("city") or "").strip()
        salary = (item.get("salary") or item.get("salaryDesc") or "").strip()

        if job_id:
            detail_api = f"{base}/api/outer/ats-apply/website/job/{job_id}"
            detail_params = {"orgId": org_id} if org_id else None
            try:
                if index > 1:
                    await polite_pause()
                detail_payload = await fetch_json(detail_api, params=detail_params)
                detail = detail_payload.get("data") or {}
                if isinstance(detail, dict):
                    jd_text = clean_text(
                        detail.get("description")
                        or detail.get("jobDescription")
                        or detail.get("duty")
                        or ""
                    )
                    city = city or (detail.get("location") or detail.get("city") or "").strip()
                    salary = salary or (detail.get("salary") or detail.get("salaryDesc") or "").strip()
                    if detail.get("title"):
                        title = detail["title"].strip()
            except Exception:
                log(f"  [{index}] {title}：详情 API 失败，仅保留标题")

        if not detail_url:
            detail_url = list_url

        candidate = ScrapedJob(
            job_title=title,
            company=company,
            job_url=normalize_job_url(detail_url),
            jd_text=jd_text,
            city=city,
            salary=salary,
            platform="career:moka",
        )
        if not is_campus_recruitment_job(candidate, list_url):
            log(f"  [{index}] 跳过非校招：{title}")
            continue

        jobs.append(candidate)
        log(f"  [{index}] 已收录：{title}")

    return jobs
