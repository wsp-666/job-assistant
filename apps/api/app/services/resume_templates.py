from typing import Any

RESUME_TEMPLATES: dict[str, dict[str, Any]] = {
    "comprehensive": {
        "id": "comprehensive",
        "name": "全面简历",
        "description": "完整分段结构，适合在线精修与 AI 优化",
        "defaults": {
            "full_name": "",
            "phone": "",
            "email": "",
            "summary": "【求职意向】\n期望岗位：\n期望城市：\n期望薪资：\n到岗时间：\n\n【个人优势】\n请用 3-5 句话概括你的核心亮点",
            "education": "【教育经历】\n学校名称 | 专业 | 学历 | 起止时间\nGPA / 排名（选填）\n主修课程 / 荣誉（选填）",
            "experience": "【工作 / 实习经历】\n公司名称 | 职位 | 起止时间\n工作职责：\n- \n工作成果（尽量量化）：\n- ",
            "projects": "【项目经历】\n项目名称 | 担任角色 | 起止时间\n项目描述：\n- \n项目成果：\n- ",
            "skills": [],
        },
    },
    "classic": {
        "id": "classic",
        "name": "经典简洁",
        "description": "通用社招/校招，结构清晰",
        "defaults": {
            "full_name": "",
            "phone": "",
            "email": "",
            "summary": "【个人简介】\n请填写你的核心优势、求职意向与亮点（3-5 句）。",
            "education": "【教育经历】\n学校 | 专业 | 学历 | 起止时间",
            "experience": "【工作经历】\n公司 | 岗位 | 起止时间\n- 负责…\n- 成果…",
            "projects": "【项目经历】\n项目名称 | 角色 | 时间\n- 背景与职责\n- 量化成果",
            "skills": ["沟通能力", "团队协作", "学习能力"],
        },
    },
    "campus": {
        "id": "campus",
        "name": "校园实习",
        "description": "侧重实习与项目，适合在校生",
        "defaults": {
            "full_name": "",
            "phone": "",
            "email": "",
            "summary": "【求职意向】\n目标岗位 | 可实习时间 | 到岗时间",
            "education": "【教育背景】\n学校 | 专业 | GPA/排名（如有）",
            "experience": "【实习经历】\n公司 | 岗位 | 时间\n- 工作内容\n- 收获",
            "projects": "【项目/竞赛】\n项目名 | 角色\n- 你做了什么\n- 结果数据",
            "skills": ["Python", "Office", "英语"],
        },
    },
    "technical": {
        "id": "technical",
        "name": "技术研发",
        "description": "突出技术栈与项目成果",
        "defaults": {
            "full_name": "",
            "phone": "",
            "email": "",
            "summary": "【技术概述】\n方向 + 年限 + 熟悉技术栈 + 代表成果",
            "education": "【教育经历】\n学校 | 计算机/相关专业 | 学历",
            "experience": "【工作经历】\n公司 | 研发岗位 | 时间\n- 系统/模块\n- 性能/业务指标提升",
            "projects": "【代表项目】\n技术栈 | 规模 | 你的贡献",
            "skills": ["Python", "Java", "SQL", "Git"],
        },
    },
}


def list_template_meta() -> list[dict[str, str]]:
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "description": item["description"],
        }
        for item in RESUME_TEMPLATES.values()
    ]


def build_parsed_from_template(template_id: str) -> dict[str, Any]:
    template = RESUME_TEMPLATES.get(template_id) or RESUME_TEMPLATES["comprehensive"]
    data = dict(template["defaults"])
    data["template_id"] = template["id"]
    data["source"] = "template"
    data["raw_text"] = render_resume_text(data)
    data["parse_method"] = "editor"
    return data


def render_resume_text(data: dict[str, Any]) -> str:
    skills = data.get("skills") or []
    if isinstance(skills, list):
        skills_text = "、".join(str(item) for item in skills if item)
    else:
        skills_text = str(skills)
    parts = [
        data.get("full_name", ""),
        f"{data.get('phone', '')} {data.get('email', '')}".strip(),
        data.get("summary", ""),
        data.get("education", ""),
        data.get("experience", ""),
        data.get("projects", ""),
        f"技能：{skills_text}" if skills_text else "",
    ]
    return "\n\n".join(part.strip() for part in parts if part and str(part).strip())[:8000]
