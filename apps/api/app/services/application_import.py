from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Iterable
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from app.models.models import Job
from app.schemas.schemas import JobPipelineUpdate
from app.services.job_pipeline import (
    APPLICATION_STAGE_MAP,
    apply_job_pipeline_patch,
    record_application_event,
)


MAX_IMPORT_BYTES = 10 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_COLUMNS = 100
SUPPORTED_SUFFIXES = {".xlsx", ".csv", ".tsv", ".json"}


class ApplicationImportError(ValueError):
    pass


FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "company": ("公司", "公司名称", "企业", "企业名称", "company", "company name", "employer"),
    "job_title": ("岗位", "岗位名称", "职位", "职位名称", "应聘岗位", "推荐投递岗位", "招聘岗位", "job title", "position", "role"),
    "job_url": ("岗位链接", "职位链接", "网申链接", "申请链接", "投递链接", "公告链接", "链接", "job url", "url", "link"),
    "platform": ("平台", "岗位来源", "招聘平台", "source", "platform"),
    "city": ("城市", "工作城市", "工作地点", "地点", "city", "location"),
    "salary": ("薪资", "薪资范围", "待遇", "salary"),
    "status": ("求职进度", "投递进度", "投递状态", "当前状态", "当前阶段", "进度", "状态", "stage", "status", "progress"),
    "priority": ("优先级", "岗位优先级", "推荐等级", "priority"),
    "job_category": ("岗位大类", "岗位方向", "目标方向", "category", "job category"),
    "application_channel": ("投递渠道", "申请渠道", "简历投递渠道", "channel"),
    "contact_name": ("联系人", "招聘联系人", "hr", "hr姓名", "hr name", "recruiter"),
    "contact_info": ("联系方式", "联系人信息", "hr联系方式", "contact", "contact info"),
    "application_tags": ("标签", "岗位标签", "分类标签", "tags", "tag"),
    "application_notes": ("备注", "个人备注", "进展备注", "跟进记录", "薪资/备注要点", "说明", "notes", "note"),
    "written_test_status": ("笔试", "笔试结果", "笔试/测评", "笔试测评", "written test"),
    "assessment_status": ("测评", "测评结果", "assessment"),
    "screening_status": ("初筛", "简历初筛", "screening"),
    "first_interview_status": ("一面", "第一轮面试", "first interview"),
    "second_interview_status": ("二面", "第二轮面试", "second interview"),
    "third_interview_status": ("三面", "第三轮面试", "third interview"),
    "final_interview_status": ("终面", "最终面试", "final interview"),
    "applied_at": ("投递时间", "投递日期", "申请时间", "申请日期", "applied at", "applied date"),
    "next_action_at": ("下次跟进", "下次跟进时间", "待办时间", "下一步时间", "下一节点时间", "next action", "follow up"),
    "interview_at": ("面试时间", "面试日期", "interview at", "interview date"),
    "last_follow_up_at": ("最近跟进", "上次跟进", "最后跟进时间", "更新日", "last follow up"),
    "match_score": ("匹配分", "匹配度", "岗位匹配分", "match score", "score"),
    "jd_text": ("职位描述", "岗位描述", "jd", "jd text", "description"),
    "company_size": ("公司规模", "企业规模", "company size"),
    "company_industry": ("行业", "所属行业", "公司行业", "industry"),
}


STATUS_ALIASES: dict[str, str] = {
    "待评估": "pending",
    "待处理": "pending",
    "收藏": "pending",
    "准备材料": "preparing",
    "材料准备": "preparing",
    "待投递": "ready",
    "待申请": "ready",
    "已沟通": "greeted",
    "已打招呼": "greeted",
    "已联系": "greeted",
    "已投递": "applied",
    "已申请": "applied",
    "简历筛选": "applied",
    "筛选中": "applied",
    "笔试": "written_test",
    "测评": "written_test",
    "在线测评": "written_test",
    "面试": "interview",
    "面试中": "interview",
    "一面": "interview",
    "二面": "interview",
    "三面": "interview",
    "终面": "final_interview",
    "最终面试": "final_interview",
    "已获offer": "offer",
    "收到offer": "offer",
    "offer": "offer",
    "录用": "offer",
    "已入职": "hired",
    "入职": "hired",
    "未通过": "rejected",
    "已拒绝": "rejected",
    "被拒": "rejected",
    "淘汰": "rejected",
    "已撤回": "withdrawn",
    "撤回": "withdrawn",
    "岗位关闭": "closed",
    "职位关闭": "closed",
    "已结束": "closed",
    "结束": "closed",
    "不考虑": "skipped",
    "已跳过": "skipped",
    "跳过": "skipped",
}


def _normalize_header(value: Any) -> str:
    text = str(value or "").strip().casefold()
    return re.sub(r"[\s_\-—/\\()（）\[\]【】:：]+", "", text)


HEADER_MAP = {
    _normalize_header(alias): field
    for field, aliases in FIELD_ALIASES.items()
    for alias in (field, *aliases)
}


def _text(value: Any, limit: int = 10000) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()[:limit]


def _map_row(headers: list[Any], values: list[Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for index, header in enumerate(headers[:MAX_IMPORT_COLUMNS]):
        normalized_header = _normalize_header(header)
        field = HEADER_MAP.get(normalized_header)
        if not field or index >= len(values):
            continue
        value = values[index]
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        if normalized_header == _normalize_header("笔试/测评"):
            result["written_test_status"] = value
            result["assessment_status"] = value
        else:
            result[field] = value
    return result


def _tabular_rows(rows: Iterable[list[Any] | tuple[Any, ...]]) -> list[tuple[int, dict[str, Any]]]:
    headers: list[Any] | None = None
    result: list[tuple[int, dict[str, Any]]] = []
    for index, raw_values in enumerate(rows, 1):
        values = list(raw_values[:MAX_IMPORT_COLUMNS])
        if headers is None:
            recognized = sum(bool(HEADER_MAP.get(_normalize_header(cell))) for cell in values)
            if recognized >= 2:
                headers = values
            elif index >= 20:
                raise ApplicationImportError("没有识别到表头，请至少包含“公司、岗位、进度”等两列")
            continue
        mapped = _map_row(headers, values)
        if mapped:
            result.append((index, mapped))
        if len(result) > MAX_IMPORT_ROWS:
            raise ApplicationImportError(f"单次最多导入 {MAX_IMPORT_ROWS} 行")
    if headers is None:
        raise ApplicationImportError("没有识别到表头，请至少包含“公司、岗位、进度”等两列")
    return result


def _read_xlsx(content: bytes) -> list[tuple[int, dict[str, Any]]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ApplicationImportError("Excel 文件无法读取，请重新导出为 .xlsx") from exc
    try:
        candidates: list[list[tuple[int, dict[str, Any]]]] = []
        for worksheet in workbook.worksheets:
            try:
                rows = _tabular_rows(worksheet.iter_rows(values_only=True))
            except ApplicationImportError:
                continue
            if rows:
                candidates.append(rows)
        if not candidates:
            raise ApplicationImportError("没有识别到可导入的进度表，请确认存在“公司、岗位、当前状态”等列")
        return max(candidates, key=len)
    finally:
        workbook.close()


def _decode_csv(content: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ApplicationImportError("CSV 编码无法识别，请使用 UTF-8 或 GB18030")


def _read_csv(content: bytes, suffix: str) -> list[tuple[int, dict[str, Any]]]:
    text = _decode_csv(content)
    delimiter = "\t" if suffix == ".tsv" else ","
    if suffix == ".csv":
        try:
            delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",\t;").delimiter
        except csv.Error:
            pass
    return _tabular_rows(csv.reader(io.StringIO(text), delimiter=delimiter))


def _read_json(content: bytes) -> list[tuple[int, dict[str, Any]]]:
    try:
        raw = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ApplicationImportError("JSON 文件无法读取") from exc
    if isinstance(raw, dict):
        raw = next((raw[key] for key in ("rows", "records", "items", "data") if isinstance(raw.get(key), list)), None)
    if not isinstance(raw, list):
        raise ApplicationImportError("JSON 顶层应为数组，或包含 rows/records/items/data 数组")
    result: list[tuple[int, dict[str, Any]]] = []
    for index, item in enumerate(raw, 1):
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("fields"), dict):
            item = item["fields"]
        mapped: dict[str, Any] = {}
        for key, value in item.items():
            normalized_key = _normalize_header(key)
            field = HEADER_MAP.get(normalized_key)
            if field and value not in (None, ""):
                if normalized_key == _normalize_header("笔试/测评"):
                    mapped["written_test_status"] = value
                    mapped["assessment_status"] = value
                else:
                    mapped[field] = value
        if mapped:
            result.append((index, mapped))
        if len(result) > MAX_IMPORT_ROWS:
            raise ApplicationImportError(f"单次最多导入 {MAX_IMPORT_ROWS} 行")
    return result


def parse_application_file(filename: str, content: bytes) -> list[tuple[int, dict[str, Any]]]:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ApplicationImportError("仅支持 .xlsx、.csv、.tsv、.json 文件")
    if not content:
        raise ApplicationImportError("导入文件为空")
    if len(content) > MAX_IMPORT_BYTES:
        raise ApplicationImportError("导入文件不能超过 10MB")
    if suffix == ".xlsx":
        rows = _read_xlsx(content)
    elif suffix in {".csv", ".tsv"}:
        rows = _read_csv(content, suffix)
    else:
        rows = _read_json(content)
    if not rows:
        raise ApplicationImportError("文件中没有可导入的数据行")
    return rows


def _status(value: Any) -> str | None:
    raw = _text(value, 100)
    if not raw:
        return None
    canonical = raw.strip().lower()
    if canonical in APPLICATION_STAGE_MAP:
        return canonical
    token = _normalize_header(raw)
    if token in STATUS_ALIASES:
        return STATUS_ALIASES[token]
    if "终面" in token:
        return "final_interview"
    if "面试" in token or re.fullmatch(r"[一二三四五1-5]面", token):
        return "interview"
    if "笔试" in token or "测评" in token:
        return "written_test"
    if "offer" in token or "录用" in token:
        return "offer"
    if "投递" in token or "申请" in token:
        return "applied"
    return None


def _priority(value: Any) -> int | None:
    raw = _text(value, 50).upper()
    if not raw:
        return None
    if raw[:1] in {"A", "B", "C"}:
        return {"A": 1, "B": 2, "C": 3}[raw[:1]]
    match = re.search(r"P\s*([0-4])", raw)
    if match:
        return int(match.group(1)) + 1
    labels = {"最高": 1, "紧急": 1, "高": 2, "较高": 2, "中": 3, "普通": 3, "正常": 3, "低": 4, "较低": 4, "暂不处理": 5}
    if raw in labels:
        return labels[raw]
    try:
        number = int(float(raw))
    except ValueError:
        return None
    return number if 1 <= number <= 5 else None


def _score(value: Any) -> float | None:
    raw = _text(value, 50).rstrip("%")
    if not raw:
        return None
    try:
        number = float(raw)
    except ValueError:
        return None
    if "%" in _text(value, 50) and number <= 1:
        number *= 100
    return max(0.0, min(100.0, number))


def _datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min)
    else:
        raw = _text(value, 100)
        if not raw:
            return None
        normalized = raw.replace("年", "-").replace("月", "-").replace("日", " ").strip()
        parsed = None
        try:
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        except ValueError:
            for pattern in ("%Y/%m/%d %H:%M", "%Y/%m/%d", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
                try:
                    parsed = datetime.strptime(normalized, pattern)
                    break
                except ValueError:
                    continue
        if parsed is None:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _tags(value: Any) -> list[str]:
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[、,，;；|\n]+", _text(value))
    result: list[str] = []
    for item in items:
        tag = _text(item, 50)
        if tag and tag not in result:
            result.append(tag)
    return result[:20]


def _url_key(value: Any) -> str:
    raw = _text(value, 1000)
    if not raw:
        return ""
    try:
        parts = urlsplit(raw if "://" in raw else f"https://{raw}")
        query = [
            (key, val)
            for key, val in parse_qsl(parts.query, keep_blank_values=True)
            if not key.lower().startswith("utm_") and key.lower() not in {"from", "source", "track"}
        ]
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), urlencode(query), ""))
    except ValueError:
        return raw.rstrip("/").casefold()


def _identity_key(company: Any, title: Any) -> tuple[str, str] | None:
    company_key = re.sub(r"\s+", "", _text(company, 200)).casefold()
    title_key = re.sub(r"\s+", "", _text(title, 200)).casefold()
    return (company_key, title_key) if company_key and title_key else None


def _platform(source: Any, url: str) -> tuple[str, str]:
    raw = _text(source, 50)
    token = raw.casefold()
    if "boss" in token or "zhipin.com" in url.casefold():
        return "boss", raw or "BOSS直聘"
    return "career_import", raw


def import_application_progress(
    db: Session,
    *,
    filename: str,
    content: bytes,
) -> dict[str, Any]:
    rows = parse_application_file(filename, content)
    existing = db.query(Job).all()
    by_url = {_url_key(job.job_url): job for job in existing if _url_key(job.job_url)}
    by_identity = {
        key: job
        for job in existing
        if (key := _identity_key(job.company, job.job_title)) is not None
    }
    result: dict[str, Any] = {
        "filename": filename,
        "total_rows": len(rows),
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "skipped": 0,
        "failed": 0,
        "issues": [],
    }

    def issue(row: int, level: str, message: str) -> None:
        if len(result["issues"]) < 100:
            result["issues"].append({"row": row, "level": level, "message": message})

    try:
        for row_number, raw in rows:
            url = _text(raw.get("job_url"), 500)
            identity = _identity_key(raw.get("company"), raw.get("job_title"))
            # 招聘门户链接经常被同一公司的多个岗位共用。只要公司与岗位齐全，
            # 就以二者为主键；仅在缺少身份字段时才用链接更新已有记录。
            job = by_identity.get(identity) if identity else None
            if job is None and not identity and url:
                job = by_url.get(_url_key(url))

            if job is None and not identity:
                result["failed"] += 1
                issue(row_number, "error", "新岗位必须填写公司和岗位名称；更新旧岗位可只填写岗位链接")
                continue

            created = job is None
            source_platform, source_label = _platform(raw.get("platform"), url)
            if created:
                job = Job(
                    platform=source_platform,
                    job_title=_text(raw.get("job_title"), 200),
                    company=_text(raw.get("company"), 200),
                    salary=_text(raw.get("salary"), 100),
                    city=_text(raw.get("city"), 100),
                    jd_text=_text(raw.get("jd_text")),
                    job_url=url,
                    company_size=_text(raw.get("company_size"), 100),
                    company_industry=_text(raw.get("company_industry"), 200),
                    status="pending",
                )
                db.add(job)
                db.flush()

            before = (
                job.platform,
                job.job_title,
                job.company,
                job.salary,
                job.city,
                job.jd_text,
                job.job_url,
                job.company_size,
                job.company_industry,
                job.match_score,
                job.status,
                job.priority,
                job.job_category,
                job.application_channel,
                job.contact_name,
                job.contact_info,
                job.application_notes,
                job.application_tags_json,
                job.written_test_status,
                job.assessment_status,
                job.screening_status,
                job.first_interview_status,
                job.second_interview_status,
                job.third_interview_status,
                job.final_interview_status,
                job.applied_at,
                job.next_action_at,
                job.interview_at,
                job.last_follow_up_at,
            )

            base_fields = {
                "job_title": (200, None),
                "company": (200, None),
                "salary": (100, None),
                "city": (100, None),
                "jd_text": (10000, None),
                "job_url": (500, None),
                "company_size": (100, None),
                "company_industry": (200, None),
            }
            for field, (limit, _) in base_fields.items():
                if field in raw and _text(raw[field]):
                    setattr(job, field, _text(raw[field], limit))
            if "platform" in raw and _text(raw["platform"]):
                job.platform = source_platform
            if "match_score" in raw:
                parsed_score = _score(raw["match_score"])
                if parsed_score is None:
                    issue(row_number, "warning", f"匹配分“{_text(raw['match_score'], 30)}”无法识别，已保留原值")
                else:
                    job.match_score = parsed_score

            patch: dict[str, Any] = {"event_note": f"从 {filename} 第 {row_number} 行一键导入"}
            if "status" in raw:
                parsed_status = _status(raw["status"])
                if parsed_status is None:
                    issue(row_number, "warning", f"进度“{_text(raw['status'], 30)}”无法识别，已保留原进度")
                else:
                    patch["status"] = parsed_status
            if "priority" in raw:
                parsed_priority = _priority(raw["priority"])
                if parsed_priority is None:
                    issue(row_number, "warning", f"优先级“{_text(raw['priority'], 30)}”无法识别，已保留原值")
                else:
                    patch["priority"] = parsed_priority
            for field, limit in (
                ("job_category", 100),
                ("application_channel", 50),
                ("contact_name", 100),
                ("contact_info", 200),
                ("application_notes", 10000),
            ):
                if field in raw and _text(raw[field]):
                    patch[field] = _text(raw[field], limit)
            for field in (
                "written_test_status",
                "assessment_status",
                "screening_status",
                "first_interview_status",
                "second_interview_status",
                "third_interview_status",
                "final_interview_status",
            ):
                if field in raw:
                    patch[field] = _text(raw[field], 50)
            if "application_channel" not in patch and source_label:
                patch["application_channel"] = source_label
            if "application_tags" in raw:
                patch["application_tags"] = _tags(raw["application_tags"])
            for field in ("applied_at", "next_action_at", "interview_at", "last_follow_up_at"):
                if field not in raw:
                    continue
                parsed_date = _datetime(raw[field])
                if parsed_date is None:
                    issue(row_number, "warning", f"{field} 的日期“{_text(raw[field], 40)}”无法识别，已保留原值")
                else:
                    patch[field] = parsed_date

            apply_job_pipeline_patch(db, job, JobPipelineUpdate(**patch), actor="import")
            after = (
                job.platform,
                job.job_title,
                job.company,
                job.salary,
                job.city,
                job.jd_text,
                job.job_url,
                job.company_size,
                job.company_industry,
                job.match_score,
                job.status,
                job.priority,
                job.job_category,
                job.application_channel,
                job.contact_name,
                job.contact_info,
                job.application_notes,
                job.application_tags_json,
                job.written_test_status,
                job.assessment_status,
                job.screening_status,
                job.first_interview_status,
                job.second_interview_status,
                job.third_interview_status,
                job.final_interview_status,
                job.applied_at,
                job.next_action_at,
                job.interview_at,
                job.last_follow_up_at,
            )
            changed = before != after
            if created:
                result["created"] += 1
                record_application_event(
                    db,
                    job,
                    event_type="progress_imported",
                    note=f"从 {filename} 第 {row_number} 行创建岗位并导入进度",
                    actor="import",
                )
            elif changed:
                result["updated"] += 1
                record_application_event(
                    db,
                    job,
                    event_type="progress_imported",
                    note=f"从 {filename} 第 {row_number} 行合并求职进度",
                    actor="import",
                )
            else:
                result["unchanged"] += 1

            if url:
                by_url[_url_key(url)] = job
            identity = _identity_key(job.company, job.job_title)
            if identity:
                by_identity[identity] = job
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result


def build_application_import_template() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "求职进度"
    headers = [
        "序号",
        "公司",
        "链接",
        "岗位",
        "岗位大类",
        "城市",
        "投递渠道",
        "投递日期",
        "当前状态",
        "下一节点时间",
        "笔试",
        "测评",
        "初筛",
        "一面",
        "二面",
        "三面",
        "终面",
        "薪资/备注要点",
        "更新日",
    ]
    sheet.append(headers)
    fill = PatternFill("solid", fgColor="2563EB")
    for cell in sheet[1]:
        cell.fill = fill
        cell.font = Font(color="FFFFFF", bold=True)
        cell.alignment = Alignment(horizontal="center")
    widths = [8, 18, 36, 22, 16, 14, 14, 14, 16, 18, 12, 12, 12, 12, 12, 12, 12, 36, 14]
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[chr(64 + index)].width = width
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:S1"

    stages = "待评估,准备材料,待投递,已沟通,已投递,笔试,面试中,终面,已获Offer,已入职,未通过,已撤回,岗位关闭,不考虑"
    stage_validation = DataValidation(type="list", formula1=f'"{stages}"', allow_blank=True)
    sheet.add_data_validation(stage_validation)
    stage_validation.add("I2:I5000")
    round_validation = DataValidation(type="list", formula1='"未开始,待定,通过,未通过,放弃"', allow_blank=True)
    sheet.add_data_validation(round_validation)
    round_validation.add("K2:Q5000")

    guide = workbook.create_sheet("填写说明")
    guide.append(["字段", "说明"])
    guide.append(["公司 + 岗位", "新增岗位时必填；同一公司投递多个岗位时，每个岗位单独占一行"])
    guide.append(["岗位链接", "优先用于去重；同一链接会更新原记录，不会重复创建"])
    guide.append(["求职进度", stages.replace(",", "、")])
    guide.append(["优先级", "P0 最高，P4 最低；也支持数字 1-5"])
    guide.append(["日期", "推荐 YYYY-MM-DD 或 YYYY-MM-DD HH:MM"])
    guide.append(["空白单元格", "不会清空已有数据"])
    guide.column_dimensions["A"].width = 18
    guide.column_dimensions["B"].width = 90
    for cell in guide[1]:
        cell.fill = fill
        cell.font = Font(color="FFFFFF", bold=True)

    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()
