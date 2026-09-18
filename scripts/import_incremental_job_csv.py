from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.database import SessionLocal, init_db  # noqa: E402
from app.models.models import JobLibraryEntry  # noqa: E402


SOURCE_SHEET = "📁26、27校招汇总表（增量CSV）"


@dataclass(frozen=True)
class DirectionRule:
    name: str
    patterns: tuple[str, ...]
    resume: str
    match_basis: str
    risk: str
    technical: bool = False


DIRECTION_RULES = (
    DirectionRule(
        "AI FDE／AI交付",
        (
            r"(?:AI|人工智能|大模型|智能体|Agent)[- /]?(?:FDE|交付|实施)",
            r"FDE[- /]?(?:AI|人工智能|大模型|智能体|Agent)",
            r"(?:AI|人工智能|大模型|智能体|Agent)部署(?:工程师|顾问|专员)",
            r"(?:AI|人工智能|大模型|智能体|Agent)解决方案",
        ),
        "AI FDE简历",
        "具备LLM应用开发、政企需求澄清、系统演示、部署验证和交付协同经验。",
        "优先选择AI应用落地、客户部署或交付方向，避开大模型训练和算法研究岗。",
        True,
    ),
    DirectionRule(
        "AI应用开发",
        (
            r"AI应用(?:开发|研发|工程师)",
            r"人工智能(?:应用)?开发",
            r"大模型应用(?:开发|工程师)",
            r"AI(?:全栈|软件开发|开发工程师)",
            r"(?:Agent|智能体)(?:全栈|研发|开发|工程师)",
            r"工业软件AI开发",
            r"生成式AI应用",
        ),
        "AI应用开发简历",
        "具备LLM、Prompt、结构化输出、FastAPI/React和AI应用工程实践。",
        "仅推荐应用开发方向，不建议投递模型训练、算法研究或纯数据科学岗位。",
        True,
    ),
    DirectionRule(
        "Java后端",
        (r"Java.{0,8}(?:后端|开发|研发|工程师|管培)", r"(?:后端|开发|研发).{0,8}Java"),
        "Java后端开发简历",
        "软件工程本科，具备Spring Boot、MySQL、接口开发、SQL优化和政企项目实习经验。",
        "投递前确认技术栈以Java/Spring为主，并核对是否有竞赛或实习年限硬要求。",
        True,
    ),
    DirectionRule(
        "全栈开发",
        (
            r"全栈(?:开发|研发|工程师|软件)",
            r"Full[ -]?Stack",
            r"(?:Web)?前端(?:开发|研发|工程师)",
        ),
        "全栈开发简历",
        "具备Spring Boot+Vue、FastAPI+React端到端开发、联调和部署验证经验。",
        "前端工程化深度仍需在JD要求较高时重点核对。",
        True,
    ),
    DirectionRule(
        "后端开发延伸",
        (
            r"后端(?:开发|研发|软件|工程师)",
            r"服务端(?:开发|研发|工程师)?",
            r"云服务开发",
            r"(?:Golang|Go|Python).{0,8}(?:开发|后端|工程师)",
            r"系统开发(?:工程师)?",
        ),
        "Java后端／通用软件开发简历",
        "具备后端接口、数据库、日志排障和部署验证经验，可迁移到其他后端技术栈。",
        "非Java技术栈需要补充对应语言和框架准备。",
        True,
    ),
    DirectionRule(
        "数据平台／数据开发",
        (
            r"数据(?:平台|开发|工程师|仓库|中台)",
            r"大数据(?:开发|工程师|平台)",
            r"ETL(?:开发|工程师)?",
        ),
        "Java后端／通用软件开发简历",
        "具备MySQL、数据建模、聚合接口、数据上报和多源查询优化经验。",
        "适合数据接口或平台开发，纯算法、量化研究和数据科学岗位需谨慎。",
        True,
    ),
    DirectionRule(
        "软件测试／测试开发",
        (r"测试开发(?:工程师)?", r"软件测试(?:工程师|岗)?", r"自动化测试(?:开发|工程师)?"),
        "通用软件开发简历（需补测试表述）",
        "具备接口联调、日志定位、异常路径验证和自动化回归实践。",
        "需补充测试用例设计、自动化测试框架和质量指标表述。",
        True,
    ),
    DirectionRule(
        "通用软件开发",
        (
            r"软件(?:开发|研发|工程师|技术类|类岗位)",
            r"应用层(?:软件)?开发",
            r"应用开发工程师",
            r"客户端(?:开发|研发|工程师)",
            r"Windows(?:客户端)?开发(?:工程师)?",
            r"信息技术(?:类|岗|岗位|工程师)",
            r"信息科技(?:类|岗|岗位|工程师)",
            r"IT(?:技术|开发|研发|岗|岗位|管培)",
            r"科技研发类",
        ),
        "通用软件开发简历",
        "软件工程专业，具备后端、前端联调、数据库和完整项目交付经验。",
        "综合招聘记录需进入官网确认具体岗位、技术栈和专业要求。",
        True,
    ),
    DirectionRule(
        "通用FDE／实施交付",
        (
            r"\bFDE\b",
            r"实施(?:交付|工程师|顾问)",
            r"交付(?:工程师|顾问|管培|专员)",
            r"部署(?:工程师|顾问)",
        ),
        "通用FDE简历",
        "具备政企需求澄清、接口联调、部署验证、问题跟踪和交付材料管理经验。",
        "优先软件与数字化交付，避开机械设备安装维修类岗位。",
        True,
    ),
    DirectionRule(
        "售前解决方案",
        (
            r"售前(?:工程师|顾问|方案|技术|管培)?",
            r"解决方案(?:工程师|顾问|经理|设计|架构|售前|营销|销售经理)",
            r"信息化咨询(?:师|顾问)?",
            r"初级咨询顾问",
        ),
        "售前解决方案简历",
        "软件工程背景，具备需求澄清、方案材料、系统演示和政企客户沟通经验。",
        "优先软件、云、数据与数字化方案，行业知识要求重的岗位需提前补课。",
    ),
    DirectionRule(
        "产品经理／产品助理",
        (
            r"产品(?:经理|助理|管培生?|专员|运营|策划)",
            r"产品类岗位",
            r"产品管理(?:岗|类|岗位)?",
        ),
        "产品经理／产品助理简历",
        "具备需求拆解、原型设计、产品协同、数据分析和完整产品项目实践。",
        "优先初级、助理或管培岗位，避开要求成熟商业化业绩的高级产品岗。",
    ),
    DirectionRule(
        "项目经理／项目助理",
        (
            r"项目(?:经理|助理|专员|协调|管理岗|管理类|管培)",
            r"PMO(?:助理|项目|管培)?",
        ),
        "项目经理／项目助理简历",
        "具备问题清单、进度跟踪、跨团队协同、材料版本和阶段验收实践。",
        "优先项目助理、PMO助理或校招管培，谨慎投递要求独立负责大型项目的岗位。",
    ),
    DirectionRule(
        "售后／技术支持",
        (
            r"技术支持(?:工程师|顾问|岗|类)?",
            r"客户成功(?:工程师|经理|顾问)?",
            r"现场应用(?:工程师|支持)?",
            r"(?:IT|系统|软件)运维(?:工程师|岗)?",
            r"FAE(?:工程师|管培生?)?",
        ),
        "售后／技术支持简历",
        "具备客户沟通、接口与日志排障、系统演示、部署验证和问题闭环经验。",
        "需确认岗位以软件/系统支持为主，避开机械设备维修或强硬件背景岗位。",
    ),
    DirectionRule(
        "商务拓展／BD",
        (r"商务拓展(?:专员|经理|管培)?", r"业务拓展(?:专员|经理|工程师|管培)?", r"(?:^|[^A-Za-z])BD(?:岗|经理|管培|工程师)?"),
        "ToB销售／商务拓展简历",
        "具备陌生客户拓展、需求识别、方案表达、异议处理和持续跟进经验。",
        "优先ToB、政企或技术产品业务，谨慎对待纯渠道拉新和强资源型岗位。",
    ),
    DirectionRule(
        "大客户销售／ToB销售",
        (
            r"大客户(?:销售|经理|代表)",
            r"客户经理(?:助理|管培生?)?",
            r"销售(?:工程师|经理|代表|助理|顾问|管培生?)",
            r"技术销售(?:工程师|管培生?)?",
            r"解决方案销售",
            r"海外销售(?:工程师|经理|助理|管培生?)?",
            r"渠道销售(?:经理|专员)?",
        ),
        "大客户销售简历",
        "具备陌生拓客、顾问式需求沟通、政企客户协同、方案演示和跟进闭环经验。",
        "优先ToB或技术型销售，投递前确认客户类型、业绩指标和出差要求。",
    ),
    DirectionRule(
        "营销管培／市场销售",
        (
            r"营销(?:管培生?|管理类|管理岗|岗位|类岗位)",
            r"市场(?:销售岗|营销类|营销岗|管培生?)",
        ),
        "大客户销售／ToB销售简历",
        "具备一线销售闭环、客户需求识别、价值表达和持续跟进经验。",
        "需核对岗位是否偏ToB/技术产品；纯品牌、投放或门店营销匹配度较弱。",
    ),
    DirectionRule(
        "数字化／IT项目",
        (
            r"数字化(?:工程师|专员|管培|项目|运营岗)",
            r"信息化(?:工程师|项目|建设|管理岗)",
            r"数智(?:管理|工程|项目|运营)",
            r"信息系统应用与开发",
        ),
        "项目交付／通用软件开发简历",
        "具备政企信息化项目、数据接口、系统联调、客户协同和交付跟踪经验。",
        "需确认岗位包含IT系统或数字化项目职责，而非纯业务运营。",
        True,
    ),
)


TECH_MAJOR_PATTERN = re.compile(
    r"计算机|软件|人工智能|电子信息|通信|自动化|数学|统计|大数据|信息|理工|专业不限|不限专业|专业对口",
    re.IGNORECASE,
)
BUSINESS_MAJOR_PATTERN = re.compile(
    r"计算机|软件|人工智能|电子信息|信息|理工|市场|营销|工商|管理|经济|金融|电子商务|国际贸易|专业不限|不限专业|专业对口",
    re.IGNORECASE,
)
MECHANICAL_AFTERSALES_PATTERN = re.compile(r"机械维修|设备维修|维修工程师|机修|售后维修")
EXCLUDED_TECH_PHRASE_PATTERN = re.compile(
    r"(?:嵌入式|固件|驱动|BSP|底层).{0,10}(?:软件)?(?:开发|研发|工程师)"
    r"|(?:IC|ATE|芯片|硬件|半导体).{0,8}测试开发(?:工程师)?"
    r"|(?:数字|IC)后端(?:设计|工程师)?",
    re.IGNORECASE,
)
ROLE_TOKEN_PATTERN = re.compile(r"工程师|经理|顾问|管培生|助理|专员|开发岗|研发岗")
MULTI_ROLE_PATTERN = re.compile(r"[,，、;；/\n]")
DATE_PATTERN = re.compile(r"^\s*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s*$")
CORE_PATTERNS = {
    "AI FDE／AI交付": r"AI[- /]?FDE|FDE[- /]?AI|AI(?:交付|实施|部署|解决方案)",
    "AI应用开发": r"AI应用(?:开发|研发|工程师)|大模型应用(?:开发|工程师)|Agent(?:研发|开发|工程师)",
    "Java后端": r"Java.{0,6}(?:后端|开发|研发|工程师)",
    "全栈开发": r"全栈(?:开发|研发|工程师)|Full[ -]?Stack",
    "通用FDE／实施交付": r"\bFDE\b|实施(?:交付|工程师|顾问)|交付(?:工程师|顾问)",
    "售前解决方案": r"售前(?:工程师|顾问|方案|技术)|解决方案(?:工程师|顾问)",
    "产品经理／产品助理": r"产品(?:经理|助理|管培生)",
    "项目经理／项目助理": r"项目(?:助理|专员|协调)|PMO(?:助理|项目)?",
    "大客户销售／ToB销售": r"大客户(?:销售|经理)|ToB|技术销售|解决方案销售|销售工程师|海外销售",
}
DIRECTION_PRIORITY = {
    name: index
    for index, name in enumerate(
        (
            "AI FDE／AI交付",
            "通用FDE／实施交付",
            "售前解决方案",
            "全栈开发",
            "Java后端",
            "后端开发延伸",
            "通用软件开发",
            "AI应用开发",
            "数据平台／数据开发",
            "软件测试／测试开发",
            "数字化／IT项目",
            "售后／技术支持",
            "产品经理／产品助理",
            "项目经理／项目助理",
            "大客户销售／ToB销售",
            "商务拓展／BD",
            "营销管培／市场销售",
        )
    )
}


def _text(value: object) -> str:
    return "" if value is None else str(value).strip()


def _identity(company: str, title: str) -> str:
    normalized = "".join(f"{company}||{title}".split()).casefold()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:24]


def _identity_tuple(company: str, title: str) -> tuple[str, str]:
    return (
        "".join(company.split()).casefold(),
        "".join(title.split()).casefold(),
    )


def _is_instruction_row(row: dict[str, str]) -> bool:
    company = _text(row.get("公司名称"))
    title = _text(row.get("招聘岗位"))
    return (
        not company
        or not title
        or "使用说明" in company
        or company.startswith("☝")
        or "每天晚上12点" in title
        or "工作日持续更新" in title
    )


def _clean_industry(value: str) -> str:
    parts = [part.strip() for part in value.split(",")]
    return ", ".join(part for part in parts if part and "婉清学姐" not in part)


def _role_text(row: dict[str, str]) -> str:
    """Remove a duplicated profession suffix from the role text when possible."""
    title = _text(row.get("招聘岗位"))
    profession = _text(row.get("专业要求"))
    if profession and profession != "/" and len(profession) >= 8:
        index = title.find(profession)
        if index > 0:
            return title[:index].rstrip(" ,，、;；:：")
    return title


def _parse_deadline(value: str) -> date | None:
    match = DATE_PATTERN.match(value)
    if not match:
        return None
    try:
        return date(*(int(part) for part in match.groups()))
    except ValueError:
        return None


def _is_eligible(row: dict[str, str], as_of: date) -> tuple[bool, str]:
    cohort = _text(row.get("届次"))
    education = _text(row.get("学历要求"))
    deadline = _parse_deadline(_text(row.get("截止时间")))
    if not ("2027" in cohort or "应届" in cohort or "不限" in cohort):
        return False, "届次不含2027届/应届/不限"
    if not ("本科" in education or "不限" in education):
        return False, "学历不允许本科"
    if deadline and deadline < as_of:
        return False, "已过明确截止日期"
    return True, ""


def _major_compatible(row: dict[str, str], rule: DirectionRule) -> bool:
    requirement = _text(row.get("专业要求"))
    if not requirement or requirement == "/":
        return True
    pattern = TECH_MAJOR_PATTERN if rule.technical else BUSINESS_MAJOR_PATTERN
    return bool(pattern.search(requirement))


def _matched_directions(row: dict[str, str]) -> list[DirectionRule]:
    role_text = _role_text(row)
    match_text = EXCLUDED_TECH_PHRASE_PATTERN.sub(" ", role_text)
    matches: list[DirectionRule] = []
    for rule in DIRECTION_RULES:
        if any(re.search(pattern, match_text, re.IGNORECASE) for pattern in rule.patterns):
            if _major_compatible(row, rule):
                matches.append(rule)
    if MECHANICAL_AFTERSALES_PATTERN.search(role_text):
        matches = [rule for rule in matches if rule.name != "售后／技术支持"]
    matches.sort(key=lambda rule: DIRECTION_PRIORITY.get(rule.name, len(DIRECTION_PRIORITY)))
    return matches


def _is_core(row: dict[str, str], rule: DirectionRule, match_count: int) -> bool:
    role_text = _role_text(row)
    separators = len(MULTI_ROLE_PATTERN.findall(role_text))
    role_tokens = len(ROLE_TOKEN_PATTERN.findall(role_text))
    core_pattern = CORE_PATTERNS.get(rule.name)
    return (
        core_pattern is not None
        and re.search(core_pattern, role_text, re.IGNORECASE) is not None
        and len(role_text) <= 70
        and separators <= 2
        and role_tokens <= 2
        and match_count <= 2
    )


def _source_risk(row: dict[str, str]) -> str:
    parts: list[str] = []
    deadline = _text(row.get("截止时间"))
    profession = _text(row.get("专业要求"))
    exam = _text(row.get("是否笔试"))
    if deadline:
        parts.append(f"截止时间：{deadline}")
    if profession and profession != "/":
        compact = re.sub(r"\s+", " ", profession)
        if len(compact) > 180:
            compact = compact[:177] + "…"
        parts.append(f"专业要求需核对：{compact}")
    if exam and exam not in {"/", "未知"}:
        parts.append(f"笔试：{exam}")
    return "；".join(parts)


def _progress_mapping(row_number: int, row: dict[str, str], matches: list[DirectionRule]) -> dict:
    company = _text(row.get("公司名称"))
    title = _text(row.get("招聘岗位"))
    primary = matches[0]
    risks = [primary.risk]
    if len(_role_text(row)) > 120 or len(MULTI_ROLE_PATTERN.findall(_role_text(row))) > 4:
        risks.append("该记录包含多个岗位，进入官网后只选择与推荐方向匹配的具体岗位。")
    source_risk = _source_risk(row)
    if source_risk:
        risks.append(source_risk)
    return {
        "source_key": f"progress:{_identity(company, title)}",
        "collection": "progress",
        "source_sheet": SOURCE_SHEET,
        "source_row": row_number,
        "recommendation_level": "核心推荐" if _is_core(row, primary, len(matches)) else "可投递",
        "target_direction": primary.name,
        "other_directions": "；".join(rule.name for rule in matches[1:]),
        "company": company,
        "job_title": title,
        "company_type": _text(row.get("企业性质")),
        "industry": _clean_industry(_text(row.get("行业分类"))),
        "city": _text(row.get("工作地点")),
        "cohort": _text(row.get("届次")),
        "education": _text(row.get("学历要求")),
        "updated_date": _text(row.get("更新时间")),
        "match_basis": primary.match_basis,
        "recommended_resume": primary.resume,
        "risk_note": "；".join(risks),
        "announcement_url": _text(row.get("公告链接")),
        "application_url": _text(row.get("投递链接")),
        "source_status": "",
        "personal_note": "",
    }


def _all_mapping(
    row_number: int,
    row: dict[str, str],
    matches: list[DirectionRule] | None = None,
) -> dict:
    company = _text(row.get("公司名称"))
    title = _text(row.get("招聘岗位"))
    matches = matches or []
    primary = matches[0] if matches else None
    risks: list[str] = []
    if primary:
        risks.append(primary.risk)
        if len(_role_text(row)) > 120 or len(MULTI_ROLE_PATTERN.findall(_role_text(row))) > 4:
            risks.append("该记录包含多个岗位，进入官网后只选择与推荐方向匹配的具体岗位。")
    source_risk = _source_risk(row)
    if source_risk:
        risks.append(source_risk)
    return {
        "source_key": f"all:incremental:{_identity(company, title)}",
        "collection": "all",
        "source_sheet": SOURCE_SHEET,
        "source_row": row_number,
        "recommendation_level": "总库",
        "target_direction": primary.name if primary else "",
        "other_directions": "；".join(rule.name for rule in matches[1:]),
        "company": company,
        "job_title": title,
        "company_type": _text(row.get("企业性质")),
        "industry": _clean_industry(_text(row.get("行业分类"))),
        "city": _text(row.get("工作地点")),
        "cohort": _text(row.get("届次")),
        "education": _text(row.get("学历要求")),
        "updated_date": _text(row.get("更新时间")),
        "match_basis": primary.match_basis if primary else "",
        "recommended_resume": primary.resume if primary else "",
        "risk_note": "；".join(risks),
        "announcement_url": _text(row.get("公告链接")),
        "application_url": _text(row.get("投递链接")),
        "source_status": "",
        "personal_note": "",
    }


def _read_rows(path: Path) -> Iterable[tuple[int, dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"公司名称", "招聘岗位", "届次", "学历要求"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV缺少必要字段：{', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, start=2):
            normalized = {key: _text(value) for key, value in row.items() if key}
            if not _is_instruction_row(normalized):
                yield row_number, normalized


def _preview_examples(entries: list[dict], limit: int = 30) -> list[dict]:
    ordered = sorted(
        entries,
        key=lambda item: (item["recommendation_level"] != "核心推荐", item["target_direction"], item["company"]),
    )
    return [
        {
            "推荐等级": item["recommendation_level"],
            "方向": item["target_direction"],
            "公司": item["company"],
            "岗位": item["job_title"],
        }
        for item in ordered[:limit]
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="将新CSV中的增量岗位导入岗位总库，并筛选个人可投岗位")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--commit", action="store_true", help="实际写入数据库；默认只预览")
    parser.add_argument(
        "--as-of",
        type=lambda value: datetime.strptime(value, "%Y-%m-%d").date(),
        default=date.today(),
        help="筛选截止日期基准，格式YYYY-MM-DD",
    )
    args = parser.parse_args()

    if not args.csv_path.is_file():
        raise FileNotFoundError(args.csv_path)

    init_db()
    db = SessionLocal()
    try:
        existing_all = {
            _identity_tuple(company, title)
            for company, title in db.query(JobLibraryEntry.company, JobLibraryEntry.job_title)
            .filter(JobLibraryEntry.collection == "all")
            .all()
        }
        existing_progress_keys = {
            key
            for (key,) in db.query(JobLibraryEntry.source_key)
            .filter(JobLibraryEntry.collection == "progress")
            .all()
        }

        seen: set[tuple[str, str]] = set()
        new_rows: list[tuple[int, dict[str, str]]] = []
        duplicate_existing = 0
        duplicate_source = 0
        for row_number, row in _read_rows(args.csv_path):
            identity = _identity_tuple(row["公司名称"], row["招聘岗位"])
            if identity in existing_all:
                duplicate_existing += 1
                continue
            if identity in seen:
                duplicate_source += 1
                continue
            seen.add(identity)
            new_rows.append((row_number, row))

        all_entries: list[dict] = []
        progress_entries: list[dict] = []
        rejected = Counter()
        for row_number, row in new_rows:
            eligible, reason = _is_eligible(row, args.as_of)
            if not eligible:
                rejected[reason] += 1
                all_entries.append(_all_mapping(row_number, row))
                continue
            matches = _matched_directions(row)
            if not matches:
                rejected["未命中目标方向或专业不匹配"] += 1
                all_entries.append(_all_mapping(row_number, row))
                continue
            all_entries.append(_all_mapping(row_number, row, matches))
            entry = _progress_mapping(row_number, row, matches)
            if entry["source_key"] in existing_progress_keys:
                rejected["已在个人岗位池"] += 1
                continue
            progress_entries.append(entry)

        if args.commit:
            for start in range(0, len(all_entries), 500):
                db.bulk_insert_mappings(JobLibraryEntry, all_entries[start : start + 500])
            for start in range(0, len(progress_entries), 500):
                db.bulk_insert_mappings(JobLibraryEntry, progress_entries[start : start + 500])
            db.commit()

        result = {
            "mode": "commit" if args.commit else "preview",
            "as_of": args.as_of.isoformat(),
            "source": str(args.csv_path.resolve()),
            "duplicates_already_in_library": duplicate_existing,
            "duplicates_inside_source": duplicate_source,
            "new_all_jobs": len(all_entries),
            "new_suitable_jobs": len(progress_entries),
            "core_recommended": sum(item["recommendation_level"] == "核心推荐" for item in progress_entries),
            "applicable": sum(item["recommendation_level"] == "可投递" for item in progress_entries),
            "directions": dict(Counter(item["target_direction"] for item in progress_entries).most_common()),
            "rejected": dict(rejected.most_common()),
            "examples": _preview_examples(progress_entries),
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
