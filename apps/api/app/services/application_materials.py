from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import ROOT_DIR
from app.models.models import Resume


@dataclass(frozen=True)
class BundledResumeSpec:
    key: str
    resume_path: str
    document_name: str
    skills: tuple[str, ...]


WORKSPACE_DIR = ROOT_DIR.parent
MATERIALS_DIR = WORKSPACE_DIR / "网申资料" / "岗位资料套装-优化版"

BUNDLED_RESUME_SPECS = (
    BundledResumeSpec("java", "简历/开发/王似鹏-java后端开发简历.html", "01-Java后端开发.md", ("Java", "Spring Boot", "MyBatis-Plus", "MySQL", "Docker")),
    BundledResumeSpec("fullstack", "简历/开发/王似鹏-全栈开发简历.html", "02-全栈开发.md", ("Java", "Vue", "React", "TypeScript", "FastAPI", "MySQL")),
    BundledResumeSpec("ai_app", "简历/开发/王似鹏-AI应用开发简历.html", "03-AI应用开发.md", ("Python", "FastAPI", "React", "LLM", "Prompt", "MySQL")),
    BundledResumeSpec("fde", "简历/FDE/王似鹏-通用FDE客户部署工程师简历.html", "04-FDE客户部署.md", ("Java", "Linux", "Docker", "MySQL", "接口联调", "客户交付")),
    BundledResumeSpec("ai_fde", "简历/FDE/王似鹏-AI FDE应用交付工程师简历.html", "04-FDE客户部署.md", ("FastAPI", "LLM", "Docker", "日志排查", "客户交付")),
    BundledResumeSpec("presales", "简历/售前/王似鹏-售前解决方案工程师简历.html", "07-售前解决方案.md", ("需求澄清", "解决方案", "原型", "PPT", "系统演示")),
    BundledResumeSpec("security_presales", "简历/售前/王似鹏-售前解决方案工程师简历-网络安全.html", "07-售前解决方案.md", ("安全售前", "需求澄清", "方案材料", "攻防演练", "密评等保协同", "接口联调", "问题跟踪")),
    BundledResumeSpec("support", "简历/售后/王似鹏-售后工程师简历.html", "04-FDE客户部署.md", ("技术支持", "问题复现", "日志排查", "用户手册", "接口联调")),
    BundledResumeSpec("product_manager", "简历/产品管理/王似鹏-产品经理简历.html", "06-产品经理产品助理.md", ("需求分析", "业务流程", "原型设计", "数据口径", "产品迭代")),
    BundledResumeSpec("product_assistant", "简历/产品管理/王似鹏-产品助理简历.html", "06-产品经理产品助理.md", ("需求记录", "原型", "用户手册", "问题跟踪", "跨团队协作")),
    BundledResumeSpec("project_manager", "简历/项目管理/王似鹏-项目经理简历.html", "05-项目经理项目交付.md", ("项目交付", "进度管理", "问题管理", "干系人协同", "交付物管理")),
    BundledResumeSpec("project_assistant", "简历/项目管理/王似鹏-项目助理简历.html", "05-项目经理项目交付.md", ("进度跟踪", "问题清单", "会议事项", "材料管理", "项目协同")),
    BundledResumeSpec("account_sales", "简历/销售/王似鹏-大客户销售简历.html", "08-ToB销售商务拓展.md", ("客户开发", "需求沟通", "异议处理", "方案演示", "客户维护")),
    BundledResumeSpec("tob_sales", "简历/销售/王似鹏-ToB销售简历.html", "08-ToB销售商务拓展.md", ("ToB销售", "商务拓展", "需求识别", "顾问式沟通", "客户跟进")),
)


def _section(text: str, heading: str) -> str:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$\n+(.*?)(?=^##\s+|\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _parsed_resume(spec: BundledResumeSpec) -> dict:
    document_path = MATERIALS_DIR / spec.document_name
    text = document_path.read_text(encoding="utf-8") if document_path.is_file() else ""
    summary = _section(text, "个人优势/自我评价") or _section(text, "自我评价")
    experience_full = _section(text, "实习经历｜完整版") or _section(text, "实习经历")
    experience = _section(text, "实习经历｜标准版") or _section(text, "实习经历")
    experience_short = _section(text, "实习经历｜精简版") or experience
    projects_full = _section(text, "项目经历｜完整版") or _section(text, "项目经历")
    projects = _section(text, "项目经历｜标准版") or _section(text, "项目经历")
    projects_short = _section(text, "项目经历｜精简版") or projects
    education = "安徽信息工程学院｜软件工程｜本科｜2023.09—2027.06｜GPA 3.82/4.0，专业前1%"
    raw_text = "\n\n".join(part for part in (summary, education, experience, projects, "、".join(spec.skills)) if part)
    return {
        "source": "bundled_html",
        "bundled_key": spec.key,
        "full_name": "王似鹏",
        "summary": summary,
        "education": education,
        "experience": experience,
        "experience_full": experience_full,
        "experience_short": experience_short,
        "projects": projects,
        "projects_full": projects_full,
        "projects_short": projects_short,
        "skills": list(spec.skills),
        "raw_text": raw_text,
    }


def ensure_bundled_resumes(db: Session) -> dict[str, Resume]:
    existing_by_key: dict[str, Resume] = {}
    for resume in db.query(Resume).all():
        try:
            parsed = json.loads(resume.parsed_json or "{}")
        except json.JSONDecodeError:
            continue
        key = str(parsed.get("bundled_key") or "")
        if key:
            existing_by_key[key] = resume

    result: dict[str, Resume] = {}
    changed = False
    for spec in BUNDLED_RESUME_SPECS:
        source_path = WORKSPACE_DIR / spec.resume_path
        if not source_path.is_file():
            continue
        parsed = _parsed_resume(spec)
        parsed_json = json.dumps(parsed, ensure_ascii=False)
        resume = existing_by_key.get(spec.key)
        if resume:
            next_path = str(source_path)
            if resume.name != source_path.name or resume.file_path != next_path or resume.parsed_json != parsed_json:
                resume.name = source_path.name
                resume.file_path = next_path
                resume.parsed_json = parsed_json
                changed = True
        else:
            resume = Resume(
                name=source_path.name,
                file_path=str(source_path),
                parsed_json=parsed_json,
                is_default=False,
            )
            db.add(resume)
            changed = True
        result[spec.key] = resume
    if changed:
        db.commit()
        for resume in result.values():
            db.refresh(resume)
    return result


def resume_key_from_hint(hint: str) -> str:
    normalized = re.sub(r"[\s/／、_\-.（）()]+", "", (hint or "").lower())
    rules = (
        ("security_presales", ("网络安全",)),
        ("ai_fde", ("aifde", "ai应用交付")),
        ("product_assistant", ("产品助理",)),
        ("project_assistant", ("项目助理",)),
        ("account_sales", ("大客户销售",)),
        ("tob_sales", ("tob销售", "商务拓展")),
        ("fullstack", ("全栈",)),
        ("ai_app", ("ai应用开发",)),
        ("java", ("java", "通用软件")),
        ("fde", ("通用fde", "客户部署")),
        ("presales", ("售前解决方案", "方案顾问")),
        ("support", ("售后", "技术支持")),
        ("product_manager", ("产品经理",)),
        ("project_manager", ("项目经理", "项目交付")),
    )
    return next((key for key, words in rules if any(word in normalized for word in words)), "")
