from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import Greeting, Job
from app.schemas.schemas import (
    GreetingGenerateRequest,
    GreetingOut,
    GreetingUpdate,
    JobCreate,
)
from app.services.api_profiles import get_active_profile
from app.services.ai_matcher import compute_match_result
from app.services.greeting_generator import generate_greeting
from app.services.llm_client import LLMError
from app.services.access_control import require_active_license
from app.services.matcher import (
    get_default_resume_data,
    get_user_settings,
)

router = APIRouter(prefix="/api/greetings", tags=["greetings"])


@router.post("/generate", response_model=GreetingOut)
async def generate_greeting_api(
    payload: GreetingGenerateRequest,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    job: Job | None = None
    job_data: JobCreate | None = None

    if payload.job_id:
        job = db.query(Job).filter(Job.id == payload.job_id).first()
        if not job:
            raise HTTPException(404, "岗位不存在")
        if job.platform.startswith("career"):
            raise HTTPException(400, "官网岗位仅支持投递简历，不支持生成打招呼话术")
        if payload.job_data:
            job_data = payload.job_data
        else:
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
    elif payload.job_data:
        job_data = payload.job_data
        job = db.query(Job).filter(Job.job_url == job_data.job_url).first()
    else:
        raise HTTPException(400, "请提供 job_id 或 job_data")

    user_settings = get_user_settings(db)
    resume_data = get_default_resume_data(db)
    positions = user_settings.get("target_positions", [])
    default_style = (
        positions[0].get("greeting_style")
        if positions
        else user_settings.get("greeting_style", settings.default_greeting_style)
    )
    style = payload.style or default_style
    modify_instruction = (payload.modify_instruction or "").strip() or None

    previous_content: str | None = None
    if payload.base_greeting_id:
        base = db.query(Greeting).filter(Greeting.id == payload.base_greeting_id).first()
        if base:
            previous_content = base.content
    elif modify_instruction and job:
        latest = (
            db.query(Greeting)
            .filter(Greeting.job_id == job.id)
            .order_by(Greeting.created_at.desc())
            .first()
        )
        if latest:
            previous_content = latest.content

    analysis_profile = get_active_profile(db, "analysis")

    if not (job_data.jd_text or "").strip():
        raise HTTPException(400, "岗位 JD 为空，无法生成个性化话术，请先抓取岗位详情")

    content: str | None = None
    last_err: LLMError | None = None
    for _ in range(2):
        try:
            content = await generate_greeting(
                job_data,
                resume_data,
                style=style,
                template_id=payload.template_id,
                analysis_profile=analysis_profile,
                previous_content=previous_content,
                modify_instruction=modify_instruction,
            )
            break
        except LLMError as exc:
            last_err = exc
    if content is None:
        raise HTTPException(502, f"AI 话术生成失败：{last_err}") from last_err

    if not job and job_data:
        settings_data = get_user_settings(db)
        resume_data_for_match = get_default_resume_data(db)
        try:
            match = await compute_match_result(job_data, resume_data_for_match, settings_data, db)
        except LLMError:
            match = None
        job = Job(
            platform=job_data.platform,
            job_title=job_data.job_title,
            company=job_data.company,
            salary=job_data.salary,
            city=job_data.city,
            jd_text=job_data.jd_text,
            job_url=job_data.job_url,
            hr_name=job_data.hr_name,
            hr_title=job_data.hr_title,
            company_size=job_data.company_size,
            company_industry=job_data.company_industry,
            match_score=match.match_score if match else 0.0,
            role_match_score=match.role_match_score if match else 0.0,
            benefits_match_score=match.benefits_match_score if match else 0.0,
            company_match_score=match.company_match_score if match else 0.0,
        )
        db.add(job)
        db.flush()

    greeting = Greeting(
        job_id=job.id,
        content=content,
        template_id=payload.template_id,
    )
    db.add(greeting)
    db.commit()
    db.refresh(greeting)
    return greeting


@router.get("", response_model=list[GreetingOut])
def list_greetings(
    job_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Greeting).order_by(Greeting.created_at.desc())
    if job_id:
        q = q.filter(Greeting.job_id == job_id)
    return q.limit(100).all()


@router.put("/{greeting_id}", response_model=GreetingOut)
def update_greeting(
    greeting_id: int,
    payload: GreetingUpdate,
    db: Session = Depends(get_db),
):
    greeting = db.query(Greeting).filter(Greeting.id == greeting_id).first()
    if not greeting:
        raise HTTPException(404, "话术不存在")
    greeting.content = payload.content
    if payload.is_sent is not None:
        greeting.is_sent = payload.is_sent
        if payload.is_sent:
            greeting.sent_at = utc_now()
            job = db.query(Job).filter(Job.id == greeting.job_id).first()
            if job:
                job.status = "greeted"
                job.has_greeted = True
    db.commit()
    db.refresh(greeting)
    return greeting


@router.delete("/{greeting_id}", status_code=204)
def delete_greeting(greeting_id: int, db: Session = Depends(get_db)):
    greeting = db.query(Greeting).filter(Greeting.id == greeting_id).first()
    if not greeting:
        raise HTTPException(404, "话术不存在")
    db.delete(greeting)
    db.commit()
    return None
