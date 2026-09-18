from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.database import SessionLocal, init_db  # noqa: E402
from app.models.models import JobLibraryEntry  # noqa: E402
from import_incremental_job_csv import (  # noqa: E402
    DIRECTION_RULES,
    DIRECTION_PRIORITY,
    MULTI_ROLE_PATTERN,
    DirectionRule,
    _identity,
    _identity_tuple,
    _is_core,
    _is_eligible,
    _matched_directions,
)


REANALYSIS_SOURCE = "全库重新分析"
SOURCE_DETAIL_PATTERN = re.compile(
    r"(?:截止时间|专业要求需核对|笔试)：[^；]+"
)
RULE_BY_NAME = {rule.name: rule for rule in DIRECTION_RULES}
DIRECTION_ALIASES = {
    "前端／全栈延伸": "全栈开发",
}


def _row_from_entry(entry: JobLibraryEntry) -> dict[str, str]:
    source_details = "；".join(SOURCE_DETAIL_PATTERN.findall(entry.risk_note or ""))
    deadline = ""
    profession = ""
    exam = ""
    for part in source_details.split("；"):
        if part.startswith("截止时间："):
            deadline = part.removeprefix("截止时间：")
        elif part.startswith("专业要求需核对："):
            profession = part.removeprefix("专业要求需核对：")
        elif part.startswith("笔试："):
            exam = part.removeprefix("笔试：")
    return {
        "更新时间": entry.updated_date or "",
        "公司名称": entry.company or "",
        "企业性质": entry.company_type or "",
        "行业分类": entry.industry or "",
        "招聘岗位": entry.job_title or "",
        "工作地点": entry.city or "",
        "截止时间": deadline,
        "届次": entry.cohort or "",
        "学历要求": entry.education or "",
        "专业要求": profession,
        "是否笔试": exam,
        "公告链接": entry.announcement_url or "",
        "投递链接": entry.application_url or "",
    }


def _source_details(entry: JobLibraryEntry) -> list[str]:
    return SOURCE_DETAIL_PATTERN.findall(entry.risk_note or "")


def _classification_values(
    entry: JobLibraryEntry,
    matches: list[DirectionRule],
) -> dict[str, str]:
    primary = matches[0]
    risks = [primary.risk]
    title = entry.job_title or ""
    if len(title) > 120 or len(MULTI_ROLE_PATTERN.findall(title)) > 4:
        risks.append("该记录包含多个岗位，进入官网后只选择与推荐方向匹配的具体岗位。")
    risks.extend(_source_details(entry))
    return {
        "target_direction": primary.name,
        "other_directions": "；".join(rule.name for rule in matches[1:]),
        "match_basis": primary.match_basis,
        "recommended_resume": primary.resume,
        "risk_note": "；".join(dict.fromkeys(part for part in risks if part)),
    }


def _merge_matches(*groups: list[DirectionRule]) -> list[DirectionRule]:
    by_name = {rule.name: rule for group in groups for rule in group}
    return sorted(
        by_name.values(),
        key=lambda rule: DIRECTION_PRIORITY.get(rule.name, len(DIRECTION_PRIORITY)),
    )


def _existing_matches(entry: JobLibraryEntry) -> list[DirectionRule]:
    names = [entry.target_direction or ""]
    names.extend(re.split(r"[；;]", entry.other_directions or ""))
    matches: list[DirectionRule] = []
    for raw_name in names:
        name = DIRECTION_ALIASES.get(raw_name.strip(), raw_name.strip())
        rule = RULE_BY_NAME.get(name)
        if rule and rule not in matches:
            matches.append(rule)
    return matches


def _progress_mapping(
    source: JobLibraryEntry,
    matches: list[DirectionRule],
    occupied_source_keys: set[str],
) -> dict:
    source_key = f"progress:{_identity(source.company, source.job_title)}"
    if source_key in occupied_source_keys:
        suffix = hashlib.sha1(
            f"{source.id}|{source.company}|{source.job_title}".encode("utf-8")
        ).hexdigest()[:10]
        source_key = f"progress:reanalyzed:{suffix}"
    occupied_source_keys.add(source_key)
    values = _classification_values(source, matches)
    return {
        "source_key": source_key,
        "collection": "progress",
        "source_sheet": REANALYSIS_SOURCE,
        "source_row": source.id,
        "recommendation_level": (
            "核心推荐"
            if _is_core(_row_from_entry(source), matches[0], len(matches))
            else "可投递"
        ),
        **values,
        "company": source.company,
        "job_title": source.job_title,
        "company_type": source.company_type,
        "industry": source.industry,
        "city": source.city,
        "cohort": source.cohort,
        "education": source.education,
        "updated_date": source.updated_date,
        "announcement_url": source.announcement_url,
        "application_url": source.application_url,
        "source_status": "",
        "personal_note": "",
        "hidden": False,
    }


def _changed(entry: JobLibraryEntry, values: dict[str, str]) -> bool:
    return any((getattr(entry, key) or "") != value for key, value in values.items())


def main() -> None:
    parser = argparse.ArgumentParser(
        description="按个人最新岗位优先级重新分析整个岗位库并补全多方向分类"
    )
    parser.add_argument("--commit", action="store_true", help="实际写入；默认只预览")
    parser.add_argument(
        "--as-of",
        type=lambda value: datetime.strptime(value, "%Y-%m-%d").date(),
        default=date.today(),
        help="筛选截止日期基准，格式YYYY-MM-DD",
    )
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    try:
        all_entries = (
            db.query(JobLibraryEntry)
            .filter(JobLibraryEntry.collection == "all")
            .order_by(JobLibraryEntry.id)
            .all()
        )
        progress_entries = (
            db.query(JobLibraryEntry)
            .filter(JobLibraryEntry.collection == "progress")
            .order_by(JobLibraryEntry.id)
            .all()
        )

        progress_by_identity: dict[tuple[str, str], list[JobLibraryEntry]] = defaultdict(list)
        progress_by_announcement: dict[tuple[str, str], list[JobLibraryEntry]] = defaultdict(list)
        occupied_source_keys = {entry.source_key for entry in progress_entries}
        new_progress_identities: set[tuple[str, str]] = set()
        progress_matches: dict[int, list[DirectionRule]] = {}

        for entry in progress_entries:
            progress_by_identity[_identity_tuple(entry.company, entry.job_title)].append(entry)
            if entry.announcement_url:
                progress_by_announcement[(entry.company, entry.announcement_url)].append(entry)
            progress_matches[entry.id] = _merge_matches(
                _matched_directions(_row_from_entry(entry)),
                _existing_matches(entry),
            )

        all_updates: list[dict] = []
        new_progress: list[dict] = []
        rejected = Counter()
        all_direction_counts = Counter()
        link_counts = Counter()

        for entry in all_entries:
            row = _row_from_entry(entry)
            matches = _matched_directions(row)
            if not matches:
                rejected["未命中目标方向或专业不匹配"] += 1
                continue

            all_direction_counts[matches[0].name] += 1
            values = _classification_values(entry, matches)
            if _changed(entry, values):
                all_updates.append({"id": entry.id, **values})

            eligible, reason = _is_eligible(row, args.as_of)
            if not eligible:
                rejected[reason] += 1
                continue

            identity = _identity_tuple(entry.company, entry.job_title)
            linked = progress_by_identity.get(identity, [])
            link_type = "exact_identity"
            if not linked and entry.announcement_url:
                linked = progress_by_announcement.get(
                    (entry.company, entry.announcement_url), []
                )
                link_type = "announcement_url"
            if linked:
                link_counts[link_type] += 1
                for progress in linked:
                    progress_matches[progress.id] = _merge_matches(
                        progress_matches.get(progress.id, []), matches
                    )
                continue

            if identity in new_progress_identities:
                link_counts["duplicate_all_identity"] += 1
                continue
            mapping = _progress_mapping(entry, matches, occupied_source_keys)
            new_progress.append(mapping)
            new_progress_identities.add(identity)

        progress_updates: list[dict] = []
        progress_direction_counts = Counter()
        for entry in progress_entries:
            matches = progress_matches.get(entry.id, [])
            if not matches:
                continue
            values = _classification_values(entry, matches)
            progress_direction_counts[matches[0].name] += 1
            if _changed(entry, values):
                progress_updates.append({"id": entry.id, **values})

        for mapping in new_progress:
            progress_direction_counts[mapping["target_direction"]] += 1

        microstep = []
        for entry in [*progress_entries, *all_entries]:
            if entry.company != "微步在线":
                continue
            if entry.collection == "progress":
                matches = progress_matches.get(entry.id, [])
            else:
                matches = _matched_directions(_row_from_entry(entry))
            microstep.append(
                {
                    "collection": entry.collection,
                    "title": entry.job_title,
                    "primary": matches[0].name if matches else "",
                    "other": [rule.name for rule in matches[1:]],
                }
            )

        if args.commit:
            if all_updates:
                db.bulk_update_mappings(JobLibraryEntry, all_updates)
            if progress_updates:
                db.bulk_update_mappings(JobLibraryEntry, progress_updates)
            for start in range(0, len(new_progress), 500):
                db.bulk_insert_mappings(
                    JobLibraryEntry, new_progress[start : start + 500]
                )
            db.commit()

        result = {
            "mode": "commit" if args.commit else "preview",
            "as_of": args.as_of.isoformat(),
            "priority": [
                name
                for name, _ in sorted(
                    DIRECTION_PRIORITY.items(), key=lambda item: item[1]
                )
            ],
            "all_rows_scanned": len(all_entries),
            "all_rows_classified": sum(all_direction_counts.values()),
            "all_rows_to_update": len(all_updates),
            "existing_progress_scanned": len(progress_entries),
            "existing_progress_to_update": len(progress_updates),
            "new_progress_to_add": len(new_progress),
            "linked_to_existing_progress": dict(link_counts),
            "final_progress_direction_counts": dict(
                progress_direction_counts.most_common()
            ),
            "rejected_all_rows": dict(rejected.most_common()),
            "microstep_check": microstep,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
