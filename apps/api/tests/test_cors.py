import unittest

from fastapi.testclient import TestClient

from app.main import app


class CorsPolicyTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_local_and_extension_origins_are_allowed(self):
        for origin in (
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        ):
            response = self.client.options(
                "/health",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    def test_unrelated_web_origin_is_not_allowed(self):
        response = self.client.options(
            "/health",
            headers={
                "Origin": "https://malicious.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertNotIn("access-control-allow-origin", response.headers)


if __name__ == "__main__":
    unittest.main()
