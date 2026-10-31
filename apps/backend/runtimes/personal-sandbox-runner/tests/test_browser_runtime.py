"""
Unit tests for Browser Runtime interfaces, Mock Driver, and AuthVault security walls.
"""

import unittest
from unittest.mock import MagicMock
from pathlib import Path
import tempfile
import json

from dsh_modules.browser_runtime import (
    BrowserAction,
    BrowserActionType,
    BrowserConfig,
    RenderResult,
    IBrowserDriver,
    IBrowserSession,
    AuthVault,
    get_browser_driver,
    set_browser_driver
)


class TestBrowserRuntime(unittest.TestCase):

    def test_auth_vault_security_wall_for_jina(self):
        """测试安全屏障：带敏感参数或已认证请求严禁外发给外部 Jina Reader"""
        vault = AuthVault()

        # 1. 普通公共 URL 允许回退
        self.assertTrue(vault.assert_safe_for_external_fallback("https://example.com/blog/article-1"))

        # 2. 携带敏感认证 query 参数的 URL 严禁外发
        self.assertFalse(vault.assert_safe_for_external_fallback("https://example.com/api?token=secret123"))
        self.assertFalse(vault.assert_safe_for_external_fallback("https://sso.example.com/auth?ticket=ST-123456"))

        # 3. 携带 auth_state 凭据的请求严禁外发
        auth_state = {"cookies": [{"name": "sessionid", "value": "xyz"}]}
        self.assertFalse(vault.assert_safe_for_external_fallback("https://example.com/profile", auth_state=auth_state))

        # 4. 私有上下文严禁外发
        self.assertFalse(vault.assert_safe_for_external_fallback("https://example.com", is_private_context=True))

    def test_auth_vault_load_and_discovery(self):
        """测试从指定目录发现并读取 Playwright storageState"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            weibo_auth = tmppath / "weibo.com.json"
            sample_state = {
                "cookies": [{"name": "SUB", "value": "_2AkMV...", "domain": ".weibo.com"}],
                "origins": []
            }
            with open(weibo_auth, "w", encoding="utf-8") as f:
                json.dump(sample_state, f)

            vault = AuthVault(search_paths=[tmppath])
            self.assertTrue(vault.has_credentials("weibo.com"))
            self.assertTrue(vault.has_credentials("https://m.weibo.cn/detail/123"))
            self.assertFalse(vault.has_credentials("zhihu.com"))

            loaded = vault.load_storage_state("weibo.com")
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded["cookies"][0]["name"], "SUB")

    def test_mock_browser_driver_injection(self):
        """测试可注入自定义或 Mock 驱动，为 fetch_page 提供无状态渲染"""
        class MockDriver(IBrowserDriver):
            def is_available(self) -> bool:
                return True

            def render_page_stateless(self, url, timeout_budget=12.0, auth_state=None, config=None):
                return RenderResult(
                    success=True,
                    outcome="rendered",
                    url=url,
                    title="Mock Rendered Page",
                    content_md="# 动态渲染后的正文\n\n通过虚拟无头模型成功渲染。",
                    raw_html="<html><body><h1>动态渲染后的正文</h1></body></html>",
                    latency_ms=120.0,
                    backend="mock_browser"
                )

            def create_session(self, session_id, config=None):
                mock_sess = MagicMock(spec=IBrowserSession)
                return mock_sess

        mock_driver = MockDriver()
        set_browser_driver(mock_driver)

        driver = get_browser_driver()
        self.assertTrue(driver.is_available())
        res = driver.render_page_stateless("https://spa.example.com")
        self.assertTrue(res.success)
        self.assertEqual(res.backend, "mock_browser")
        self.assertIn("动态渲染后的正文", res.content_md)


if __name__ == "__main__":
    unittest.main()
