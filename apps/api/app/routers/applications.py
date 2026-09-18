from __future__ import annotations

import json
import re
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import (
    ApplicationEvent,
    ApplicationQueue,
    ApplicationTask,
    AppSetting,
    Job,
    Resume,
)
from app.schemas.schemas import (
    ApplicationEventOut,
    ApplicationAnswerSet,
    ApplicationBulkDeleteOut,
    ApplicationBulkDeleteRequest,
    ApplicationImportResultOut,
    ApplicationNextTaskOut,
    ApplicationProfile,
    ApplicationProfileOut,
    ApplicationQueueCreate,
    ApplicationQueueOut,
    ApplicationSummaryOut,
    ApplicationTaskOut,
    ApplicationTaskStateUpdate,
    ApplicationWorkspaceOut,
    JobCreate,
    JobOut,
    JobPipelineUpdate,
    ManualJobCreate,
)
from app.services.application_import import (
    MAX_IMPORT_BYTES,
    ApplicationImportError,
    build_application_import_template,
    import_application_progress,
)
from app.services.application_materials import ensure_bundled_resumes, resume_key_from_hint
from app.services.job_pipeline import (
    APPLICATION_STAGE_IDS,
    APPLICATION_STAGE_MAP,
    APPLIED_OR_LATER_STAGES,
    PRIORITIES,
    TERMINAL_APPLICATION_STAGES,
    apply_job_pipeline_patch,
    application_stage_meta,
    record_application_event,
    set_job_status,
)
from app.services.job_serializer import job_to_out


router = APIRouter(prefix="/api/applications", tags=["applications"])

PROFILE_SETTING_KEY = "application_profile"
ANSWER_TEMPLATE_DIR = Path(__file__).resolve().parents[5] / "网申资料" / "岗位资料套装-优化版"
KNOWN_PROFILE_FIELDS = {
    "full_name": "王似鹏",
    "gender": "男",
    "birth_date": "2004-06-01",
    "current_city": "北京市昌平区",
    "target_city": "北京、合肥、苏州、南京、全国",
    "native_place": "安徽省安庆市",
    "school": "安徽信息工程学院",
    "major": "软件工程",
    "discipline_category": "工学",
    "degree": "本科",
    "graduation_date": "2027-06",
    "work_years": "应届生",
    "expected_salary": "12K/月",
    "github_url": "https://github.com/wsp-666/yunyu",
    "language_ability": "大学英语四级（CET-4），514分；能够阅读英文技术文档，具备日常沟通基础。",
    "certificates": "大学英语四级（CET-4，514分）",
}
ACTIVE_QUEUE_STATUSES = ("running", "paused", "waiting_login", "waiting_confirmation")
TERMINAL_TASK_STATUSES = ("succeeded", "failed", "skipped", "cancelled")
IN_PROGRESS_TASK_STATUSES = (
    "opening",
    "waiting_login",
    "filling",
    "ready_to_submit",
    "submitting",
)
QUEUEABLE_JOB_STATUSES = ("pending", "preparing", "ready", "greeted")

TASK_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"opening", "cancelled", "skipped"},
    "opening": {"waiting_login", "filling", "failed", "skipped", "cancelled"},
    "waiting_login": {"opening", "filling", "failed", "skipped", "cancelled"},
    "filling": {"ready_to_submit", "submitting", "failed", "skipped", "cancelled"},
    "ready_to_submit": {"submitting", "succeeded", "failed", "skipped", "cancelled"},
    "submitting": {"ready_to_submit", "succeeded", "failed", "skipped", "cancelled"},
    "failed": {"queued", "cancelled", "skipped"},
    "skipped": {"queued"},
    "cancelled": {"queued"},
    "succeeded": set(),
}


def _load_resume_json(resume: Resume | None) -> dict:
    if not resume:
        return {}
    try:
        data = json.loads(resume.parsed_json or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _default_resume(db: Session, resume_id: int | None = None) -> Resume | None:
    if resume_id:
        row = db.query(Resume).filter(Resume.id == resume_id).first()
        if row:
            return row
    row = db.query(Resume).filter(Resume.is_default == True).first()  # noqa: E712
    if row:
        return row
    return db.query(Resume).order_by(Resume.created_at.desc()).first()


def _guess_education_fields(text: str) -> dict[str, str]:
    normalized = (text or "").replace("｜", "|")
    first_line = next((line.strip() for line in normalized.splitlines() if line.strip()), "")
    chunks = [part.strip() for part in re.split(r"[|丨·]", first_line) if part.strip()]
    degree = next(
        (item for item in ("博士", "硕士", "本科", "大专", "高中") if item in normalized),
        "",
    )
    return {
        "school": chunks[0] if chunks else "",
        "major": chunks[1] if len(chunks) > 1 else "",
        "degree": degree,
    }


def _split_resume_sections(text: str) -> tuple[str, dict[str, str]]:
    """Keep resume sections isolated even when a parser appends them to projects."""
    section_patterns = {
        "awards": re.compile(r"^(荣誉奖项|获奖经历|奖项荣誉|竞赛获奖|荣誉与奖项)$", re.I),
        "language_ability": re.compile(r"^(语言能力|外语能力|英语水平|外语水平)$", re.I),
        "certificates": re.compile(r"^(证书|资格证书|技能证书|证书资质)$", re.I),
        "campus_experience": re.compile(r"^(校园经历|校内经历|学生工作|社团经历)$", re.I),
    }
    unrelated_heading = re.compile(
        r"^(个人优势|自我评价|个人简介|教育经历|教育背景|专业技能|技能清单|工作经历|实习经历)$",
        re.I,
    )
    buckets: dict[str, list[str]] = {"projects": []}
    active = "projects"
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        heading = re.sub(r"^[#*\-\s]+|[：:]$", "", line).strip()
        matched = next((key for key, pattern in section_patterns.items() if pattern.fullmatch(heading)), None)
        if matched:
            active = matched
            buckets.setdefault(active, [])
            continue
        if unrelated_heading.fullmatch(heading):
            active = "ignore"
            continue
        if active != "ignore":
            buckets.setdefault(active, []).append(raw_line)
    cleaned = {key: "\n".join(lines).strip() for key, lines in buckets.items()}
    return cleaned.pop("projects", ""), cleaned


def _profile_from_resume(resume: Resume | None) -> dict:
    parsed = _load_resume_json(resume)
    edu = _guess_education_fields(str(parsed.get("education") or ""))
    skills = parsed.get("skills") or []
    if not isinstance(skills, list):
        skills = [item.strip() for item in str(skills).split(",") if item.strip()]
    projects, extracted = _split_resume_sections(str(parsed.get("projects") or ""))
    return {
        "full_name": str(parsed.get("full_name") or ""),
        "phone": str(parsed.get("phone") or ""),
        "email": str(parsed.get("email") or ""),
        "school": edu["school"],
        "major": edu["major"],
        "degree": edu["degree"],
        "summary": str(parsed.get("summary") or ""),
        "education": str(parsed.get("education") or ""),
        "experience": str(parsed.get("experience") or ""),
        "projects": projects,
        "awards": str(parsed.get("awards") or parsed.get("honors") or extracted.get("awards") or ""),
        "language_ability": str(parsed.get("language_ability") or parsed.get("languages") or extracted.get("language_ability") or ""),
        "certificates": str(parsed.get("certificates") or extracted.get("certificates") or ""),
        "campus_experience": str(parsed.get("campus_experience") or extracted.get("campus_experience") or ""),
        "skills": [str(item) for item in skills if str(item).strip()][:50],
        "resume_id": resume.id if resume else None,
    }


def _load_saved_profile(db: Session) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == PROFILE_SETTING_KEY).first()
    if not row:
        return {}
    try:
        data = json.loads(row.value_json or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _template_meta(text: str, label: str) -> str:
    match = re.search(rf"^\*\*{re.escape(label)}：\*\*\s*(.+?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def _template_section(text: str, heading: str) -> str:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$\n+(.*?)(?=^##\s+|\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _application_answer_templates() -> list[dict]:
    if not ANSWER_TEMPLATE_DIR.is_dir():
        return []
    templates: list[dict] = []
    for path in sorted(ANSWER_TEMPLATE_DIR.glob("[0-9][0-9]-*.md")):
        if path.name.startswith("00-"):
            continue
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^#\s+(.+?)｜投递资料\s*$", text, re.MULTILINE)
        name = title_match.group(1).strip() if title_match else path.stem
        internship_full = _template_section(text, "实习经历｜完整版")
        internship = _template_section(text, "实习经历｜标准版")
        internship_short = _template_section(text, "实习经历｜精简版")
        project_full = _template_section(text, "项目经历｜完整版")
        project = _template_section(text, "项目经历｜标准版")
        project_short = _template_section(text, "项目经历｜精简版")
        personal = _template_section(text, "个人优势/自我评价")
        if not internship or not project:
            continue
        answers = {
            "实习经历": internship,
            "工作经历": internship,
            "实习内容": internship,
            "工作内容": internship,
            "实习经历（完整版）": internship_full,
            "工作经历（完整版）": internship_full,
            "实习经历（精简版）": internship_short,
            "项目经历": project,
            "项目描述": project,
            "项目内容": project,
            "项目经历（完整版）": project_full,
            "项目描述（完整版）": project_full,
            "项目经历（精简版）": project_short,
            "个人优势": personal,
            "自我评价": personal,
        }
        templates.append(
            {
                "id": f"job-doc-{path.stem}",
                "name": f"{name}资料",
                "job_category": _template_meta(text, "岗位分类") or name,
                "resume_id": None,
                "resume_hint": _template_meta(text, "关联简历"),
                "description": f"来自岗位独立文档：{path.name}；提供完整、标准、精简三档，单框字段默认使用标准版。",
                "answers": {key: value for key, value in answers.items() if value},
            }
        )
    return templates


def _category_family(value: str) -> str:
    normalized = re.sub(r"[\s/／、_\-]+", "", (value or "").lower())
    rules = (
        ("ai_fde", lambda: "ai" in normalized and any(key in normalized for key in ("fde", "交付", "解决方案"))),
        ("network_presales", lambda: "售前" in normalized and any(key in normalized for key in ("安全", "网络"))),
        ("product_assistant", lambda: "产品" in normalized and "助理" in normalized),
        ("project_assistant", lambda: "项目" in normalized and "助理" in normalized),
        ("tob_sales", lambda: any(key in normalized for key in ("tob", "商务拓展", "bd"))),
        ("java", lambda: "java" in normalized),
        ("fullstack", lambda: "全栈" in normalized),
        ("ai_app", lambda: "ai" in normalized or "人工智能" in normalized),
        ("fde", lambda: any(key in normalized for key in ("fde", "客户部署", "实施交付"))),
        ("presales", lambda: any(key in normalized for key in ("售前", "方案顾问"))),
        ("aftersales", lambda: any(key in normalized for key in ("售后", "技术支持", "实施支持"))),
        ("product", lambda: "产品" in normalized),
        ("project", lambda: any(key in normalized for key in ("项目", "pmo"))),
        ("sales", lambda: any(key in normalized for key in ("销售", "客户经理"))),
        ("software", lambda: any(key in normalized for key in ("软件", "开发", "研发"))),
    )
    return next((family for family, matches in rules if matches()), normalized)


def _answer_set_for_job(profile: ApplicationProfile, job_context: str):
    family = _category_family(job_context)
    if not family:
        return None
    return next(
        (
            item for item in profile.answer_sets
            if _category_family(f"{item.job_category} {item.name}") == family
        ),
        None,
    )


def _application_profile(db: Session, job_context: str = "") -> ApplicationProfileOut:
    bundled_resumes = ensure_bundled_resumes(db)
    saved = _load_saved_profile(db)
    resume = _default_resume(db, saved.get("resume_id"))
    data = _profile_from_resume(resume)
    data.update(KNOWN_PROFILE_FIELDS)
    if saved:
        data.update(saved)
    cleaned_projects, extracted_sections = _split_resume_sections(str(data.get("projects") or ""))
    data["projects"] = cleaned_projects
    for key, value in extracted_sections.items():
        if value and not str(data.get(key) or "").strip():
            data[key] = value
    profile = ApplicationProfile(**data)

    templates = _application_answer_templates()
    if templates:
        existing_by_id = {item.id: item for item in profile.answer_sets if item.id}
        template_ids = {str(item["id"]) for item in templates}
        custom_sets = [item for item in profile.answer_sets if item.id not in template_ids]
        imported_sets: list[ApplicationAnswerSet] = []
        for template in templates:
            existing = existing_by_id.get(str(template["id"]))
            resume_key = resume_key_from_hint(str(template.get("resume_hint") or template.get("job_category") or ""))
            bundled_resume = bundled_resumes.get(resume_key)
            resume_id = existing.resume_id if existing and existing.resume_id else None
            if resume_id is None and bundled_resume:
                resume_id = bundled_resume.id
            imported_sets.append(
                ApplicationAnswerSet(
                    id=str(template["id"]),
                    name=str(template["name"]),
                    job_category=str(template["job_category"]),
                    resume_id=resume_id,
                    description=str(template["description"]),
                    answers=dict(template["answers"]),
                )
            )
        profile.answer_sets = [*custom_sets, *imported_sets]
        if not profile.active_answer_set_id or profile.active_answer_set_id not in {
            item.id for item in profile.answer_sets
        }:
            profile.active_answer_set_id = imported_sets[0].id

    active_set = _answer_set_for_job(profile, job_context) if job_context else None
    if not active_set:
        active_set = next(
            (item for item in profile.answer_sets if item.id and item.id == profile.active_answer_set_id),
            None,
        )
    elif active_set.id:
        profile.active_answer_set_id = active_set.id
    effective_custom_fields = dict(profile.custom_fields)
    if active_set:
        effective_custom_fields.update(
            {
                str(key).strip(): str(value).strip()
                for key, value in active_set.answers.items()
                if str(key).strip() and str(value).strip()
            }
        )
        if active_set.resume_id:
            profile.resume_id = active_set.resume_id

    resume = _default_resume(db, profile.resume_id)
    uploadable = False
    resume_url: str | None = None
    resume_name = ""
    if resume:
        path = Path(resume.file_path)
        resume_name = resume.name
        if path.suffix and not Path(resume_name).suffix:
            resume_name = f"{resume_name}{path.suffix.lower()}"
        uploadable = path.is_file() and path.suffix.lower() in {".pdf", ".doc", ".docx"}
        if uploadable:
            resume_url = f"/api/applications/profile/resume-file?resume_id={resume.id}"

    return ApplicationProfileOut(
        **profile.model_dump(),
        resume_name=resume_name,
        has_uploadable_resume=uploadable,
        resume_file_url=resume_url,
        effective_custom_fields=effective_custom_fields,
    )


def _application_summary(db: Session) -> ApplicationSummaryOut:
    rows = db.query(Job.status).all()
    stage_counts = {stage: 0 for stage in APPLICATION_STAGE_IDS}
    for (status,) in rows:
        normalized = status if status in APPLICATION_STAGE_MAP else "pending"
        stage_counts[normalized] += 1

    now = utc_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today_start + timedelta(days=1)
    overdue = (
        db.query(Job)
        .filter(
            Job.next_action_at.isnot(None),
            Job.next_action_at < now,
            Job.status.notin_(TERMINAL_APPLICATION_STAGES),
        )
        .count()
    )
    due_today = (
        db.query(Job)
        .filter(Job.next_action_at >= today_start, Job.next_action_at < tomorrow)
        .count()
    )
    applied = sum(stage_counts.get(stage, 0) for stage in APPLIED_OR_LATER_STAGES)
    interviews = sum(
        stage_counts.get(stage, 0)
        for stage in ("written_test", "interview", "final_interview")
    )
    offers = stage_counts.get("offer", 0) + stage_counts.get("hired", 0)
    total = len(rows)
    active = sum(
        count
        for stage, count in stage_counts.items()
        if stage not in TERMINAL_APPLICATION_STAGES
    )
    return ApplicationSummaryOut(
        total=total,
        active=active,
        applied=applied,
        interviews=interviews,
        offers=offers,
        overdue_actions=overdue,
        due_today=due_today,
        conversion_rate=round((offers / applied * 100), 1) if applied else 0.0,
        stage_counts=stage_counts,
    )


def _apply_pipeline_patch(db: Session, job: Job, payload: JobPipelineUpdate, actor: str = "user") -> Job:
    return apply_job_pipeline_patch(db, job, payload, actor=actor)


def _task_out(task: ApplicationTask, *, include_job: bool = True) -> ApplicationTaskOut:
    return ApplicationTaskOut(
        id=task.id,
        queue_id=task.queue_id,
        job_id=task.job_id,
        sequence=task.sequence,
        priority=task.priority,
        status=task.status,
        attempt_count=task.attempt_count,
        last_error=task.last_error or "",
        result_message=task.result_message or "",
        page_url=task.page_url or "",
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        job=job_to_out(task.job) if include_job and task.job else None,
    )


def _queue_out(queue: ApplicationQueue, *, include_tasks: bool = True) -> ApplicationQueueOut:
    tasks = sorted(queue.tasks, key=lambda item: item.sequence) if include_tasks else []
    return ApplicationQueueOut(
        id=queue.id,
        name=queue.name,
        status=queue.status,
        auto_submit=queue.auto_submit,
        total=queue.total,
        processed=queue.processed,
        succeeded=queue.succeeded,
        failed=queue.failed,
        created_at=queue.created_at,
        started_at=queue.started_at,
        completed_at=queue.completed_at,
        tasks=[_task_out(task) for task in tasks],
    )


def _refresh_queue_counts(queue: ApplicationQueue) -> None:
    queue.total = len(queue.tasks)
    queue.processed = sum(task.status in TERMINAL_TASK_STATUSES for task in queue.tasks)
    queue.succeeded = sum(task.status == "succeeded" for task in queue.tasks)
    queue.failed = sum(task.status == "failed" for task in queue.tasks)
    if queue.status != "cancelled" and queue.total > 0 and queue.processed >= queue.total:
        queue.status = "completed"
        queue.completed_at = queue.completed_at or utc_now()


@router.get("/workspace", response_model=ApplicationWorkspaceOut)
def application_workspace(
    status: str = Query(""),
    keyword: str = Query(""),
    priority: int | None = Query(None, ge=1, le=5),
    db: Session = Depends(get_db),
):
    query = db.query(Job)
    if status:
        statuses = [item.strip() for item in status.split(",") if item.strip()]
        invalid = [item for item in statuses if item not in APPLICATION_STAGE_MAP]
        if invalid:
            raise HTTPException(400, f"无效状态：{', '.join(invalid)}")
        if statuses:
            query = query.filter(Job.status.in_(statuses))
    if priority is not None:
        query = query.filter(Job.priority == priority)
    token = keyword.strip()
    if token:
        like = f"%{token}%"
        query = query.filter(
            or_(
                Job.job_title.like(like),
                Job.company.like(like),
                Job.city.like(like),
                Job.application_notes.like(like),
            )
        )
    rows = query.order_by(Job.created_at.desc(), Job.id.desc()).limit(2000).all()
    return ApplicationWorkspaceOut(
        stages=application_stage_meta(),
        priorities=[dict(item) for item in PRIORITIES],
        summary=_application_summary(db),
        jobs=[job_to_out(job) for job in rows],
    )


@router.get("/summary", response_model=ApplicationSummaryOut)
def application_summary(db: Session = Depends(get_db)):
    return _application_summary(db)


@router.post("/jobs/bulk-delete", response_model=ApplicationBulkDeleteOut)
def bulk_delete_application_jobs(
    payload: ApplicationBulkDeleteRequest,
    db: Session = Depends(get_db),
):
    job_ids = set(payload.job_ids)
    active_task = (
        db.query(ApplicationTask)
        .join(ApplicationQueue, ApplicationQueue.id == ApplicationTask.queue_id)
        .filter(
            ApplicationTask.job_id.in_(job_ids),
            ApplicationQueue.status.in_(ACTIVE_QUEUE_STATUSES),
            ApplicationTask.status.notin_(TERMINAL_TASK_STATUSES),
        )
        .first()
    )
    if active_task:
        raise HTTPException(409, "所选岗位中有正在自动投递的任务，请先完成或取消任务")
    rows = db.query(Job).filter(Job.id.in_(job_ids)).all()
    for job in rows:
        db.delete(job)
    db.commit()
    return ApplicationBulkDeleteOut(requested=len(job_ids), deleted=len(rows))


@router.post("/jobs/{job_id}/duplicate", response_model=JobOut)
def duplicate_application_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    copy = Job(
        user_id=job.user_id,
        platform=job.platform,
        job_title=job.job_title,
        company=job.company,
        salary=job.salary,
        city=job.city,
        jd_text=job.jd_text,
        job_url=job.job_url,
        hr_name=job.hr_name,
        hr_title=job.hr_title,
        match_score=job.match_score,
        role_match_score=job.role_match_score,
        benefits_match_score=job.benefits_match_score,
        company_match_score=job.company_match_score,
        company_size=job.company_size,
        company_industry=job.company_industry,
        status=job.status,
        has_greeted=job.has_greeted,
        has_applied_resume=job.has_applied_resume,
        interview_round=job.interview_round,
        offer_status=job.offer_status,
        priority=job.priority,
        job_category=job.job_category,
        application_channel=job.application_channel,
        contact_name=job.contact_name,
        contact_info=job.contact_info,
        application_notes=job.application_notes,
        application_tags_json=job.application_tags_json,
        written_test_status=job.written_test_status,
        interview_stage=job.interview_stage,
        assessment_status=job.assessment_status,
        screening_status=job.screening_status,
        first_interview_status=job.first_interview_status,
        second_interview_status=job.second_interview_status,
        third_interview_status=job.third_interview_status,
        final_interview_status=job.final_interview_status,
        applied_at=job.applied_at,
        next_action_at=job.next_action_at,
        interview_at=job.interview_at,
        last_follow_up_at=job.last_follow_up_at,
        status_updated_at=job.status_updated_at,
        tailored_resume_json=job.tailored_resume_json,
    )
    db.add(copy)
    db.flush()
    record_application_event(
        db,
        copy,
        event_type="duplicated",
        note=f"复制自岗位 #{job.id}「{job.company} / {job.job_title}」",
        actor="user",
    )
    db.commit()
    db.refresh(copy)
    return job_to_out(copy)


def _normalize_manual_url(value: str) -> str:
    """生成用于手工录入岗位去重的稳定键。"""
    if not value:
        return ""
    candidate = value.strip().lower()
    candidate = re.sub(r"#.*$", "", candidate)
    candidate = candidate.rstrip("/")
    return candidate


@router.post("/jobs", response_model=JobOut)
def create_manual_job(payload: ManualJobCreate, db: Session = Depends(get_db)):
    """在工作台手工新增岗位：链接已存在则合并到原记录，否则新建为待投递。"""
    target_url = payload.job_url.strip()
    if not target_url:
        raise HTTPException(400, "岗位链接不能为空")
    normalized = _normalize_manual_url(target_url)

    existing: Job | None = None
    if normalized:
        for candidate in db.query(Job).all():
            if _normalize_manual_url(candidate.job_url) == normalized:
                existing = candidate
                break

    tags_json = json.dumps(payload.application_tags or [], ensure_ascii=False)
    if existing is not None:
        existing.company = payload.company.strip() or existing.company
        existing.job_title = payload.job_title.strip() or existing.job_title
        if payload.salary is not None:
            existing.salary = payload.salary
        if payload.city is not None:
            existing.city = payload.city
        if payload.job_category is not None:
            existing.job_category = payload.job_category
        if payload.application_channel is not None:
            existing.application_channel = payload.application_channel
        if payload.application_notes is not None:
            existing.application_notes = payload.application_notes
        if payload.interview_stage is not None:
            existing.interview_stage = payload.interview_stage
        if payload.application_tags:
            existing.application_tags_json = tags_json
        if payload.contact_name is not None:
            existing.contact_name = payload.contact_name
        if payload.contact_info is not None:
            existing.contact_info = payload.contact_info
        existing.job_url = target_url
        if payload.platform:
            existing.platform = payload.platform
        if payload.priority is not None:
            existing.priority = payload.priority
        if payload.applied_at is not None:
            existing.applied_at = payload.applied_at
        if payload.next_action_at is not None:
            existing.next_action_at = payload.next_action_at
        job = existing
        event_type = "manual_updated"
        note = "用户在投递工作台补充了岗位信息"
    else:
        job = Job(
            platform=payload.platform or "manual",
            job_title=payload.job_title.strip(),
            company=payload.company.strip(),
            salary=payload.salary.strip() if payload.salary else "",
            city=payload.city.strip() if payload.city else "",
            jd_text="",
            job_url=target_url,
            hr_name="",
            hr_title="",
            match_score=0.0,
            company_match_score=0.0,
            role_match_score=0.0,
            benefits_match_score=0.0,
            status=payload.status or "pending",
            priority=payload.priority or 3,
            job_category=payload.job_category or "",
            application_channel=payload.application_channel or "",
            contact_name=payload.contact_name or "",
            contact_info=payload.contact_info or "",
            application_notes=payload.application_notes or "",
            interview_stage=payload.interview_stage or "",
            application_tags_json=tags_json,
            applied_at=payload.applied_at,
            next_action_at=payload.next_action_at,
        )
        db.add(job)
        db.flush()
        event_type = "manual_created"
        note = "用户在投递工作台新增了一条岗位"

    if payload.status and payload.status != job.status:
        job.status = payload.status
    db.flush()
    record_application_event(
        db,
        job,
        event_type=event_type,
        note=note,
        actor="user",
    )
    db.commit()
    db.refresh(job)
    return job_to_out(job)


@router.post("/import", response_model=ApplicationImportResultOut)
async def import_progress_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "").name
    try:
        content = await file.read(MAX_IMPORT_BYTES + 1)
    finally:
        await file.close()
    try:
        return ApplicationImportResultOut(
            **import_application_progress(db, filename=filename, content=content)
        )
    except ApplicationImportError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/import-template", include_in_schema=False)
def download_progress_import_template():
    filename = "求职进度导入模板.xlsx"
    headers = {
        "Content-Disposition": (
            f"attachment; filename=application-progress-template.xlsx; "
            f"filename*=UTF-8''{quote(filename)}"
        )
    }
    return StreamingResponse(
        BytesIO(build_application_import_template()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.patch("/jobs/{job_id}", response_model=JobOut)
def update_application_job(
    job_id: int,
    payload: JobPipelineUpdate,
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "岗位不存在")
    _apply_pipeline_patch(db, job, payload)
    db.commit()
    db.refresh(job)
    return job_to_out(job)


@router.get("/jobs/{job_id}/events", response_model=list[ApplicationEventOut])
def application_events(job_id: int, db: Session = Depends(get_db)):
    if not db.query(Job.id).filter(Job.id == job_id).first():
        raise HTTPException(404, "岗位不存在")
    return (
        db.query(ApplicationEvent)
        .filter(ApplicationEvent.job_id == job_id)
        .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc())
        .limit(200)
        .all()
    )


@router.get("/profile", response_model=ApplicationProfileOut)
def get_application_profile(db: Session = Depends(get_db)):
    return _application_profile(db)


@router.get("/profile/answer-templates")
def get_application_answer_templates():
    return _application_answer_templates()


@router.put("/profile", response_model=ApplicationProfileOut)
def save_application_profile(payload: ApplicationProfile, db: Session = Depends(get_db)):
    if payload.resume_id and not db.query(Resume.id).filter(Resume.id == payload.resume_id).first():
        raise HTTPException(400, "所选简历不存在")
    resume_ids = {resume_id for (resume_id,) in db.query(Resume.id).all()}
    invalid_answer_resumes = [
        item.resume_id for item in payload.answer_sets
        if item.resume_id is not None and item.resume_id not in resume_ids
    ]
    if invalid_answer_resumes:
        raise HTTPException(400, "问答资料套装关联的简历不存在")
    answer_set_ids = [item.id for item in payload.answer_sets if item.id]
    if len(answer_set_ids) != len(set(answer_set_ids)):
        raise HTTPException(400, "问答资料套装 ID 不能重复")
    if payload.active_answer_set_id and payload.active_answer_set_id not in answer_set_ids:
        raise HTTPException(400, "当前选择的问答资料套装不存在")
    row = db.query(AppSetting).filter(AppSetting.key == PROFILE_SETTING_KEY).first()
    value = json.dumps(payload.model_dump(), ensure_ascii=False)
    if row:
        row.value_json = value
    else:
        db.add(AppSetting(key=PROFILE_SETTING_KEY, value_json=value))
    db.commit()
    return _application_profile(db)


@router.get("/profile/resume-file", include_in_schema=False)
def application_resume_file(
    resume_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    profile = _application_profile(db)
    resume = _default_resume(db, resume_id or profile.resume_id)
    if not resume:
        raise HTTPException(404, "尚未选择简历")
    path = Path(resume.file_path)
    if not path.is_file() or path.suffix.lower() not in {".pdf", ".doc", ".docx"}:
        raise HTTPException(404, "所选简历没有可上传的原始文件")
    media = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
    }[path.suffix.lower()]
    filename = resume.name if Path(resume.name).suffix else f"{resume.name}{path.suffix.lower()}"
    return FileResponse(path, media_type=media, filename=filename)


@router.post("/queues", response_model=ApplicationQueueOut)
def create_application_queue(payload: ApplicationQueueCreate, db: Session = Depends(get_db)):
    active = (
        db.query(ApplicationQueue)
        .filter(ApplicationQueue.status.in_(ACTIVE_QUEUE_STATUSES))
        .order_by(ApplicationQueue.id.desc())
        .first()
    )
    if active:
        raise HTTPException(409, f"已有未结束的投递任务 #{active.id}，请先继续或取消")

    query = db.query(Job).filter(Job.job_url != "")
    if payload.job_ids:
        query = query.filter(Job.id.in_(set(payload.job_ids)))
    else:
        query = query.filter(
            Job.status.in_(QUEUEABLE_JOB_STATUSES),
            Job.priority <= payload.max_priority,
            Job.match_score >= payload.min_match_score,
        )
    jobs = (
        query.order_by(Job.priority.asc(), Job.match_score.desc(), Job.updated_at.desc())
        .limit(payload.max_count)
        .all()
    )
    jobs = [job for job in jobs if job.status not in TERMINAL_APPLICATION_STAGES]
    if not jobs:
        raise HTTPException(400, "没有符合条件的待投递岗位")

    now = utc_now()
    queue = ApplicationQueue(
        name=payload.name.strip() or f"自动投递 {now.strftime('%Y-%m-%d %H:%M')}",
        status="running",
        auto_submit=payload.auto_submit,
        total=len(jobs),
        settings_json=json.dumps(payload.model_dump(), ensure_ascii=False),
        started_at=now,
    )
    db.add(queue)
    db.flush()
    for sequence, job in enumerate(jobs, 1):
        db.add(
            ApplicationTask(
                queue_id=queue.id,
                job_id=job.id,
                sequence=sequence,
                priority=job.priority,
                status="queued",
                page_url=job.job_url,
            )
        )
        record_application_event(
            db,
            job,
            event_type="queued",
            note=f"加入自动投递任务 #{queue.id}，队列顺序 {sequence}",
            actor="automation",
        )
    db.commit()
    db.refresh(queue)
    return _queue_out(queue)


@router.get("/queues", response_model=list[ApplicationQueueOut])
def list_application_queues(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.query(ApplicationQueue).order_by(ApplicationQueue.id.desc()).limit(limit).all()
    return [_queue_out(row) for row in rows]


@router.get("/queues/current", response_model=ApplicationQueueOut | None)
def current_application_queue(db: Session = Depends(get_db)):
    queue = (
        db.query(ApplicationQueue)
        .filter(ApplicationQueue.status.in_(ACTIVE_QUEUE_STATUSES))
        .order_by(ApplicationQueue.id.desc())
        .first()
    )
    return _queue_out(queue) if queue else None


@router.get("/queues/{queue_id}", response_model=ApplicationQueueOut)
def get_application_queue(queue_id: int, db: Session = Depends(get_db)):
    queue = db.query(ApplicationQueue).filter(ApplicationQueue.id == queue_id).first()
    if not queue:
        raise HTTPException(404, "投递任务不存在")
    _refresh_queue_counts(queue)
    db.commit()
    return _queue_out(queue)


@router.post("/queues/{queue_id}/next", response_model=ApplicationNextTaskOut)
def claim_next_application_task(queue_id: int, db: Session = Depends(get_db)):
    queue = db.query(ApplicationQueue).filter(ApplicationQueue.id == queue_id).first()
    if not queue:
        raise HTTPException(404, "投递任务不存在")
    if queue.status == "paused":
        return ApplicationNextTaskOut(queue=_queue_out(queue), task=None, profile=None)
    if queue.status in {"completed", "cancelled"}:
        return ApplicationNextTaskOut(queue=_queue_out(queue), task=None, profile=None)

    task = (
        db.query(ApplicationTask)
        .filter(
            ApplicationTask.queue_id == queue.id,
            ApplicationTask.status.in_(IN_PROGRESS_TASK_STATUSES),
        )
        .order_by(ApplicationTask.sequence.asc())
        .first()
    )
    if not task:
        task = (
            db.query(ApplicationTask)
            .filter(ApplicationTask.queue_id == queue.id, ApplicationTask.status == "queued")
            .order_by(ApplicationTask.sequence.asc())
            .first()
        )
        if task:
            task.status = "opening"
            task.started_at = task.started_at or utc_now()
            task.attempt_count += 1
            task.last_error = ""
            queue.status = "running"
            record_application_event(
                db,
                task.job,
                event_type="automation_started",
                note=f"自动投递开始，第 {task.sequence}/{queue.total} 个",
                actor="automation",
            )

    if not task:
        _refresh_queue_counts(queue)
        if queue.processed >= queue.total:
            queue.status = "completed"
            queue.completed_at = queue.completed_at or utc_now()
        db.commit()
        return ApplicationNextTaskOut(queue=_queue_out(queue), task=None, profile=None)

    db.commit()
    db.refresh(task)
    return ApplicationNextTaskOut(
        queue=_queue_out(queue),
        task=_task_out(task),
        profile=_application_profile(
            db,
            f"{task.job.job_category} {task.job.job_title}",
        ),
    )


@router.patch("/tasks/{task_id}", response_model=ApplicationQueueOut)
def update_application_task(
    task_id: int,
    payload: ApplicationTaskStateUpdate,
    db: Session = Depends(get_db),
):
    task = db.query(ApplicationTask).filter(ApplicationTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "投递子任务不存在")
    current = task.status
    if payload.status != current and payload.status not in TASK_TRANSITIONS.get(current, set()):
        raise HTTPException(409, f"子任务不能从 {current} 变更为 {payload.status}")

    task.status = payload.status
    if payload.page_url:
        task.page_url = payload.page_url
    if payload.status == "failed":
        task.last_error = payload.message or "自动填写失败"
    else:
        task.result_message = payload.message
    if payload.status in TERMINAL_TASK_STATUSES:
        task.completed_at = utc_now()

    queue = task.queue
    if payload.status == "waiting_login":
        queue.status = "waiting_login"
    elif payload.status == "ready_to_submit":
        queue.status = "waiting_confirmation"
    elif payload.status in {"opening", "filling", "submitting", "queued"}:
        queue.status = "running"

    if payload.status == "succeeded":
        set_job_status(
            db,
            task.job,
            "applied",
            note=payload.message or "自动填写并提交完成",
            actor="automation",
        )
        task.job.application_channel = task.job.application_channel or "浏览器自动投递"
    elif payload.status in {"failed", "skipped", "cancelled"}:
        record_application_event(
            db,
            task.job,
            event_type=f"automation_{payload.status}",
            note=payload.message,
            actor="automation",
        )

    _refresh_queue_counts(queue)
    db.commit()
    db.refresh(queue)
    return _queue_out(queue)


@router.post("/queues/{queue_id}/{action}", response_model=ApplicationQueueOut)
def control_application_queue(queue_id: int, action: str, db: Session = Depends(get_db)):
    queue = db.query(ApplicationQueue).filter(ApplicationQueue.id == queue_id).first()
    if not queue:
        raise HTTPException(404, "投递任务不存在")
    if action == "pause":
        if queue.status in {"completed", "cancelled"}:
            raise HTTPException(409, "已结束的任务不能暂停")
        queue.status = "paused"
    elif action == "resume":
        if queue.status in {"completed", "cancelled"}:
            raise HTTPException(409, "已结束的任务不能继续")
        if any(task.status == "ready_to_submit" for task in queue.tasks):
            raise HTTPException(409, "请先在扩展侧边栏确认当前岗位是否已提交")
        queue.status = "running"
        waiting = next((task for task in queue.tasks if task.status == "waiting_login"), None)
        if waiting:
            waiting.status = "opening"
    elif action == "cancel":
        if queue.status == "completed":
            raise HTTPException(409, "已完成的任务不能取消")
        queue.status = "cancelled"
        queue.completed_at = utc_now()
        for task in queue.tasks:
            if task.status not in TERMINAL_TASK_STATUSES:
                task.status = "cancelled"
                task.completed_at = utc_now()
    else:
        raise HTTPException(400, "仅支持 pause / resume / cancel")
    _refresh_queue_counts(queue)
    db.commit()
    db.refresh(queue)
    return _queue_out(queue)
