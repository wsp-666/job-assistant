import json
import re
from typing import Any

from app.schemas.schemas import JobCreate
from app.services.api_profiles import get_active_profile
from app.services.greeting_generator import _build_job_block, _build_resume_summary
from app.services.llm_client import LLMError, chat_completion


async def tailor_resume_for_job(
    resume_data: dict[str, Any],
    job: JobCreate,
    db,
) -> dict[str, Any]:
    profile = get_active_profile(db, "analysis")
    system_prompt = (
        "你是资深求职顾问。根据候选人真实简历与目标岗位 JD，输出「定向改写」版简历 JSON。"
        "要求：突出与 JD 匹配的经历与技能，调整 summary 与项目描述措辞，禁止编造不存在的内容。"
        "字段：full_name, summary, education, experience, projects, skills(数组)。"
        "只输出 JSON，不要 markdown。"
    )
    user_prompt = f"""请针对以下岗位改写简历（在真实经历范围内强化匹配度）：

【目标岗位】
{_build_job_block(job)}

【候选人原始简历】
{_build_resume_summary(resume_data)}
"""
    try:
        raw = await chat_completion(
            system_prompt,
            user_prompt,
            profile=profile,
            temperature=0.45,
            max_tokens=2500,
        )
    except LLMError:
        raise

    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise LLMError("AI 返回格式无法解析，请稍后重试")
    try:
        improved = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise LLMError("AI 返回 JSON 无效") from exc

    merged = dict(resume_data)
    for key in ("full_name", "summary", "education", "experience", "projects", "skills"):
        if key in improved and improved[key]:
            merged[key] = improved[key]
    merged["tailored_for"] = {
        "job_title": job.job_title,
        "company": job.company,
    }
    merged["tailored"] = True
    return merged
