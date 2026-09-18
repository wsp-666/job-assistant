from typing import Any

import httpx

from app.core.config import settings


class LLMError(Exception):
    pass


def _resolve_config(profile: dict[str, Any] | None) -> tuple[str, str, str]:
    if profile:
        api_key = profile.get("api_key", "")
        base_url = profile.get("base_url") or settings.llm_base_url
        model = profile.get("model") or settings.llm_model
        return api_key, base_url.rstrip("/"), model
    return settings.llm_api_key, settings.llm_base_url.rstrip("/"), settings.llm_model


def _build_payload(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 500,
) -> dict:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if "v4" in model.lower():
        payload["thinking"] = {"type": "disabled"}
    return payload


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1") or base.endswith("/v4"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


async def chat_completion(
    system_prompt: str,
    user_prompt: str,
    profile: dict[str, Any] | None = None,
    temperature: float = 0.7,
    max_tokens: int = 500,
) -> str:
    api_key, base_url, model = _resolve_config(profile)
    if not api_key or api_key in {"", "your_key_here", "***"}:
        raise LLMError("请先在设置页添加并选择分析 API")

    url = _chat_completions_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = _build_payload(model, system_prompt, user_prompt, temperature, max_tokens)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise LLMError(f"LLM 请求失败: {resp.status_code} {resp.text[:200]}")
        data = resp.json()
        try:
            message = data["choices"][0]["message"]
            content = message.get("content") or ""
            if not content.strip() and message.get("reasoning_content"):
                content = message["reasoning_content"]
            return content.strip()
        except (KeyError, IndexError) as exc:
            raise LLMError("LLM 返回格式异常") from exc
