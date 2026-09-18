from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "deployment_role": settings.deployment_role,
        "uses_cloud_membership": settings.uses_cloud_membership,
    }
