import json



from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session



from app.core.config import settings

from app.core.database import get_db

from app.models.models import AppSetting

from app.schemas.schemas import (
    PositionKeywordsSuggestOut,
    PositionKeywordsSuggestRequest,
    SettingsOut,
    TargetPosition,
)
from app.services.api_profiles import get_active_profile
from app.services.access_control import require_active_license
from app.services.matcher import DEFAULT_SETTINGS, _normalize_settings
from app.services.position_keywords import suggest_position_keywords



router = APIRouter(prefix="/api/settings", tags=["settings"])





def _load_settings(db: Session) -> SettingsOut:

    row = db.query(AppSetting).filter(AppSetting.key == "user").first()

    data = dict(DEFAULT_SETTINGS)

    if row:

        try:

            data = _normalize_settings(json.loads(row.value_json))

        except json.JSONDecodeError:

            pass

    positions = [TargetPosition(**p) for p in data.get("target_positions", [])]

    return SettingsOut(

        target_titles=data.get("target_titles", []),

        target_positions=positions,

        cities=data.get("cities", []),

        min_salary=data.get("min_salary", 0),

        max_salary=data.get("max_salary", 0),

        min_salary_unlimited=data.get("min_salary_unlimited", True),

        max_salary_unlimited=data.get("max_salary_unlimited", True),

        include_keywords=data.get("include_keywords", []),

        exclude_keywords=data.get("exclude_keywords", []),

        greeting_style=data.get("greeting_style", settings.default_greeting_style),

        daily_limit=data.get("daily_limit", settings.daily_greeting_limit),

    )





@router.get("", response_model=SettingsOut)

def get_settings(db: Session = Depends(get_db)):

    return _load_settings(db)


@router.post("/suggest-position-keywords", response_model=PositionKeywordsSuggestOut)
async def suggest_position_keywords_api(
    payload: PositionKeywordsSuggestRequest,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    profile = get_active_profile(db, "analysis")
    result = await suggest_position_keywords(
        payload.titles,
        details=payload.details,
        summary=payload.summary,
        analysis_profile=profile,
    )
    return PositionKeywordsSuggestOut(**result)





@router.put("", response_model=SettingsOut)

def update_settings(payload: SettingsOut, db: Session = Depends(get_db)):

    positions = [p.model_dump() for p in payload.target_positions]

    save_data = {

        "target_positions": positions,

        "target_titles": [p["title"] for p in positions if p.get("title")],

        "cities": payload.cities,

        "min_salary": 0 if payload.min_salary_unlimited else payload.min_salary,

        "max_salary": 0 if payload.max_salary_unlimited else payload.max_salary,

        "min_salary_unlimited": payload.min_salary_unlimited,

        "max_salary_unlimited": payload.max_salary_unlimited,

        "include_keywords": payload.include_keywords,

        "exclude_keywords": payload.exclude_keywords,

        "greeting_style": payload.greeting_style,

        "daily_limit": payload.daily_limit,

    }

    row = db.query(AppSetting).filter(AppSetting.key == "user").first()

    if row:

        row.value_json = json.dumps(save_data, ensure_ascii=False)

    else:

        row = AppSetting(key="user", value_json=json.dumps(save_data, ensure_ascii=False))

        db.add(row)

    db.commit()

    return _load_settings(db)

