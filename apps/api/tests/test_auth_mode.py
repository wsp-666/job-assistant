import asyncio
import unittest

from app.core.config import settings
from app.services.auth_service import authentication_required
from app.services.access_control import require_premium_access


class AuthenticationModeTests(unittest.TestCase):
    _FIELDS = (
        "deployment_role",
        "cloud_api_url",
        "auth_enabled",
        "email_auth_enabled",
        "smtp_host",
        "smtp_user",
        "smtp_password",
        "dev_login_enabled",
        "payment_mock",
        "wechat_oauth_enabled",
        "wechat_app_id",
        "wechat_app_secret",
        "alipay_oauth_enabled",
        "alipay_app_id",
        "alipay_private_key",
    )

    def setUp(self):
        self.previous = {name: getattr(settings, name) for name in self._FIELDS}

    def tearDown(self):
        for name, value in self.previous.items():
            setattr(settings, name, value)

    def test_local_without_provider_is_open_but_cloud_or_proxy_requires_login(self):
        settings.deployment_role = "local"
        settings.cloud_api_url = ""
        settings.auth_enabled = True
        settings.email_auth_enabled = True
        settings.smtp_host = ""
        settings.smtp_user = ""
        settings.smtp_password = ""
        settings.dev_login_enabled = False
        settings.payment_mock = False
        settings.wechat_oauth_enabled = False
        settings.wechat_app_id = ""
        settings.wechat_app_secret = ""
        settings.alipay_oauth_enabled = False
        settings.alipay_app_id = ""
        settings.alipay_private_key = ""

        self.assertFalse(authentication_required())

        settings.cloud_api_url = "https://membership.example.com"
        self.assertTrue(authentication_required())

        settings.cloud_api_url = ""
        settings.deployment_role = "cloud"
        self.assertTrue(authentication_required())

    def test_local_auth_disabled_bypasses_membership_dependency(self):
        settings.deployment_role = "local"
        settings.cloud_api_url = ""
        settings.auth_enabled = False

        status = asyncio.run(require_premium_access(db=None, user=None, credentials=None))

        self.assertTrue(status["active"])
        self.assertEqual(status["plan"], "local")


if __name__ == "__main__":
    unittest.main()
