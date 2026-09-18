import json
import re
from typing import Any

from app.services.api_profiles import get_active_profile
from app.services.llm_client import LLMError, chat_completion


async def optimize_resume_content(content: dict[str, Any], db) -> dict[str, Any]:
    profile = get_active_profile(db, "analysis")
    payload = {
        "full_name": content.get("full_name", ""),
        "summary": content.get("summary", ""),
        "education": content.get("education", ""),
        "experience": content.get("experience", ""),
        "projects": content.get("projects", ""),
        "skills": content.get("skills", []),
    }
    system_prompt = (
        "你是资深求职顾问与简历优化专家。根据用户提供的简历内容，输出优化后的 JSON，"
        "保持真实不编造经历。字段：full_name, summary, education, experience, projects, skills(数组)。"
        "语言简洁专业，量化成果，适合中国大陆求职场景。只输出 JSON，不要 markdown。"
    )
    user_prompt = f"请优化以下简历内容：\n{json.dumps(payload, ensure_ascii=False)}"
    try:
        raw = await chat_completion(
            system_prompt,
            user_prompt,
            profile=profile,
            temperature=0.4,
            max_tokens=2000,
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

    merged = dict(content)
    for key in ("full_name", "summary", "education", "experience", "projects", "skills"):
        if key in improved and improved[key]:
            merged[key] = improved[key]
    merged["ai_optimized"] = True
    return merged
