from __future__ import annotations

import secrets
from urllib.parse import quote

import httpx

from app.core.config import settings

WECHAT_AUTH_URL = "https://open.weixin.qq.com/connect/qrconnect"
WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"
WECHAT_USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo"


def wechat_login_enabled() -> bool:
    if not settings.auth_enabled:
        return False
    if settings.wechat_oauth_enabled and settings.wechat_app_id and settings.wechat_app_secret:
        return True
    return settings.dev_login_enabled and settings.payment_mock


def wechat_fully_configured() -> bool:
    return bool(settings.wechat_oauth_enabled and settings.wechat_app_id and settings.wechat_app_secret)


def build_wechat_authorize_url(state: str) -> str:
    redirect_uri = quote(f"{settings.public_base_url.rstrip('/')}/api/auth/wechat/callback", safe="")
    return (
        f"{WECHAT_AUTH_URL}?appid={settings.wechat_app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code&scope=snsapi_login&state={state}"
        f"#wechat_redirect"
    )


def new_oauth_state() -> str:
    return secrets.token_urlsafe(16)


async def exchange_wechat_code(code: str) -> dict:
    if settings.dev_login_enabled and settings.payment_mock and not wechat_fully_configured():
        return {
            "open_id": f"mock_wechat_{code[:12]}",
            "union_id": "",
            "nickname": "微信用户",
            "avatar_url": "",
        }

    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.get(
            WECHAT_TOKEN_URL,
            params={
                "appid": settings.wechat_app_id,
                "secret": settings.wechat_app_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_res.json()
        if token_data.get("errcode"):
            raise ValueError(token_data.get("errmsg") or "微信授权失败")

        access_token = token_data.get("access_token")
        openid = token_data.get("openid")
        if not access_token or not openid:
            raise ValueError("微信返回数据不完整")

        user_res = await client.get(
            WECHAT_USERINFO_URL,
            params={"access_token": access_token, "openid": openid, "lang": "zh_CN"},
        )
        user_data = user_res.json()
        if user_data.get("errcode"):
            raise ValueError(user_data.get("errmsg") or "获取微信用户信息失败")

        return {
            "open_id": openid,
            "union_id": user_data.get("unionid") or "",
            "nickname": user_data.get("nickname") or "微信用户",
            "avatar_url": user_data.get("headimgurl") or "",
        }
