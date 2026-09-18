"""判断抓取内容是否为真实岗位 JD，过滤导航页、商城页等噪声。"""

import re

from app.services.career_scrapers.base import ScrapedJob

JUNK_PHRASES = (
    "小米商城",
    "购物车",
    "登录",
    "注册",
    "全部商品",
    "商品分类",
    "MIUI",
    "云服务",
    "有品",
    "资质证照",
    "协议规则",
    "下载App",
    "下载 APP",
    "智能生活",
    "企业团购",
    "元起",
    "隐私政策",
    "用户协议",
    "网站地图",
    "官方微博",
    "官方微信",
    "客服热线",
    "Copyright",
    "版权所有",
    "ICP",
    "友情链接",
)

INVALID_TITLES = (
    "职位列表",
    "招聘首页",
    "社会招聘",
    "校园招聘",
    "加入我们",
    "人才招聘",
    "招聘信息",
    "招聘页",
    "未知岗位",
    "小米官网",
    "首页",
    "公司简介",
    "关于我们",
    "企业介绍",
    "公司介绍",
    "集团简介",
    "企业概况",
    "了解我们",
    "品牌故事",
    "发展历程",
    "公司文化",
)

COMPANY_INTRO_PHRASES = (
    "公司简介",
    "关于我们",
    "企业介绍",
    "集团简介",
    "成立于",
    "总部位于",
    "主营业务",
    "上市公司",
    "集团旗下",
    "企业文化",
    "发展历程",
    "品牌愿景",
    "使命愿景",
)

STRUCTURED_PLATFORMS = ("career:moka", "career:zhiye")

JOB_JD_KEYWORDS = (
    "职责",
    "任职要求",
    "岗位要求",
    "任职资格",
    "工作内容",
    "职位描述",
    "学历",
    "经验",
    "专业",
    "薪资",
    "薪酬",
    "福利",
    "实习",
    "投递",
    "简历",
)

JOB_TITLE_KEYWORDS = (
    "工程师",
    "经理",
    "专员",
    "主管",
    "总监",
    "实习",
    "开发",
    "产品",
    "运营",
    "设计",
    "算法",
    "分析师",
    "顾问",
    "助理",
    "架构",
    "测试",
    "研发",
    "销售",
    "市场",
    "财务",
    "人力",
    "法务",
    "博士",
    "硕士",
)


def _looks_like_company_intro(title: str, jd_text: str) -> bool:
    text = f"{title}\n{jd_text}"
    intro_hits = sum(1 for phrase in COMPANY_INTRO_PHRASES if phrase in text)
    job_hits = sum(1 for keyword in JOB_JD_KEYWORDS if keyword in jd_text)
    if any(word in title for word in ("简介", "关于我们", "企业介绍", "公司介绍")):
        return True
    if intro_hits >= 3 and job_hits < 2:
        return True
    if intro_hits >= 2 and job_hits == 0 and len(jd_text) > 100:
        return True
    return False


def is_valid_job_title(title: str) -> bool:
    text = (title or "").strip()
    if len(text) < 2 or len(text) > 80:
        return False
    if text in INVALID_TITLES:
        return False
    if text.endswith("招聘页") or text.endswith("官网"):
        return False
    if text.count("|") >= 2:
        return False
    junk_hits = sum(1 for phrase in JUNK_PHRASES if phrase in text)
    if junk_hits >= 2:
        return False
    if any(keyword in text for keyword in JOB_TITLE_KEYWORDS):
        return True
    if re.search(r"(工程师|经理|专员|实习|开发|产品|运营|设计|岗)", text):
        return True
    return False


def is_valid_job_jd(jd_text: str, title: str = "") -> bool:
    text = (jd_text or "").strip()
    if len(text) < 80:
        return False
    if text.count("|") >= 10:
        return False
    if len(re.findall(r"\d+元起", text)) >= 2:
        return False
    if len(re.findall(r"(小米|华为|苹果|iPhone|手机)", text)) >= 4 and "工程师" not in text:
        return False

    junk_hits = sum(1 for phrase in JUNK_PHRASES if phrase in text)
    if junk_hits >= 4:
        return False

    keyword_hits = sum(1 for keyword in JOB_JD_KEYWORDS if keyword in text)
    if keyword_hits >= 2:
        return True
    if is_valid_job_title(title) and len(text) >= 120:
        return True
    return False


def validate_scraped_job(job: ScrapedJob) -> tuple[bool, str]:
    if _looks_like_company_intro(job.job_title, job.jd_text or ""):
        return False, "内容像公司简介，已跳过"
    if not is_valid_job_title(job.job_title):
        return False, f"标题不像岗位：{job.job_title[:40]}"
    if job.platform in STRUCTURED_PLATFORMS:
        jd = (job.jd_text or "").strip()
        if len(jd) >= 30 and (
            sum(1 for keyword in JOB_JD_KEYWORDS if keyword in jd) >= 1
            or is_valid_job_title(job.job_title)
        ):
            return True, ""
        return False, "JD 内容不足"
    if not is_valid_job_jd(job.jd_text, job.job_title):
        return False, "JD 内容像网站导航或商品页，已跳过"
    return True, ""
