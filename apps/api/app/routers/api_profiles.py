from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.schemas import ApiProfilesOut, ApiProfile
from app.services.api_profiles import get_api_profiles_masked, save_api_profiles

router = APIRouter(prefix="/api/api-profiles", tags=["api-profiles"])


@router.get("", response_model=ApiProfilesOut)
def get_profiles(db: Session = Depends(get_db)):
    return get_api_profiles_masked(db)


@router.put("", response_model=ApiProfilesOut)
def update_profiles(payload: ApiProfilesOut, db: Session = Depends(get_db)):
    return save_api_profiles(
        db,
        [ApiProfile(**p.model_dump()) for p in payload.profiles],
        payload.active_vision_id,
        payload.active_analysis_id,
    )
