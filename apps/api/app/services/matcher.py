import json
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import AppSetting, Resume
from app.schemas.schemas import JobCreate


DEFAULT_SETTINGS = {
    "target_titles": [],
    "target_positions": [],
    "cities": [],
    "min_salary": 0,
    "max_salary": 0,
    "min_salary_unlimited": True,
    "max_salary_unlimited": True,
    "include_keywords": [],
    "exclude_keywords": [],
    "greeting_style": "简洁",
    "daily_limit": 30,
}

POSITION_DEFAULTS: dict[str, Any] = {
    "cities": [],
    "min_salary": 0,
    "max_salary": 0,
    "min_salary_unlimited": True,
    "max_salary_unlimited": True,
    "salary_type_monthly": True,
    "salary_type_daily": False,
    "min_daily_salary": 0,
    "max_daily_salary": 0,
    "min_daily_salary_unlimited": True,
    "max_daily_salary_unlimited": True,
    "job_types": [],
    "weekend_rest": "any",
    "require_social_insurance": False,
    "want_year_end_bonus": False,
    "want_commission": False,
    "want_meal_allowance": False,
    "want_accommodation": False,
    "preferred_company_sizes": [],
    "preferred_industries": [],
    "outlook_industries": [],
    "include_keywords": [],
    "exclude_keywords": [],
    "greeting_style": "简洁",
    "daily_limit": 30,
}

JOB_TYPE_KEYWORDS: dict[str, list[str]] = {
    "全职": ["全职", "正式员工"],
    "实习": ["实习", "实习生", "intern"],
    "兼职": ["兼职", "小时工"],
    "校招": ["校招", "应届", "毕业生"],
}


@dataclass
class MatchResult:
    role_match_score: float
    benefits_match_score: float
    company_match_score: float
    match_score: float


def _normalize_position(pos: dict[str, Any], global_data: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "id": pos.get("id", ""),
        "title": pos.get("title", ""),
        "title_aliases": pos.get("title_aliases") or [],
        "summary": pos.get("summary", ""),
        "details": pos.get("details", ""),
        "keywords": pos.get("keywords") or [],
        **POSITION_DEFAULTS,
    }
    merged.update({k: v for k, v in pos.items() if k in merged or k in POSITION_DEFAULTS})
    if not pos.get("cities") and global_data.get("cities"):
        merged["cities"] = list(global_data["cities"])
    if "min_salary_unlimited" not in pos and global_data.get("min_salary_unlimited") is not None:
        merged["min_salary_unlimited"] = global_data.get("min_salary_unlimited", True)
        merged["min_salary"] = global_data.get("min_salary", 0)
    if "max_salary_unlimited" not in pos and global_data.get("max_salary_unlimited") is not None:
        merged["max_salary_unlimited"] = global_data.get("max_salary_unlimited", True)
        merged["max_salary"] = global_data.get("max_salary", 0)
    if not pos.get("include_keywords") and global_data.get("include_keywords"):
        merged["include_keywords"] = list(global_data["include_keywords"])
    if not pos.get("exclude_keywords") and global_data.get("exclude_keywords"):
        merged["exclude_keywords"] = list(global_data["exclude_keywords"])
    if pos.get("greeting_style") is None and global_data.get("greeting_style"):
        merged["greeting_style"] = global_data["greeting_style"]
    if pos.get("daily_limit") is None and global_data.get("daily_limit"):
        merged["daily_limit"] = global_data["daily_limit"]
    return merged


def _normalize_settings(data: dict[str, Any]) -> dict[str, Any]:
    merged = dict(DEFAULT_SETTINGS)
    merged.update(data)
    if "min_salary_unlimited" not in data:
        merged["min_salary_unlimited"] = merged.get("min_salary", 0) <= 0
    if "max_salary_unlimited" not in data:
        merged["max_salary_unlimited"] = merged.get("max_salary", 0) <= 0
    if not merged.get("target_positions") and merged.get("target_titles"):
        merged["target_positions"] = [
            _normalize_position(
                {
                    "id": f"legacy-{i}",
                    "title": title,
                    "summary": "",
                    "details": "",
                    "keywords": [],
                },
                merged,
            )
            for i, title in enumerate(merged["target_titles"])
        ]
    elif merged.get("target_positions"):
        merged["target_positions"] = [
            _normalize_position(p, merged) for p in merged["target_positions"]
        ]
        merged["target_titles"] = [
            p.get("title", "") for p in merged["target_positions"] if p.get("title")
        ]
    return merged


def _parse_salary_k(salary_text: str) -> tuple[int, int]:
    if not salary_text:
        return 0, 0
    nums = [int(n) for n in re.findall(r"(\d+)", salary_text)]
    if not nums:
        return 0, 0
    if len(nums) >= 2:
        return nums[0], nums[1]
    return nums[0], nums[0]


def _parse_daily_salary(salary_text: str, jd_text: str) -> tuple[int, int]:
    combined = f"{salary_text} {jd_text}"
    range_m = re.search(r"(\d+)\s*[-~至]\s*(\d+)\s*元\s*/?\s*天", combined)
    if range_m:
        return int(range_m.group(1)), int(range_m.group(2))
    single_m = re.search(r"(\d+)\s*元\s*/?\s*天", combined)
    if single_m:
        n = int(single_m.group(1))
        return n, n
    return 0, 0


def _job_text_blob(job: JobCreate) -> str:
    return (
        f"{job.job_title} {job.salary} {job.jd_text} {job.city} "
        f"{job.company} {job.company_size} {job.company_industry}"
    ).lower()


def _extract_company_size(text: str) -> str:
    patterns = [
        r"(\d+)\s*[-~至]\s*(\d+)\s*人",
        r"(\d{4,})\s*人\s*以上",
        r"(\d+)\s*人\s*以上",
        r"(\d+)\s*人",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(0)
    return ""


def _size_bucket_match(job_size: str, preferred: list[str]) -> float:
    if not preferred:
        return 0.0
    if not job_size:
        return 3.0
    job_size = job_size.replace(" ", "")
    for pref in preferred:
        pref = pref.replace(" ", "")
        if pref in job_size or job_size in pref:
            return 35.0
        job_nums = [int(n) for n in re.findall(r"\d+", job_size)]
        pref_nums = [int(n) for n in re.findall(r"\d+", pref)]
        if job_nums and pref_nums:
            j = max(job_nums)
            p = max(pref_nums)
            if abs(j - p) / max(p, 1) <= 0.5:
                return 22.0
    return 4.0


def _industry_match(blob: str, industry_field: str, keywords: list[str]) -> float:
    if not keywords:
        return 0.0
    hits = sum(
        1
        for kw in keywords
        if kw.strip() and (kw.lower() in blob or kw.lower() in industry_field.lower())
    )
    if hits >= 2:
        return 35.0
    if hits == 1:
        return 24.0
    return 3.0


def _compute_company_score(job: JobCreate, pos: dict[str, Any]) -> float:
    blob = _job_text_blob(job)
    industry_field = job.company_industry or ""
    size_field = job.company_size or _extract_company_size(blob)

    weighted_total = 0.0
    weighted_score = 0.0

    def add(weight: float, points: float) -> None:
        nonlocal weighted_total, weighted_score
        weighted_total += weight
        weighted_score += points

    sizes_unlimited = pos.get("company_sizes_unlimited")
    if sizes_unlimited is None:
        sizes_unlimited = len(pos.get("preferred_company_sizes", [])) == 0
    if not sizes_unlimited:
        sizes = pos.get("preferred_company_sizes", [])
        if sizes:
            add(40, _size_bucket_match(size_field, sizes))

    industries = pos.get("preferred_industries", [])
    if industries:
        add(35, _industry_match(blob, industry_field, industries))

    outlook = pos.get("outlook_industries", [])
    if outlook:
        add(25, _industry_match(blob, industry_field, outlook))

    if weighted_total <= 0:
        return 62.0
    raw = weighted_score / weighted_total * 100
    # 未限定规模/行业时，不因 JD 未写公司信息给极低分
    sizes_unlimited = pos.get("company_sizes_unlimited")
    if sizes_unlimited is None:
        sizes_unlimited = len(pos.get("preferred_company_sizes", [])) == 0
    if sizes_unlimited and not pos.get("preferred_industries") and not pos.get("outlook_industries"):
        return round(max(raw, 58.0), 1)
    return round(max(0.0, min(raw, 100.0)), 1)


def _position_title_terms(pos: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    for key in ("title",):
        val = str(pos.get(key, "")).strip()
        if val:
            terms.append(val)
    for alias in pos.get("title_aliases") or []:
        val = str(alias).strip()
        if val:
            terms.append(val)
    return terms


def _tokenize_cn(text: str) -> set[str]:
    words = set(re.findall(r"[\u4e00-\u9fa5]{2,}", text.lower()))
    words |= {w for w in re.findall(r"[a-zA-Z]{2,}", text.lower())}
    return words


def _strip_title_suffix(text: str) -> str:
    for suffix in ("工程师", "专员", "顾问", "经理", "主管", "总监", "助理", "实习生"):
        if text.endswith(suffix) and len(text) > len(suffix) + 1:
            return text[: -len(suffix)]
    return text


def _term_hits_text(term: str, text: str) -> bool:
    term = term.strip().lower()
    blob = text.lower()
    if not term or not blob:
        return False
    if term in blob:
        return True
    core = _strip_title_suffix(term)
    if len(core) >= 2 and core in blob:
        return True
    return False


def _collect_position_terms(pos: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()

    def add(t: str) -> None:
        t = t.strip()
        if not t:
            return
        key = t.lower()
        if key in seen:
            return
        seen.add(key)
        terms.append(t)

    for t in _position_title_terms(pos):
        add(t)
    for kw in pos.get("keywords") or []:
        add(str(kw))
    for kw in pos.get("include_keywords") or []:
        add(str(kw))
    for chunk in (pos.get("summary", ""), pos.get("details", "")):
        for part in re.split(r"[,，、\s/]+", str(chunk)):
            if len(part.strip()) >= 2:
                add(part.strip())
    return terms


def _position_title_score(job_title: str, jd_text: str, pos: dict[str, Any]) -> float:
    """岗位方向匹配：标题命中优先，其次 JD / 关键词命中。"""
    title_lower = job_title.lower()
    jd_lower = jd_text.lower()
    blob = f"{title_lower} {jd_lower}"

    title_terms = _position_title_terms(pos)
    for term in title_terms:
        t = term.lower()
        if t in title_lower or title_lower in t:
            return 48.0
        core = _strip_title_suffix(t).lower()
        if len(core) >= 2 and core in title_lower:
            return 44.0

    all_terms = _collect_position_terms(pos)
    title_hits = sum(1 for t in all_terms if _term_hits_text(t, job_title))
    jd_hits = sum(1 for t in all_terms if _term_hits_text(t, jd_text))

    if title_hits >= 2:
        return 42.0
    if title_hits == 1:
        return 38.0
    if jd_hits >= 3:
        return 36.0
    if jd_hits >= 2:
        return 32.0
    if jd_hits == 1:
        return 26.0

    for term in title_terms:
        if len(term) >= 2 and _term_hits_text(term, jd_text):
            return 28.0

    return 8.0


def _keyword_score(jd_text: str, resume_skills: list[str], includes: list[str], pos: dict[str, Any]) -> float:
    jd_lower = jd_text.lower()
    score = 0.0
    if resume_skills:
        hits = sum(1 for s in resume_skills if s.lower() in jd_lower)
        score += min(hits * 5, 22)
    if includes:
        hits = sum(1 for k in includes if k.lower() in jd_lower)
        score += min(hits * 4, 16)

    pos_kws = pos.get("keywords") or []
    if pos_kws:
        kw_hits = sum(1 for k in pos_kws if _term_hits_text(str(k), jd_text))
        score += min(kw_hits * 5, 20)

    return min(score, 35.0)


def _overlap_score(jd_text: str, resume_text: str, pos: dict[str, Any]) -> float:
    jd_words = _tokenize_cn(jd_text)
    if not jd_words:
        return 0.0

    if resume_text:
        resume_words = _tokenize_cn(resume_text)
        overlap = len(jd_words & resume_words)
        if overlap >= 8:
            return 18.0
        if overlap >= 4:
            return 12.0
        if overlap >= 2:
            return 7.0

    # 简历为空或很短时：用目标岗位关键词与 JD 重合度兜底，避免一律低分
    pos_terms = _collect_position_terms(pos)
    if pos_terms:
        hits = sum(1 for t in pos_terms if _term_hits_text(t, jd_text))
        if hits >= 4:
            return 14.0
        if hits >= 2:
            return 10.0
        if hits >= 1:
            return 6.0
    return 0.0


def _exclude_penalty(jd_text: str, job_title: str, excludes: list[str]) -> float:
    text = f"{job_title} {jd_text}".lower()
    penalty = 0.0
    for word in excludes:
        if word.lower() in text:
            penalty += 15
    return penalty


def _job_type_score(text: str, job_types: list[str]) -> float | None:
    if not job_types:
        return None
    for jt in job_types:
        for kw in JOB_TYPE_KEYWORDS.get(jt, [jt]):
            if kw.lower() in text:
                return 10.0
    return 2.0


def _compute_role_score(
    job: JobCreate,
    resume_data: dict[str, Any],
    pos: dict[str, Any],
) -> float:
    skills = resume_data.get("skills", [])
    resume_text = resume_data.get("raw_text", "").lower()
    title_score = _position_title_score(job.job_title, job.jd_text, pos)
    kw_score = _keyword_score(job.jd_text, skills, pos.get("include_keywords", []), pos)
    overlap = _overlap_score(job.jd_text, resume_text, pos)
    text = _job_text_blob(job)
    jt = _job_type_score(text, pos.get("job_types", []))
    jt_bonus = jt if jt is not None else 0.0

    score = title_score * 0.55 + kw_score * 0.25 + overlap * 0.15 + jt_bonus
    score -= _exclude_penalty(job.jd_text, job.job_title, pos.get("exclude_keywords", []))

    # 岗位方向已明显命中时，职责分不低于 52，避免「售前岗只给 30 分」
    direction_hits = sum(
        1 for t in _collect_position_terms(pos) if _term_hits_text(t, f"{job.job_title} {job.jd_text}")
    )
    if direction_hits >= 2 and title_score >= 26:
        score = max(score, 52.0)
    if direction_hits >= 3 and title_score >= 32:
        score = max(score, 62.0)
    if title_score >= 42:
        score = max(score, 68.0)

    return round(max(0.0, min(score, 100.0)), 1)


def _monthly_salary_fit(
    salary_text: str,
    min_salary: int,
    max_salary: int,
    min_unlimited: bool,
    max_unlimited: bool,
) -> float:
    low, high = _parse_salary_k(salary_text)
    if low == 0 and high == 0:
        return 6.0
    if min_unlimited and max_unlimited:
        return 12.0
    if not max_unlimited and max_salary > 0 and low > max_salary:
        return 0.0
    if not min_unlimited and min_salary > 0 and high < min_salary:
        return 2.0
    return 15.0


def _daily_salary_fit(
    salary_text: str,
    jd_text: str,
    min_daily: int,
    max_daily: int,
    min_unlimited: bool,
    max_unlimited: bool,
) -> float:
    low, high = _parse_daily_salary(salary_text, jd_text)
    if low == 0 and high == 0:
        return 6.0
    if min_unlimited and max_unlimited:
        return 12.0
    if not max_unlimited and max_daily > 0 and low > max_daily:
        return 0.0
    if not min_unlimited and min_daily > 0 and high < min_daily:
        return 2.0
    return 15.0


def _benefit_hit(text: str, keywords: list[str]) -> bool:
    return any(k.lower() in text for k in keywords)


def _benefits_mostly_open(pos: dict[str, Any]) -> bool:
    cities_unlimited = pos.get("cities_unlimited")
    if cities_unlimited is None:
        cities_unlimited = len(pos.get("cities", [])) == 0
    salary_open = pos.get("min_salary_unlimited", True) and pos.get("max_salary_unlimited", True)
    daily_open = not pos.get("salary_type_daily") or (
        pos.get("min_daily_salary_unlimited", True) and pos.get("max_daily_salary_unlimited", True)
    )
    return bool(cities_unlimited and salary_open and daily_open)


def _compute_benefits_score(job: JobCreate, pos: dict[str, Any]) -> float:
    text = _job_text_blob(job)

    # 条件大多「不限」时：以中性偏高为底，只对明确不符项扣分
    if _benefits_mostly_open(pos) and pos.get("weekend_rest", "any") != "double_rest":
        if not pos.get("require_social_insurance") and not any(
            pos.get(k) for k in ("want_year_end_bonus", "want_commission", "want_meal_allowance", "want_accommodation")
        ):
            score = 72.0
            if pos.get("job_types"):
                jt = _job_type_score(text, pos.get("job_types", []))
                if jt is not None and jt <= 2:
                    score -= 8
            return round(max(35.0, min(score, 100.0)), 1)

    weighted_total = 0.0
    weighted_score = 0.0

    def add(weight: float, points: float) -> None:
        nonlocal weighted_total, weighted_score
        weighted_total += weight
        weighted_score += points

    cities_unlimited = pos.get("cities_unlimited")
    if cities_unlimited is None:
        cities_unlimited = len(pos.get("cities", [])) == 0
    if not cities_unlimited:
        cities = pos.get("cities", [])
        if cities:
            add(12, 14.0 if any(c in job.city for c in cities) else 5.0)

    if pos.get("salary_type_monthly", True):
        fit = _monthly_salary_fit(
            job.salary,
            pos.get("min_salary", 0),
            pos.get("max_salary", 0),
            pos.get("min_salary_unlimited", True),
            pos.get("max_salary_unlimited", True),
        )
        add(18, max(fit, 8.0) if pos.get("min_salary_unlimited") and pos.get("max_salary_unlimited") else fit)

    if pos.get("salary_type_daily"):
        fit = _daily_salary_fit(
            job.salary,
            job.jd_text,
            pos.get("min_daily_salary", 0),
            pos.get("max_daily_salary", 0),
            pos.get("min_daily_salary_unlimited", True),
            pos.get("max_daily_salary_unlimited", True),
        )
        add(18, max(fit, 8.0) if pos.get("min_daily_salary_unlimited") and pos.get("max_daily_salary_unlimited") else fit)

    weekend = pos.get("weekend_rest", "any")
    if weekend == "double_rest":
        add(14, 16.0 if _benefit_hit(text, ["双休", "做五休二", "周末双休", "休息日"]) else 6.0)
        if _benefit_hit(text, ["单休", "大小周", "六天工作制"]):
            weighted_score -= 6

    if pos.get("require_social_insurance"):
        if _benefit_hit(text, ["五险一金", "五险一金", "社保公积金"]):
            add(14, 16.0)
        elif _benefit_hit(text, ["五险", "社保", "公积金"]):
            add(14, 11.0)
        else:
            add(14, 5.0)

    benefit_prefs = [
        ("want_year_end_bonus", ["年终奖", "年终奖金", "13薪", "14薪", "年终"]),
        ("want_commission", ["提成", "绩效奖金", "底薪+提成", "高提成"]),
        ("want_meal_allowance", ["餐补", "食堂", "包餐", "餐饮补贴", "免费午餐"]),
        ("want_accommodation", ["包住宿", "包住", "住宿", "宿舍", "提供住宿", "包宿"]),
    ]
    for field, keywords in benefit_prefs:
        if pos.get(field):
            add(8, 10.0 if _benefit_hit(text, keywords) else 5.0)

    if weighted_total <= 0:
        return 68.0
    raw = weighted_score / weighted_total * 100
    return round(max(0.0, min(max(raw, 45.0), 100.0)), 1)


def _compute_for_position(
    job: JobCreate,
    resume_data: dict[str, Any],
    pos: dict[str, Any],
) -> MatchResult:
    role = _compute_role_score(job, resume_data, pos)
    benefits = _compute_benefits_score(job, pos)
    company = _compute_company_score(job, pos)
    combined = round((role + benefits + company) / 3, 1)
    return MatchResult(
        role_match_score=role,
        benefits_match_score=benefits,
        company_match_score=company,
        match_score=combined,
    )


def get_user_settings(db: Session) -> dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == "user").first()
    if not row:
        return dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(row.value_json)
        return _normalize_settings(data)
    except json.JSONDecodeError:
        return dict(DEFAULT_SETTINGS)


def get_default_resume_data(db: Session) -> dict[str, Any]:
    resume = db.query(Resume).filter(Resume.is_default == True).first()  # noqa: E712
    if not resume:
        resume = db.query(Resume).order_by(Resume.created_at.desc()).first()
    if not resume:
        return {}
    try:
        return json.loads(resume.parsed_json)
    except json.JSONDecodeError:
        return {}
