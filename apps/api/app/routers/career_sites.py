from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.schemas.schemas import (
    CareerBackgroundScrapeStatus,
    CareerImportPresetsOut,
    CareerImportPresetsRequest,
    CareerScrapeItemResult,
    CareerScrapeRequest,
    CareerScrapeResultOut,
    CareerSiteConfigOut,
    CareerSitePresetOut,
)
from app.services.career_presets import list_presets
from app.services.career_scrape_background import background_scrape
from app.services.career_scrapers.campus_filter import is_campus_recruitment_job
from app.services.career_scrapers.jd_quality import validate_scraped_job
from app.services.career_scrapers.runner import (
    _title_matches,
    scrape_career_source,
    upsert_scraped_jobs,
)
from app.services.career_sites_store import (
    import_career_presets,
    load_career_site_config,
    prune_career_sources_to_curated,
    save_career_site_config,
    update_source_scrape_result,
)
from app.services.access_control import require_active_license

router = APIRouter(prefix="/api/career-sites", tags=["career-sites"])


async def _scrape_one_source(
    db: Session,
    source,
    max_jobs: int,
) -> CareerScrapeItemResult:
    logs: list[str] = []

    def on_log(message: str) -> None:
        logs.append(message)

    if not source.enabled:
        return CareerScrapeItemResult(
            source_id=source.id,
            company=source.company,
            message="已禁用，跳过",
            logs=["已禁用，跳过"],
        )

    try:
        on_log(f"开始抓取 {source.company}")
        scraped, adapter_used = await scrape_career_source(
            source,
            max_jobs=max_jobs,
            on_log=on_log,
        )
        on_log(f"原始抓取 {len(scraped)} 条，校招筛选与质量校验…")
        filtered: list = []
        for job in scraped:
            if not is_campus_recruitment_job(job, source.list_url):
                on_log(f"跳过：{job.job_title[:30]} — 非校招岗位")
                continue
            ok, reason = validate_scraped_job(job)
            if not ok:
                on_log(f"跳过：{job.job_title[:30]} — {reason}")
                continue
            if not _title_matches(job.job_title, source.keywords):
                continue
            filtered.append(job)
        on_log(f"过滤后保留 {len(filtered)} 条")
        created, updated = upsert_scraped_jobs(db, filtered)
        status = f"成功：新增 {created}，更新 {updated}"
        on_log(status)
        update_source_scrape_result(
            db,
            source.id,
            status=status,
            count=len(filtered),
            adapter_used=adapter_used,
        )
        return CareerScrapeItemResult(
            source_id=source.id,
            company=source.company,
            adapter_used=adapter_used,
            fetched=len(filtered),
            created=created,
            updated=updated,
            message=status,
            logs=logs,
        )
    except Exception as exc:
        db.rollback()
        message = f"失败：{exc}"
        on_log(message)
        update_source_scrape_result(db, source.id, status=message, count=0)
        return CareerScrapeItemResult(
            source_id=source.id,
            company=source.company,
            message=message,
            logs=logs,
        )


@router.get("/presets/categories", response_model=list[str])
def get_career_preset_categories():
    from app.services.career_presets import list_categories

    return list_categories()


@router.get("/presets", response_model=list[CareerSitePresetOut])
def get_career_presets(
    category: str | None = None,
    db: Session = Depends(get_db),
):
    config = load_career_site_config(db)
    imported_urls = {item.list_url.strip().rstrip("/").lower() for item in config.sources}
    imported_companies = {item.company.strip() for item in config.sources}
    result: list[CareerSitePresetOut] = []
    for preset in list_presets(category):
        url_key = preset.list_url.strip().rstrip("/").lower()
        result.append(
            CareerSitePresetOut(
                id=preset.id,
                company=preset.company,
                list_url=preset.list_url,
                adapter=preset.adapter,  # type: ignore[arg-type]
                category=preset.category,
                keywords=list(preset.keywords),
                note=preset.note,
                already_imported=url_key in imported_urls or preset.company in imported_companies,
            )
        )
    return result


@router.post("/import-presets", response_model=CareerImportPresetsOut)
def import_presets(
    payload: CareerImportPresetsRequest,
    db: Session = Depends(get_db),
):
    if payload.import_all:
        preset_ids = None
    elif payload.preset_ids:
        preset_ids = payload.preset_ids
    else:
        return CareerImportPresetsOut(added=0, skipped=0, removed=0, message="请选择要导入的预设")

    added, skipped, removed = import_career_presets(
        db,
        preset_ids,
        enable_auto_scrape=payload.enable_auto_scrape,
        sync_mode=payload.sync_mode,
    )
    message = f"已导入 {added} 家精选源，跳过 {skipped} 家（已存在）"
    if removed > 0:
        message += f"，已清理 {removed} 个历史/非精选源"
    if payload.enable_auto_scrape and added > 0:
        message += "；已开启定时自动抓取"
    return CareerImportPresetsOut(added=added, skipped=skipped, removed=removed, message=message)


@router.post("/prune-to-curated", response_model=CareerImportPresetsOut)
def prune_to_curated(db: Session = Depends(get_db)):
    """删除历史批量源，仅保留精选目录 + 手动添加。"""
    from app.services.career_sites_store import _config_from_raw, _load_raw

    before = len(_config_from_raw(_load_raw(db)).sources)
    removed, after = prune_career_sources_to_curated(db)
    message = f"已清理 {removed} 个历史源，当前保留 {after} 家"
    return CareerImportPresetsOut(
        added=0,
        skipped=after,
        removed=removed,
        message=message,
    )


@router.get("", response_model=CareerSiteConfigOut)
def get_career_sites(db: Session = Depends(get_db)):
    return load_career_site_config(db)


@router.put("", response_model=CareerSiteConfigOut)
def update_career_sites(
    payload: CareerSiteConfigOut,
    db: Session = Depends(get_db),
):
    return save_career_site_config(db, payload)


@router.post("/scrape/background", response_model=CareerBackgroundScrapeStatus)
async def start_background_scrape(
    payload: CareerScrapeRequest,
    _license: dict = Depends(require_active_license),
):
    return CareerBackgroundScrapeStatus(**background_scrape.start(payload))


@router.get("/scrape/background", response_model=CareerBackgroundScrapeStatus)
def get_background_scrape_status():
    return CareerBackgroundScrapeStatus(**background_scrape.snapshot())


@router.post("/scrape", response_model=CareerScrapeResultOut)
async def scrape_career_sites(
    payload: CareerScrapeRequest,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    config = load_career_site_config(db)
    targets = config.sources
    if payload.source_id:
        targets = [item for item in targets if item.id == payload.source_id]
    else:
        targets = [item for item in targets if item.enabled]

    results: list[CareerScrapeItemResult] = []
    for source in targets:
        results.append(await _scrape_one_source(db, source, payload.max_jobs))

    return CareerScrapeResultOut(results=results)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _source_due(source, default_interval_hours: int) -> bool:
    last = _parse_iso(source.last_scraped_at)
    if not last:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    interval = source.scrape_interval_hours or default_interval_hours
    elapsed_hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600
    return elapsed_hours >= max(interval, 1)


async def run_scheduled_career_scrape() -> None:
    db = SessionLocal()
    try:
        config = load_career_site_config(db)
        if not config.auto_scrape_enabled:
            return
        for source in config.sources:
            if not source.enabled or not _source_due(source, config.default_interval_hours):
                continue
            await _scrape_one_source(db, source, max_jobs=40)
    finally:
        db.close()
