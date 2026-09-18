from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.time import utc_now
from app.models.models import Job, JobLibraryCompanyRule, JobLibraryEntry
from app.services.application_import import _identity_key
from app.services.job_pipeline import (
    APPLIED_OR_LATER_STAGES,
    dump_tags,
    record_application_event,
    set_job_status,
)


VALID_SCOPES = {"all", "progress"}

# 在 company_type 字段中识别央国企的关键词（SQL LIKE 子串匹配）
SOE_KEYWORDS = ("央企", "央国企", "国企", "国资")
APPLIED_SOURCE_STATUS = "已投递"


def _is_soe_entry(entry: JobLibraryEntry) -> bool:
    """根据企业性质字段判断是否央国企。空值视为未知，保留在列表中。"""
    text = (entry.company_type or "").strip()
    if not text:
        return False
    return any(keyword in text for keyword in SOE_KEYWORDS)


def _normalize_scope(scope: str) -> str:
    normalized = "progress" if scope == "recommended" else scope
    if normalized not in VALID_SCOPES:
        raise ValueError("信息库仅支持 all / progress")
    return normalized


def _entry_dict(
    entry: JobLibraryEntry,
    scope: str,
    *,
    suppressed_companies: set[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": entry.source_key,
        "scope": scope,
        "recommendation_level": entry.recommendation_level,
        "target_direction": entry.target_direction,
        "other_directions": entry.other_directions,
        "company": entry.company,
        "job_title": entry.job_title,
        "company_type": entry.company_type,
        "industry": entry.industry,
        "city": entry.city,
        "cohort": entry.cohort,
        "education": entry.education,
        "updated_date": entry.updated_date,
        "match_basis": entry.match_basis,
        "recommended_resume": entry.recommended_resume,
        "risk_note": entry.risk_note,
        "announcement_url": entry.announcement_url,
        "application_url": entry.application_url,
        "source_status": entry.source_status,
        "personal_note": entry.personal_note,
        "source_row": entry.source_row,
        "hidden": bool(entry.hidden) or entry.company in (suppressed_companies or set()),
    }


def _applied_companies(db: Session) -> set[str]:
    """Return companies with a job or library row that is already applied."""
    job_rows = (
        db.query(Job.company)
        .filter(
            or_(
                Job.status.in_(APPLIED_OR_LATER_STAGES),
                Job.has_applied_resume.is_(True),
                Job.applied_at.isnot(None),
            ),
            Job.company != "",
        )
        .distinct()
        .all()
    )
    library_rows = (
        db.query(JobLibraryEntry.company)
        .filter(
            JobLibraryEntry.source_status == APPLIED_SOURCE_STATUS,
            JobLibraryEntry.company != "",
        )
        .distinct()
        .all()
    )
    return {company for (company,) in [*job_rows, *library_rows] if company}


def _suppressed_companies(db: Session) -> set[str]:
    """Company names excluded from the normal library view."""
    hidden_rules = {
        company
        for (company,) in (
            db.query(JobLibraryCompanyRule.company)
            .filter(JobLibraryCompanyRule.hidden.is_(True), JobLibraryCompanyRule.company != "")
            .all()
        )
        if company
    }
    applied_rules = {
        company
        for (company,) in (
            db.query(JobLibraryCompanyRule.company)
            .filter(JobLibraryCompanyRule.applied.is_(True), JobLibraryCompanyRule.company != "")
            .all()
        )
        if company
    }
    # Keep the legacy row-level flag as a compatibility fallback for databases
    # that have not gone through the startup backfill yet.
    legacy_hidden = {
        company
        for (company,) in (
            db.query(JobLibraryEntry.company)
            .filter(JobLibraryEntry.hidden.is_(True), JobLibraryEntry.company != "")
            .distinct()
            .all()
        )
        if company
    }
    return hidden_rules | applied_rules | legacy_hidden | _applied_companies(db)


def library_item(db: Session, scope: str, item_id: str) -> dict[str, Any]:
    collection = _normalize_scope(scope)
    entry = (
        db.query(JobLibraryEntry)
        .filter(JobLibraryEntry.collection == collection, JobLibraryEntry.source_key == item_id)
        .one_or_none()
    )
    if entry is None:
        raise KeyError(item_id)
    return _entry_dict(entry, collection, suppressed_companies=_suppressed_companies(db))


def list_library(
    db: Session,
    *,
    scope: str,
    keyword: str = "",
    direction: str = "",
    company: str = "",
    page: int = 1,
    page_size: int = 30,
    hide_applied: bool = False,
    hide_soe: bool = False,
    show_hidden: bool = False,
) -> dict[str, Any]:
    collection = _normalize_scope(scope)
    base = db.query(JobLibraryEntry).filter(JobLibraryEntry.collection == collection)
    suppressed_companies = _suppressed_companies(db)
    applied_companies = _applied_companies(db)

    # Do not return thousands of company names on every page request. The web UI
    # uses a text filter, so rendering and switching remain constant-time.
    companies: list[str] = []
    directions = [
        value
        for (value,) in base.with_entities(JobLibraryEntry.target_direction)
        .filter(JobLibraryEntry.target_direction != "")
        .distinct()
        .order_by(JobLibraryEntry.target_direction)
        .all()
    ]

    query = base
    if not show_hidden:
        query = query.filter(JobLibraryEntry.hidden.is_(False))
        if suppressed_companies:
            query = query.filter(~JobLibraryEntry.company.in_(suppressed_companies))
    token = keyword.strip()
    if token:
        pattern = f"%{token}%"
        query = query.filter(
            or_(
                JobLibraryEntry.company.ilike(pattern),
                JobLibraryEntry.job_title.ilike(pattern),
                JobLibraryEntry.target_direction.ilike(pattern),
                JobLibraryEntry.other_directions.ilike(pattern),
                JobLibraryEntry.city.ilike(pattern),
                JobLibraryEntry.industry.ilike(pattern),
                JobLibraryEntry.match_basis.ilike(pattern),
            )
        )
    if direction.strip():
        query = query.filter(
            or_(
                JobLibraryEntry.target_direction == direction.strip(),
                JobLibraryEntry.other_directions.ilike(f"%{direction.strip()}%"),
            )
        )
    if company.strip():
        query = query.filter(JobLibraryEntry.company.ilike(f"%{company.strip()}%"))

    entries_query = query.order_by(JobLibraryEntry.id)
    if hide_applied or hide_soe:
        all_entries = entries_query.all()
        kept_entries = [
            entry
            for entry in all_entries
            if (not hide_applied or entry.company not in applied_companies)
            and (not hide_soe or not _is_soe_entry(entry))
        ]
        total = len(kept_entries)
        entries = kept_entries[(page - 1) * page_size : page * page_size]
    else:
        total = entries_query.count()
        entries = (
            entries_query.offset((page - 1) * page_size).limit(page_size).all()
        )

    items = [
        _entry_dict(entry, collection, suppressed_companies=suppressed_companies)
        for entry in entries
    ]

    page_companies = {item["company"] for item in items if item.get("company")}
    jobs = db.query(Job).filter(Job.company.in_(page_companies)).all() if page_companies else []
    by_identity = {key: job for job in jobs if (key := _identity_key(job.company, job.job_title))}
    company_counts = Counter(job.company for job in jobs if job.company and job.status != "skipped")
    for item in items:
        job = by_identity.get(_identity_key(item.get("company"), item.get("job_title")))
        item["tracked_job_id"] = job.id if job else None
        item["tracked_status"] = job.status if job else ""
        item["company_tracked_count"] = company_counts.get(item.get("company", ""), 0)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "companies": companies,
        "directions": directions,
    }


def track_library_item(db: Session, *, scope: str, item_id: str, mark_applied: bool = False) -> Job:
    collection = _normalize_scope(scope)
    item = library_item(db, collection, item_id)
    url = item.get("application_url") or item.get("announcement_url") or ""
    if not url:
        raise ValueError("该岗位没有可打开的招聘链接")

    job = None
    identity = _identity_key(item.get("company"), item.get("job_title"))
    if identity:
        for candidate in db.query(Job).filter(Job.company == item["company"]).all():
            if _identity_key(candidate.company, candidate.job_title) == identity:
                job = candidate
                break

    if job is None:
        job = Job(
            platform="library",
            company=item["company"],
            job_title=item["job_title"],
            city=item.get("city", ""),
            company_industry=item.get("industry", ""),
            job_url=url,
            status="ready",
        )
        db.add(job)
        db.flush()

    job.platform = job.platform or "library"
    job.company = item["company"]
    job.job_title = item["job_title"]
    job.city = item.get("city", "") or job.city
    job.company_industry = item.get("industry", "") or job.company_industry
    job.job_url = url
    job.job_category = item.get("target_direction", "") or job.job_category
    job.priority = {"A": 1, "B": 2, "C": 3}.get(item.get("recommendation_level", "")[:1].upper(), 3)
    job.application_channel = "招聘信息库"
    notes = [item.get("match_basis", ""), item.get("risk_note", ""), item.get("personal_note", "")]
    if not job.application_notes:
        job.application_notes = "；".join(note for note in notes if note)
    tags = [item.get("target_direction", ""), item.get("company_type", "")]
    tags.append("核心推荐" if item.get("recommendation_level") == "核心推荐" else "推进岗位")
    job.application_tags_json = dump_tags([tag for tag in tags if tag])
    job.updated_at = utc_now()
    record_application_event(
        db,
        job,
        event_type="library_selected",
        note=f"从{'推进岗位' if collection == 'progress' else '全部岗位'}信息库加入投递工作台",
        actor="library",
    )
    if mark_applied:
        set_job_status(
            db,
            job,
            "applied",
            note="通过岗位信息库确认已投递",
            actor="library",
        )
        rule = (
            db.query(JobLibraryCompanyRule)
            .filter(JobLibraryCompanyRule.company == item["company"])
            .one_or_none()
        )
        if rule is None:
            db.add(JobLibraryCompanyRule(company=item["company"], applied=True))
        else:
            rule.applied = True
        # 公司级过滤由 _applied_companies 统一计算，因而同公司的现有岗位
        # 和之后重新导入的新岗位都会从主列表中排除；历史记录仍保留。
    db.commit()
    db.refresh(job)
    return job


def set_entries_hidden(db: Session, source_keys: list[str], hidden: bool) -> dict[str, int]:
    """按公司批量设置隐藏规则，返回请求数与实际更新的岗位行数。"""
    keys = [key for key in {key.strip() for key in source_keys} if key]
    if not keys:
        return {"requested": 0, "updated": 0}
    selected_rows = (
        db.query(JobLibraryEntry)
        .filter(JobLibraryEntry.source_key.in_(keys))
        .all()
    )
    companies = {entry.company for entry in selected_rows if entry.company}
    if not companies:
        return {"requested": len(keys), "updated": 0}

    rows = (
        db.query(JobLibraryEntry)
        .filter(JobLibraryEntry.company.in_(companies))
        .all()
    )
    updated = 0
    if hidden:
        existing_rules = {
            row.company: row
            for row in db.query(JobLibraryCompanyRule)
            .filter(JobLibraryCompanyRule.company.in_(companies))
            .all()
        }
        for company in companies:
            rule = existing_rules.get(company)
            if rule is None:
                db.add(JobLibraryCompanyRule(company=company, hidden=True))
            elif not rule.hidden:
                rule.hidden = True
        for entry in rows:
            if not entry.hidden:
                entry.hidden = True
                entry.updated_at = utc_now()
                updated += 1
    else:
        rules = db.query(JobLibraryCompanyRule).filter(
            JobLibraryCompanyRule.company.in_(companies)
        ).all()
        for rule in rules:
            if rule.applied:
                rule.hidden = False
            else:
                db.delete(rule)
        for entry in rows:
            if entry.hidden:
                entry.hidden = False
                entry.updated_at = utc_now()
                updated += 1
    db.commit()
    return {"requested": len(keys), "updated": updated}
