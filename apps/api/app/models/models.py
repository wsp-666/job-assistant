from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import utc_now


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    file_path: Mapped[str] = mapped_column(String(500))
    parsed_json: Mapped[str] = mapped_column(Text, default="{}")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    platform: Mapped[str] = mapped_column(String(50), default="boss")
    job_title: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200))
    salary: Mapped[str] = mapped_column(String(100), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    jd_text: Mapped[str] = mapped_column(Text, default="")
    job_url: Mapped[str] = mapped_column(String(500), index=True)
    hr_name: Mapped[str] = mapped_column(String(100), default="")
    hr_title: Mapped[str] = mapped_column(String(100), default="")
    match_score: Mapped[float] = mapped_column(Float, default=0.0)
    role_match_score: Mapped[float] = mapped_column(Float, default=0.0)
    benefits_match_score: Mapped[float] = mapped_column(Float, default=0.0)
    company_match_score: Mapped[float] = mapped_column(Float, default=0.0)
    company_size: Mapped[str] = mapped_column(String(100), default="")
    company_industry: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    has_greeted: Mapped[bool] = mapped_column(Boolean, default=False)
    has_applied_resume: Mapped[bool] = mapped_column(Boolean, default=False)
    interview_round: Mapped[int] = mapped_column(Integer, default=0)
    offer_status: Mapped[str] = mapped_column(String(20), default="none")
    priority: Mapped[int] = mapped_column(Integer, default=3, index=True)
    job_category: Mapped[str] = mapped_column(String(100), default="")
    application_channel: Mapped[str] = mapped_column(String(50), default="")
    contact_name: Mapped[str] = mapped_column(String(100), default="")
    contact_info: Mapped[str] = mapped_column(String(200), default="")
    application_notes: Mapped[str] = mapped_column(Text, default="")
    application_tags_json: Mapped[str] = mapped_column(Text, default="[]")
    written_test_status: Mapped[str] = mapped_column(String(50), default="")
    interview_stage: Mapped[str] = mapped_column(String(50), default="")
    assessment_status: Mapped[str] = mapped_column(String(50), default="")
    screening_status: Mapped[str] = mapped_column(String(50), default="")
    first_interview_status: Mapped[str] = mapped_column(String(50), default="")
    second_interview_status: Mapped[str] = mapped_column(String(50), default="")
    third_interview_status: Mapped[str] = mapped_column(String(50), default="")
    final_interview_status: Mapped[str] = mapped_column(String(50), default="")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    interview_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    last_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tailored_resume_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )

    greetings: Mapped[list["Greeting"]] = relationship(
        "Greeting", back_populates="job", cascade="all, delete-orphan"
    )
    application_events: Mapped[list["ApplicationEvent"]] = relationship(
        "ApplicationEvent", back_populates="job", cascade="all, delete-orphan"
    )
    application_tasks: Mapped[list["ApplicationTask"]] = relationship(
        "ApplicationTask", back_populates="job", cascade="all, delete-orphan"
    )


class JobLibraryEntry(Base):
    __tablename__ = "job_library_entries"
    __table_args__ = (
        Index("ix_job_library_collection_id", "collection", "id"),
        Index("ix_job_library_collection_company", "collection", "company"),
        Index("ix_job_library_collection_direction", "collection", "target_direction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_key: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    collection: Mapped[str] = mapped_column(String(30), index=True)
    source_sheet: Mapped[str] = mapped_column(String(100), default="")
    source_row: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_level: Mapped[str] = mapped_column(String(50), default="")
    target_direction: Mapped[str] = mapped_column(String(200), default="", index=True)
    other_directions: Mapped[str] = mapped_column(Text, default="")
    company: Mapped[str] = mapped_column(String(200), index=True)
    job_title: Mapped[str] = mapped_column(Text, default="")
    company_type: Mapped[str] = mapped_column(String(100), default="")
    industry: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(200), default="")
    cohort: Mapped[str] = mapped_column(String(100), default="")
    education: Mapped[str] = mapped_column(String(200), default="")
    updated_date: Mapped[str] = mapped_column(String(50), default="")
    match_basis: Mapped[str] = mapped_column(Text, default="")
    recommended_resume: Mapped[str] = mapped_column(String(300), default="")
    risk_note: Mapped[str] = mapped_column(Text, default="")
    announcement_url: Mapped[str] = mapped_column(Text, default="")
    application_url: Mapped[str] = mapped_column(Text, default="")
    source_status: Mapped[str] = mapped_column(String(50), default="")
    personal_note: Mapped[str] = mapped_column(Text, default="")
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class JobLibraryCompanyRule(Base):
    """Company-level visibility rules that must survive library re-imports."""

    __tablename__ = "job_library_company_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    hidden: Mapped[bool] = mapped_column(Boolean, default=True)
    applied: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class Greeting(Base):
    __tablename__ = "greetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"))
    content: Mapped[str] = mapped_column(Text)
    template_id: Mapped[str] = mapped_column(String(50), default="default")
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    job: Mapped["Job"] = relationship("Job", back_populates="greetings")


class AppSetting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    value_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )


class LicenseKey(Base):
    __tablename__ = "license_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="friend")
    label: Mapped[str] = mapped_column(String(100), default="")
    note: Mapped[str] = mapped_column(String(500), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_activations: Mapped[int] = mapped_column(Integer, default=1)
    activation_count: Mapped[int] = mapped_column(Integer, default=0)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    redeemed_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), default="", index=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    nickname: Mapped[str] = mapped_column(String(100), default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )

    oauth_accounts: Mapped[list["UserOAuth"]] = relationship(
        "UserOAuth", back_populates="user", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["UserMembership"]] = relationship(
        "UserMembership", back_populates="user", cascade="all, delete-orphan"
    )


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class UserOAuth(Base):
    __tablename__ = "user_oauth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20), index=True)
    open_id: Mapped[str] = mapped_column(String(128), index=True)
    union_id: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    user: Mapped["User"] = relationship("User", back_populates="oauth_accounts")


class UserMembership(Base):
    __tablename__ = "user_memberships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    plan: Mapped[str] = mapped_column(String(50))
    source: Mapped[str] = mapped_column(String(50), default="payment")
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    user: Mapped["User"] = relationship("User", back_populates="memberships")


class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    out_trade_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(50))
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    pay_channel: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    payer_remark: Mapped[str] = mapped_column(String(200), default="")
    admin_note: Mapped[str] = mapped_column(String(500), default="")
    provider_trade_no: Mapped[str] = mapped_column(String(128), default="")
    confirmation_source: Mapped[str] = mapped_column(String(30), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )


class ApplicationEvent(Base):
    __tablename__ = "application_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    from_status: Mapped[str] = mapped_column(String(50), default="")
    to_status: Mapped[str] = mapped_column(String(50), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(50), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)

    job: Mapped["Job"] = relationship("Job", back_populates="application_events")


class ApplicationQueue(Base):
    __tablename__ = "application_queues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="自动投递任务")
    status: Mapped[str] = mapped_column(String(30), default="running", index=True)
    auto_submit: Mapped[bool] = mapped_column(Boolean, default=False)
    total: Mapped[int] = mapped_column(Integer, default=0)
    processed: Mapped[int] = mapped_column(Integer, default=0)
    succeeded: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    tasks: Mapped[list["ApplicationTask"]] = relationship(
        "ApplicationTask", back_populates="queue", cascade="all, delete-orphan"
    )


class ApplicationTask(Base):
    __tablename__ = "application_tasks"
    __table_args__ = (UniqueConstraint("queue_id", "job_id", name="uq_application_task_queue_job"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    queue_id: Mapped[int] = mapped_column(Integer, ForeignKey("application_queues.id"), index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=3)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    result_message: Mapped[str] = mapped_column(Text, default="")
    page_url: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    queue: Mapped["ApplicationQueue"] = relationship("ApplicationQueue", back_populates="tasks")
    job: Mapped["Job"] = relationship("Job", back_populates="application_tasks")
