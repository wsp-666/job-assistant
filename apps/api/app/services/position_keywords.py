import json
import re
from typing import Any

from app.services.llm_client import LLMError, chat_completion

SYSTEM_PROMPT = """你是招聘与求职领域的专家，熟悉 BOSS 直聘上的岗位命名习惯。
根据用户提供的岗位名称（可能多个同类叫法），输出用于匹配招聘信息的 JSON，不要 markdown，不要解释。

格式：
{
  "title_aliases": ["BOSS上常见的其他岗位名称1", "名称2"],
  "keywords": ["匹配关键词1", "关键词2"]
}

要求：
1. title_aliases：与输入含义相同、BOSS 上常见的其他岗位标题叫法，5-10 个，不要与输入完全重复
2. keywords：用于在岗位标题和 JD 中匹配的关键词，8-15 个，包含行业词、技能词、业务词，可含英文缩写
3. 全部使用中文或常见英文缩写，每条 2-12 字"""

# 常见岗位兜底别名与关键词（无 API 时）
FALLBACK_MAP: dict[str, dict[str, list[str]]] = {
    "售前": {
        "title_aliases": [
            "售前工程师",
            "售前顾问",
            "售前技术支持",
            "解决方案工程师",
            "解决方案顾问",
            "技术售前",
            "Pre-sales工程师",
        ],
        "keywords": [
            "售前",
            "解决方案",
            "B端",
            "客户沟通",
            "需求分析",
            "产品演示",
            "POC",
            "招投标",
            "技术交流",
            "SaaS",
        ],
    },
    "产品经理": {
        "title_aliases": ["产品专员", "产品策划", "PM", "产品负责人", "互联网产品经理"],
        "keywords": ["产品", "需求", "原型", "PRD", "用户研究", "数据分析", "迭代", "Axure"],
    },
    "Java": {
        "title_aliases": ["Java开发", "Java工程师", "后端开发", "服务端开发", "Java研发"],
        "keywords": ["Java", "Spring", "微服务", "MySQL", "Redis", "后端", "分布式"],
    },
}


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


def _as_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [v.strip() for v in re.split(r"[,，\n]", value) if v.strip()]
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _fallback(titles: list[str], details: str) -> dict[str, list[str]]:
    blob = " ".join(titles) + " " + details
    for key, data in FALLBACK_MAP.items():
        if key.lower() in blob.lower():
            aliases = list(data["title_aliases"])
            keywords = list(data["keywords"])
            for t in titles:
                if t and t not in aliases and t != key:
                    aliases.insert(0, t)
                for part in re.findall(r"[\u4e00-\u9fa5a-zA-Z]{2,}", t):
                    if part not in keywords:
                        keywords.append(part)
            return {
                "title_aliases": _dedupe(aliases)[:12],
                "keywords": _dedupe(keywords)[:15],
            }

    # 通用兜底：从名称拆词
    aliases: list[str] = []
    keywords: list[str] = []
    for t in titles:
        t = t.strip()
        if not t:
            continue
        keywords.append(t)
        if "工程师" not in t and len(t) <= 6:
            aliases.append(f"{t}工程师")
        if "专员" not in t and len(t) <= 6:
            aliases.append(f"{t}专员")
    if details:
        keywords.extend(_as_list(details)[:5])
    return {
        "title_aliases": _dedupe(aliases)[:10],
        "keywords": _dedupe(keywords)[:12],
    }


async def suggest_position_keywords(
    titles: list[str],
    details: str = "",
    summary: str = "",
    analysis_profile: dict[str, Any] | None = None,
) -> dict[str, list[str]]:
    clean_titles = _dedupe([t.strip() for t in titles if t and t.strip()])
    if not clean_titles:
        return {"title_aliases": [], "keywords": []}

    context = f"""【岗位名称（含同类叫法）】
{chr(10).join(f"- {t}" for t in clean_titles)}

【简介】{summary or "无"}
【期望工作内容】{details or "无"}

请输出 JSON。"""

    try:
        raw = await chat_completion(SYSTEM_PROMPT, context, analysis_profile)
        data = _parse_json(raw)
        aliases = _dedupe(_as_list(data.get("title_aliases")))
        keywords = _dedupe(_as_list(data.get("keywords")))
        # 不把主名称重复放进 aliases
        title_set = {t.lower() for t in clean_titles}
        aliases = [a for a in aliases if a.lower() not in title_set]
        for t in clean_titles:
            if t not in keywords:
                keywords.insert(0, t)
        return {
            "title_aliases": aliases[:12],
            "keywords": keywords[:15],
        }
    except (LLMError, json.JSONDecodeError, TypeError, KeyError):
        return _fallback(clean_titles, f"{summary} {details}".strip())
