from __future__ import annotations

import secrets
from urllib.parse import quote

import httpx

from app.core.config import settings

ALIPAY_AUTH_URL = "https://openauth.alipay.com/oauth2/publicAppAuthorize.htm"
ALIPAY_TOKEN_URL = "https://openapi.alipay.com/gateway.do"


def alipay_login_enabled() -> bool:
    if not settings.auth_enabled:
        return False
    if settings.alipay_oauth_enabled and settings.alipay_app_id and settings.alipay_private_key:
        return True
    return settings.dev_login_enabled and settings.payment_mock


def alipay_fully_configured() -> bool:
    return bool(settings.alipay_oauth_enabled and settings.alipay_app_id and settings.alipay_private_key)


def build_alipay_authorize_url(state: str) -> str:
    redirect_uri = quote(f"{settings.public_base_url.rstrip('/')}/api/auth/alipay/callback", safe="")
    return (
        f"{ALIPAY_AUTH_URL}?app_id={settings.alipay_app_id}"
        f"&scope=auth_user&redirect_uri={redirect_uri}&state={state}"
    )


def new_oauth_state() -> str:
    return secrets.token_urlsafe(16)


async def exchange_alipay_code(code: str) -> dict:
    if settings.dev_login_enabled and settings.payment_mock and not alipay_fully_configured():
        return {
            "open_id": f"mock_alipay_{code[:12]}",
            "union_id": "",
            "nickname": "支付宝用户",
            "avatar_url": "",
        }

    from app.services.alipay_client import alipay_system_oauth_token, alipay_user_info_share

    token_data = await alipay_system_oauth_token(code)
    access_token = token_data.get("access_token")
    user_id = token_data.get("user_id")
    if not access_token or not user_id:
        raise ValueError("支付宝授权失败")

    profile = await alipay_user_info_share(access_token)
    return {
        "open_id": user_id,
        "union_id": "",
        "nickname": profile.get("nick_name") or profile.get("nickname") or "支付宝用户",
        "avatar_url": profile.get("avatar") or "",
    }
