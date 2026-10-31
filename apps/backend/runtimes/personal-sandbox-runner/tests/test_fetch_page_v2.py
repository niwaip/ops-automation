"""
Comprehensive Unit Tests for Tiered Web Retrieval (Fetch -> Jina -> Local Headless Browser).
Verifies:
1. Elimination of False Positive Success on Weibo login page.
2. Tier 2: Public SPA pages fall back to Jina Reader first (saving local compute).
3. Tier 3: When Jina fails/times out, local headless browser kicks in as the ultimate safety net.
4. Resilience: 403 Forbidden on native fetch (e.g. Zhihu) is NOT aborted, but successfully rescued by Jina/Local Browser.
5. Privacy Wall: Authenticated requests (with storageState) bypass Jina and render locally.
6. Jina API Key header injection support.
7. Strict SSRF blocking.
"""

import unittest
from unittest.mock import patch, MagicMock
import urllib.error
import os

from dsh_modules.web_tools import fetch_page, fetch_page_detailed, _fetch_jina_fallback, _fetch_firecrawl_scrape_fallback
from dsh_modules.web_classifier import WebOutcome
from dsh_modules.browser_runtime import (
    IBrowserDriver,
    RenderResult,
    set_browser_driver,
    PlaywrightDriver,
    html_to_clean_markdown,
)
from dsh_modules.tool_result import ToolResult


class TestTieredWebRetrieval(unittest.TestCase):

    def tearDown(self):
        set_browser_driver(PlaywrightDriver())
        if "JINA_API_KEY" in os.environ:
            del os.environ["JINA_API_KEY"]
        if "FIRECRAWL_API_KEY" in os.environ:
            del os.environ["FIRECRAWL_API_KEY"]

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    def test_weibo_login_page_blocked_from_false_positive_success(self, mock_build_opener, mock_is_safe):
        """核心用例验证：针对微博登录 URL，彻底消除 50 字符假成功，明确判定为 LOGIN_REQUIRED 且严禁外发 Jina"""
        weibo_url = "https://weibo.com/newlogin?tabtype=weibo&gid=102803&openLoginLayer=0&url=https://weibo.com/"
        weibo_html = """
        <html>
        <head><title>微博 - 随时随地发现新鲜事</title></head>
        <body>
            <div class="login-wrapper">
                <h3>请扫码登录微博</h3>
                <form action="/login" method="post">
                    <input type="text" name="username" />
                    <input type="password" name="password" />
                    <button type="submit">登录</button>
                </form>
            </div>
            <footer>这是一段超过五十个字符的网站底部通用版权协议与备案声明内容，用于测试过去的正则假成功漏洞。</footer>
        </body>
        </html>
        """.encode("utf-8")

        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [weibo_html, b""]
        mock_resp.status = 200

        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        res_detailed: ToolResult = fetch_page_detailed(weibo_url)
        self.assertEqual(res_detailed.provenance.get("outcome"), WebOutcome.LOGIN_REQUIRED.value)
        self.assertTrue(res_detailed.is_partial)
        self.assertIn("需要用户登录鉴权", res_detailed.render_text())
        self.assertIn("未挂载该站点的有效会话凭据", res_detailed.render_text())

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_zhihu_403_rescued_by_jina_without_short_circuit(self, mock_jina, mock_build_opener, mock_is_safe):
        """核心修复验证：知乎等平台对原生 urllib 返回 403 Forbidden 时，绝不提前退出，由 Jina 成功穿透救场！"""
        zhihu_url = "https://zhuanlan.zhihu.com/p/2072698072879125245"

        # 模拟原生 urllib 遭遇 403 Forbidden
        mock_opener = MagicMock()
        mock_opener.open.side_effect = urllib.error.HTTPError(zhihu_url, 403, "Forbidden", {}, None)
        mock_build_opener.return_value = mock_opener

        # 模拟 Jina 云端成功抓取知乎专栏长文
        zhihu_article = (
            "# DeepSeek Harness 必装的 10 个插件\n\n"
            "最近这几天，DeepSeek Harness 火得一塌糊涂。发布当晚 GitHub 仓库公开不到两小时，Star 数就破万了。"
            "很多同学装上 Harness 之后发现界面太素了，今天这篇文章就挑选出 10 个最值得装的精选插件。"
        )
        mock_jina.return_value = (zhihu_article, None)

        res = fetch_page_detailed(zhihu_url)
        self.assertTrue(res.is_success)
        self.assertEqual(res.provenance.get("backend"), "jina_fallback")
        self.assertIn("DeepSeek Harness 必装的 10 个插件", res.render_text())
        mock_jina.assert_called_once()

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_tier2_jina_success_skips_local_browser(self, mock_jina, mock_build_opener, mock_is_safe):
        """Tier 2 测试：公开 SPA 页面，Jina 成功返回，无需拉起本地无头浏览器（白嫖算力）"""
        spa_url = "https://dashboard.example.com/public-analytics"
        spa_html = b"<html><body><div id='app'></div><script src='/bundle.js'></script></body></html>"

        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [spa_html, b""]
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        mock_jina.return_value = ("# Jina 云端渲染正文\n\n成功从 Jina 获取公开内容。", None)

        mock_driver = MagicMock(spec=IBrowserDriver)
        mock_driver.is_available.return_value = True
        set_browser_driver(mock_driver)

        res = fetch_page_detailed(spa_url)
        self.assertTrue(res.is_success)
        self.assertEqual(res.provenance.get("backend"), "jina_fallback")
        self.assertIn("Jina 云端渲染正文", res.render_text())
        mock_driver.render_page_stateless.assert_not_called()

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_tier3_local_browser_kicks_in_when_jina_fails(self, mock_jina, mock_build_opener, mock_is_safe):
        """Tier 3 核心测试：公开 SPA 页面，当 Jina 失败（如超时/429/海外被拦），本地无头浏览器成功兜底救场！"""
        spa_url = "https://dashboard.example.com/protected-spa"
        spa_html = b"<html><body><div id='app'></div><noscript>Please enable JS</noscript></body></html>"

        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [spa_html, b""]
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        mock_jina.return_value = (None, "获取网页内容超时: The read operation timed out")

        class LocalFallbackBrowserDriver(IBrowserDriver):
            def is_available(self):
                return True

            def render_page_stateless(self, url, timeout_budget=10.0, auth_state=None, config=None):
                return RenderResult(
                    success=True,
                    outcome="rendered",
                    url=url,
                    title="Dashboard",
                    content_md="# 本地无头浏览器接盘成功\n\nJina 超时后，沙箱本地 Chromium 成功渲染动态正文！各项数据指标与实时信息流均已正常加载并完成呈现。系统运行稳定，无异常告警。",
                    raw_html="<html><body><article><h1>本地无头浏览器接盘成功</h1><p>Jina 超时后，沙箱本地 Chromium 成功渲染动态正文！各项数据指标与实时信息流均已正常加载并完成呈现。系统运行稳定，无异常告警。</p></article></body></html>",
                    latency_ms=310.0,
                    backend="local_chromium"
                )

            def create_session(self, session_id, config=None):
                return MagicMock()

        set_browser_driver(LocalFallbackBrowserDriver())

        res = fetch_page_detailed(spa_url)
        self.assertTrue(res.is_success)
        self.assertEqual(res.provenance.get("backend"), "headless_browser_fallback")
        self.assertIn("本地无头浏览器接盘成功", res.render_text())
        self.assertIn("本地无头浏览器兜底", res.render_text())

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("dsh_modules.web_tools.default_auth_vault.load_storage_state")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_authenticated_request_bypasses_jina_and_renders_locally(self, mock_jina, mock_load_auth, mock_is_safe):
        """隐私屏障测试：带有个人凭证（auth_state）的请求绝对跳过 Jina，直接在本地浏览器安全渲染"""
        private_url = "https://weibo.com/my/feed"
        mock_load_auth.return_value = {"cookies": [{"name": "SUB", "value": "my_secret_cookie"}]}

        mock_driver = MagicMock(spec=IBrowserDriver)
        mock_driver.is_available.return_value = True
        mock_driver.render_page_stateless.return_value = RenderResult(
            success=True,
            outcome="rendered",
            url=private_url,
            title="我的个人主页",
            content_md="# 关注动态流\n\n这是您的个人专属关注流内容，包含私信与收藏动态。今日关注博主共发布了 12 条新动态，互动数据稳步增长。",
            raw_html="<html><body><article><h1>关注动态流</h1><p>这是您的个人专属关注流内容，包含私信与收藏动态。今日关注博主共发布了 12 条新动态，互动数据稳步增长。</p></article></body></html>",
            latency_ms=280.0,
            backend="playwright",
            is_authenticated=True
        )
        set_browser_driver(mock_driver)

        res = fetch_page_detailed(private_url)
        self.assertTrue(res.is_success)
        self.assertEqual(res.provenance.get("backend"), "headless_browser")
        self.assertTrue(res.provenance.get("auth_injected"))
        mock_jina.assert_not_called()
        self.assertIn("关注动态流", res.render_text())

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    def test_jina_api_key_header_injection(self, mock_build_opener, mock_is_safe):
        """测试 Jina API Key 认证头注入"""
        os.environ["JINA_API_KEY"] = "jina_secret_key_999"

        captured_requests = []
        mock_opener = MagicMock()
        def fake_open(req, timeout=None):
            captured_requests.append(req)
            mock_resp = MagicMock()
            mock_resp.__enter__.return_value = mock_resp
            mock_resp.read.side_effect = [b"Title: Test\n\nMarkdown Content:\nJina with API Key successfully retrieved high-quality article content.", b""]
            return mock_resp

        mock_opener.open.side_effect = fake_open
        mock_build_opener.return_value = mock_opener

        content, err = _fetch_jina_fallback("https://example.com/page", max_chars=1000, timeout=4.0, deadline=None)
        self.assertIsNotNone(content)
        self.assertEqual(len(captured_requests), 1)
        req = captured_requests[0]
        # 验证 Authorization 头部正确携带了 Bearer Token
        self.assertEqual(req.headers.get("Authorization"), "Bearer jina_secret_key_999")

    def test_ssrf_forbidden_url(self):
        """测试 SSRF 内网拦截"""
        res = fetch_page_detailed("http://127.0.0.1:8080/admin")
        self.assertTrue(res.is_error)
        self.assertEqual(res.error_code, "ssrf_blocked")
        self.assertIn("安全拦截", res.render_text())

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_jina_adaptive_timeout_budget(self, mock_jina, mock_build_opener, mock_is_safe):
        """验证 Jina 超时预算弹性机制：配置 API Key 时享 10.0s 预算，未配置时为 7.0s"""
        test_url = "https://dashboard.example.com/long-read"
        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [b"<html><body><div id='app'></div></body></html>", b""]
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        mock_jina.return_value = ("# Content", None)

        # 1. 无 Key 状态：应传入 7.0s 预算
        if "JINA_API_KEY" in os.environ:
            del os.environ["JINA_API_KEY"]
        fetch_page_detailed(test_url)
        self.assertEqual(mock_jina.call_args[0][2], 7.0)

        # 2. 有 Key 状态：应传入 10.0s 充裕预算
        os.environ["JINA_API_KEY"] = "jina_test_key"
        fetch_page_detailed(test_url)
        self.assertEqual(mock_jina.call_args[0][2], 10.0)

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    def test_jina_key_exhausted_fallback_to_public_pool(self, mock_build_opener, mock_is_safe):
        """核心修复验证：当专属 JINA_API_KEY 遭遇 402(配额耗尽) 或 429 时，自动脱敏请求头回退至匿名公共池重试成功"""
        os.environ["JINA_API_KEY"] = "jina_exhausted_key"

        captured_requests = []
        call_count = 0

        def fake_open(req, timeout=None):
            nonlocal call_count
            call_count += 1
            captured_requests.append(req)
            if call_count == 1:
                # 第一次请求携带专属 key，模拟 402 Payment Required 配额耗尽
                raise urllib.error.HTTPError(req.full_url, 402, "Payment Required: Quota Exhausted", {}, None)
            # 第二次请求回退至公共池，重试成功
            mock_resp = MagicMock()
            mock_resp.__enter__.return_value = mock_resp
            mock_resp.read.side_effect = [
                b"Title: Public Pool Success\n\nMarkdown Content:\nSuccessfully fetched via anonymous public pool after quota exhaustion.",
                b""
            ]
            return mock_resp

        mock_opener = MagicMock()
        mock_opener.open.side_effect = fake_open
        mock_build_opener.return_value = mock_opener

        content, err = _fetch_jina_fallback("https://example.com/article", max_chars=1000, timeout=4.0, deadline=None)
        self.assertIsNotNone(content)
        self.assertIsNone(err)
        self.assertIn("Successfully fetched via anonymous public pool", content)
        self.assertEqual(len(captured_requests), 2)
        # 验证第一次携带了专属 Key
        self.assertEqual(captured_requests[0].headers.get("Authorization"), "Bearer jina_exhausted_key")
        # 验证第二次回退到公共池时，已自动剥离 Authorization 头部
        self.assertIsNone(captured_requests[1].headers.get("Authorization"))

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    @patch("dsh_modules.web_tools._fetch_firecrawl_scrape_fallback")
    def test_tier2_5_firecrawl_scrape_fallback(self, mock_fc, mock_jina, mock_build_opener, mock_is_safe):
        """Tier 2.5 验证：当 Jina 失败或超时，且环境中配置了 FIRECRAWL_API_KEY 时，自动通过 Firecrawl Scrape 获取正文"""
        target_url = "https://community.example.com/topic/123"
        os.environ["FIRECRAWL_API_KEY"] = "fc-personal-key"

        # 模拟原生抓取遭遇动态 SPA
        spa_html = b"<html><body><div id='root'></div><script src='/main.js'></script></body></html>"
        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [spa_html, b""]
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        # 模拟 Jina 失败（如限流或网络阻断）
        mock_jina.return_value = (None, "Jina Reader 超时或受限")

        # 模拟 Firecrawl Scrape 成功返回 Markdown
        mock_fc.return_value = ("# Firecrawl 云端提取正文\n\n通过 Firecrawl /v1/scrape 成功抓取动态渲染内容。", None)

        mock_driver = MagicMock(spec=IBrowserDriver)
        mock_driver.is_available.return_value = True
        set_browser_driver(mock_driver)

        res = fetch_page_detailed(target_url)
        self.assertTrue(res.is_success)
        self.assertEqual(res.provenance.get("backend"), "firecrawl_scrape_fallback")
        self.assertIn("Firecrawl 云端提取正文", res.render_text())
        mock_fc.assert_called_once()
        # 本地 Chromium 无需被拉起
        mock_driver.render_page_stateless.assert_not_called()

    @patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, ""))
    @patch("urllib.request.build_opener")
    @patch("dsh_modules.web_tools._fetch_jina_fallback")
    def test_headless_browser_markdownify(self, mock_jina, mock_build_opener, mock_is_safe):
        """核心格式修复验证：无头浏览器接盘后，富文本 HTML 必须经过 html_to_clean_markdown 结构化保留标题、链接与列表"""
        target_url = "https://complex-spa.example.com/details"
        spa_html = b"<html><body><div id='app'></div></body></html>"

        mock_resp = MagicMock()
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.read.side_effect = [spa_html, b""]
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        mock_jina.return_value = (None, "Jina 失败")

        rich_html = """
        <html>
        <head><title>详情页</title><style>.hidden { display: none; }</style></head>
        <body>
            <nav><a href="/home">首页</a></nav>
            <article>
                <h1>自动化架构核心指南</h1>
                <p>这是一篇关于<strong>AI Agent</strong>与无头浏览器集成的深度解析。</p>
                <h2>主要特性</h2>
                <ul>
                    <li>多级优雅降级策略</li>
                    <li>Markdownify 结构化解析</li>
                </ul>
                <p>参考官方文档：<a href="https://example.com/docs">点击查阅</a></p>
            </article>
            <script>console.log("analytics");</script>
        </body>
        </html>
        """

        class MockHeadlessDriver(IBrowserDriver):
            def is_available(self):
                return True

            def render_page_stateless(self, url, timeout_budget=10.0, auth_state=None, config=None):
                return RenderResult(
                    success=True,
                    outcome="rendered",
                    url=url,
                    title="详情页",
                    content_md="",  # 故意留空，验证 fetch_page_detailed 会自动调用 html_to_clean_markdown(raw_html)
                    raw_html=rich_html,
                    latency_ms=250.0,
                    backend="local_chromium"
                )

            def create_session(self, session_id, config=None):
                return MagicMock()

        set_browser_driver(MockHeadlessDriver())

        res = fetch_page_detailed(target_url)
        self.assertTrue(res.is_success)
        rendered_text = res.render_text()
        # 验证 Markdown 格式得到完美保留
        self.assertIn("# 自动化架构核心指南", rendered_text)
        self.assertIn("## 主要特性", rendered_text)
        self.assertTrue("- 多级优雅降级策略" in rendered_text or "* 多级优雅降级策略" in rendered_text)
        self.assertIn("[点击查阅](https://example.com/docs)", rendered_text)
        # 验证 script 和 nav 噪音被成功剥离
        self.assertNotIn("console.log", rendered_text)
        self.assertNotIn("首页", rendered_text)

    def test_html_to_clean_markdown_standalone(self):
        """验证 html_to_clean_markdown 转换模块去噪与保留语意的纯函数特性"""
        sample_html = """
        <html>
        <body>
            <script>var bad = 1;</script>
            <style>body { color: red; }</style>
            <h1>测试文章大标题</h1>
            <p>第一段包含一个 <a href="https://google.com">谷歌链接</a> 和 <strong>重点文字</strong>。</p>
            <pre><code>print('hello world')</code></pre>
        </body>
        </html>
        """
        md = html_to_clean_markdown(sample_html)
        self.assertIn("# 测试文章大标题", md)
        self.assertIn("[谷歌链接](https://google.com)", md)
        self.assertIn("print('hello world')", md)
        self.assertNotIn("var bad = 1", md)
        self.assertNotIn("color: red", md)


if __name__ == "__main__":
    unittest.main()
