from typing import Any

from app.schemas.schemas import JobCreate
from app.services.llm_client import LLMError, chat_completion

SYSTEM_PROMPT = """你是资深求职顾问，擅长为 BOSS 直聘撰写简短、真诚的打招呼语。
要求：
1. 80-150 字，语气自然，不要套话
2. 必须结合候选人真实经历和岗位 JD，提及 1-2 个 JD 关键词和 1 个真实项目/经历亮点
3. 禁止编造简历中不存在的内容
4. 不要加标题、引号或解释，直接输出打招呼正文"""


TEMPLATES = {
    "default": "首聊打招呼：突出匹配度与一项核心经历",
    "first_contact": "首聊打招呼：突出匹配度与一项核心经历",
    "follow_up": "跟进话术：礼貌询问进展，补充一项新亮点，更短一些",
    "thank_you": "感谢/收尾：面试或沟通后致谢，表达持续意向",
    "interview_confirm": "面试回复：确认时间、表达重视与准备意愿",
    "technical": "技术向：突出技术栈与项目成果",
    "career_switch": "转岗向：强调可迁移能力与学习意愿",
}

ROUND_SYSTEM_PROMPTS = {
    "first_contact": SYSTEM_PROMPT,
    "default": SYSTEM_PROMPT,
    "follow_up": """你是资深求职顾问，撰写 BOSS 直聘「跟进」消息。
要求：50-120 字，礼貌不催促，可补充 1 个与岗位相关的亮点，不要重复首聊全文。""",
    "thank_you": """你是资深求职顾问，撰写面试或沟通后的「感谢」消息。
要求：60-130 字，表达感谢与加入意愿，语气真诚克制。""",
    "interview_confirm": """你是资深求职顾问，撰写「面试确认/回复」消息。
要求：60-130 字，确认时间或表达可参加面试，简要说明准备方向，不编造经历。""",
}


def _build_resume_summary(resume_data: dict[str, Any]) -> str:
    if not resume_data:
        return "（暂无简历，请基于岗位通用优势撰写）"
    parts = [
        f"技能：{', '.join(resume_data.get('skills', [])) or '未识别'}",
        f"经历摘要：{resume_data.get('experience', '')[:800]}",
        f"项目摘要：{resume_data.get('projects', '')[:800]}",
        f"自我评价：{resume_data.get('summary', '')[:400]}",
    ]
    return "\n".join(parts)


def _build_job_block(job: JobCreate) -> str:
    return f"""岗位：{job.job_title}
公司：{job.company}
薪资：{job.salary}
城市：{job.city}
JD：
{job.jd_text[:3000]}"""


async def generate_greeting(
    job: JobCreate,
    resume_data: dict[str, Any],
    style: str = "简洁",
    template_id: str = "default",
    analysis_profile: dict[str, Any] | None = None,
    previous_content: str | None = None,
    modify_instruction: str | None = None,
) -> str:
    template_hint = TEMPLATES.get(template_id, TEMPLATES["default"])
    instruction = (modify_instruction or "").strip()
    round_key = template_id if template_id in ROUND_SYSTEM_PROMPTS else "default"
    system_prompt = ROUND_SYSTEM_PROMPTS.get(round_key, SYSTEM_PROMPT)
    round_label = {
        "follow_up": "跟进",
        "thank_you": "感谢/收尾",
        "interview_confirm": "面试回复",
    }.get(round_key, "首聊打招呼")

    if previous_content and instruction:
        user_prompt = f"""请根据用户对上一版话术的修改意见，重新撰写 BOSS 直聘打招呼语。

【修改意见】
{instruction}

【上一版话术】
{previous_content}

【风格】{style}
【模板倾向】{template_hint}

【候选人简历摘要】
{_build_resume_summary(resume_data)}

【目标岗位】
{_build_job_block(job)}

请输出修改后的话术正文，保留上一版优点，落实修改意见，仍须 80-150 字且不得编造简历内容。"""
    else:
        extra = f"\n【用户额外要求】\n{instruction}\n" if instruction else ""
        user_prompt = f"""请为以下候选人撰写 BOSS 直聘「{round_label}」消息。

【风格】{style}
【模板倾向】{template_hint}
{extra}
【候选人简历摘要】
{_build_resume_summary(resume_data)}

【目标岗位】
{_build_job_block(job)}
"""
    try:
        content = await chat_completion(system_prompt, user_prompt, analysis_profile)
    except LLMError:
        raise
    except Exception as exc:
        raise LLMError(str(exc)) from exc

    content = content.strip().strip('"').strip("'")
    if len(content) < 30:
        raise LLMError("生成的话术过短，请重试")
    if len(content) > 250:
        content = content[:250]
    return content


async def generate_fallback_greeting(job: JobCreate, resume_data: dict[str, Any]) -> str:
    skills = ", ".join(resume_data.get("skills", [])[:3]) or "相关技能"
    project = (resume_data.get("projects") or resume_data.get("experience") or "")[:80]
    if project:
        project_part = f"曾在项目中{project[:60]}…"
    else:
        project_part = "有相关岗位实践经验"
    return (
        f"您好，看到贵司「{job.job_title}」岗位，我有{skills}等经验，"
        f"{project_part}，与 JD 要求较匹配，方便进一步沟通吗？"
    )
