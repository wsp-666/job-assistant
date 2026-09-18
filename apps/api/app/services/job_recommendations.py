import json
import re
from typing import Any

from app.schemas.schemas import JobCreate, JobRecommendationsOut
from app.services.greeting_generator import _build_job_block, _build_resume_summary
from app.services.llm_client import LLMError, chat_completion

SYSTEM_PROMPT = """你是资深求职顾问。根据候选人简历与岗位 JD，输出沟通建议。
必须严格输出 JSON，不要 markdown 代码块，不要其他说明。格式：
{
  "chat_tips": ["聊天注意事项1", "注意事项2", "注意事项3"],
  "focus_skills": ["应重点展示的技能1", "技能2", "技能3"],
  "pros": ["岗位优点1", "优点2"],
  "cons": ["岗位风险或不足1", "不足2"]
}
每项 2-4 条，每条 15-40 字，结合简历与 JD 具体分析，禁止空泛套话。"""


def _parse_json_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _as_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


def _fallback_recommendations(job: JobCreate, resume_data: dict[str, Any]) -> JobRecommendationsOut:
    skills = resume_data.get("skills", [])[:3]
    skill_text = "、".join(skills) if skills else "与岗位相关的核心技能"
    return JobRecommendationsOut(
        chat_tips=[
            "先确认岗位是否仍在招聘，避免对已关闭岗位发消息",
            "打招呼语突出 1-2 项与 JD 直接相关的经历，勿堆砌技能清单",
            f"若 HR 回复，可主动询问团队规模、工作节奏与试用期考核方式",
        ],
        focus_skills=[
            f"重点准备：{skill_text}",
            "对照 JD 职责，准备 1 个能体现解决问题能力的项目案例",
            "了解公司业务方向，沟通时体现对岗位场景的理解",
        ],
        pros=[
            f"岗位「{job.job_title}」与简历方向有一定匹配，可尝试沟通",
            f"公司 {job.company}，可进一步了解团队与发展空间" if job.company else "可借此了解行业与团队情况",
        ],
        cons=[
            "JD 信息有限时，薪资、加班与晋升需面试或沟通中进一步确认",
            "竞争情况未知，建议同步投递其他匹配岗位",
        ],
    )


async def generate_job_recommendations(
    job: JobCreate,
    resume_data: dict[str, Any],
    analysis_profile: dict[str, Any] | None = None,
) -> JobRecommendationsOut:
    user_prompt = f"""【候选人简历摘要】
{_build_resume_summary(resume_data)}

【目标岗位】
{_build_job_block(job)}

请输出 JSON。"""

    try:
        raw = await chat_completion(SYSTEM_PROMPT, user_prompt, analysis_profile)
        data = _parse_json_response(raw)
        return JobRecommendationsOut(
            chat_tips=_as_list(data.get("chat_tips"))[:5],
            focus_skills=_as_list(data.get("focus_skills"))[:5],
            pros=_as_list(data.get("pros"))[:5],
            cons=_as_list(data.get("cons"))[:5],
        )
    except (LLMError, json.JSONDecodeError, KeyError, TypeError):
        return _fallback_recommendations(job, resume_data)
