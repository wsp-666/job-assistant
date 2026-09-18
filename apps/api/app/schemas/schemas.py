from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ApplicationStageId = Literal[
    "pending",
    "preparing",
    "ready",
    "greeted",
    "applied",
    "written_test",
    "interview",
    "final_interview",
    "offer",
    "hired",
    "rejected",
    "withdrawn",
    "closed",
    "skipped",
]


class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"


class ResumeOut(BaseModel):
    id: int
    name: str
    file_path: str
    parsed_json: dict[str, Any]
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    platform: str = "boss"
    job_title: str
    company: str
    salary: str = ""
    city: str = ""
    jd_text: str = ""
    job_url: str
    hr_name: str = ""
    hr_title: str = ""
    company_size: str = ""
    company_industry: str = ""


class ManualJobCreate(BaseModel):
    """用户在工作台里手工录入岗位时使用的入参，字段比 JobCreate 更宽。"""

    company: str = Field(..., min_length=1, max_length=200)
    job_title: str = Field(..., min_length=1, max_length=200)
    job_url: str = Field(..., min_length=4, max_length=500)
    salary: str = Field("", max_length=100)
    city: str = Field("", max_length=100)
    job_category: str = Field("", max_length=100)
    application_channel: str = Field("", max_length=50)
    application_notes: str = Field("", max_length=10000)
    interview_stage: str = Field("", max_length=50)
    application_tags: list[str] = Field(default_factory=list)
    contact_name: str = Field("", max_length=100)
    contact_info: str = Field("", max_length=200)
    status: ApplicationStageId | None = None
    priority: int | None = Field(None, ge=1, le=5)
    applied_at: datetime | None = None
    next_action_at: datetime | None = None
    platform: str = Field("manual", max_length=50)



class JobOut(BaseModel):
    id: int
    platform: str
    job_title: str
    company: str
    salary: str
    city: str
    jd_text: str
    job_url: str
    hr_name: str
    hr_title: str
    match_score: float
    role_match_score: float = 0.0
    benefits_match_score: float = 0.0
    company_match_score: float = 0.0
    company_size: str = ""
    company_industry: str = ""
    status: str
    has_greeted: bool = False
    has_applied_resume: bool = False
    interview_round: int = 0
    offer_status: str = "none"
    priority: int = 3
    job_category: str = ""
    application_channel: str = ""
    contact_name: str = ""
    contact_info: str = ""
    application_notes: str = ""
    application_tags: list[str] = Field(default_factory=list)
    written_test_status: str = ""
    interview_stage: str = ""
    assessment_status: str = ""
    screening_status: str = ""
    first_interview_status: str = ""
    second_interview_status: str = ""
    third_interview_status: str = ""
    final_interview_status: str = ""
    applied_at: datetime | None = None
    next_action_at: datetime | None = None
    interview_at: datetime | None = None
    last_follow_up_at: datetime | None = None
    status_updated_at: datetime | None = None
    tailored_resume: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobPipelineUpdate(BaseModel):
    company: str | None = Field(None, min_length=1, max_length=200)
    job_title: str | None = Field(None, min_length=1, max_length=200)
    job_url: str | None = Field(None, min_length=4, max_length=500)
    city: str | None = Field(None, max_length=100)
    status: ApplicationStageId | None = None
    priority: int | None = Field(None, ge=1, le=5)
    job_category: str | None = Field(None, max_length=100)
    has_greeted: bool | None = None
    has_applied_resume: bool | None = None
    interview_round: int | None = Field(None, ge=0, le=10)
    offer_status: Literal["none", "pending", "received", "rejected"] | None = None
    application_channel: str | None = Field(None, max_length=50)
    contact_name: str | None = Field(None, max_length=100)
    contact_info: str | None = Field(None, max_length=200)
    application_notes: str | None = Field(None, max_length=10000)
    application_tags: list[str] | None = None
    written_test_status: str | None = Field(None, max_length=50)
    interview_stage: str | None = Field(None, max_length=50)
    assessment_status: str | None = Field(None, max_length=50)
    screening_status: str | None = Field(None, max_length=50)
    first_interview_status: str | None = Field(None, max_length=50)
    second_interview_status: str | None = Field(None, max_length=50)
    third_interview_status: str | None = Field(None, max_length=50)
    final_interview_status: str | None = Field(None, max_length=50)
    applied_at: datetime | None = None
    next_action_at: datetime | None = None
    interview_at: datetime | None = None
    last_follow_up_at: datetime | None = None
    event_note: str = Field("", max_length=1000)


class JobTailoredResumeOut(BaseModel):
    job_id: int
    tailored_resume: dict[str, Any]


class JobListResponse(BaseModel):
    items: list[JobOut]
    total: int
    page: int
    page_size: int


class JobStatusUpdate(BaseModel):
    status: ApplicationStageId
    note: str = Field("", max_length=1000)


class ApplicationStageOut(BaseModel):
    id: str
    label: str
    group: str
    rank: int
    terminal: bool


class ApplicationPriorityOut(BaseModel):
    value: int
    label: str
    short_label: str


class ApplicationEventOut(BaseModel):
    id: int
    job_id: int
    event_type: str
    from_status: str = ""
    to_status: str = ""
    note: str = ""
    actor: str = "user"
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplicationAnswerSet(BaseModel):
    id: str = Field("", max_length=80)
    name: str = Field("", max_length=100)
    job_category: str = Field("", max_length=100)
    resume_id: int | None = None
    description: str = Field("", max_length=500)
    answers: dict[str, str] = Field(default_factory=dict)


class ApplicationProfile(BaseModel):
    full_name: str = ""
    phone: str = ""
    email: str = ""
    gender: str = ""
    birth_date: str = ""
    current_city: str = ""
    target_city: str = ""
    native_place: str = ""
    school: str = ""
    major: str = ""
    discipline_category: str = ""
    degree: str = ""
    graduation_date: str = ""
    work_years: str = ""
    expected_salary: str = ""
    recruitment_source: str = ""
    portfolio_url: str = ""
    github_url: str = ""
    linkedin_url: str = ""
    summary: str = ""
    education: str = ""
    experience: str = ""
    projects: str = ""
    awards: str = ""
    language_ability: str = ""
    certificates: str = ""
    campus_experience: str = ""
    skills: list[str] = Field(default_factory=list)
    resume_id: int | None = None
    custom_fields: dict[str, str] = Field(default_factory=dict)
    answer_sets: list[ApplicationAnswerSet] = Field(default_factory=list)
    active_answer_set_id: str = ""


class ApplicationProfileOut(ApplicationProfile):
    resume_name: str = ""
    has_uploadable_resume: bool = False
    resume_file_url: str | None = None
    effective_custom_fields: dict[str, str] = Field(default_factory=dict)


class ApplicationSummaryOut(BaseModel):
    total: int = 0
    active: int = 0
    applied: int = 0
    interviews: int = 0
    offers: int = 0
    overdue_actions: int = 0
    due_today: int = 0
    conversion_rate: float = 0.0
    stage_counts: dict[str, int] = Field(default_factory=dict)


class ApplicationQueueCreate(BaseModel):
    job_ids: list[int] = Field(default_factory=list)
    name: str = Field("", max_length=200)
    auto_submit: bool = False
    max_count: int = Field(50, ge=1, le=200)
    max_priority: int = Field(4, ge=1, le=5)
    min_match_score: float = Field(0, ge=0, le=100)


class ApplicationTaskStateUpdate(BaseModel):
    status: Literal[
        "queued",
        "opening",
        "waiting_login",
        "filling",
        "ready_to_submit",
        "submitting",
        "succeeded",
        "failed",
        "skipped",
        "cancelled",
    ]
    message: str = Field("", max_length=2000)
    page_url: str = Field("", max_length=1000)


class ApplicationTaskOut(BaseModel):
    id: int
    queue_id: int
    job_id: int
    sequence: int
    priority: int
    status: str
    attempt_count: int
    last_error: str = ""
    result_message: str = ""
    page_url: str = ""
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    job: JobOut | None = None


class ApplicationQueueOut(BaseModel):
    id: int
    name: str
    status: str
    auto_submit: bool
    total: int
    processed: int
    succeeded: int
    failed: int
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    tasks: list[ApplicationTaskOut] = Field(default_factory=list)


class ApplicationNextTaskOut(BaseModel):
    queue: ApplicationQueueOut
    task: ApplicationTaskOut | None = None
    profile: ApplicationProfileOut | None = None


class ApplicationWorkspaceOut(BaseModel):
    stages: list[ApplicationStageOut]
    priorities: list[ApplicationPriorityOut]
    summary: ApplicationSummaryOut
    jobs: list[JobOut]


class ApplicationBulkDeleteRequest(BaseModel):
    job_ids: list[int] = Field(min_length=1, max_length=2000)


class ApplicationBulkDeleteOut(BaseModel):
    requested: int
    deleted: int


class ApplicationImportIssueOut(BaseModel):
    row: int
    level: Literal["warning", "error"]
    message: str


class ApplicationImportResultOut(BaseModel):
    filename: str
    total_rows: int
    created: int
    updated: int
    unchanged: int
    skipped: int
    failed: int
    issues: list[ApplicationImportIssueOut] = Field(default_factory=list)


class JobLibraryItemOut(BaseModel):
    id: str
    scope: Literal["all", "progress"]
    recommendation_level: str = ""
    target_direction: str = ""
    other_directions: str = ""
    company: str
    job_title: str
    company_type: str = ""
    industry: str = ""
    city: str = ""
    cohort: str = ""
    education: str = ""
    updated_date: str = ""
    match_basis: str = ""
    recommended_resume: str = ""
    risk_note: str = ""
    announcement_url: str = ""
    application_url: str = ""
    source_status: str = ""
    personal_note: str = ""
    source_row: int = 0
    hidden: bool = False
    tracked_job_id: int | None = None
    tracked_status: str = ""
    company_tracked_count: int = 0


class JobLibraryListOut(BaseModel):
    items: list[JobLibraryItemOut]
    total: int
    page: int
    page_size: int
    companies: list[str] = Field(default_factory=list)
    directions: list[str] = Field(default_factory=list)


class JobLibraryTrackRequest(BaseModel):
    mark_applied: bool = False


class JobLibraryBulkHideRequest(BaseModel):
    source_keys: list[str] = Field(min_length=1, max_length=2000)
    hidden: bool = True


class JobLibraryBulkHideOut(BaseModel):
    requested: int
    updated: int


class JobRecommendationsOut(BaseModel):
    chat_tips: list[str] = Field(default_factory=list)
    focus_skills: list[str] = Field(default_factory=list)
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class PositionKeywordsSuggestRequest(BaseModel):
    titles: list[str] = Field(default_factory=list)
    summary: str = ""
    details: str = ""


class PositionKeywordsSuggestOut(BaseModel):
    title_aliases: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class GreetingGenerateRequest(BaseModel):
    job_id: int | None = None
    job_data: JobCreate | None = None
    style: str | None = None
    template_id: str = "default"
    modify_instruction: str | None = None
    base_greeting_id: int | None = None


class GreetingOut(BaseModel):
    id: int
    job_id: int
    content: str
    template_id: str
    is_sent: bool
    sent_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GreetingUpdate(BaseModel):
    content: str
    is_sent: bool | None = None


class TargetPosition(BaseModel):
    id: str
    title: str
    title_aliases: list[str] = Field(default_factory=list)
    summary: str = ""
    details: str = ""
    keywords: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    min_salary: int = 0
    max_salary: int = 0
    min_salary_unlimited: bool = True
    max_salary_unlimited: bool = True
    include_keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    greeting_style: str = "简洁"
    daily_limit: int = 30
    # 薪资：月薪(K)与日薪(元/天)可同时启用
    salary_type_monthly: bool = True
    salary_type_daily: bool = False
    min_daily_salary: int = 0
    max_daily_salary: int = 0
    min_daily_salary_unlimited: bool = True
    max_daily_salary_unlimited: bool = True
    # 岗位性质与待遇期望
    job_types: list[str] = Field(default_factory=list)
    weekend_rest: Literal["any", "double_rest"] = "any"
    require_social_insurance: bool = False
    want_year_end_bonus: bool = False
    want_commission: bool = False
    want_meal_allowance: bool = False
    want_accommodation: bool = False
    # 公司规模与行业前景
    preferred_company_sizes: list[str] = Field(default_factory=list)
    preferred_industries: list[str] = Field(default_factory=list)
    outlook_industries: list[str] = Field(default_factory=list)
    cities_unlimited: bool = True
    company_sizes_unlimited: bool = True


class SettingsOut(BaseModel):
    target_titles: list[str] = Field(default_factory=list)
    target_positions: list[TargetPosition] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    min_salary: int = 0
    max_salary: int = 0
    min_salary_unlimited: bool = True
    max_salary_unlimited: bool = True
    include_keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    greeting_style: str = "简洁"
    daily_limit: int = 30


class ApiProfile(BaseModel):
    id: str
    name: str
    category: Literal["vision", "analysis"]
    provider: str
    api_key: str = ""
    secret_key: str = ""
    base_url: str = ""
    model: str = ""
    options: dict[str, Any] = Field(default_factory=dict)


class ApiProfilesOut(BaseModel):
    profiles: list[ApiProfile] = Field(default_factory=list)
    active_vision_id: str = ""
    active_analysis_id: str = ""


class DashboardStats(BaseModel):
    total_jobs: int
    pending_jobs: int
    greeted_jobs: int
    skipped_jobs: int
    today_jobs: int
    avg_match_score: float


class LicenseStatusOut(BaseModel):
    active: bool
    plan: str = ""
    plan_label: str = ""
    label: str = ""
    expires_at: str | None = None
    message: str = ""


class LicenseActivateRequest(BaseModel):
    key: str


class LicenseGenerateRequest(BaseModel):
    plan: Literal["friend", "monthly", "yearly", "lifetime"] = "friend"
    count: int = 1
    note: str = ""
    label: str = ""
    days: int | None = None
    max_activations: int = 1


class LicenseGenerateOut(BaseModel):
    keys: list[str]
    plan: str
    plan_label: str


class UserOut(BaseModel):
    id: int
    nickname: str
    avatar_url: str = ""
    created_at: str | None = None


class MembershipStatusOut(BaseModel):
    active: bool
    plan: str = ""
    plan_label: str = ""
    expires_at: str | None = None
    source: str = ""
    message: str = ""


class AuthProvidersOut(BaseModel):
    auth_enabled: bool
    email: bool = False
    wechat: bool
    alipay: bool
    payment_mock: bool = False
    dev_login: bool = False
    personal_qr: bool = False


class EmailSendCodeIn(BaseModel):
    email: str
    purpose: Literal["register", "reset"] = "register"


class EmailPasswordIn(BaseModel):
    email: str
    code: str
    password: str


class EmailLoginIn(BaseModel):
    email: str
    password: str


class AuthTokenOut(BaseModel):
    token: str


class AuthSessionOut(BaseModel):
    logged_in: bool
    user: UserOut | None = None
    membership: MembershipStatusOut
    auth_enabled: bool


class MembershipPlanOut(BaseModel):
    plan: str
    label: str
    price_cents: int
    description: str = ""


class PaymentOrderCreate(BaseModel):
    plan: Literal["monthly", "yearly", "lifetime"]
    pay_channel: Literal["wechat", "alipay"]


class PaymentOrderOut(BaseModel):
    order_id: int
    out_trade_no: str
    plan: str
    plan_label: str
    amount_cents: int
    pay_channel: str
    status: str
    pay_url: str | None = None
    code_url: str | None = None
    qr_url: str | None = None
    mock: bool = False
    message: str = ""
    payer_remark: str = ""
    created_at: str | None = None
    expires_at: str | None = None
    submitted_at: str | None = None
    paid_at: str | None = None
    can_cancel: bool = False


class PaymentClaimIn(BaseModel):
    payer_remark: str = Field(min_length=2, max_length=200)


class AdminOrderRejectIn(BaseModel):
    note: str = Field(min_length=2, max_length=500)


class MembershipAdminGrantRequest(BaseModel):
    user_id: int | None = None
    nickname: str = ""
    plan: Literal["friend", "monthly", "yearly", "lifetime"] = "friend"
    days: int | None = None


class AdminOrderOut(BaseModel):
    order_id: int
    out_trade_no: str
    user_id: int
    nickname: str
    plan: str
    plan_label: str
    amount_cents: int
    pay_channel: str
    status: str
    payer_remark: str = ""
    admin_note: str = ""
    created_at: str | None = None
    expires_at: str | None = None
    submitted_at: str | None = None


class AdminUserOut(BaseModel):
    id: int
    nickname: str
    membership_active: bool
    plan_label: str = ""
    created_at: str | None = None


class CareerSiteSource(BaseModel):
    id: str
    company: str
    list_url: str
    adapter: Literal["auto", "moka", "generic"] = "auto"
    enabled: bool = True
    keywords: list[str] = Field(default_factory=list)
    scrape_interval_hours: int = 24
    last_scraped_at: str | None = None
    last_scrape_status: str = ""
    last_scrape_count: int = 0
    last_adapter_used: str = ""
    origin: Literal["preset", "manual", "legacy"] = "legacy"


class CareerSiteConfigOut(BaseModel):
    sources: list[CareerSiteSource] = Field(default_factory=list)
    auto_scrape_enabled: bool = False
    default_interval_hours: int = 24


class CareerScrapeRequest(BaseModel):
    source_id: str | None = None
    max_jobs: int = 40


class CareerScrapeItemResult(BaseModel):
    source_id: str
    company: str
    adapter_used: str = ""
    fetched: int = 0
    created: int = 0
    updated: int = 0
    message: str = ""
    logs: list[str] = Field(default_factory=list)


class CareerScrapeResultOut(BaseModel):
    results: list[CareerScrapeItemResult] = Field(default_factory=list)


class CareerBackgroundScrapeStatus(BaseModel):
    running: bool = False
    task_id: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    total: int = 0
    completed: int = 0
    current_company: str = ""
    logs: list[str] = Field(default_factory=list)
    summary: str = ""
    total_created: int = 0
    total_updated: int = 0
    total_fetched: int = 0
    error: str = ""


class CareerSitePresetOut(BaseModel):
    id: str
    company: str
    list_url: str
    adapter: Literal["auto", "moka", "generic"] = "auto"
    category: str = ""
    keywords: list[str] = Field(default_factory=list)
    note: str = ""
    already_imported: bool = False


class CareerImportPresetsRequest(BaseModel):
    preset_ids: list[str] = Field(default_factory=list)
    import_all: bool = False
    enable_auto_scrape: bool = False
    sync_mode: Literal["add", "replace"] = "add"


class CareerImportPresetsOut(BaseModel):
    added: int = 0
    skipped: int = 0
    removed: int = 0
    message: str = ""


class ResumeTemplateOut(BaseModel):
    id: str
    name: str
    description: str


class ResumeCreateRequest(BaseModel):
    template_id: str = "comprehensive"
    name: str = "我的简历"


class ResumeContentUpdate(BaseModel):
    full_name: str = ""
    phone: str = ""
    email: str = ""
    summary: str = ""
    education: str = ""
    experience: str = ""
    projects: str = ""
    skills: list[str] = Field(default_factory=list)
    template_id: str | None = None
