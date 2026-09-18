from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import ApplicationEvent, Job
from app.core.time import utc_now


APPLICATION_STAGES: tuple[dict[str, Any], ...] = (
    {"id": "pending", "label": "待评估", "group": "todo", "rank": 10, "terminal": False},
    {"id": "preparing", "label": "准备材料", "group": "todo", "rank": 20, "terminal": False},
    {"id": "ready", "label": "待投递", "group": "todo", "rank": 30, "terminal": False},
    {"id": "greeted", "label": "已沟通", "group": "active", "rank": 40, "terminal": False},
    {"id": "applied", "label": "已投递", "group": "active", "rank": 50, "terminal": False},
    {"id": "written_test", "label": "笔试", "group": "active", "rank": 60, "terminal": False},
    {"id": "interview", "label": "面试中", "group": "active", "rank": 70, "terminal": False},
    {"id": "final_interview", "label": "终面", "group": "active", "rank": 80, "terminal": False},
    {"id": "offer", "label": "已获 Offer", "group": "success", "rank": 90, "terminal": False},
    {"id": "hired", "label": "已入职", "group": "success", "rank": 100, "terminal": True},
    {"id": "rejected", "label": "未通过", "group": "stopped", "rank": 110, "terminal": True},
    {"id": "withdrawn", "label": "已撤回", "group": "stopped", "rank": 120, "terminal": True},
    {"id": "closed", "label": "岗位关闭", "group": "stopped", "rank": 130, "terminal": True},
    {"id": "skipped", "label": "不考虑", "group": "stopped", "rank": 140, "terminal": True},
)

APPLICATION_STAGE_IDS = tuple(item["id"] for item in APPLICATION_STAGES)
APPLICATION_STAGE_MAP = {item["id"]: item for item in APPLICATION_STAGES}
TERMINAL_APPLICATION_STAGES = {
    item["id"] for item in APPLICATION_STAGES if bool(item["terminal"])
}
APPLIED_OR_LATER_STAGES = {
    "applied",
    "written_test",
    "interview",
    "final_interview",
    "offer",
    "hired",
    "rejected",
}

PRIORITIES: tuple[dict[str, Any], ...] = (
    {"value": 1, "label": "P0 立即投递", "short_label": "P0"},
    {"value": 2, "label": "P1 高优先级", "short_label": "P1"},
    {"value": 3, "label": "P2 正常", "short_label": "P2"},
    {"value": 4, "label": "P3 低优先级", "short_label": "P3"},
    {"value": 5, "label": "暂不处理", "short_label": "P4"},
)


def validate_application_stage(status: str) -> str:
    normalized = (status or "").strip().lower()
    if normalized not in APPLICATION_STAGE_MAP:
        raise ValueError(f"无效投递状态：{status}")
    return normalized


def parse_tags(raw: str) -> list[str]:
    try:
        value = json.loads(raw or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        tag = str(item).strip()
        if tag and tag not in result:
            result.append(tag)
    return result[:20]


def dump_tags(tags: list[str] | None) -> str:
    clean: list[str] = []
    for item in tags or []:
        tag = str(item).strip()
        if tag and tag not in clean:
            clean.append(tag)
    return json.dumps(clean[:20], ensure_ascii=False)


def record_application_event(
    db: Session,
    job: Job,
    *,
    event_type: str,
    from_status: str = "",
    to_status: str = "",
    note: str = "",
    actor: str = "user",
) -> ApplicationEvent:
    row = ApplicationEvent(
        job_id=job.id,
        event_type=event_type[:50],
        from_status=(from_status or "")[:50],
        to_status=(to_status or "")[:50],
        note=(note or "")[:1000],
        actor=(actor or "user")[:50],
    )
    db.add(row)
    return row


def set_job_status(
    db: Session,
    job: Job,
    status: str,
    *,
    note: str = "",
    actor: str = "user",
) -> bool:
    next_status = validate_application_stage(status)
    previous = job.status or "pending"
    if previous == next_status:
        return False

    now = utc_now()
    job.status = next_status
    job.status_updated_at = now

    if next_status == "greeted":
        job.has_greeted = True
    if next_status in APPLIED_OR_LATER_STAGES:
        job.has_applied_resume = True
        if job.applied_at is None:
            job.applied_at = now
    if next_status in {"interview", "final_interview", "offer", "hired"}:
        job.interview_round = max(job.interview_round or 0, 1)
    if next_status == "final_interview":
        job.interview_round = max(job.interview_round or 0, 3)
    if next_status in {"offer", "hired"}:
        job.offer_status = "received"
    elif next_status == "rejected":
        job.offer_status = "rejected"

    record_application_event(
        db,
        job,
        event_type="status_changed",
        from_status=previous,
        to_status=next_status,
        note=note,
        actor=actor,
    )
    return True


def apply_job_pipeline_patch(
    db: Session,
    job: Job,
    payload: Any,
    *,
    actor: str = "user",
) -> Job:
    before = {
        "company": job.company,
        "job_title": job.job_title,
        "job_url": job.job_url,
        "city": job.city,
        "priority": job.priority,
        "job_category": job.job_category,
        "application_channel": job.application_channel,
        "contact_name": job.contact_name,
        "contact_info": job.contact_info,
        "application_notes": job.application_notes,
        "application_tags_json": job.application_tags_json,
        "written_test_status": job.written_test_status,
        "interview_stage": job.interview_stage,
        "assessment_status": job.assessment_status,
        "screening_status": job.screening_status,
        "first_interview_status": job.first_interview_status,
        "second_interview_status": job.second_interview_status,
        "third_interview_status": job.third_interview_status,
        "final_interview_status": job.final_interview_status,
        "next_action_at": job.next_action_at,
        "interview_at": job.interview_at,
        "last_follow_up_at": job.last_follow_up_at,
    }

    if payload.company is not None:
        job.company = payload.company.strip()
    if payload.job_title is not None:
        job.job_title = payload.job_title.strip()
    if payload.job_url is not None:
        job.job_url = payload.job_url.strip()
    if payload.city is not None:
        job.city = payload.city.strip()
    if payload.status is not None:
        set_job_status(db, job, payload.status, note=payload.event_note, actor=actor)
    if payload.priority is not None:
        job.priority = payload.priority
    if payload.job_category is not None:
        job.job_category = payload.job_category.strip()
    if payload.application_channel is not None:
        job.application_channel = payload.application_channel.strip()
    if payload.contact_name is not None:
        job.contact_name = payload.contact_name.strip()
    if payload.contact_info is not None:
        job.contact_info = payload.contact_info.strip()
    if payload.application_notes is not None:
        job.application_notes = payload.application_notes.strip()
    if payload.application_tags is not None:
        job.application_tags_json = dump_tags(payload.application_tags)
    for field in (
        "written_test_status",
        "interview_stage",
        "assessment_status",
        "screening_status",
        "first_interview_status",
        "second_interview_status",
        "third_interview_status",
        "final_interview_status",
    ):
        value = getattr(payload, field, None)
        if value is not None:
            setattr(job, field, value.strip())
    supplied = getattr(payload, "model_fields_set", set())
    if "applied_at" in supplied:
        job.applied_at = payload.applied_at
    if "next_action_at" in supplied:
        job.next_action_at = payload.next_action_at
    if "interview_at" in supplied:
        job.interview_at = payload.interview_at
    if "last_follow_up_at" in supplied:
        job.last_follow_up_at = payload.last_follow_up_at

    if payload.has_greeted is not None:
        job.has_greeted = payload.has_greeted
        if payload.has_greeted and job.status == "pending":
            set_job_status(db, job, "greeted", actor=actor)
    if payload.has_applied_resume is not None:
        job.has_applied_resume = payload.has_applied_resume
        if payload.has_applied_resume and job.status not in APPLIED_OR_LATER_STAGES:
            set_job_status(db, job, "applied", actor=actor)
    if payload.interview_round is not None:
        job.interview_round = payload.interview_round
        if payload.interview_round > 0 and job.status not in {"final_interview", "offer", "hired"}:
            set_job_status(db, job, "interview", actor=actor)
    if payload.offer_status is not None:
        job.offer_status = payload.offer_status
        if payload.offer_status == "received":
            set_job_status(db, job, "offer", actor=actor)
        elif payload.offer_status == "rejected":
            set_job_status(db, job, "rejected", actor=actor)

    after = {key: getattr(job, key) for key in before}
    changed_fields = [key for key, old in before.items() if old != after[key]]
    if changed_fields:
        record_application_event(
            db,
            job,
            event_type="details_updated",
            note=payload.event_note or f"更新字段：{', '.join(changed_fields)}",
            actor=actor,
        )
    job.updated_at = utc_now()
    return job


def application_stage_meta() -> list[dict[str, Any]]:
    return [dict(item) for item in APPLICATION_STAGES]
