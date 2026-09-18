"""北森 / 智联招聘云 zhiye.com 招聘门户适配器。"""

from urllib.parse import urlparse

from app.services.career_scrapers.base import ScrapedJob, clean_text, normalize_job_url
from app.services.career_scrapers.campus_filter import is_campus_recruitment_job, is_campus_zhiye_item
from app.services.career_scrapers.http_client import fetch_json, polite_pause
from app.services.career_scrapers.log import LogFn


def _zhiye_origin(list_url: str) -> str | None:
    parsed = urlparse(list_url)
    if "zhiye.com" not in parsed.netloc.lower():
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _build_jd(item: dict) -> str:
    parts = [
        (item.get("Duty") or "").strip(),
        (item.get("Require") or "").strip(),
    ]
    text = "\n\n".join(part for part in parts if part)
    return clean_text(text)


def _item_location(item: dict) -> str:
    loc = item.get("LocNames")
    if isinstance(loc, list):
        return "、".join(str(x) for x in loc if x)
    return str(loc or "").strip()


async def scrape_zhiye(
    list_url: str,
    company: str,
    max_jobs: int = 40,
    on_log: LogFn | None = None,
) -> list[ScrapedJob]:
    def log(msg: str) -> None:
        if on_log:
            on_log(msg)

    origin = _zhiye_origin(list_url)
    if not origin:
        return []

    log("识别为北森招聘门户（zhiye.com），拉取校招/实习岗位…")
    api = f"{origin}/api/JobAd/GetJobAdPageList"
    headers = {
        "Referer": f"{origin}/Campus",
    }

    jobs: list[ScrapedJob] = []
    page_size = min(max(max_jobs, 5), 10)
    campus_categories = ("3", "2", "1")  # 3=实习；2/1 中筛标题含校招关键词的岗位
    seen_titles: set[str] = set()

    for category in campus_categories:
        if len(jobs) >= max_jobs:
            break
        page_index = 1
        while len(jobs) < max_jobs:
            try:
                payload = await fetch_json(
                    api,
                    params=None,
                    json_body={
                        "PageIndex": page_index,
                        "PageSize": page_size,
                        "Category": category,
                    },
                    extra_headers=headers,
                )
            except Exception as exc:
                if page_index == 1 and category == "3":
                    log(f"北森列表 API 失败：{exc}")
                break

            if payload.get("Code") != 200:
                break

            items = payload.get("Data") or []
            if not isinstance(items, list) or not items:
                break

            if page_index == 1 and category == "3":
                total = int(payload.get("Count") or len(items))
                log(f"北森校招通道 Category={category} 约 {total} 条，筛选中…")

            for item in items:
                if not isinstance(item, dict):
                    continue
                if not is_campus_zhiye_item(item):
                    continue
                title = (item.get("JobAdName") or "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)

                job_ad_id = item.get("JobAdId") or item.get("Id")
                if not job_ad_id:
                    continue
                detail_url = f"{origin}/Campus/detail?jobAdId={job_ad_id}"

                jd_text = _build_jd(item)
                candidate = ScrapedJob(
                    job_title=title,
                    company=company,
                    job_url=normalize_job_url(detail_url),
                    jd_text=jd_text,
                    city=_item_location(item),
                    salary=str(item.get("Salary") or "").strip(),
                    platform="career:zhiye",
                )
                if not is_campus_recruitment_job(candidate, list_url):
                    continue
                jobs.append(candidate)
                if len(jobs) >= max_jobs:
                    break

            if len(items) < page_size or len(jobs) >= max_jobs:
                break
            page_index += 1
            await polite_pause()

    log(f"北森校招收录 {len(jobs)} 条")
    return jobs[:max_jobs]
