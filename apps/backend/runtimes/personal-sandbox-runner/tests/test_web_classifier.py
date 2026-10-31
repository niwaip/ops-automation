"""
Unit tests for WebOutcome and PageContentClassifier.
Ensures accurate detection of login pages, SPA shells, bot challenges, and valid articles.
"""

import unittest
from dsh_modules.web_classifier import classify_web_page, WebOutcome


class TestWebClassifier(unittest.TestCase):

    def test_weibo_login_url_classified_as_login_required(self):
        """测试用户给出的微博登录案例，杜绝假成功"""
        weibo_url = "https://weibo.com/newlogin?tabtype=weibo&gid=102803&openLoginLayer=0&url=https://weibo.com/"
        weibo_html = """
        <!DOCTYPE html>
        <html>
        <head><title>微博 - 随时随地发现新鲜事</title></head>
        <body>
            <div class="login-box">
                <h2>扫码登录</h2>
                <div class="qrcode-login"></div>
                <p>请使用微博客户端扫一扫</p>
                <form action="/passport/login" method="post">
                    <input type="text" name="username" placeholder="手机号或邮箱" />
                    <input type="password" name="password" placeholder="请输入密码" />
                    <button type="submit">立即登录</button>
                </form>
            </div>
            <footer>京ICP备12002058号 增值电信业务经营许可证 互联网新闻信息服务许可证</footer>
        </body>
        </html>
        """
        res = classify_web_page(weibo_html, weibo_url)
        self.assertEqual(res.outcome, WebOutcome.LOGIN_REQUIRED)
        self.assertTrue(res.requires_auth)
        self.assertFalse(res.is_usable)
        self.assertIn("password_input", res.detected_features)
        self.assertIn("url_has_login_pattern", res.detected_features)

    def test_spa_shell_requires_browser_render(self):
        """测试 SPA 空壳检测，正确触发浏览器渲染需求"""
        spa_url = "https://example.com/app"
        spa_html = """
        <!DOCTYPE html>
        <html>
        <head><title>React App Dashboard</title></head>
        <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script src="/static/js/bundle.js"></script>
            <script src="/static/js/vendor.js"></script>
        </body>
        </html>
        """
        res = classify_web_page(spa_html, spa_url)
        self.assertEqual(res.outcome, WebOutcome.SPA_JS_SHELL)
        self.assertTrue(res.requires_browser_render)
        self.assertFalse(res.is_usable)

    def test_valid_news_article(self):
        """测试正常包含正文的新闻文章"""
        news_url = "https://news.example.com/article/123"
        news_html = """
        <!DOCTYPE html>
        <html>
        <head><title>深度科技快讯：AI 架构革新</title></head>
        <body>
            <article>
                <h1>深度科技快讯：AI 架构革新</h1>
                <p>今天，技术团队发布了全新的轻量化个人沙箱架构设计，实现了浏览器运行时解耦。</p>
                <p>该架构有效隔离了长效会话和临时无状态抓取任务，大幅降低了资源开销和维护复杂度。</p>
                <p>通过多层分级获取机制，保证了毫秒级响应并兼顾了复杂富前端的动态渲染支持。</p>
            </article>
        </body>
        </html>
        """
        res = classify_web_page(news_html, news_url)
        self.assertEqual(res.outcome, WebOutcome.VALID_CONTENT)
        self.assertTrue(res.is_usable)
        self.assertFalse(res.requires_auth)
        self.assertIn("AI 架构革新", res.extracted_text)

    def test_cloudflare_challenge(self):
        """测试 Cloudflare 人机挑战检测"""
        cf_url = "https://protected.example.com"
        cf_html = """
        <!DOCTYPE html>
        <html>
        <head><title>Just a moment...</title></head>
        <body>
            <div class="cf-browser-verification">
                <p>Checking your browser before accessing the website.</p>
                <p>Enable JavaScript and cookies to continue.</p>
            </div>
        </body>
        </html>
        """
        res = classify_web_page(cf_html, cf_url)
        self.assertEqual(res.outcome, WebOutcome.BOT_CHALLENGE)
        self.assertFalse(res.is_usable)

    def test_http_error_codes(self):
        """测试 403 与 500 状态码"""
        res_403 = classify_web_page("<html>403 Forbidden</html>", "https://example.com/secret", http_status=403)
        self.assertEqual(res_403.outcome, WebOutcome.ACCESS_DENIED)

        res_500 = classify_web_page("<html>Internal Error</html>", "https://example.com/err", http_status=500)
        self.assertEqual(res_500.outcome, WebOutcome.HTTP_ERROR)


if __name__ == "__main__":
    unittest.main()
