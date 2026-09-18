from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.payment_qr_service import personal_qr_enabled
from app.core.database import get_db
from app.schemas.schemas import (
    AuthProvidersOut,
    AuthSessionOut,
    AuthTokenOut,
    EmailLoginIn,
    EmailPasswordIn,
    EmailSendCodeIn,
    UserOut,
)
from app.services.auth_service import (
    authentication_required,
    create_access_token,
    get_current_user_optional,
    user_to_dict,
)
from app.services.membership_service import get_membership_status
from app.services.oauth_alipay import (
    alipay_fully_configured,
    alipay_login_enabled,
    build_alipay_authorize_url,
    exchange_alipay_code,
    new_oauth_state as new_alipay_state,
)
from app.services.oauth_wechat import (
    build_wechat_authorize_url,
    exchange_wechat_code,
    new_oauth_state as new_wechat_state,
    wechat_fully_configured,
    wechat_login_enabled,
)
from app.services.user_oauth_service import find_or_create_oauth_user, pop_oauth_state, save_oauth_state
from app.services.email_auth_service import login_with_email, register_or_reset_password, send_email_code

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _login_redirect_base() -> str:
    if settings.is_cloud_server:
        return settings.local_app_url.rstrip("/")
    return settings.public_base_url.rstrip("/")


def _auth_redirect(token: str) -> RedirectResponse:
    q = urlencode({"token": token})
    return RedirectResponse(url=f"{_login_redirect_base()}/login?{q}")


@router.get("/providers", response_model=AuthProvidersOut)
def auth_providers():
    email_on = settings.email_login_available
    return AuthProvidersOut(
        auth_enabled=authentication_required(),
        email=email_on,
        wechat=False if email_on else wechat_login_enabled(),
        alipay=False if email_on else alipay_login_enabled(),
        payment_mock=settings.payment_mock and settings.payment_mode == "mock",
        dev_login=settings.dev_login_enabled and settings.payment_mock,
        personal_qr=personal_qr_enabled(),
    )


@router.get("/me", response_model=AuthSessionOut)
def auth_me(
    db: Session = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    membership = get_membership_status(db, user)
    if not user:
        return AuthSessionOut(
            logged_in=False,
            user=None,
            membership=membership,
            auth_enabled=authentication_required(),
        )
    return AuthSessionOut(
        logged_in=True,
        user=UserOut(**user_to_dict(user)),
        membership=membership,
        auth_enabled=authentication_required(),
    )


@router.get("/wechat/url")
def wechat_auth_url(db: Session = Depends(get_db)):
    if not wechat_login_enabled():
        raise HTTPException(503, "微信登录未配置")
    state = new_wechat_state()
    save_oauth_state(db, state, "wechat")
    if wechat_fully_configured():
        return {"url": build_wechat_authorize_url(state)}
    base = settings.public_base_url.rstrip("/")
    return {"url": f"{base}/api/auth/mock-oauth/wechat?state={state}"}


@router.get("/mock-oauth/{provider}")
def mock_oauth_login(
    provider: str,
    state: str = Query(""),
    db: Session = Depends(get_db),
):
    if not settings.dev_login_enabled or not settings.payment_mock:
        raise HTTPException(403, "生产环境已关闭模拟登录")
    if provider not in ("wechat", "alipay"):
        raise HTTPException(400, "无效登录渠道")
    if not state or not pop_oauth_state(db, state, provider):
        raise HTTPException(400, "授权无效或已过期")

    nickname = "微信用户" if provider == "wechat" else "支付宝用户"
    user = find_or_create_oauth_user(
        db,
        provider=provider,
        open_id=f"mock_{provider}_user",
        nickname=nickname,
    )
    token = create_access_token(user.id)
    return _auth_redirect(token)


@router.get("/wechat/callback")
async def wechat_callback(
    code: str = Query(""),
    state: str = Query(""),
    db: Session = Depends(get_db),
):
    if not code or not state or not pop_oauth_state(db, state, "wechat"):
        raise HTTPException(400, "微信授权无效或已过期")
    try:
        profile = await exchange_wechat_code(code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    user = find_or_create_oauth_user(db, provider="wechat", **profile)
    token = create_access_token(user.id)
    return _auth_redirect(token)


@router.get("/alipay/url")
def alipay_auth_url(db: Session = Depends(get_db)):
    if not alipay_login_enabled():
        raise HTTPException(503, "支付宝登录未配置")
    state = new_alipay_state()
    save_oauth_state(db, state, "alipay")
    if alipay_fully_configured():
        return {"url": build_alipay_authorize_url(state)}
    base = settings.public_base_url.rstrip("/")
    return {"url": f"{base}/api/auth/mock-oauth/alipay?state={state}"}


@router.get("/alipay/callback")
async def alipay_callback(
    auth_code: str = Query("", alias="auth_code"),
    code: str = Query(""),
    state: str = Query(""),
    db: Session = Depends(get_db),
):
    auth_code = auth_code or code
    if not auth_code or not state or not pop_oauth_state(db, state, "alipay"):
        raise HTTPException(400, "支付宝授权无效或已过期")
    try:
        profile = await exchange_alipay_code(auth_code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    user = find_or_create_oauth_user(db, provider="alipay", **profile)
    token = create_access_token(user.id)
    return _auth_redirect(token)


@router.post("/email/send-code")
def email_send_code(body: EmailSendCodeIn, db: Session = Depends(get_db)):
    return send_email_code(db, body.email, body.purpose)


@router.post("/email/register", response_model=AuthTokenOut)
def email_register(body: EmailPasswordIn, db: Session = Depends(get_db)):
    user = register_or_reset_password(db, body.email, body.code, body.password, "register")
    return AuthTokenOut(token=create_access_token(user.id))


@router.post("/email/reset-password", response_model=AuthTokenOut)
def email_reset_password(body: EmailPasswordIn, db: Session = Depends(get_db)):
    user = register_or_reset_password(db, body.email, body.code, body.password, "reset")
    return AuthTokenOut(token=create_access_token(user.id))


@router.post("/email/login", response_model=AuthTokenOut)
def email_login(body: EmailLoginIn, db: Session = Depends(get_db)):
    if not settings.email_login_available:
        raise HTTPException(503, "邮箱登录未启用")
    user = login_with_email(db, body.email, body.password)
    return AuthTokenOut(token=create_access_token(user.id))


@router.post("/dev-login")
def dev_login(db: Session = Depends(get_db)):
    """仅开发环境：DEV_LOGIN_ENABLED 与 PAYMENT_MOCK 同时开启时可用。"""
    if not settings.dev_login_enabled or not settings.payment_mock:
        raise HTTPException(403, "生产环境已关闭开发登录")
    user = find_or_create_oauth_user(
        db,
        provider="dev",
        open_id="dev_local_user",
        nickname="开发测试用户",
    )
    return {"token": create_access_token(user.id)}


@router.post("/logout")
def auth_logout():
    return {"ok": True, "message": "已退出，请清除浏览器中的登录令牌"}
