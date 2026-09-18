import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import RESUMES_DIR
from app.core.database import get_db
from app.models.models import Resume
from app.schemas.schemas import (
    ResumeContentUpdate,
    ResumeCreateRequest,
    ResumeOut,
    ResumeTemplateOut,
)
from app.services.access_control import require_active_license
from app.services.application_materials import ensure_bundled_resumes
from app.services.llm_client import LLMError
from app.services.resume_optimizer import optimize_resume_content
from app.services.resume_parser import RESUME_UPLOAD_PURPOSE, parse_resume
from app.services.resume_templates import (
    build_parsed_from_template,
    list_template_meta,
    render_resume_text,
)

router = APIRouter(prefix="/api/resume", tags=["resume"])


def _to_out(resume: Resume) -> ResumeOut:
    try:
        parsed = json.loads(resume.parsed_json)
    except json.JSONDecodeError:
        parsed = {}
    return ResumeOut(
        id=resume.id,
        name=resume.name,
        file_path=resume.file_path,
        parsed_json=parsed,
        is_default=resume.is_default,
        created_at=resume.created_at,
    )


def _load_parsed(resume: Resume) -> dict:
    try:
        return json.loads(resume.parsed_json)
    except json.JSONDecodeError:
        return {}


@router.get("/templates", response_model=list[ResumeTemplateOut])
def list_resume_templates():
    return list_template_meta()


@router.post("/create", response_model=ResumeOut)
def create_resume_from_template(
    body: ResumeCreateRequest,
    db: Session = Depends(get_db),
):
    parsed = build_parsed_from_template(body.template_id)
    save_name = f"{uuid.uuid4().hex}.resume.json"
    save_path = RESUMES_DIR / save_name
    save_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")

    has_default = db.query(Resume).filter(Resume.is_default == True).count()  # noqa: E712
    resume = Resume(
        name=body.name.strip() or "我的简历",
        file_path=str(save_path),
        parsed_json=json.dumps(parsed, ensure_ascii=False),
        is_default=has_default == 0,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _to_out(resume)


@router.post("/upload", response_model=ResumeOut)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "文件名无效")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".doc"}:
        raise HTTPException(400, "仅支持 PDF 或 Word (.docx)")

    save_name = f"{uuid.uuid4().hex}{suffix}"
    save_path = RESUMES_DIR / save_name

    with save_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        parsed = await parse_resume(save_path, purpose=RESUME_UPLOAD_PURPOSE, db=db)
    except ValueError as exc:
        save_path.unlink(missing_ok=True)
        raise HTTPException(400, str(exc)) from exc

    parsed["source"] = "upload"
    has_default = db.query(Resume).filter(Resume.is_default == True).count()  # noqa: E712
    resume = Resume(
        name=file.filename,
        file_path=str(save_path),
        parsed_json=json.dumps(parsed, ensure_ascii=False),
        is_default=has_default == 0,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _to_out(resume)


@router.get("", response_model=ResumeOut | None)
def get_default_resume(db: Session = Depends(get_db)):
    ensure_bundled_resumes(db)
    resume = db.query(Resume).filter(Resume.is_default == True).first()  # noqa: E712
    if not resume:
        resume = db.query(Resume).order_by(Resume.created_at.desc()).first()
    if not resume:
        return None
    return _to_out(resume)


@router.get("/list", response_model=list[ResumeOut])
def list_resumes(db: Session = Depends(get_db)):
    ensure_bundled_resumes(db)
    rows = db.query(Resume).order_by(Resume.created_at.desc()).all()
    return [_to_out(r) for r in rows]


@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "简历不存在")
    return _to_out(resume)


@router.put("/{resume_id}/content", response_model=ResumeOut)
def update_resume_content(
    resume_id: int,
    body: ResumeContentUpdate,
    db: Session = Depends(get_db),
):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "简历不存在")

    parsed = _load_parsed(resume)
    updates = body.model_dump(exclude_none=True)
    parsed.update(updates)
    parsed["source"] = parsed.get("source") or "editor"
    parsed["raw_text"] = render_resume_text(parsed)
    resume.parsed_json = json.dumps(parsed, ensure_ascii=False)
    resume.name = body.full_name.strip() or resume.name

    save_path = Path(resume.file_path)
    if save_path.suffix == ".resume.json":
        save_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")

    db.commit()
    db.refresh(resume)
    return _to_out(resume)


@router.post("/{resume_id}/optimize", response_model=ResumeOut)
async def optimize_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    _license: dict = Depends(require_active_license),
):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "简历不存在")

    parsed = _load_parsed(resume)
    try:
        improved = await optimize_resume_content(parsed, db)
    except LLMError as exc:
        raise HTTPException(400, str(exc)) from exc

    improved["raw_text"] = render_resume_text(improved)
    resume.parsed_json = json.dumps(improved, ensure_ascii=False)

    save_path = Path(resume.file_path)
    if save_path.suffix == ".resume.json":
        save_path.write_text(json.dumps(improved, ensure_ascii=False, indent=2), encoding="utf-8")

    db.commit()
    db.refresh(resume)
    return _to_out(resume)


@router.put("/{resume_id}/default", response_model=ResumeOut)
def set_default_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "简历不存在")
    db.query(Resume).update({Resume.is_default: False})
    resume.is_default = True
    db.commit()
    db.refresh(resume)
    return _to_out(resume)


@router.delete("/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "简历不存在")

    was_default = resume.is_default
    file_path = Path(resume.file_path)
    try:
        resolved = file_path.resolve()
        if resolved.is_file() and resolved.parent.resolve() == RESUMES_DIR.resolve():
            resolved.unlink(missing_ok=True)
    except OSError:
        pass

    db.delete(resume)
    db.commit()

    if was_default:
        next_default = db.query(Resume).order_by(Resume.created_at.desc()).first()
        if next_default:
            next_default.is_default = True
            db.commit()

    return {"ok": True}
