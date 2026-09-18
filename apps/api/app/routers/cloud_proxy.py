from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.services import cloud_client

router = APIRouter(tags=["cloud-proxy"])
_bearer = HTTPBearer(auto_error=False)

_PROXY_PREFIXES = (
    "/api/auth",
    "/api/membership/plans",
    "/api/membership/status",
    "/api/membership/orders",
)


def _token(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    return credentials.credentials if credentials and credentials.credentials else ""


async def _forward(request: Request, path: str) -> Response:
    base = settings.cloud_api_url.rstrip("/")
    if not base:
        raise HTTPException(503, "未配置 CLOUD_API_URL")
    url = f"{base}{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() in ("authorization", "content-type")}
    body = await request.body()

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
        res = await client.request(
            request.method,
            url,
            headers=headers,
            content=body if body else None,
        )

    skip = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    resp_headers = {k: v for k, v in res.headers.items() if k.lower() not in skip}
    return Response(content=res.content, status_code=res.status_code, headers=resp_headers)


@router.get("/api/auth/providers")
async def proxy_auth_providers():
    return await cloud_client.cloud_get("/api/auth/providers")


@router.get("/api/auth/me")
async def proxy_auth_me(token: str = Depends(_token)):
    return await cloud_client.fetch_auth_session(token)


@router.api_route("/api/auth/{path:path}", methods=["GET", "POST"])
async def proxy_auth(request: Request, path: str):
    return await _forward(request, f"/api/auth/{path}")


@router.get("/api/membership/plans")
async def proxy_plans():
    return await cloud_client.cloud_get("/api/membership/plans")


@router.get("/api/membership/status")
async def proxy_membership_status(token: str = Depends(_token)):
    if not token:
        raise HTTPException(401, "请先登录")
    return await cloud_client.fetch_membership_status(token)


@router.api_route("/api/membership/orders", methods=["GET", "POST"])
async def proxy_membership_orders_root(request: Request):
    return await _forward(request, "/api/membership/orders")


@router.api_route("/api/membership/orders/{subpath:path}", methods=["GET", "POST"])
async def proxy_membership_orders_sub(request: Request, subpath: str):
    return await _forward(request, f"/api/membership/orders/{subpath}")
