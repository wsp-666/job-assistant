from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import Job
from app.schemas.schemas import DashboardStats

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(Job).count()
    pending = db.query(Job).filter(Job.status.in_(("pending", "preparing", "ready"))).count()
    greeted = db.query(Job).filter(Job.status == "greeted").count()
    skipped = db.query(Job).filter(Job.status == "skipped").count()
    today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    today = db.query(Job).filter(Job.created_at >= today_start).count()
    avg_score = db.query(func.avg(Job.match_score)).scalar() or 0.0
    return DashboardStats(
        total_jobs=total,
        pending_jobs=pending,
        greeted_jobs=greeted,
        skipped_jobs=skipped,
        today_jobs=today,
        avg_match_score=round(float(avg_score), 1),
    )
