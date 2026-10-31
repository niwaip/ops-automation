"""
Web Outcome and Content Classifier for DeepSeek Harness (dsh).
Accurately categorizes web fetch responses to prevent 'false positive success'
and guides intelligent fallback to headless browser rendering or auth instructions.
"""

import re
import html
import urllib.parse
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any


class WebOutcome(str, Enum):
    VALID_CONTENT = "valid_content"          # 真实有效的网页正文
    SPA_JS_SHELL = "spa_js_shell"            # 客户端单页应用(SPA)空壳，需浏览器JS渲染
    LOGIN_REQUIRED = "login_required"        # 明确需要用户登录鉴权/会话凭据
    BOT_CHALLENGE = "bot_challenge"          # 人机挑战(Cloudflare/极验/验证码/WAF)
    ACCESS_DENIED = "access_denied"          # 403 Forbidden / IP 拦截
    HTTP_ERROR = "http_error"                # 404 / 500 等 HTTP 故障
    EMPTY_RESPONSE = "empty_response"        # 完全空内容或空白页面
    UNSUPPORTED_TYPE = "unsupported_type"    # 二进制/非文本类型


@dataclass
class PageClassificationResult:
    outcome: WebOutcome
    title: str = ""
    extracted_text: str = ""
    clean_markdown: str = ""
    confidence: float = 1.0
    reason: str = ""
    detected_features: List[str] = field(default_factory=list)
    final_url: str = ""
    http_status: int = 200

    @property
    def is_usable(self) -> bool:
        return self.outcome == WebOutcome.VALID_CONTENT

    @property
    def requires_browser_render(self) -> bool:
        return self.outcome == WebOutcome.SPA_JS_SHELL

    @property
    def requires_auth(self) -> bool:
        return self.outcome == WebOutcome.LOGIN_REQUIRED


# 特征正则规则集
LOGIN_URL_PATTERNS = [
    re.compile(r'[/?&](new)?login', re.I),
    re.compile(r'[/?&]passport', re.I),
    re.compile(r'[/?&]signin', re.I),
    re.compile(r'[/?&]auth(enticate)?', re.I),
    re.compile(r'[/?&]oauth', re.I),
    re.compile(r'[/?&]sso', re.I),
    re.compile(r'loginLayer=', re.I),
]

LOGIN_DOM_PATTERNS = [
    (re.compile(r'<input\b[^>]*type=["\']password["\']', re.I), "password_input"),
    (re.compile(r'<form\b[^>]*(?:login|signin|auth)', re.I), "login_form"),
    (re.compile(r'(?:扫码登录|二维码登录|密码登录|短信验证码登录|请先登录|登录后查看|立即登录|快速登录)', re.I), "chinese_login_prompt"),
    (re.compile(r'(?:sign in to your account|log in to continue|please sign in|please log in)', re.I), "english_login_prompt"),
    (re.compile(r'login-container|login-box|passport-login|qrcode-login', re.I), "login_container_class"),
]

BOT_CHALLENGE_PATTERNS = [
    (re.compile(r'Just a moment\.\.\.', re.I), "cloudflare_wait"),
    (re.compile(r'cf-browser-verification|challenge-platform|cf-turnstile', re.I), "cloudflare_challenge"),
    (re.compile(r'(?:geetest|gt_slider|滑动滑块|完成安全验证|验证码错误|security challenge)', re.I), "captcha_slider"),
    (re.compile(r'hcaptcha\.com|recaptcha/api', re.I), "recaptcha_script"),
    (re.compile(r'Enable JavaScript and cookies to continue', re.I), "antibot_cookie_prompt"),
]

SPA_SHELL_PATTERNS = [
    (re.compile(r'<div\b[^>]*id=["\'](?:app|root|__next|__nuxt|main-app)["\']\s*>\s*</div>', re.I), "empty_spa_mount_div"),
    (re.compile(r'You need to enable JavaScript to run this app', re.I), "noscript_spa_warning"),
    (re.compile(r'请开启\s*JavaScript|需要启用\s*JavaScript|需开启浏览器的\s*JS', re.I), "chinese_noscript_warning"),
]


def extract_html_title(raw_html: str) -> str:
    """提取 HTML <title> 内容并反转义"""
    m = re.search(r'<title\b[^>]*>(.*?)</title>', raw_html, re.DOTALL | re.I)
    if m:
        clean = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        return html.unescape(clean)
    return ""


def extract_clean_text_segments(raw_html: str) -> List[str]:
    """剥离 script/style/svg/nav/header/footer 后提取有效正文行段落"""
    clean = re.sub(
        r'<(?:script|style|svg|noscript|nav|header|footer|aside|select|option)[^>]*>.*?</(?:script|style|svg|noscript|nav|header|footer|aside|select|option)>',
        '',
        raw_html,
        flags=re.DOTALL | re.I
    )
    clean = re.sub(r'<!--.*?-->', '', clean, flags=re.DOTALL)
    clean = re.sub(r'<[^>]+>', '\n', clean)
    clean = html.unescape(clean)
    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    return lines


def classify_web_page(
    raw_html: str,
    target_url: str,
    http_status: int = 200,
    parsed_markdown: Optional[str] = None
) -> PageClassificationResult:
    """
    深度网页内容分类器：
    综合分析 HTTP 状态码、URL 参数特征、页面 DOM 特征与正文语义密度，
    准确阻断假成功（False Positive Success）。
    """
    clean_url = target_url.strip()
    title = extract_html_title(raw_html)
    features: List[str] = []

    # 1. HTTP 状态码前置检查
    if http_status in (401, 403):
        return PageClassificationResult(
            outcome=WebOutcome.ACCESS_DENIED,
            title=title or "访问受限 (403)",
            reason=f"服务器返回拒绝访问状态码 ({http_status})",
            final_url=clean_url,
            http_status=http_status
        )
    elif http_status in (404, 500, 502, 503, 504):
        return PageClassificationResult(
            outcome=WebOutcome.HTTP_ERROR,
            title=title or f"HTTP 错误 ({http_status})",
            reason=f"目标服务器响应异常状态码 ({http_status})",
            final_url=clean_url,
            http_status=http_status
        )

    if not raw_html or len(raw_html.strip()) == 0:
        return PageClassificationResult(
            outcome=WebOutcome.EMPTY_RESPONSE,
            title="空白响应",
            reason="目标服务器返回了空内容",
            final_url=clean_url,
            http_status=http_status
        )

    # 2. 检查人机校验 / 防爬挑战 (Bot Challenge)
    for pat, feat_name in BOT_CHALLENGE_PATTERNS:
        if pat.search(raw_html):
            features.append(feat_name)
    if "cloudflare_wait" in features or "cloudflare_challenge" in features or "captcha_slider" in features:
        return PageClassificationResult(
            outcome=WebOutcome.BOT_CHALLENGE,
            title=title or "安全验证拦截",
            reason="页面命中 WAF 或人机验证质询 (Cloudflare / 验证码 / 滑块)",
            detected_features=features,
            final_url=clean_url,
            http_status=http_status
        )

    # 3. 检查登录页与鉴权特征 (Login Required)
    url_has_login = any(pat.search(clean_url) for pat in LOGIN_URL_PATTERNS)
    if url_has_login:
        features.append("url_has_login_pattern")

    for pat, feat_name in LOGIN_DOM_PATTERNS:
        if pat.search(raw_html):
            features.append(feat_name)

    # 复合判定：URL 命中登录特征 且 页面具有登录表单/提示
    # 或者 页面标题直接包含登录/passport 且带有登录特征
    title_lower = title.lower()
    title_has_login = "登录" in title or "passport" in title_lower or "sign in" in title_lower or "log in" in title_lower
    if title_has_login:
        features.append("title_has_login")

    is_login_page = (
        (url_has_login and len(features) >= 2)
        or (title_has_login and ("password_input" in features or "chinese_login_prompt" in features or "english_login_prompt" in features))
        or ("password_input" in features and "chinese_login_prompt" in features)
    )

    if is_login_page:
        return PageClassificationResult(
            outcome=WebOutcome.LOGIN_REQUIRED,
            title=title or "登录入口",
            reason="页面属于登录认证网关或重定向登录页，需要用户会话凭据",
            detected_features=features,
            final_url=clean_url,
            http_status=http_status
        )

    # 4. 检查客户端 SPA / CSR 空壳特征 (SPA JS Shell)
    for pat, feat_name in SPA_SHELL_PATTERNS:
        if pat.search(raw_html):
            features.append(feat_name)

    text_segments = extract_clean_text_segments(raw_html)
    total_text = " ".join(text_segments)
    if parsed_markdown and len(parsed_markdown.strip()) > len(total_text):
        total_text = parsed_markdown.strip()
    num_chars = len(total_text)

    # 统计脚本数量与正文字符比例
    scripts_count = len(re.findall(r'<script\b', raw_html, re.I))
    if ("empty_spa_mount_div" in features or "noscript_spa_warning" in features or "chinese_noscript_warning" in features):
        if num_chars < 200 or scripts_count > 3:
            return PageClassificationResult(
                outcome=WebOutcome.SPA_JS_SHELL,
                title=title,
                extracted_text=total_text,
                reason="检测到单页应用(SPA)挂载点与JS启用提示，页面未完成客户端渲染",
                detected_features=features,
                final_url=clean_url,
                http_status=http_status
            )

    # 极低正文密度但含有大量打包 script，判定为前端空壳
    if num_chars < 80 and scripts_count >= 2:
        features.append("low_text_density_with_scripts")
        return PageClassificationResult(
            outcome=WebOutcome.SPA_JS_SHELL,
            title=title,
            extracted_text=total_text,
            reason="页面正文密度极低且依赖脚本打包，疑似未渲染前端空壳",
            detected_features=features,
            final_url=clean_url,
            http_status=http_status
        )

    # 5. 判定有效正文 (Valid Content)
    # 过滤仅仅是站点通用导航/版权/备案信息的极短文本（例如 < 50 字符）
    if num_chars <= 50:
        return PageClassificationResult(
            outcome=WebOutcome.EMPTY_RESPONSE,
            title=title,
            extracted_text=total_text,
            reason=f"提取的正文过短 (仅 {num_chars} 字符)，缺乏实质性内容",
            detected_features=features,
            final_url=clean_url,
            http_status=http_status
        )

    clean_md = parsed_markdown if parsed_markdown else "\n\n".join(text_segments)
    return PageClassificationResult(
        outcome=WebOutcome.VALID_CONTENT,
        title=title,
        extracted_text=total_text,
        clean_markdown=clean_md,
        reason=f"成功提取有效正文 ({num_chars} 字符)",
        detected_features=features,
        final_url=clean_url,
        http_status=http_status
    )
