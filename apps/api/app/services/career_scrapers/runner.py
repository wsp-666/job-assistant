from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.models import Job
from app.core.time import utc_now
from app.schemas.schemas import CareerSiteSource
from app.services.career_scrapers.base import ScrapedJob, normalize_job_url
from app.services.career_scrapers.generic import detect_adapter, scrape_generic
from app.services.career_scrapers.log import LogFn
from app.services.career_scrapers.moka import scrape_moka
from app.services.career_scrapers.zhiye import scrape_zhiye


def _title_matches(title: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    lower = title.lower()
    return any(keyword.lower() in lower for keyword in keywords if keyword.strip())


async def scrape_career_source(
    source: CareerSiteSource,
    max_jobs: int = 40,
    on_log: LogFn | None = None,
) -> tuple[list[ScrapedJob], str]:
    def log(msg: str) -> None:
        if on_log:
            on_log(msg)

    adapter = source.adapter
    if adapter == "auto":
        adapter = detect_adapter(source.list_url)
    log(f"使用适配器：{adapter}")

    try:
        if adapter == "moka":
            jobs = await scrape_moka(source.list_url, source.company, max_jobs=max_jobs, on_log=on_log)
            if jobs:
                return jobs, "moka"
            log("Moka 无结果，回退通用 HTML 解析…")
            jobs = await scrape_generic(source.list_url, source.company, max_jobs=max_jobs, on_log=on_log)
            return jobs, "generic(fallback)"

        if adapter == "zhiye":
            jobs = await scrape_zhiye(source.list_url, source.company, max_jobs=max_jobs, on_log=on_log)
            if jobs:
                return jobs, "zhiye"
            log("北森门户无结果，回退通用 HTML 解析…")
            jobs = await scrape_generic(source.list_url, source.company, max_jobs=max_jobs, on_log=on_log)
            return jobs, "generic(fallback)"

        jobs = await scrape_generic(source.list_url, source.company, max_jobs=max_jobs, on_log=on_log)
        return jobs, adapter
    except Exception as exc:
        log(f"抓取异常：{exc}")
        return [], f"{adapter}(error)"


def upsert_scraped_jobs(db: Session, jobs: list[ScrapedJob]) -> tuple[int, int]:
    created = 0
    updated = 0
    now = utc_now()
    seen_urls: set[str] = set()

    for item in jobs:
        url = normalize_job_url(item.job_url or "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)

        try:
            with db.begin_nested():
                existing = db.query(Job).filter(Job.job_url == url).first()
                if existing:
                    unchanged = (
                        existing.job_title == item.job_title
                        and (existing.jd_text or "") == (item.jd_text or "")
                        and (existing.city or "") == (item.city or "")
                    )
                    if unchanged:
                        continue
                    existing.job_title = item.job_title
                    existing.company = item.company
                    existing.jd_text = item.jd_text or existing.jd_text
                    existing.city = item.city or existing.city
                    existing.salary = item.salary or existing.salary
                    existing.platform = item.platform
                    existing.updated_at = now
                    updated += 1
                else:
                    db.add(
                        Job(
                            platform=item.platform,
                            job_title=item.job_title,
                            company=item.company,
                            salary=item.salary,
                            city=item.city,
                            jd_text=item.jd_text,
                            job_url=url,
                        )
                    )
                    created += 1
        except IntegrityError:
            # 并发或重复 URL：回滚本条 savepoint 后尝试更新
            existing = db.query(Job).filter(Job.job_url == url).first()
            if not existing:
                continue
            existing.job_title = item.job_title
            existing.company = item.company
            existing.jd_text = item.jd_text or existing.jd_text
            existing.city = item.city or existing.city
            existing.salary = item.salary or existing.salary
            existing.platform = item.platform
            existing.updated_at = now
            updated += 1

    db.commit()
    return created, updated
