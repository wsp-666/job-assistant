from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

def _resolve_root_dir() -> Path:
    here = Path(__file__).resolve().parent
    for candidate in reversed(here.parents):
        if (candidate / "apps" / "api" / "app").is_dir():
            return candidate
        if (candidate / "api" / "app").is_dir() and (candidate / "web").is_dir():
            return candidate
    return here.parents[2] if len(here.parents) > 2 else here


ROOT_DIR = _resolve_root_dir()
DATA_DIR = ROOT_DIR / "data"
RESUMES_DIR = DATA_DIR / "resumes"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_provider: str = "deepseek"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-v4-flash"

    resume_ocr_enabled: bool = True
    baidu_ocr_api_key: str = ""
    baidu_ocr_secret_key: str = ""
    baidu_ocr_type: str = "general"
    resume_ocr_min_text_chars: int = 80
    resume_ocr_max_pages: int = 3
    resume_pdf_max_mb: int = 10

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # local=用户本机（岗位/简历 SQLite）；cloud=仅会员与运营
    deployment_role: Literal["local", "cloud"] = "local"
    # 本机模式：会员/登录走云端 API（用户无需配置 MySQL）
    cloud_api_url: str = ""
    # 云端模式：OAuth 登录成功后跳回用户本机地址
    local_app_url: str = "http://127.0.0.1:8000"

    # sqlite（默认）| mysql
    db_backend: Literal["sqlite", "mysql"] = "sqlite"
    sqlite_path: str = "data/job_assistant.db"

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = "123456"
    mysql_database: str = "job_assistant"

    database_url: str = ""

    # 用于 scripts/generate-license.py 及管理端生成 Key
    license_admin_secret: str = ""

    # 本地开发阶段暂时关闭账号登录；云端恢复时通过 AUTH_ENABLED=true 显式开启。
    auth_enabled: bool = False
    # 仅开发调试；正式内测请用微信/支付宝模拟登录
    dev_login_enabled: bool = False

    # 邮箱验证码登录（须配置 SMTP 后可用）
    email_auth_enabled: bool = True
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_ssl: bool = True
    email_code_expire_minutes: int = 10
    email_code_cooldown_seconds: int = 60
    jwt_secret: str = "change-me-in-production"
    jwt_expire_days: int = 30
    public_base_url: str = "http://127.0.0.1:8000"

    # 微信开放平台（网站应用扫码登录）
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    wechat_oauth_enabled: bool = False

    # 支付宝开放平台（网页授权登录）
    alipay_app_id: str = ""
    alipay_private_key: str = ""
    alipay_alipay_public_key: str = ""
    alipay_oauth_enabled: bool = False

    # 支付：mock=开发模拟；personal_qr=个人收款码；merchant=微信/支付宝商户
    payment_mode: Literal["mock", "personal_qr", "merchant"] = "personal_qr"
    payment_mock: bool = False
    payment_personal_qr: bool = True
    wechat_pay_mch_id: str = ""
    wechat_pay_api_v3_key: str = ""

    default_greeting_style: str = "简洁"
    daily_greeting_limit: int = 30

    @model_validator(mode="after")
    def default_cloud_local_app_url(self):
        if self.deployment_role == "cloud" and not self.local_app_url.strip():
            self.local_app_url = "http://127.0.0.1:8000"
        return self

    @model_validator(mode="after")
    def validate_cloud_secrets(self):
        if not self.is_cloud_server or not self.auth_enabled:
            return self
        if self.jwt_secret == "change-me-in-production" or len(self.jwt_secret.strip()) < 32:
            raise ValueError("云端 JWT_SECRET 必须设置为至少 32 位的随机字符串")
        if len(self.license_admin_secret.strip()) < 16:
            raise ValueError("云端 LICENSE_ADMIN_SECRET 必须设置为至少 16 位的随机字符串")
        if self.payment_mode == "mock" and not self.payment_mock:
            raise ValueError("PAYMENT_MODE=mock 时必须显式设置 PAYMENT_MOCK=true")
        return self

    @model_validator(mode="after")
    def resolve_database_url(self):
        if self.database_url:
            return self
        if self.db_backend == "sqlite":
            db_file = Path(self.sqlite_path)
            if not db_file.is_absolute():
                db_file = ROOT_DIR / db_file
            db_file.parent.mkdir(parents=True, exist_ok=True)
            self.database_url = f"sqlite:///{db_file.as_posix()}"
            return self
        password = quote_plus(self.mysql_password)
        self.database_url = (
            f"mysql+pymysql://{self.mysql_user}:{password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
            f"?charset=utf8mb4"
        )
        return self

    @property
    def uses_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_cloud_server(self) -> bool:
        return self.deployment_role == "cloud"

    @property
    def is_local_app(self) -> bool:
        return self.deployment_role == "local"

    @property
    def uses_cloud_membership(self) -> bool:
        return self.is_local_app and bool(self.cloud_api_url.strip())

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host.strip() and self.smtp_user.strip() and self.smtp_password.strip())

    @property
    def email_login_available(self) -> bool:
        if not self.auth_enabled or not self.email_auth_enabled:
            return False
        return self.smtp_configured


settings = Settings()

DATA_DIR.mkdir(parents=True, exist_ok=True)
RESUMES_DIR.mkdir(parents=True, exist_ok=True)
