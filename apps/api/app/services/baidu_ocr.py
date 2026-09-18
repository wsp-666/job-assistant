import time
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings

_token_cache: dict[str, dict[str, float | str]] = {}

OCR_ENDPOINTS = {
    "general": "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic",
    "accurate": "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic",
}


class BaiduOcrError(Exception):
    pass


def _cache_key(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "env"
    return str(profile.get("id", "default"))


def _resolve_credentials(profile: dict[str, Any] | None) -> tuple[str, str, str]:
    if profile:
        api_key = profile.get("api_key", "")
        secret_key = profile.get("secret_key", "")
        ocr_type = profile.get("options", {}).get("ocr_type", "general")
        return api_key, secret_key, ocr_type if ocr_type in OCR_ENDPOINTS else "general"
    return settings.baidu_ocr_api_key, settings.baidu_ocr_secret_key, (
        settings.baidu_ocr_type if settings.baidu_ocr_type in OCR_ENDPOINTS else "general"
    )


async def _get_access_token(profile: dict[str, Any] | None = None) -> str:
    api_key, secret_key, _ = _resolve_credentials(profile)
    if not api_key or not secret_key:
        raise BaiduOcrError("请先在设置页添加并选择识图 API（百度 OCR 需 API Key 与 Secret Key）")

    key = _cache_key(profile)
    cache = _token_cache.get(key, {"token": "", "expires_at": 0.0})
    now = time.time()
    if cache["token"] and now < float(cache["expires_at"]) - 60:
        return str(cache["token"])

    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": api_key,
        "client_secret": secret_key,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, params=params)
        data = resp.json()

    if "access_token" not in data:
        raise BaiduOcrError(f"获取百度 OCR Token 失败: {data.get('error_description', data)}")

    cache = {
        "token": data["access_token"],
        "expires_at": now + int(data.get("expires_in", 2592000)),
    }
    _token_cache[key] = cache
    return str(cache["token"])


async def ocr_image_base64(image_b64: str, profile: dict[str, Any] | None = None) -> str:
    token = await _get_access_token(profile)
    _, _, ocr_type = _resolve_credentials(profile)
    url = f"{OCR_ENDPOINTS[ocr_type]}?access_token={token}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            content=urlencode({"image": image_b64}).encode(),
        )
        data = resp.json()

    if "error_code" in data:
        raise BaiduOcrError(f"百度 OCR 识别失败: {data.get('error_msg', data)}")

    lines = [item.get("words", "") for item in data.get("words_result", [])]
    return "\n".join(line for line in lines if line)


def is_baidu_ocr_configured(profile: dict[str, Any] | None = None) -> bool:
    api_key, secret_key, _ = _resolve_credentials(profile)
    placeholders = {"", "your_baidu_api_key_here", "your_baidu_secret_key_here", "***"}
    return bool(api_key and secret_key and api_key not in placeholders and secret_key not in placeholders)
