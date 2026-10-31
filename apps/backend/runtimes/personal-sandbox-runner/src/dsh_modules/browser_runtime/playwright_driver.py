"""
Playwright-based Headless Browser Driver for DeepSeek Harness (dsh).
Implements secure one-shot rendering (for fetch_page) and task-scoped sessions (for future browser-use).
Features strict SSRF route interception, domcontentloaded readiness detection, and explicit resource reclamation.
"""

import os
import time
import urllib.parse
from typing import Optional, Dict, Any

from .types import (
    BrowserAction,
    BrowserActionType,
    BrowserObservation,
    BrowserConfig,
    RenderResult
)
from .driver_interface import IBrowserDriver, IBrowserSession
from .html_markdown import html_to_clean_markdown
from ..web_ssrf import is_safe_web_url


class PlaywrightSession(IBrowserSession):
    """Interactive Playwright session bound to a specific task lifecycle."""

    def __init__(self, context, page, session_id: str):
        self.context = context
        self.page = page
        self.session_id = session_id
        self._is_closed = False

    def step(self, action: BrowserAction) -> BrowserObservation:
        if self._is_closed:
            return BrowserObservation(url="", error="Browser session is already closed")

        try:
            atype = action.action_type
            params = action.params or {}

            if atype == BrowserActionType.GOTO:
                url = params.get("url", "")
                safe, reason = is_safe_web_url(url)
                if not safe:
                    return BrowserObservation(url=url, error=f"SSRF Blocked: {reason}")
                self.page.goto(url, wait_until="domcontentloaded", timeout=15000)

            elif atype == BrowserActionType.CLICK:
                selector = params.get("selector", "")
                self.page.click(selector, timeout=5000)

            elif atype == BrowserActionType.TYPE:
                selector = params.get("selector", "")
                text = params.get("text", "")
                self.page.fill(selector, text, timeout=5000)

            elif atype == BrowserActionType.SCROLL:
                delta_y = params.get("delta_y", 500)
                self.page.mouse.wheel(0, delta_y)
                self.page.wait_for_timeout(500)

            elif atype == BrowserActionType.WAIT:
                ms = min(params.get("ms", 1000), 10000)
                self.page.wait_for_timeout(ms)

            return self.get_state()
        except Exception as e:
            return BrowserObservation(url=self.page.url if self.page else "", error=str(e))

    def get_state(self) -> BrowserObservation:
        if self._is_closed:
            return BrowserObservation(url="", error="Session closed")
        try:
            url = self.page.url
            title = self.page.title()
            text_content = self.page.inner_text("body")
            return BrowserObservation(
                url=url,
                title=title,
                text_content=text_content
            )
        except Exception as e:
            return BrowserObservation(url="", error=str(e))

    def close(self) -> None:
        if not self._is_closed:
            self._is_closed = True
            try:
                self.context.close()
            except Exception:
                pass


class PlaywrightDriver(IBrowserDriver):
    """
    Standard Playwright Driver implementation.
    Safely controls Chromium with zero residual daemons in stateless mode.
    """

    def __init__(self):
        self._playwright_available = False
        try:
            import playwright  # noqa: F401
            self._playwright_available = True
        except ImportError:
            self._playwright_available = False

    def is_available(self) -> bool:
        return self._playwright_available

    def _setup_security_interception(self, context):
        """Attaches route handler to enforce SSRF validation on all subresources and navigations"""
        def intercept_route(route, request):
            req_url = request.url
            safe, reason = is_safe_web_url(req_url)
            if not safe:
                route.abort("accessdenied")
            else:
                route.continue_()

        context.route("**/*", intercept_route)

    def render_page_stateless(
        self,
        url: str,
        timeout_budget: float = 12.0,
        auth_state: Optional[Dict[str, Any]] = None,
        config: Optional[BrowserConfig] = None
    ) -> RenderResult:
        if not self.is_available():
            return RenderResult(
                success=False,
                outcome="driver_unavailable",
                url=url,
                error_message="Playwright is not installed in the current environment",
                backend="none"
            )

        start_time = time.monotonic()
        safe, reason = is_safe_web_url(url)
        if not safe:
            return RenderResult(
                success=False,
                outcome="ssrf_blocked",
                url=url,
                error_message=f"SSRF Blocked: {reason}",
                backend="playwright"
            )

        from playwright.sync_api import sync_playwright

        cfg = config or BrowserConfig()
        launch_args = [
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check"
        ]
        # 非 root 环境且无特殊权限时按需兼容
        if os.geteuid() == 0:
            launch_args.append("--no-sandbox")

        playwright_obj = None
        browser = None
        context = None

        try:
            playwright_obj = sync_playwright().start()
            browser = playwright_obj.chromium.launch(
                headless=cfg.headless,
                args=launch_args,
                timeout=int(timeout_budget * 1000)
            )

            context_options = {
                "viewport": {"width": cfg.viewport_width, "height": cfg.viewport_height},
                "user_agent": cfg.user_agent or "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            }
            if auth_state:
                context_options["storage_state"] = auth_state

            context = browser.new_context(**context_options)
            self._setup_security_interception(context)

            page = context.new_page()
            remaining_ms = max(1000, int((timeout_budget - (time.monotonic() - start_time)) * 1000))

            # 1. 等待 DOMContentLoaded
            page.goto(url, wait_until="domcontentloaded", timeout=remaining_ms)

            # 2. 短暂等待页面动态脚本填充 (避免等待无休止的 networkidle)
            # 轮询 3 次，每次 400ms，只要 body 内容长度超过 300 字符或稳定即可
            for _ in range(3):
                elapsed = time.monotonic() - start_time
                if elapsed >= timeout_budget - 1.0:
                    break
                page.wait_for_timeout(400)
                try:
                    text_len = len(page.inner_text("body") or "")
                    if text_len > 300:
                        break
                except Exception:
                    pass

            title = page.title()
            final_url = page.url
            raw_html = page.content()
            text_content = page.inner_text("body")
            latency = (time.monotonic() - start_time) * 1000

            content_md = html_to_clean_markdown(raw_html, fallback_text=text_content)

            return RenderResult(
                success=True,
                outcome="rendered",
                url=final_url,
                title=title,
                content_md=content_md,
                raw_html=raw_html,
                latency_ms=latency,
                backend="playwright",
                is_authenticated=bool(auth_state)
            )
        except Exception as e:
            latency = (time.monotonic() - start_time) * 1000
            return RenderResult(
                success=False,
                outcome="render_failed",
                url=url,
                error_message=str(e),
                latency_ms=latency,
                backend="playwright",
                is_authenticated=bool(auth_state)
            )
        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass
            if playwright_obj:
                try:
                    playwright_obj.stop()
                except Exception:
                    pass

    def create_session(
        self,
        session_id: str,
        config: Optional[BrowserConfig] = None
    ) -> IBrowserSession:
        if not self.is_available():
            raise RuntimeError("Playwright is not installed in the current environment")

        from playwright.sync_api import sync_playwright

        cfg = config or BrowserConfig()
        launch_args = [
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run"
        ]
        if os.geteuid() == 0:
            launch_args.append("--no-sandbox")

        playwright_obj = sync_playwright().start()
        browser = playwright_obj.chromium.launch(
            headless=cfg.headless,
            args=launch_args,
            timeout=cfg.timeout_ms
        )
        context = browser.new_context()
        self._setup_security_interception(context)
        page = context.new_page()

        return PlaywrightSession(context, page, session_id)
