from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings

_CLOUD_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


def _cloud_base() -> str:
    base = settings.cloud_api_url.rstrip("/")
    if not base:
        raise HTTPException(503, "未配置 CLOUD_API_URL")
    return base


async def cloud_get(path: str, token: str = "") -> Any:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=_CLOUD_TIMEOUT) as client:
        res = await client.get(f"{_cloud_base()}{path}", headers=headers)
    if res.status_code >= 400:
        raise HTTPException(res.status_code, res.text or "云端请求失败")
    return res.json()


async def cloud_post(path: str, token: str = "", json: dict | None = None) -> Any:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=_CLOUD_TIMEOUT) as client:
        res = await client.post(f"{_cloud_base()}{path}", headers=headers, json=json or {})
    if res.status_code >= 400:
        raise HTTPException(res.status_code, res.text or "云端请求失败")
    return res.json()


async def cloud_post_multipart(path: str, token: str, files: dict, params: dict | None = None) -> Any:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
        res = await client.post(
            f"{_cloud_base()}{path}",
            headers=headers,
            files=files,
            params=params or {},
        )
    if res.status_code >= 400:
        raise HTTPException(res.status_code, res.text or "云端请求失败")
    return res.json()


async def fetch_membership_status(token: str) -> dict[str, Any]:
    return await cloud_get("/api/membership/status", token)


async def fetch_auth_session(token: str) -> dict[str, Any]:
    return await cloud_get("/api/auth/me", token)
