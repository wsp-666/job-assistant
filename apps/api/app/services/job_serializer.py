import json
from typing import Any

from app.models.models import Job
from app.schemas.schemas import JobOut
from app.services.job_pipeline import parse_tags


def _parse_tailored_resume(raw: str) -> dict[str, Any] | None:
    if not raw or not raw.strip():
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def job_to_out(job: Job) -> JobOut:
    base = JobOut.model_validate(job)
    return base.model_copy(
        update={
            "tailored_resume": _parse_tailored_resume(job.tailored_resume_json),
            "application_tags": parse_tags(job.application_tags_json),
        }
    )
