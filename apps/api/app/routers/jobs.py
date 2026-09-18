import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Query as SqlQuery, Session
from urllib.parse import quote

from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import Job
from app.schemas.schemas import (
    JobCreate,
    JobListResponse,
    JobOut,
    JobPipelineUpdate,
    JobRecommendationsOut,
    JobStatusUpdate,
    JobTailoredResumeOut,
)
from app.services.job_serializer import job_to_out
from app.services.job_pipeline import apply_job_pipeline_patch, set_job_status
from app.services.resume_tailor import tailor_resume_for_job
from app.services.api_profiles import get_active_profile
from app.services.job_recommendations import generate_job_recommendations
from app.services.ai_matcher import compute_match_result
from app.services.llm_client import LLMError
from app.services.job_export_service import build_jobs_excel
from app.services.access_control import require_active_license
from app.services.career_scrapers.base import ScrapedJob
from app.services.career_scrapers.jd_quality import validate_scraped_job
from app.services.matcher import (
    get_default_resume_data,
    get_user_settings,
)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_SORT_MAP = {
    "match_score": Job.match_score,
    "role_match_score": Job.role_match_score,
    "benefits_match_score": Job.benefits_match_score,
    "company_match_score": Job.company_match_score,
    "created_at": Job.created_at,
    "company": Job.company,
    "job_title": Job.job_title,
}


def _filter_invalid_career_jobs(rows: list[Job]) -> list[Job]:
    kept: list[Job] = []
    for job in rows:
        if not (job.platform or "").startswith("career"):
            kept.append(job)
            continue
        scraped = ScrapedJob(
            job_title=job.job_title or "",
            company=job.company or "",
            job_url=job.job_url or "",
            jd_text=job.jd_text or "",
            platform=job.platform or "career",
        )
        ok, _ = validate_scraped_job(scraped)
        if ok:
            kept.append(job)
    return kept


def _apply_job_filters(
    q: SqlQuery,
    *,
    status: str | None = None,
    min_score: float | None = None,
    platform: str | None = None,
    company: str | None = None,
    city: str | None = None,
    keyword: str | None = None,
) -> SqlQuery:
    if status:
        q = q.filter(Job.status == status)
    if min_score is not None:
        q = q.filter(Job.match_score >= min_score)
    if platform:
        if platform == "career":
            q = q.filter(Job.platform.like("career%"))
        elif platform == "boss":
            q = q.filter(Job.platform == "boss")
        else:
            q = q.filter(Job.platform == platform)
    if company:
        q = q.filter(Job.company.contains(company.strip()))
    if city:
        q = q.filter(Job.city.contains(city.strip()))
    if keyword:
        token = keyword.strip()
        if token:
            like = f"%{token}%"
            q = q.filter(
                or_(
                    Job.job_title.like(like),
                    Job.company.like(like),
                    Job.jd_text.like(like),
                    Job.city.like(like),
                )
            )
    return q


def _apply_job_sort(
    q: SqlQuery,
    *,
    sort: str | None,
    order: str,
    platform: str | None,
) -> SqlQuery:
    default_sort = "created_at" if platform == "career" else "match_score"
    sort_col = _SORT_MAP.get(sort or default_sort, _SORT_MAP[default_sort])
    if order == "asc":
        return q.order_by(sort_col.asc())
    return q.order_by(sort_col.desc())


def _fetch_filtered_jobs(
    db: Session,
    *,
    status: str | None = None,
    min_score: float | None = None,
    platform: str | None = None,
    company: str | None = None,
    city: str | None = None,
    keyword: str | None = None,
    sort: str | None = None,
    order: str = "desc",
    page: int | None = None,
    page_size: int | None = None,
) -> tuple[list[Job], int]:
    q = db.query(Job)
    q = _apply_job_filters(
        q,
        status=status,
        min_score=min_score,
        platform=platform,
        company=company,
        city=city,
        keyword=keyword,
    )
    q = _apply_job_sort(q, sort=sort, order=order, platform=platform)

    if platform == "career":
        rows = _filter_invalid_career_jobs(q.all())
        total = len(rows)
        if page is not None and page_size is not None:
            start = (page - 1) * page_size
            rows = rows[start : start + page_size]
        return rows, total

    if page is not None and page_size is not None:
        total = q.count()
        rows = q.offset((page - 1) * page_size).limit(page_size).all()
        return rows, total

    rows = q.all()
    return rows, len(rows)


async def _apply_match(job: Job, payload: JobCreate, db: Session) -> None:
    settings = get_user_settings(db)
    resume_data = get_default_resume_data(db)
    try:
        result = await compute_match_result(payload, resume_data, settings, db)
    except LLMError as e:
        raise HTTPException(503, f"AI 匹配打分失败：{e}") from e
    job.match_score = result.match_score
    job.role_match_score = result.role_match_score
    job.benefits_match_score = result.benefits_match_score
    job.company_match_score = result.company_match_score


@router.post("", response_model=JobOut)
async def create_or_update_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    existing = db.query(Job).filter(Job.job_url == payload.job_url).first()
    if existing:
        existing.job_title = payload.job_title
        existing.company = payload.company
        existing.salary = payload.salary
        existing.city = payload.city
        existing.jd_text = payload.jd_text
        existing.hr_name = payload.hr_name
        existing.hr_title = payload.hr_title
        existing.company_size = payload.company_size
        existing.company_industry = payload.company_industry
        await _apply_match(existing, payload, db)
        existing.updated_at = utc_now()
        db.commit()
        db.refresh(existing)
        return existing

    job = Job(
        platform=payload.platform,
        job_title=payload.job_title,
        company=payload.company,
        salary=payload.salary,
        city=payload.city,
        jd_text=payload.jd_text,
        job_url=payload.job_url,
        hr_name=payload.hr_name,
        hr_title=payload.hr_title,
        company_size=payload.company_size,
        company_industry=payload.company_industry,
    )
    await _apply_match(job, payload, db)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=JobListResponse)
def list_jobs(
    status: str | None = Query(None),
    min_score: float | None = Query(None),
    platform: str | None = Query(None, description="boss|career|career:moka 等"),
    company: str | None = Query(None),
    city: str | None = Query(None),
    keyword: str | None = Query(None, description="岗位名/公司/JD 关键词"),
    sort: str | None = Query(None, description="match_score|role_match_score|benefits_match_score|company_match_score|created_at|company|job_title"),
    order: str = Query("desc", description="asc|desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = _fetch_filtered_jobs(
        db,
        status=status,
        min_score=min_score,
        platform=platform,
        company=company,
        city=city,
        keyword=keyword,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
    return JobListResponse(items=[job_to_out(j) for j in items], total=total, page=page, page_size=page_size)


@router.get("/meta/career")
def career_job_meta(db: Session = Depends(get_db)):
    rows = (
        db.query(Job.company, Job.city)
        .filter(Job.platform.like("career%"))
        .all()
    )
    companies = sorted({row[0].strip() for row in rows if row[0] and row[0].strip()})
    cities = sorted({row[1].strip() for row in rows if row[1] and row[1].strip()})
    return {"companies": companies, "cities": cities}


@router.get("/export/excel")
def export_jobs_excel(
    status: str | None = Query(None),
    min_score: float | None = Query(None),
    platform: str | None = Query(None),
    company: str | None = Query(None),
    city: str | None = Query(None),
    keyword: str | None = Query(None),
    sort: str | None = Query(None),
    order: str = Query("desc", description="asc|desc"),
    db: Session = Depends(get_db),
):
    jobs, total = _fetch_filtered_jobs(
        db,
        status=status,
        min_score=min_score,
        platform=platform,
        company=company,
        city=city,
        keyword=keyword,
        sort=sort,
        order=order,
    )
    if not jobs:
        raise HTTPException(404, "当前筛选条件下没有可导出的岗位")

    buffer = build_jobs_excel(jobs)
    filename = f"岗位采集_{total}条_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    encoded_name = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=jobs_export.xlsx; filename*=UTF-8''{encoded_name}"
            )
        },
    )


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    return job_to_out(job)


@router.patch("/{job_id}/pipeline", response_model=JobOut)
def update_job_pipeline(
    job_id: int,
    payload: JobPipelineUpdate,
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")

    apply_job_pipeline_patch(db, job, payload)
    db.commit()
    db.refresh(job)
    return job_to_out(job)


@router.post("/{job_id}/tailor-resume", response_model=JobTailoredResumeOut)
async def tailor_job_resume(
    job_id: int,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    if not (job.jd_text or "").strip():
        raise HTTPException(400, "岗位 JD 为空，无法定向改写简历")

    resume_data = get_default_resume_data(db)
    if not resume_data:
        raise HTTPException(400, "请先在简历管理上传或创建默认简历")

    job_data = JobCreate(
        platform=job.platform,
        job_title=job.job_title,
        company=job.company,
        salary=job.salary,
        city=job.city,
        jd_text=job.jd_text,
        job_url=job.job_url,
        hr_name=job.hr_name,
        hr_title=job.hr_title,
        company_size=job.company_size,
        company_industry=job.company_industry,
    )
    try:
        tailored = await tailor_resume_for_job(resume_data, job_data, db)
    except LLMError as exc:
        raise HTTPException(502, f"简历定向改写失败：{exc}") from exc

    job.tailored_resume_json = json.dumps(tailored, ensure_ascii=False)
    job.updated_at = utc_now()
    db.commit()
    return JobTailoredResumeOut(job_id=job.id, tailored_resume=tailored)


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.patch("/{job_id}/status", response_model=JobOut)
def update_job_status(
    job_id: int,
    payload: JobStatusUpdate,
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    set_job_status(db, job, payload.status, note=payload.note)
    job.updated_at = utc_now()
    db.commit()
    db.refresh(job)
    return job_to_out(job)


@router.post("/{job_id}/recommendations", response_model=JobRecommendationsOut)
async def get_job_recommendations(
    job_id: int,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    job_data = JobCreate(
        platform=job.platform,
        job_title=job.job_title,
        company=job.company,
        salary=job.salary,
        city=job.city,
        jd_text=job.jd_text,
        job_url=job.job_url,
        hr_name=job.hr_name,
        hr_title=job.hr_title,
        company_size=job.company_size,
        company_industry=job.company_industry,
    )
    resume_data = get_default_resume_data(db)
    analysis_profile = get_active_profile(db, "analysis")
    return await generate_job_recommendations(job_data, resume_data, analysis_profile)


@router.post("/{job_id}/match", response_model=JobOut)
async def rematch_job(
    job_id: int,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    payload = JobCreate(
        platform=job.platform,
        job_title=job.job_title,
        company=job.company,
        salary=job.salary,
        city=job.city,
        jd_text=job.jd_text,
        job_url=job.job_url,
        hr_name=job.hr_name,
        hr_title=job.hr_title,
        company_size=job.company_size,
        company_industry=job.company_industry,
    )
    await _apply_match(job, payload, db)
    job.updated_at = utc_now()
    db.commit()
    db.refresh(job)
    return job
