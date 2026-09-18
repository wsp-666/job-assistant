import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import AppSetting
from app.schemas.schemas import CareerSiteConfigOut, CareerSiteSource

SETTING_KEY = "career_sites"

DEFAULT_CONFIG = {
    "sources": [],
    "auto_scrape_enabled": False,
    "default_interval_hours": 24,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load_raw(db: Session) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == SETTING_KEY).first()
    if not row:
        return dict(DEFAULT_CONFIG)
    try:
        data = json.loads(row.value_json)
    except json.JSONDecodeError:
        return dict(DEFAULT_CONFIG)
    if not isinstance(data, dict):
        return dict(DEFAULT_CONFIG)
    merged = dict(DEFAULT_CONFIG)
    merged.update(data)
    return merged


def _save_raw(db: Session, data: dict) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == SETTING_KEY).first()
    payload = json.dumps(data, ensure_ascii=False)
    if row:
        row.value_json = payload
    else:
        db.add(AppSetting(key=SETTING_KEY, value_json=payload))
    db.commit()


def _normalize_url(url: str) -> str:
    return url.strip().rstrip("/").lower()


def _config_from_raw(raw: dict) -> CareerSiteConfigOut:
    sources = [CareerSiteSource(**item) for item in raw.get("sources", [])]
    return CareerSiteConfigOut(
        sources=sources,
        auto_scrape_enabled=bool(raw.get("auto_scrape_enabled", False)),
        default_interval_hours=int(raw.get("default_interval_hours", 24) or 24),
    )


def _persist_config(db: Session, config: CareerSiteConfigOut) -> CareerSiteConfigOut:
    data = {
        "sources": [source.model_dump() for source in config.sources],
        "auto_scrape_enabled": config.auto_scrape_enabled,
        "default_interval_hours": config.default_interval_hours,
    }
    _save_raw(db, data)
    return _config_from_raw(_load_raw(db))


def prune_career_sources_to_curated(db: Session) -> tuple[int, int]:
    """删除非精选/历史源，仅保留手动添加 + 当前精选目录。"""
    from app.services.career_presets import load_career_presets

    config = _config_from_raw(_load_raw(db))
    before = len(config.sources)
    manual = [item for item in config.sources if item.origin == "manual"]
    manual_urls = {_normalize_url(item.list_url) for item in manual if item.list_url.strip()}

    curated: list[CareerSiteSource] = []
    for preset in load_career_presets():
        url_key = _normalize_url(preset.list_url)
        if url_key in manual_urls:
            continue
        existing = next(
            (item for item in config.sources if _normalize_url(item.list_url) == url_key),
            None,
        )
        if existing:
            curated.append(
                existing.model_copy(
                    update={
                        "company": preset.company,
                        "list_url": preset.list_url,
                        "adapter": preset.adapter,  # type: ignore[arg-type]
                        "origin": "preset",
                        "keywords": list(preset.keywords),
                        "enabled": True,
                    }
                )
            )
        else:
            curated.append(
                CareerSiteSource(
                    id=new_source_id(),
                    company=preset.company,
                    list_url=preset.list_url,
                    adapter=preset.adapter,  # type: ignore[arg-type]
                    enabled=True,
                    keywords=list(preset.keywords),
                    scrape_interval_hours=config.default_interval_hours,
                    origin="preset",
                )
            )

    config.sources = manual + curated
    _persist_config(db, config)
    return before - len(config.sources), len(config.sources)


def load_career_site_config(db: Session) -> CareerSiteConfigOut:
    return _config_from_raw(_load_raw(db))


def save_career_site_config(db: Session, config: CareerSiteConfigOut) -> CareerSiteConfigOut:
    _persist_config(db, config)
    return load_career_site_config(db)


def new_source_id() -> str:
    return str(uuid.uuid4())[:8]


def update_source_scrape_result(
    db: Session,
    source_id: str,
    *,
    status: str,
    count: int,
    adapter_used: str = "",
) -> None:
    raw = _load_raw(db)
    sources = raw.get("sources", [])
    for item in sources:
        if item.get("id") == source_id:
            item["last_scraped_at"] = _now_iso()
            item["last_scrape_status"] = status
            item["last_scrape_count"] = count
            if adapter_used:
                item["last_adapter_used"] = adapter_used
            break
    _save_raw(db, raw)


def import_career_presets(
    db: Session,
    preset_ids: list[str] | None,
    *,
    enable_auto_scrape: bool = False,
    sync_mode: str = "add",
) -> tuple[int, int, int]:
    from app.services.career_presets import get_preset_by_id, load_career_presets

    config = load_career_site_config(db)
    removed = 0

    if sync_mode == "replace":
        removed, _ = prune_career_sources_to_curated(db)
        config = load_career_site_config(db)
        if preset_ids:
            targets = [get_preset_by_id(pid) for pid in preset_ids]
            targets = [item for item in targets if item is not None]
        else:
            from app.services.career_presets import load_career_presets as _load_presets

            return 0, len(_load_presets()), removed

    existing_urls = {_normalize_url(item.list_url) for item in config.sources}
    existing_companies = {item.company.strip() for item in config.sources if item.company.strip()}

    targets = load_career_presets()
    if preset_ids:
        targets = [get_preset_by_id(pid) for pid in preset_ids]
        targets = [item for item in targets if item is not None]

    added = 0
    skipped = 0
    for preset in targets:
        url_key = _normalize_url(preset.list_url)
        if url_key in existing_urls or preset.company in existing_companies:
            skipped += 1
            continue
        config.sources.append(
            CareerSiteSource(
                id=new_source_id(),
                company=preset.company,
                list_url=preset.list_url,
                adapter=preset.adapter,  # type: ignore[arg-type]
                enabled=True,
                keywords=list(preset.keywords),
                scrape_interval_hours=config.default_interval_hours,
                origin="preset",
            )
        )
        existing_urls.add(url_key)
        existing_companies.add(preset.company)
        added += 1

    if enable_auto_scrape:
        config.auto_scrape_enabled = True

    save_career_site_config(db, config)
    return added, skipped, removed
