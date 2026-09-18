from __future__ import annotations

import base64
import json
import time
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.core.config import settings


def _sign_content(params: dict[str, str]) -> str:
    if not settings.alipay_private_key:
        raise ValueError("未配置支付宝私钥")
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError as exc:
        raise ValueError("缺少 cryptography 依赖") from exc

    ordered = "&".join(f"{k}={params[k]}" for k in sorted(params))
    private_key = serialization.load_pem_private_key(
        settings.alipay_private_key.encode("utf-8"),
        password=None,
    )
    signature = private_key.sign(ordered.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("utf-8")


async def gateway_request(method: str, biz_content: dict[str, Any]) -> dict[str, Any]:
    if not settings.alipay_app_id or not settings.alipay_private_key:
        raise ValueError("支付宝未配置")

    params = {
        "app_id": settings.alipay_app_id,
        "method": method,
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": "RSA2",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "biz_content": json.dumps(biz_content, ensure_ascii=False, separators=(",", ":")),
    }
    params["sign"] = _sign_content({k: v for k, v in params.items() if k != "sign"})

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post("https://openapi.alipay.com/gateway.do", data=params)
        data = res.json()
        key = method.replace(".", "_") + "_response"
        payload = data.get(key, {})
        if payload.get("code") != "10000":
            raise ValueError(payload.get("sub_msg") or payload.get("msg") or "支付宝接口错误")
        return payload
