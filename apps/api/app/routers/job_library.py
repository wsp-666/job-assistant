from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.schemas import (
    JobLibraryBulkHideOut,
    JobLibraryBulkHideRequest,
    JobLibraryListOut,
    JobLibraryTrackRequest,
    JobOut,
)
from app.services.job_library import list_library, set_entries_hidden, track_library_item
from app.services.job_serializer import job_to_out


router = APIRouter(prefix="/api/job-library", tags=["job-library"])


@router.get("", response_model=JobLibraryListOut)
def get_job_library(
    scope: str = Query("progress", pattern="^(all|progress|recommended)$"),
    keyword: str = Query(""),
    direction: str = Query(""),
    company: str = Query(""),
    hide_applied: bool = Query(False),
    hide_soe: bool = Query(False),
    show_hidden: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=5, le=100),
    db: Session = Depends(get_db),
):
    try:
        return list_library(
            db,
            scope=scope,
            keyword=keyword,
            direction=direction,
            company=company,
            hide_applied=hide_applied,
            hide_soe=hide_soe,
            show_hidden=show_hidden,
            page=page,
            page_size=page_size,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/bulk-hide", response_model=JobLibraryBulkHideOut)
def bulk_hide_library_entries(
    payload: JobLibraryBulkHideRequest,
    db: Session = Depends(get_db),
):
    try:
        return JobLibraryBulkHideOut(**set_entries_hidden(db, payload.source_keys, payload.hidden))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{scope}/{item_id}/track", response_model=JobOut)
def track_job_library_item(
    scope: str,
    item_id: str,
    payload: JobLibraryTrackRequest | None = None,
    db: Session = Depends(get_db),
):
    normalized_scope = "progress" if scope == "recommended" else scope
    if normalized_scope not in {"all", "progress"} or not item_id.startswith(f"{normalized_scope}:"):
        raise HTTPException(400, "信息库岗位编号无效")
    mark_applied = bool(payload and payload.mark_applied)
    try:
        return job_to_out(track_library_item(db, scope=normalized_scope, item_id=item_id, mark_applied=mark_applied))
    except KeyError as exc:
        raise HTTPException(404, "信息库岗位不存在") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
