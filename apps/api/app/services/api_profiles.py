import json
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import AppSetting
from app.schemas.schemas import ApiProfile

STORE_KEY = "api_profiles"
MASKED_KEY = "***"

PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "deepseek": {
        "category": "analysis",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",
    },
    "openai": {
        "category": "analysis",
        "base_url": "https://api.openai.com",
        "model": "gpt-4o-mini",
    },
    "custom_analysis": {
        "category": "analysis",
        "base_url": "",
        "model": "",
    },
    "baidu_ocr": {
        "category": "vision",
        "base_url": "",
        "model": "",
        "options": {"ocr_type": "general"},
    },
    "tencent_ocr": {
        "category": "vision",
        "base_url": "",
        "model": "",
        "options": {"ocr_type": "general"},
    },
    "aliyun_ocr": {
        "category": "vision",
        "base_url": "",
        "model": "",
        "options": {"ocr_type": "general"},
    },
    "custom_vision": {
        "category": "vision",
        "base_url": "",
        "model": "",
        "options": {},
    },
    "qwen": {
        "category": "analysis",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus",
    },
    "zhipu": {
        "category": "analysis",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4-flash",
    },
    "moonshot": {
        "category": "analysis",
        "base_url": "https://api.moonshot.cn/v1",
        "model": "moonshot-v1-8k",
    },
}


def _empty_store() -> dict[str, Any]:
    return {"profiles": [], "active_vision_id": "", "active_analysis_id": ""}


def _is_placeholder_key(value: str) -> bool:
    if not value or value == MASKED_KEY:
        return True
    return value in {"your_key_here", "your_baidu_api_key_here", "your_baidu_secret_key_here"}


def _mask_profile(profile: dict[str, Any]) -> dict[str, Any]:
    masked = dict(profile)
    if masked.get("api_key") and not _is_placeholder_key(masked["api_key"]):
        masked["api_key"] = MASKED_KEY
    if masked.get("secret_key") and not _is_placeholder_key(masked["secret_key"]):
        masked["secret_key"] = MASKED_KEY
    return masked


def _load_raw_store(db: Session) -> dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == STORE_KEY).first()
    if not row:
        return _empty_store()
    try:
        data = json.loads(row.value_json)
    except json.JSONDecodeError:
        return _empty_store()
    if not isinstance(data, dict):
        return _empty_store()
    data.setdefault("profiles", [])
    data.setdefault("active_vision_id", "")
    data.setdefault("active_analysis_id", "")
    return data


def _save_raw_store(db: Session, store: dict[str, Any]) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == STORE_KEY).first()
    payload = json.dumps(store, ensure_ascii=False)
    if row:
        row.value_json = payload
    else:
        db.add(AppSetting(key=STORE_KEY, value_json=payload))


def _profile_from_env_analysis() -> dict[str, Any] | None:
    if _is_placeholder_key(settings.llm_api_key):
        return None
    return {
        "id": "env-analysis",
        "name": f"{settings.llm_provider}（来自 .env）",
        "category": "analysis",
        "provider": settings.llm_provider or "deepseek",
        "api_key": settings.llm_api_key,
        "secret_key": "",
        "base_url": settings.llm_base_url,
        "model": settings.llm_model,
        "options": {},
    }


def _profile_from_env_vision() -> dict[str, Any] | None:
    if _is_placeholder_key(settings.baidu_ocr_api_key) or _is_placeholder_key(settings.baidu_ocr_secret_key):
        return None
    return {
        "id": "env-vision",
        "name": "百度 OCR（来自 .env）",
        "category": "vision",
        "provider": "baidu_ocr",
        "api_key": settings.baidu_ocr_api_key,
        "secret_key": settings.baidu_ocr_secret_key,
        "base_url": "",
        "model": "",
        "options": {"ocr_type": settings.baidu_ocr_type or "general"},
    }


def ensure_migrated_from_env(db: Session) -> dict[str, Any]:
    store = _load_raw_store(db)
    if store["profiles"]:
        return store

    profiles: list[dict[str, Any]] = []
    analysis = _profile_from_env_analysis()
    vision = _profile_from_env_vision()
    if analysis:
        profiles.append(analysis)
        store["active_analysis_id"] = analysis["id"]
    if vision:
        profiles.append(vision)
        store["active_vision_id"] = vision["id"]
    if profiles:
        store["profiles"] = profiles
        _save_raw_store(db, store)
        db.commit()
    return store


def get_api_profiles_masked(db: Session) -> dict[str, Any]:
    store = ensure_migrated_from_env(db)
    return {
        "profiles": [_mask_profile(p) for p in store.get("profiles", [])],
        "active_vision_id": store.get("active_vision_id", ""),
        "active_analysis_id": store.get("active_analysis_id", ""),
    }


def _find_profile(store: dict[str, Any], profile_id: str) -> dict[str, Any] | None:
    for profile in store.get("profiles", []):
        if profile.get("id") == profile_id:
            return profile
    return None


def _merge_profile_keys(incoming: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(incoming)
    if existing:
        if _is_placeholder_key(merged.get("api_key", "")):
            merged["api_key"] = existing.get("api_key", "")
        if _is_placeholder_key(merged.get("secret_key", "")):
            merged["secret_key"] = existing.get("secret_key", "")
    return merged


def save_api_profiles(
    db: Session,
    profiles: list[ApiProfile],
    active_vision_id: str,
    active_analysis_id: str,
) -> dict[str, Any]:
    old_store = _load_raw_store(db)
    old_by_id = {p["id"]: p for p in old_store.get("profiles", [])}

    saved_profiles: list[dict[str, Any]] = []
    for item in profiles:
        data = item.model_dump()
        data = _merge_profile_keys(data, old_by_id.get(data["id"]))
        saved_profiles.append(data)

    store = {
        "profiles": saved_profiles,
        "active_vision_id": active_vision_id,
        "active_analysis_id": active_analysis_id,
    }
    _save_raw_store(db, store)
    db.commit()
    return get_api_profiles_masked(db)


def get_active_profile(db: Session, category: str) -> dict[str, Any] | None:
    store = ensure_migrated_from_env(db)
    active_id = (
        store.get("active_analysis_id")
        if category == "analysis"
        else store.get("active_vision_id")
    )
    if not active_id:
        return None
    profile = _find_profile(store, active_id)
    if not profile:
        return None
    if category == "analysis" and _is_placeholder_key(profile.get("api_key", "")):
        return None
    if category == "vision":
        if _is_placeholder_key(profile.get("api_key", "")):
            return None
        if profile.get("provider") == "baidu_ocr" and _is_placeholder_key(profile.get("secret_key", "")):
            return None
    return profile


def is_vision_api_configured(db: Session) -> bool:
    return get_active_profile(db, "vision") is not None


def is_analysis_api_configured(db: Session) -> bool:
    return get_active_profile(db, "analysis") is not None


def new_profile_defaults(category: str, provider: str, name: str = "") -> dict[str, Any]:
    preset = PROVIDER_PRESETS.get(provider, {})
    return {
        "id": str(uuid.uuid4()),
        "name": name or provider,
        "category": category,
        "provider": provider,
        "api_key": "",
        "secret_key": "",
        "base_url": preset.get("base_url", ""),
        "model": preset.get("model", ""),
        "options": dict(preset.get("options", {})),
    }
