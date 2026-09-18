import json
import re
from typing import Any

from app.schemas.schemas import JobCreate
from app.services.api_profiles import get_active_profile
from app.services.llm_client import LLMError, chat_completion
from app.services.matcher import MatchResult

SYSTEM_PROMPT = """你是资深求职顾问，负责评估招聘岗位与候选人的匹配程度。
请客观、务实打分。若 JD 为空、过短（不足 80 字）或缺少岗位职责/任职要求等实质介绍，三项分数均不得超过 25。
岗位名称与目标方向一致但 JD 信息不足时，也不得给高分。

必须只输出 JSON，不要 markdown，不要解释。格式：
{
  "role_match_score": 0到100的整数,
  "benefits_match_score": 0到100的整数,
  "company_match_score": 0到100的整数,
  "brief_reason": "一句话说明"
}

打分含义：
1. role_match_score（职责匹配）：岗位名称、JD 职责、技能要求 vs 候选人目标岗位与简历经历；无有效 JD 时 ≤25
2. benefits_match_score（待遇匹配）：薪资、城市、福利、岗位性质 vs 候选人期望；标注为「不限」的项不要扣分
3. company_match_score（公司匹配）：公司规模、行业 vs 候选人偏好；未设置偏好或标注「不限」时给中性分（55-70）"""


def _parse_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _clamp_score(value: Any) -> float:
    try:
        n = float(value)
        return round(max(0.0, min(100.0, n)), 1)
    except (TypeError, ValueError):
        return 0.0


def _resume_block(resume_data: dict[str, Any]) -> str:
    if not resume_data:
        return "（暂无简历）"
    skills = ", ".join(resume_data.get("skills", [])[:20]) or "未识别"
    parts = [
        f"技能：{skills}",
        f"经历摘要：{(resume_data.get('experience') or '')[:600]}",
        f"项目摘要：{(resume_data.get('projects') or '')[:600]}",
        f"自我评价：{(resume_data.get('summary') or '')[:300]}",
    ]
    return "\n".join(parts)


def _format_salary_expectation(pos: dict[str, Any]) -> str:
    parts: list[str] = []
    if pos.get("salary_type_monthly", True):
        if pos.get("min_salary_unlimited") and pos.get("max_salary_unlimited"):
            parts.append("月薪不限")
        else:
            low = "不限" if pos.get("min_salary_unlimited") else f"{pos.get('min_salary', 0)}K"
            high = "不限" if pos.get("max_salary_unlimited") else f"{pos.get('max_salary', 0)}K"
            parts.append(f"月薪 {low}~{high}")
    if pos.get("salary_type_daily"):
        if pos.get("min_daily_salary_unlimited") and pos.get("max_daily_salary_unlimited"):
            parts.append("日薪不限")
        else:
            low = "不限" if pos.get("min_daily_salary_unlimited") else str(pos.get("min_daily_salary", 0))
            high = "不限" if pos.get("max_daily_salary_unlimited") else str(pos.get("max_daily_salary", 0))
            parts.append(f"日薪 {low}~{high}元/天")
    return "；".join(parts) if parts else "薪资不限"


def _format_position_block(pos: dict[str, Any], index: int) -> str:
    cities_unlimited = pos.get("cities_unlimited")
    if cities_unlimited is None:
        cities_unlimited = len(pos.get("cities", [])) == 0
    sizes_unlimited = pos.get("company_sizes_unlimited")
    if sizes_unlimited is None:
        sizes_unlimited = len(pos.get("preferred_company_sizes", [])) == 0

    aliases = pos.get("title_aliases") or []
    alias_text = "、".join(aliases) if aliases else "无"
    keywords = "、".join(pos.get("keywords") or []) or "无"
    cities = "不限" if cities_unlimited else ("、".join(pos.get("cities") or []) or "未指定")
    sizes = "不限" if sizes_unlimited else ("、".join(pos.get("preferred_company_sizes") or []) or "未指定")
    industries = "、".join(pos.get("preferred_industries") or []) or "不限"
    outlook = "、".join(pos.get("outlook_industries") or []) or "不限"
    job_types = "、".join(pos.get("job_types") or []) or "不限"

    benefits: list[str] = []
    if pos.get("weekend_rest") == "double_rest":
        benefits.append("期望双休")
    if pos.get("require_social_insurance"):
        benefits.append("期望五险一金")
    if pos.get("want_year_end_bonus"):
        benefits.append("期望年终奖")
    if pos.get("want_commission"):
        benefits.append("期望提成")
    if pos.get("want_meal_allowance"):
        benefits.append("期望餐补")
    if pos.get("want_accommodation"):
        benefits.append("期望包住宿")
    benefit_text = "；".join(benefits) if benefits else "无特殊硬性要求"

    return f"""【目标岗位 {index}】{pos.get('title', '')}
同类名称：{alias_text}
匹配关键词：{keywords}
简介：{pos.get('summary', '') or '无'}
期望工作内容：{pos.get('details', '') or '无'}
目标城市：{cities}
薪资期望：{_format_salary_expectation(pos)}
岗位性质：{job_types}
待遇偏好：{benefit_text}
期望公司规模：{sizes}
期望行业：{industries}
行业前景偏好：{outlook}"""


def _job_block(job: JobCreate) -> str:
    return f"""【招聘岗位】
岗位名称：{job.job_title}
公司：{job.company}
城市：{job.city}
薪资：{job.salary or '面议'}
公司规模：{job.company_size or '未注明'}
行业：{job.company_industry or '未注明'}
JD：
{(job.jd_text or '无')[:3500]}"""


def _build_user_prompt(
    job: JobCreate,
    resume_data: dict[str, Any],
    settings: dict[str, Any],
) -> str:
    positions = settings.get("target_positions", [])
    if positions:
        pos_text = "\n\n".join(_format_position_block(p, i + 1) for i, p in enumerate(positions))
        pos_intro = f"候选人有 {len(positions)} 个目标岗位（按优先级排序），请综合判断与哪一个最匹配并打分。"
    else:
        titles = settings.get("target_titles") or []
        pos_text = f"目标岗位名称：{'、'.join(titles) if titles else '未设置'}"
        pos_intro = "候选人目标岗位信息较少，请主要依据岗位名称与 JD 判断。"

    return f"""{pos_intro}

{pos_text}

【候选人简历】
{_resume_block(resume_data)}

{_job_block(job)}

请输出 JSON。"""


def _jd_quality(job: JobCreate) -> tuple[bool, str]:
    jd = (job.jd_text or "").strip()
    if len(jd) < 80:
        return False, "JD过短"
    keywords = ["岗位职责", "职位描述", "任职要求", "工作职责", "岗位描述", "岗位要求", "工作内容", "任职资格"]
    if not any(k in jd for k in keywords):
        return False, "缺少岗位介绍"
    junk = ["立即沟通", "职位收藏", "推荐职位"]
    if sum(1 for m in junk if m in jd) >= 2:
        return False, "JD疑似列表页噪声"
    return True, ""


async def compute_ai_match_result(
    job: JobCreate,
    resume_data: dict[str, Any],
    settings: dict[str, Any],
    analysis_profile: dict[str, Any] | None = None,
) -> MatchResult:
    raw = await chat_completion(
        SYSTEM_PROMPT,
        _build_user_prompt(job, resume_data, settings),
        analysis_profile,
        temperature=0.2,
        max_tokens=400,
    )
    data = _parse_json(raw)
    role = _clamp_score(data.get("role_match_score"))
    benefits = _clamp_score(data.get("benefits_match_score"))
    company = _clamp_score(data.get("company_match_score"))
    combined = round((role + benefits + company) / 3, 1)
    return MatchResult(
        role_match_score=role,
        benefits_match_score=benefits,
        company_match_score=company,
        match_score=combined,
    )


async def compute_match_result(
    job: JobCreate,
    resume_data: dict[str, Any],
    settings: dict[str, Any],
    db: Any = None,
) -> MatchResult:
    ok, _reason = _jd_quality(job)
    if not ok:
        return MatchResult(
            role_match_score=0.0,
            benefits_match_score=0.0,
            company_match_score=0.0,
            match_score=0.0,
        )
    profile = get_active_profile(db, "analysis") if db is not None else None
    return await compute_ai_match_result(job, resume_data, settings, profile)
