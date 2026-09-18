from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

_connect_args: dict = {}
if settings.uses_sqlite:
    _connect_args["check_same_thread"] = False

if settings.uses_sqlite:
    engine = create_engine(settings.database_url, connect_args=_connect_args)
else:
    engine = create_engine(
        settings.database_url,
        connect_args=_connect_args,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def ensure_mysql_database():
    import pymysql

    conn = pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        conn.commit()
    finally:
        conn.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import models  # noqa: F401

    if not settings.uses_sqlite:
        ensure_mysql_database()
    Base.metadata.create_all(bind=engine)
    _migrate_jobs_columns()
    _migrate_jobs_indexes()
    _migrate_job_library_indexes()
    _migrate_job_library_columns()
    _migrate_job_library_company_rules()
    _migrate_auth_columns()
    _migrate_payment_order_columns()


def _migrate_auth_columns():
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "resumes" in tables:
        cols = {c["name"] for c in insp.get_columns("resumes")}
        if "user_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE resumes ADD COLUMN user_id INTEGER"))

    if "jobs" in tables:
        cols = {c["name"] for c in insp.get_columns("jobs")}
        pending: list[str] = []
        if "user_id" not in cols:
            pending.append("user_id INTEGER")
        for col_def in pending:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col_def}"))

    if "license_keys" in tables:
        cols = {c["name"] for c in insp.get_columns("license_keys")}
        if "redeemed_by_user_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE license_keys ADD COLUMN redeemed_by_user_id INTEGER"))

    if "users" in tables:
        cols = {c["name"] for c in insp.get_columns("users")}
        pending: list[str] = []
        if "email" not in cols:
            pending.append("email VARCHAR(255) NOT NULL DEFAULT ''")
        if "password_hash" not in cols:
            pending.append("password_hash VARCHAR(255) NOT NULL DEFAULT ''")
        if "email_verified" not in cols:
            pending.append("email_verified BOOLEAN NOT NULL DEFAULT 0")
        for col_def in pending:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_def}"))


def _migrate_jobs_columns():
    insp = inspect(engine)
    if "jobs" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("jobs")}
    pending: list[str] = []
    if "role_match_score" not in cols:
        pending.append("role_match_score FLOAT NOT NULL DEFAULT 0")
    if "benefits_match_score" not in cols:
        pending.append("benefits_match_score FLOAT NOT NULL DEFAULT 0")
    if "company_match_score" not in cols:
        pending.append("company_match_score FLOAT NOT NULL DEFAULT 0")
    if "company_size" not in cols:
        pending.append("company_size VARCHAR(100) NOT NULL DEFAULT ''")
    if "company_industry" not in cols:
        pending.append("company_industry VARCHAR(200) NOT NULL DEFAULT ''")
    if "has_greeted" not in cols:
        pending.append("has_greeted BOOLEAN NOT NULL DEFAULT 0")
    if "has_applied_resume" not in cols:
        pending.append("has_applied_resume BOOLEAN NOT NULL DEFAULT 0")
    if "interview_round" not in cols:
        pending.append("interview_round INTEGER NOT NULL DEFAULT 0")
    if "offer_status" not in cols:
        pending.append("offer_status VARCHAR(20) NOT NULL DEFAULT 'none'")
    if "tailored_resume_json" not in cols:
        pending.append("tailored_resume_json TEXT NOT NULL DEFAULT ''")
    if "priority" not in cols:
        pending.append("priority INTEGER NOT NULL DEFAULT 3")
    if "job_category" not in cols:
        pending.append("job_category VARCHAR(100) NOT NULL DEFAULT ''")
    if "application_channel" not in cols:
        pending.append("application_channel VARCHAR(50) NOT NULL DEFAULT ''")
    if "contact_name" not in cols:
        pending.append("contact_name VARCHAR(100) NOT NULL DEFAULT ''")
    if "contact_info" not in cols:
        pending.append("contact_info VARCHAR(200) NOT NULL DEFAULT ''")
    if "application_notes" not in cols:
        pending.append("application_notes TEXT NOT NULL DEFAULT ''")
    if "application_tags_json" not in cols:
        pending.append("application_tags_json TEXT NOT NULL DEFAULT '[]'")
    for name in (
        "written_test_status",
        "interview_stage",
        "assessment_status",
        "screening_status",
        "first_interview_status",
        "second_interview_status",
        "third_interview_status",
        "final_interview_status",
    ):
        if name not in cols:
            pending.append(f"{name} VARCHAR(50) NOT NULL DEFAULT ''")
    if "applied_at" not in cols:
        pending.append("applied_at DATETIME")
    if "next_action_at" not in cols:
        pending.append("next_action_at DATETIME")
    if "interview_at" not in cols:
        pending.append("interview_at DATETIME")
    if "last_follow_up_at" not in cols:
        pending.append("last_follow_up_at DATETIME")
    if "status_updated_at" not in cols:
        pending.append("status_updated_at DATETIME")
    if not pending:
        return
    with engine.begin() as conn:
        for col_def in pending:
            conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col_def}"))


def _migrate_jobs_indexes():
    """Older local databases made job_url unique, but campus portals share URLs across roles."""
    if engine.dialect.name != "sqlite":
        return
    insp = inspect(engine)
    if "jobs" not in insp.get_table_names():
        return
    job_url_index = next(
        (item for item in insp.get_indexes("jobs") if item.get("name") == "ix_jobs_job_url"),
        None,
    )
    if not job_url_index or not job_url_index.get("unique"):
        return
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_jobs_job_url"))
        conn.execute(text("CREATE INDEX ix_jobs_job_url ON jobs (job_url)"))


def _migrate_job_library_indexes():
    """Add composite indexes used by local job-library pagination and filtering."""
    if engine.dialect.name != "sqlite":
        return
    insp = inspect(engine)
    if "job_library_entries" not in insp.get_table_names():
        return
    statements = (
        "CREATE INDEX IF NOT EXISTS ix_job_library_collection_id ON job_library_entries (collection, id)",
        "CREATE INDEX IF NOT EXISTS ix_job_library_collection_company ON job_library_entries (collection, company)",
        "CREATE INDEX IF NOT EXISTS ix_job_library_collection_direction ON job_library_entries (collection, target_direction)",
    )
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _migrate_job_library_columns():
    """Idempotently add columns introduced after the initial job_library_entries schema."""
    insp = inspect(engine)
    if "job_library_entries" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("job_library_entries")}
    pending: list[str] = []
    if "hidden" not in cols:
        pending.append("hidden BOOLEAN NOT NULL DEFAULT 0")
    if not pending:
        return
    with engine.begin() as conn:
        for col_def in pending:
            conn.execute(text(f"ALTER TABLE job_library_entries ADD COLUMN {col_def}"))


def _migrate_job_library_company_rules():
    """Create/backfill company-level rules used by the library visibility filter."""
    from app.models.models import JobLibraryCompanyRule, JobLibraryEntry

    insp = inspect(engine)
    if "job_library_company_rules" not in insp.get_table_names():
        return
    rule_cols = {c["name"] for c in insp.get_columns("job_library_company_rules")}
    if "applied" not in rule_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE job_library_company_rules ADD COLUMN applied BOOLEAN NOT NULL DEFAULT 0"))

    db = SessionLocal()
    try:
        hidden_companies = {
            company
            for (company,) in (
                db.query(JobLibraryEntry.company)
                .filter(JobLibraryEntry.hidden.is_(True), JobLibraryEntry.company != "")
                .distinct()
                .all()
            )
            if company
        }
        applied_companies = {
            company
            for (company,) in (
                db.query(JobLibraryEntry.company)
                .filter(
                    JobLibraryEntry.source_status == "已投递",
                    JobLibraryEntry.company != "",
                )
                .distinct()
                .all()
            )
            if company
        }
        companies = hidden_companies | applied_companies
        if not companies:
            return

        existing = {
            row.company: row
            for row in db.query(JobLibraryCompanyRule)
            .filter(JobLibraryCompanyRule.company.in_(companies))
            .all()
        }
        for company in companies:
            rule = existing.get(company)
            if rule is None:
                db.add(JobLibraryCompanyRule(
                    company=company,
                    hidden=company in hidden_companies,
                    applied=company in applied_companies,
                ))
                continue
            if company in hidden_companies:
                rule.hidden = True
            if company in applied_companies:
                rule.applied = True
        db.commit()
    finally:
        db.close()


def _migrate_payment_order_columns():
    insp = inspect(engine)
    if "payment_orders" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("payment_orders")}
    definitions = {
        "payer_remark": "payer_remark VARCHAR(200) NOT NULL DEFAULT ''",
        "admin_note": "admin_note VARCHAR(500) NOT NULL DEFAULT ''",
        "provider_trade_no": "provider_trade_no VARCHAR(128) NOT NULL DEFAULT ''",
        "confirmation_source": "confirmation_source VARCHAR(30) NOT NULL DEFAULT ''",
        "expires_at": "expires_at DATETIME",
        "submitted_at": "submitted_at DATETIME",
        "cancelled_at": "cancelled_at DATETIME",
        "updated_at": "updated_at DATETIME",
    }
    pending = [definition for name, definition in definitions.items() if name not in cols]
    if not pending:
        return
    with engine.begin() as conn:
        for col_def in pending:
            conn.execute(text(f"ALTER TABLE payment_orders ADD COLUMN {col_def}"))
