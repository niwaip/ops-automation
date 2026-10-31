"""
Web retrieval and search tools for DeepSeek Harness (dsh):
Weather query, web search, page scraping, temporal freshness extraction, and query normalization.
"""

import os
import sys
import json
import re
import html
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error
import http.client
import subprocess
import socket
import ipaddress
import concurrent.futures
from pathlib import Path
from typing import Optional, Tuple

from .config import PLUGIN_DIR, DEFAULT_PROXY_URL, VIRTUAL_API_KEY

CITY_PINYIN = {
    "北京": "Beijing", "上海": "Shanghai", "广州": "Guangzhou", "深圳": "Shenzhen", "杭州": "Hangzhou",
    "南京": "Nanjing", "苏州": "Suzhou", "成都": "Chengdu", "武汉": "Wuhan", "重庆": "Chongqing",
    "西安": "Xi_an", "天津": "Tianjin", "长沙": "Changsha", "郑州": "Zhengzhou", "济南": "Jinan",
    "青岛": "Qingdao", "沈阳": "Shenyang", "大连": "Dalian", "哈尔滨": "Harbin", "长春": "Changchun",
    "福州": "Fuzhou", "厦门": "Xiamen", "合肥": "Hefei", "南昌": "Nanchang", "昆明": "Kunming",
    "贵阳": "Guiyang", "南宁": "Nanning", "海口": "Haikou", "三亚": "Sanya", "石家庄": "Shijiazhuang",
    "太原": "Taiyuan", "呼和浩特": "Hohhot", "兰州": "Lanzhou", "西宁": "Xining", "银川": "Yinchuan",
    "乌鲁木齐": "Urumqi", "拉萨": "Lhasa", "香港": "Hong_Kong", "澳门": "Macau", "台北": "Taipei",
    "无锡": "Wuxi", "宁波": "Ningbo", "佛山": "Foshan", "东莞": "Dongguan", "温州": "Wenzhou",
    "常州": "Changzhou", "绍兴": "Shaoxing", "嘉兴": "Jiaxing", "金华": "Jinhua", "扬州": "Yangzhou",
    "镇江": "Zhenjiang", "泰州": "Taizhou", "盐城": "Yancheng", "宿迁": "Suqian", "淮安": "Huaian",
    "徐州": "Xuzhou", "台州": "Taizhou_Zhejiang", "珠海": "Zhuhai", "中山": "Zhongshan", "江门": "Jiangmen",
    "汕头": "Shantou", "烟台": "Yantai", "潍坊": "Weifang", "威海": "Weihai", "淄博": "Zibo",
    "临沂": "Linyi", "洛阳": "Luoyang", "南阳": "Nanyang", "襄阳": "Xiangyang", "宜昌": "Yichang",
    "芜湖": "Wuhu", "赣州": "Ganzhou", "九江": "Jiujiang", "泉州": "Quanzhou", "漳州": "Zhangzhou",
    "桂林": "Guilin", "柳州": "Liuzhou", "绵阳": "Mianyang", "宜宾": "Yibin", "遵义": "Zunyi"
}


def check_deadline(deadline: Optional[float], default_timeout: float = 10.0, min_timeout: float = 0.01) -> float:
    """Checks task deadline and returns clamped timeout for network/subprocess operations."""
    if deadline is not None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Task total execution deadline exceeded")
        return max(min_timeout, min(default_timeout, remaining))
    return default_timeout


def assert_not_timed_out(deadline: Optional[float], operation_name: str = "operation"):
    """Raises TimeoutError if task deadline has elapsed."""
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError(f"Task total execution deadline exceeded during {operation_name}")


WMO_WEATHER_CODES = {
    0: "晴", 1: "晴间多云", 2: "多云", 3: "阴", 45: "有雾", 48: "雾凇",
    51: "轻微毛毛雨", 53: "毛毛雨", 55: "密集毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨", 71: "小雪", 73: "中雪", 75: "大雪",
    80: "阵雨", 81: "强阵雨", 82: "暴雨", 95: "雷阵雨"
}


def fetch_weather(query_or_city: str, deadline: Optional[float] = None) -> str:
    """Fetches high-accuracy real-time weather and 7-day forecast via structured weather API"""
    target = None
    found_city = None
    clean_input = (query_or_city or "").strip()

    for k, v in CITY_PINYIN.items():
        if k in clean_input:
            target = v
            found_city = k
            break

    if not found_city:
        # 尝试提取用户或模型传递的纯城市名（2-6个中文字符）
        if re.match(r'^[\u4e00-\u9fa5]{2,6}$', clean_input):
            found_city = clean_input
            target = urllib.parse.quote(clean_input)
        else:
            m = re.search(r'([\u4e00-\u9fa5]{2,6})(?:市|区|县)?(?:的天气|天气|气象|预报)', clean_input)
            if m:
                found_city = m.group(1)
                target = urllib.parse.quote(found_city)
            else:
                target = "Shanghai"
                found_city = "上海"

    to = check_deadline(deadline, default_timeout=8.0)
    display_target = urllib.parse.unquote(target)
    lines = [f"【{found_city} 实时权威气象与多日预报 ({display_target})】:"]

    wttr_weather = []
    lat, lon = None, None

    # 1. 尝试从 wttr.in 获取当前实时气况与自适应地理经纬度
    try:
        url = f"https://wttr.in/{target}?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=min(to, 4.0)) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert_not_timed_out(deadline, "weather query")
            current = data.get("current_condition", [{}])[0]
            curr_desc = current.get("weatherDesc", [{}])[0].get("value", "多云")
            lines.append(
                f"- 当前实时气温: {current.get('temp_C')}°C (体感 {current.get('FeelsLikeC')}°C), "
                f"湿度 {current.get('humidity')}%, 风速 {current.get('windspeedKmph')}km/h, 状况: {curr_desc}"
            )
            wttr_weather = data.get("weather", [])
            nearest = data.get("nearest_area", [{}])[0]
            if nearest.get("latitude") and nearest.get("longitude"):
                lat, lon = float(nearest["latitude"]), float(nearest["longitude"])
    except Exception:
        pass

    # 2. 依据动态经纬度调用 open-meteo 获取权威完整 7 天（一周）预报
    has_7day = False
    if lat is not None and lon is not None:
        try:
            om_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto"
            om_req = urllib.request.Request(om_url, headers={"User-Agent": "curl/8.0"})
            with urllib.request.urlopen(om_req, timeout=min(to, 5.0)) as om_resp:
                om_data = json.loads(om_resp.read().decode("utf-8"))
                daily = om_data.get("daily", {})
                dates = daily.get("time", [])
                max_t = daily.get("temperature_2m_max", [])
                min_t = daily.get("temperature_2m_min", [])
                rain = daily.get("precipitation_probability_max", [])
                codes = daily.get("weathercode", [])
                if dates and len(dates) >= 7:
                    lines.append(f"【未来 7 天 (一周) 趋势预报】:")
                    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
                    for idx in range(min(7, len(dates))):
                        date_str = str(dates[idx]).strip()
                        weekday_lbl = ""
                        try:
                            dt = datetime.date.fromisoformat(date_str)
                            weekday_lbl = weekday_names[dt.weekday()]
                        except Exception:
                            pass
                        if idx == 0:
                            lbl = f"今天 ({weekday_lbl})" if weekday_lbl else "今天"
                        elif idx == 1:
                            lbl = f"明天 ({weekday_lbl})" if weekday_lbl else "明天"
                        elif idx == 2:
                            lbl = f"后天 ({weekday_lbl})" if weekday_lbl else "后天"
                        else:
                            lbl = f"{weekday_lbl}/第{idx+1}天" if weekday_lbl else f"第{idx+1}天"
                        cond = WMO_WEATHER_CODES.get(codes[idx], "多云") if idx < len(codes) else "多云"
                        rain_pct = rain[idx] if idx < len(rain) and rain[idx] is not None else 0
                        lines.append(
                            f"- {lbl} ({date_str}): 最低 {min_t[idx]}°C ~ 最高 {max_t[idx]}°C, "
                            f"天气状况: {cond}, 降水概率: {rain_pct}%"
                        )
                    has_7day = True
        except Exception:
            has_7day = False

    # 3. 若 7 天预报不可用，回退至 wttr.in 3 天预报
    if not has_7day and wttr_weather:
        weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        for i, w in enumerate(wttr_weather[:3]):
            date_str = str(w.get('date', '')).strip()
            weekday_lbl = ""
            try:
                dt = datetime.date.fromisoformat(date_str)
                weekday_lbl = weekday_names[dt.weekday()]
            except Exception:
                pass
            if i == 0:
                label = f"今天 ({weekday_lbl})" if weekday_lbl else "今天"
            elif i == 1:
                label = f"明天 ({weekday_lbl})" if weekday_lbl else "明天"
            else:
                label = f"后天 ({weekday_lbl})" if weekday_lbl else "后天"
            hourly = w.get("hourly", [])
            noon_desc = hourly[4].get("weatherDesc", [{}])[0].get("value", "多云") if len(hourly) > 4 else "晴间多云"
            rain_chance = max([int(h.get("chanceofrain", "0")) for h in hourly]) if hourly else 0
            lines.append(
                f"- {label} ({date_str}): 最低 {w.get('mintempC')}°C ~ 最高 {w.get('maxtempC')}°C, "
                f"天气状况: {noon_desc}, 降水概率: {rain_chance}%"
            )

    if len(lines) <= 1:
        return f"查询 {found_city} 气象数据暂无响应，请尝试调用 web_search 检索实时天气预报。"
    return "\n".join(lines)


from .web_ssrf import (
    FORBIDDEN_HOSTS,
    MAX_FETCH_RESPONSE_BYTES,
    resolve_and_validate_destination,
    is_safe_web_url,
    SSRFPinnedHTTPConnection,
    SSRFPinnedHTTPSConnection,
    SSRFHTTPHandler,
    SSRFHTTPSHandler,
    SSRFSafeRedirectHandler,
    read_limited_response as _read_limited_response,
)
from .web_classifier import classify_web_page, WebOutcome, PageClassificationResult
from .browser_runtime import get_browser_driver, default_auth_vault, html_to_clean_markdown
from .tool_result import ToolResult


def _parse_html_articles(raw_html: str, target_url: str) -> Optional[str]:
    """针对榜单、信息流、趋势卡片（包含多个标准 <article> 语义标签）提取结构化列表"""
    articles = re.findall(r'<article\b[^>]*>(.*?)</article>', raw_html, re.DOTALL | re.I)
    if len(articles) < 2:
        return None
    extracted_items = []
    for i, a in enumerate(articles[:25], 1):
        clean = re.sub(r'<(?:script|style|svg|noscript)[^>]*>.*?</(?:script|style|svg|noscript)>', '', a, flags=re.DOTALL | re.I)
        clean = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n\1\n', clean, flags=re.I)
        clean = re.sub(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', r'[\2](\1)', clean, flags=re.I)
        clean = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\1\n', clean, flags=re.I)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = html.unescape(clean)
        lines = [line.strip() for line in clean.splitlines() if line.strip()]
        summary = " · ".join([l for l in lines if l not in ["Sponsor", "Star", "Unstar", "Follow", "Built by"]][:5])
        if summary:
            extracted_items.append(f"{i}. {summary}")
    if extracted_items:
        return f"【网页结构化解析 ({target_url})】:\n" + "\n".join(extracted_items[:20])
    return None


def _parse_html_main(raw_html: str, target_url: str, max_chars: int) -> Optional[str]:
    """针对常规正文提取 (<main> 或 <body>) 并清洗格式"""
    main_m = re.search(r'<(?:main|body)\b[^>]*>(.*?)</(?:main|body)>', raw_html, re.DOTALL | re.I)
    content = main_m.group(1) if main_m else raw_html

    clean = re.sub(r'<(?:script|style|svg|noscript|nav|header|footer|aside)[^>]*>.*?</(?:script|style|svg|noscript|nav|header|footer|aside)>', '', content, flags=re.DOTALL | re.I)
    clean = re.sub(r'<!--.*?-->', '', clean, flags=re.DOTALL)
    clean = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n\n### \1\n', clean, flags=re.I)
    clean = re.sub(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', r'[\2](\1)', clean, flags=re.I)
    clean = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', clean, flags=re.I)
    clean = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\n\1\n', clean, flags=re.I)
    clean = re.sub(r'<br\s*/?>', '\n', clean, flags=re.I)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = html.unescape(clean)
    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    result = "\n".join(lines)
    if len(result) <= 50:
        return None

    if len(result) > max_chars:
        hint = (
            f"\n\n[⚠️ 网页长文本截断提醒]: 网页解析总长 {len(result)} 字符，已展示前 {max_chars} 字符。"
            f"\n💡 [通用建议]: 如需获取网页特定段落或深入信息，请结合页面核心关键词重新调用 web_search 精准检索相关主题]"
        )
        return f"【网页内容解析 ({target_url})】:\n" + result[:max_chars] + hint
    return f"【网页内容解析 ({target_url})】:\n" + result


def _fetch_jina_fallback(
    target_url: str,
    max_chars: int,
    timeout: float,
    deadline: Optional[float],
    auth_state: Optional[dict] = None
) -> Tuple[Optional[str], Optional[str]]:
    """备用：调用 Jina Reader 智能转 Markdown (含严格安全隐私隔离与专属Key耗尽自动降级)"""
    if not default_auth_vault.assert_safe_for_external_fallback(target_url, auth_state=auth_state):
        return None, f"【隐私安全隔离】拒绝将带有身份凭据或认证特征的目标网址 ({target_url}) 转发至第三方外部服务"

    jina_url = f"https://r.jina.ai/{target_url}"
    safe_jina, _ = is_safe_web_url(jina_url)
    if not safe_jina:
        return None, f"获取网页内容失败 ({target_url}): Jina Reader 地址受限"

    def _do_jina_http_request(api_key: Optional[str], to: float) -> Tuple[Optional[str], Optional[int], Optional[str]]:
        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            req = urllib.request.Request(jina_url, headers=headers)
            opener = urllib.request.build_opener(SSRFSafeRedirectHandler())
            with opener.open(req, timeout=to) as resp:
                text = _read_limited_response(resp)
            assert_not_timed_out(deadline, "webpage fetch fallback")
            cleaned_md = re.sub(r'(?:\[[^\]\n]{1,30}\]\([^\)]+\)\s*){5,}', '\n', text)
            if cleaned_md and len(cleaned_md.strip()) > 50:
                content = cleaned_md.strip()
                if len(content) > max_chars:
                    hint = (
                        f"\n\n[⚠️ 网页长文本截断提醒]: 网页 Markdown 总长 {len(content)} 字符，已展示前 {max_chars} 字符。"
                        f"\n💡 [通用建议]: 如需查看特定章节，请结合具体关键词检索]"
                    )
                    return content[:max_chars] + hint, None, None
                return content, None, None
            return None, None, "Jina Reader 返回正文过短或为空"
        except urllib.error.HTTPError as http_err:
            if http_err.code == 403 and "SSRF Blocked" in str(http_err):
                return None, 403, f"【安全拦截】重定向目标受限 ({target_url}): {http_err.reason}"
            return None, http_err.code, f"HTTP Error {http_err.code}: {http_err.reason}"
        except TimeoutError as timeout_err:
            return None, 408, f"获取网页内容超时 ({target_url}): {timeout_err}"
        except Exception as e:
            return None, 500, f"获取网页内容失败 ({target_url}): {e}"

    jina_api_key = os.environ.get("JINA_API_KEY", "").strip()
    if jina_api_key:
        content, code, err = _do_jina_http_request(jina_api_key, timeout)
        if content:
            return content, None

        # 当用户专属 Key 遇到 401(无效/过期), 402(配额耗尽), 429(触发频控) 时，无缝自动降级至公共池重试
        if code in (401, 402, 429):
            print(
                f"⚠️ [Jina Fallback] 专属 JINA_API_KEY 返回 HTTP {code} (配额耗尽或凭据受限)，正在自动降级至 Jina 公共限流池重试...",
                flush=True
            )
            anon_budget = check_deadline(deadline, default_timeout=7.0)
            anon_content, _, anon_err = _do_jina_http_request(None, anon_budget)
            if anon_content:
                return anon_content, None
            return None, f"专属 Key 受限 ({err})，公共池重试失败: {anon_err}"

        return None, err
    else:
        content, _, err = _do_jina_http_request(None, timeout)
        return content, err


def _fetch_firecrawl_scrape_fallback(
    target_url: str,
    max_chars: int,
    timeout: float,
    deadline: Optional[float],
    auth_state: Optional[dict] = None
) -> Tuple[Optional[str], Optional[str]]:
    """备用：调用 Firecrawl /v1/scrape 单页抓取转 Markdown (含安全隐私隔离)"""
    if not default_auth_vault.assert_safe_for_external_fallback(target_url, auth_state=auth_state):
        return None, f"【隐私安全隔离】拒绝将带有身份凭据或认证特征的目标网址 ({target_url}) 转发至第三方外部服务"

    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if not firecrawl_key:
        return None, None

    firecrawl_url = "https://api.firecrawl.dev/v1/scrape"
    safe, _ = is_safe_web_url(firecrawl_url)
    if not safe:
        return None, f"获取网页内容失败 ({target_url}): Firecrawl Scrape 地址受限"

    try:
        payload = json.dumps({"url": target_url, "formats": ["markdown"]}).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {firecrawl_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        }
        req = urllib.request.Request(firecrawl_url, data=payload, headers=headers, method="POST")
        opener = urllib.request.build_opener(SSRFSafeRedirectHandler())
        with opener.open(req, timeout=timeout) as resp:
            data = json.loads(_read_limited_response(resp))
        assert_not_timed_out(deadline, "firecrawl scrape fallback")
        if data.get("success") and data.get("data", {}).get("markdown"):
            md = data["data"]["markdown"].strip()
            if len(md) > 50:
                if len(md) > max_chars:
                    hint = f"\n\n[⚠️ 网页长文本截断提醒]: 网页 Markdown 总长 {len(md)} 字符，已展示前 {max_chars} 字符。"
                    return md[:max_chars] + hint, None
                return md, None
        err_msg = data.get("error") or "Firecrawl 未返回有效正文"
        return None, f"Firecrawl 抓取失败 ({target_url}): {err_msg}"
    except TimeoutError as timeout_err:
        assert_not_timed_out(deadline, "firecrawl scrape fallback")
        return None, f"Firecrawl 抓取超时 ({target_url}): {timeout_err}"
    except Exception as e:
        assert_not_timed_out(deadline, "firecrawl scrape fallback")
        return None, f"Firecrawl 抓取失败 ({target_url}): {e}"


def fetch_page_detailed(
    url: str,
    max_chars: int = 35000,
    deadline: Optional[float] = None,
    auth_domain: Optional[str] = None
) -> ToolResult:
    """
    Standard Structured Webpage Reader.
    Coordinates SSRF verification, multi-layer content classification,
    stateless headless browser rendering, and auth credential injection.
    """
    start_time = time.monotonic()
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    env_limit = os.environ.get("DSH_FETCH_PAGE_MAX_CHARS")
    if env_limit and env_limit.isdigit():
        max_chars = int(env_limit)

    provenance = {
        "requested_url": url,
        "target_url": target_url,
        "backend": "urllib",
        "outcome": WebOutcome.EMPTY_RESPONSE.value,
        "truncated": False,
        "auth_injected": False,
    }

    # 1. SSRF 前置安全校验
    safe, reason = is_safe_web_url(target_url)
    if not safe:
        err_msg = f"【安全拦截】无法访问目标网址 ({target_url}): {reason}"
        provenance["outcome"] = "ssrf_blocked"
        return ToolResult.error(
            code="ssrf_blocked",
            message=err_msg,
            text=err_msg,
            provenance=provenance
        )

    # 2. 检查是否有针对目标域名的会话认证凭据
    auth_state = default_auth_vault.load_storage_state(auth_domain or target_url)
    if auth_state:
        provenance["auth_injected"] = True

    # 3. 优先执行 HTTP 请求 + 正文提取
    to1 = check_deadline(deadline, default_timeout=10.0)
    raw_html = ""
    http_status = 200
    try:
        req = urllib.request.Request(
            target_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
            }
        )
        opener = urllib.request.build_opener(
            SSRFSafeRedirectHandler(),
            SSRFHTTPHandler(),
            SSRFHTTPSHandler()
        )
        with opener.open(req, timeout=to1) as resp:
            raw_html = _read_limited_response(resp)
            http_status = getattr(resp, "status", 200)
    except urllib.error.HTTPError as http_err:
        http_status = http_err.code
        if http_err.code == 403 and "SSRF Blocked" in str(http_err):
            err_msg = f"【安全拦截】重定向目标受限 ({target_url}): {http_err.reason}"
            return ToolResult.error(code="ssrf_blocked", message=err_msg, text=err_msg, provenance=provenance)
        try:
            raw_html = http_err.read().decode("utf-8", errors="ignore")
        except Exception:
            raw_html = ""
    except Exception:
        raw_html = ""

    assert_not_timed_out(deadline, "webpage fetch")

    # 4. 解析正文并由分类器做深度语义诊断
    candidate_summary = None
    if raw_html:
        candidate_summary = _parse_html_articles(raw_html, target_url) or _parse_html_main(raw_html, target_url, max_chars)

    classification = classify_web_page(
        raw_html=raw_html,
        target_url=target_url,
        http_status=http_status,
        parsed_markdown=candidate_summary
    )
    provenance["outcome"] = classification.outcome.value

    # 场景 A: 拿到高质量有效正文
    if classification.outcome == WebOutcome.VALID_CONTENT and candidate_summary:
        provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
        return ToolResult.success(
            data={"url": target_url, "content": candidate_summary},
            text=candidate_summary,
            provenance=provenance
        )

    # 场景 B: 明确要求登录鉴权 (Login Required)
    if classification.outcome == WebOutcome.LOGIN_REQUIRED:
        if not auth_state:
            notice = (
                f"【访问受限】目标页面 ({target_url}) 需要用户登录鉴权（检测到登录网关或会话重定向）。\n"
                f"当前沙箱处于匿名访问模式，未挂载该站点的有效会话凭据 (storageState)。\n"
                f"💡 [建议]: 若需访问该私密内容，请在工作区凭据库配置对应站点会话凭据。"
            )
            provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
            return ToolResult.partial(
                data={"url": target_url, "requires_auth": True, "reason": classification.reason},
                text=notice,
                provenance=provenance
            )

    # 场景 C: 记录原生 HTTP 遇到的人机挑战 / 403 拦截 (不提前退出，继续放行给 Tier 2 / Tier 3 穿透救场)
    native_intercept_notice = None
    if classification.outcome in (WebOutcome.BOT_CHALLENGE, WebOutcome.ACCESS_DENIED):
        native_intercept_notice = (
            f"【访问受限】目标站点 ({target_url}) 触发了安全访问拦截 ({classification.reason})。\n"
            f"目标平台可能开启了人机挑战验证码 (Cloudflare / WAF) 或限制了自动化访问。"
        )

    # 场景 D: 私密页面或携带认证凭据 (auth_state) -> 隐私屏障生效，直接走本地浏览器 (Tier 3)
    if auth_state:
        browser_driver = get_browser_driver()
        if browser_driver.is_available():
            remaining_budget = max(2.0, check_deadline(deadline, default_timeout=12.0) - (time.monotonic() - start_time))
            render_res = browser_driver.render_page_stateless(
                target_url,
                timeout_budget=remaining_budget,
                auth_state=auth_state
            )
            if render_res.success and (render_res.content_md or render_res.raw_html):
                clean_auth_md = html_to_clean_markdown(render_res.raw_html, fallback_text=render_res.content_md)
                post_classification = classify_web_page(
                    raw_html=render_res.raw_html,
                    target_url=render_res.url or target_url,
                    parsed_markdown=clean_auth_md
                )
                if post_classification.outcome == WebOutcome.VALID_CONTENT:
                    provenance["backend"] = "headless_browser"
                    provenance["outcome"] = "rendered_valid_content"
                    provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
                    formatted = f"【网页内容解析 (无头浏览器渲染 - {target_url})】:\n" + clean_auth_md[:max_chars]
                    return ToolResult.success(
                        data={"url": target_url, "content": formatted},
                        text=formatted,
                        provenance=provenance
                    )
                elif post_classification.outcome == WebOutcome.LOGIN_REQUIRED:
                    provenance["backend"] = "headless_browser"
                    provenance["outcome"] = "login_required"
                    notice = (
                        f"【访问受限】通过无头浏览器加载目标页面 ({target_url}) 后，页面仍呈现为登录认证界面。\n"
                        f"可能该站点的 Cookie 凭证已过期或失效。"
                    )
                    return ToolResult.partial(
                        data={"url": target_url, "requires_auth": True},
                        text=notice,
                        provenance=provenance
                    )
        notice = f"【访问受限】携带个人凭据加载页面 ({target_url}) 失败。本地浏览器驱动未就绪或渲染异常。"
        return ToolResult.error(code="auth_render_failed", message=notice, text=notice, provenance=provenance)

    # 场景 E: 公开页面遇到 SPA 空壳或内容过少 -> 优先尝试 Tier 2 (Jina Reader 云端轻量渲染，配置专属 Key 享 10.0s 充裕预算，公共限流模式享 7.0s 预算)
    jina_err = None
    if default_auth_vault.assert_safe_for_external_fallback(target_url, auth_state=auth_state):
        has_jina_key = bool(os.environ.get("JINA_API_KEY", "").strip())
        jina_default_budget = 10.0 if has_jina_key else 7.0
        to_jina = check_deadline(deadline, default_timeout=jina_default_budget)
        jina_content, jina_err = _fetch_jina_fallback(target_url, max_chars, to_jina, deadline, auth_state=auth_state)
        if jina_content:
            provenance["backend"] = "jina_fallback"
            provenance["outcome"] = "jina_fallback_success"
            provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
            return ToolResult.success(
                data={"url": target_url, "content": jina_content},
                text=jina_content,
                provenance=provenance
            )
        if jina_err:
            provenance["jina_fallback_error"] = jina_err

    # 场景 E.2: Jina 失败后，尝试 Tier 2.5 (Firecrawl /v1/scrape 单页抓取备选，含隐私保护校验)
    firecrawl_err = None
    if default_auth_vault.assert_safe_for_external_fallback(target_url, auth_state=auth_state) and os.environ.get("FIRECRAWL_API_KEY", "").strip():
        to_fc = check_deadline(deadline, default_timeout=10.0)
        fc_content, firecrawl_err = _fetch_firecrawl_scrape_fallback(target_url, max_chars, to_fc, deadline, auth_state=auth_state)
        if fc_content:
            provenance["backend"] = "firecrawl_scrape_fallback"
            provenance["outcome"] = "firecrawl_scrape_success"
            provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
            return ToolResult.success(
                data={"url": target_url, "content": fc_content},
                text=fc_content,
                provenance=provenance
            )
        if firecrawl_err:
            provenance["firecrawl_scrape_error"] = firecrawl_err

    # 场景 F: Tier 3 终极救场兜底 -> Jina/Firecrawl 失败后或未走云端时，尝试沙箱本地无头浏览器接盘
    browser_driver = get_browser_driver()
    remaining_budget = check_deadline(deadline, default_timeout=10.0) - (time.monotonic() - start_time)
    if browser_driver.is_available() and remaining_budget >= 2.5:
        render_res = browser_driver.render_page_stateless(
            target_url,
            timeout_budget=remaining_budget,
            auth_state=auth_state
        )
        if render_res.success and (render_res.content_md or render_res.raw_html):
            clean_rendered_md = html_to_clean_markdown(render_res.raw_html, fallback_text=render_res.content_md)
            post_classification = classify_web_page(
                raw_html=render_res.raw_html,
                target_url=render_res.url or target_url,
                parsed_markdown=clean_rendered_md
            )
            if post_classification.outcome == WebOutcome.VALID_CONTENT:
                provenance["backend"] = "headless_browser_fallback"
                provenance["outcome"] = "rendered_valid_content"
                provenance["latency_ms"] = round((time.monotonic() - start_time) * 1000, 2)
                formatted = f"【网页内容解析 (本地无头浏览器兜底 - {target_url})】:\n" + clean_rendered_md[:max_chars]
                return ToolResult.success(
                    data={"url": target_url, "content": formatted},
                    text=formatted,
                    provenance=provenance
                )
            elif post_classification.outcome == WebOutcome.LOGIN_REQUIRED:
                provenance["backend"] = "headless_browser_fallback"
                provenance["outcome"] = "login_required"
                notice = (
                    f"【访问受限】通过本地无头浏览器加载目标页面 ({target_url}) 后，页面呈现为登录认证界面。\n"
                    f"未检测到登录后的有效正文内容。"
                )
                return ToolResult.partial(
                    data={"url": target_url, "requires_auth": True},
                    text=notice,
                    provenance=provenance
                )

    assert_not_timed_out(deadline, "webpage fetch")
    fail_text = firecrawl_err or jina_err or native_intercept_notice or f"未能获取网页有效内容 ({target_url})"
    return ToolResult.error(
        code="fetch_failed",
        message=fail_text,
        text=fail_text,
        provenance=provenance
    )


def fetch_page(url: str, max_chars: int = 35000, deadline: Optional[float] = None) -> str:
    """Universal webpage reader: extracts clean structured text, articles and links from any live URL"""
    detailed = fetch_page_detailed(url=url, max_chars=max_chars, deadline=deadline)
    return detailed.render_text()


def extract_query_freshness(q: str) -> Optional[str]:
    """Infers search freshness parameter (day/week/month/year) from temporal expressions in query."""
    if not q:
        return None
    if re.search(r'(最近\s*30\s*天|近\s*30\s*天|最近一个月|近一个月|近\s*1\s*个月|past\s*month|last\s*30\s*days)', q, re.I):
        return "month"
    if re.search(r'(最近\s*7\s*天|近\s*7\s*天|最近一周|近一周|past\s*week|last\s*7\s*days)', q, re.I):
        return "week"
    if re.search(r'(今天|今日|过去\s*24\s*小时|近\s*24\s*小时|today|past\s*24\s*hours)', q, re.I):
        return "day"
    if re.search(r'(最近一年|近一年|今年|past\s*year)', q, re.I):
        return "year"
    if re.search(r'(最新|近期|最近|latest|recent)', q, re.I):
        return "week"
    return None


def normalize_search_query(q: str) -> str:
    """Removes conversational stop words, pronouns, and request verbs to optimize search relevance without hardcoding"""
    cleaned = re.sub(
        r'^(帮我|请|给我|带我|麻烦|协助)?\s*(查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research|investigate)\s*',
        '',
        q,
        flags=re.I
    ).strip()

    cleaned = re.sub(
        r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|有关|针对其|针对这个|针对|对于|对于这个)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    cleaned = re.sub(
        r'^(他|她|它|其|这个|该|对方)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    cleaned = re.sub(r'^[的得地]\s*', '', cleaned).strip()

    # 剥离个人空间/知识库前缀与介词，避免污染通用搜索引擎
    cleaned = re.sub(
        r'^(?:在|从)?(?:个人空间|知识库|知识空间|我的个人文档|工作区|我的文档)(?:中|里|内|上的?)?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    cleaned = re.sub(
        r'\s*(?:在|从)?(?:个人空间|知识库|知识空间|我的个人文档|工作区|我的文档)(?:中|里|内|上的?)$',
        '',
        cleaned,
        flags=re.I
    ).strip()

    # 搜索只保留信息主题，剥离“总结、输出文件”等下游交付指令。
    # 这些动作由执行计划处理，不应污染搜索引擎关键词。
    # 标准工程解耦：匹配分句标点/连词 + 助动词/量词 + 交付动词短语
    action_clause_pattern = (
        r'(?:[，,；;。、\s]+(?:然后|并且|并|以及|同时|再|随之|顺便)?|(?:然后|并且|并|以及|同时|再|随之|顺便))\s*'
        r'(?:请|帮我|协助|顺手)?\s*'
        r'(?:进行|做个|做一下|给出|提供|写个|整理出|出)?\s*'
        r'(?:一份|一个|一些)?\s*'
        r'(?:简要|简短|结构化|详细|深度)?\s*'
        r'(?:总结|汇总|归纳|整理|提炼|概括|对比|分析|输出|生成|创建|导出|保存|写入|制作|做成|盘点|梳理)'
        r'(?:一下|出|成|为)?.*$'
    )
    cleaned = re.sub(action_clause_pattern, '', cleaned, flags=re.I).strip()

    substance = re.sub(r'(今天|今日|现在|最新|最近|近年|历年|历届|的|热点|热搜|热门|动态|新闻|\s+)', '', cleaned)
    if len(substance) >= 2:
        cleaned = re.sub(
            r'^(近\s*\d+\s*年[的]?|近年[的]?|近几年[的]?|历年[的]?|往年[的]?|历届[的]?|最近\s*\d+\s*天[的]?|近\s*\d+\s*天[的]?|最近一个月[的]?|近一个月[的]?|最近[的]?|最新[的]?|当前[的]?|今天[的]?|今日[的]?|现在[的]?)\s*',
            '',
            cleaned,
            flags=re.I
        ).strip()
        cleaned = re.sub(
            r'\s*[是为]?(什么时候|何时|哪天|几天|多久|哪一年|具体时间|时间安排|举办时间|安排|排期|日期)[呢吗呀啊\?？]*$',
            '',
            cleaned,
            flags=re.I
        ).strip()
        cleaned = re.sub(
            r'\s*[是为]?(什么|哪些|哪几样|怎么回事|是什么概念|是什么意思)[呢吗呀啊\?？]*$',
            '',
            cleaned,
            flags=re.I
        ).strip()
        cleaned = re.sub(
            r'\s*(近\s*\d+\s*年[的]?|近年[的]?|近几年[的]?|历年[的]?|往年[的]?|历届[的]?|最近\s*\d+\s*天[的]?|近\s*\d+\s*天[的]?|最近一个月[的]?|近一个月[的]?|最近[的]?|最新[的]?|当前[的]?|今天[的]?|今日[的]?|现在[的]?)$',
            '',
            cleaned,
            flags=re.I
        ).strip()

    return cleaned or q


def decompose_search_queries(query: str, max_queries: int = 3) -> list[str]:
    """Builds a small, general-purpose query portfolio from entity, freshness, and task facets."""
    clean = normalize_search_query(query).strip()
    subject = re.sub(
        r'(最新的?|近期的?|最近的?|当前的?|实时的?|新闻|动态|资讯|情况|信息|有哪些|是什么|'
        r'latest|recent|news|updates?|information)',
        ' ',
        clean,
        flags=re.I,
    )
    subject = re.sub(r'[，,。；;：:？?]+', ' ', subject)
    subject = re.sub(r'\s+', ' ', subject).strip(' 的') or clean

    queries = [clean]
    is_tech = bool(re.search(
        r'(插件|扩展|plugin|extension|生态|marketplace|registry|'
        r'安装方法|安装教程|如何安装|怎么安装|安装指南|install(?:ation)?|setup|quickstart|'
        r'版本|发布|更新|release|changelog|升级|源码|开源|github|repo|库|sdk|api|框架)',
        clean,
        re.I,
    ))
    is_trending = bool(re.search(r'(热点|热搜|榜单|排行|趋势|trending|ranking|热门)', clean, re.I))

    if re.search(r'(插件|扩展|plugin|extension|生态|marketplace|registry)', clean, re.I):
        queries.append(f'{subject} plugins extensions registry GitHub')
    elif re.search(r'(安装方法|安装教程|如何安装|怎么安装|安装指南|install(?:ation)?|setup|quickstart)', clean, re.I):
        queries.append(f'{subject} official installation setup quickstart GitHub')
    elif re.search(r'(版本|发布|更新|release|changelog|升级)', clean, re.I):
        queries.append(f'{subject} releases changelog GitHub')
    elif is_trending:
        queries.append(f'{subject} 实时热点 热门榜单')
    else:
        queries.append(f'{subject} latest updates')

    if is_tech:
        queries.append(f'{subject} official documentation GitHub releases')
    elif is_trending:
        queries.append(f'{subject} 热门动态 讨论')
    else:
        queries.append(f'{subject} latest news')

    unique = []
    seen = set()
    for item in queries:
        normalized = re.sub(r'\s+', ' ', item).strip()
        key = normalized.casefold()
        if normalized and key not in seen:
            seen.add(key)
            unique.append(normalized)
        if len(unique) >= max(1, max_queries):
            break
    return unique


def perform_multi_web_search(
    query: str,
    max_queries: int = 3,
    max_results_per_query: int = 5,
    max_chars: int = 12_000,
    deadline: Optional[float] = None,
) -> str:
    """Runs bounded diversified searches and returns a deduplicated evidence bundle."""
    clean_q = normalize_search_query(query)

    # 1. 垂直社交与实时榜单优先于通用搜索和气象源
    if re.search(
        r'(?:微博|weibo).*?(?:热搜|热点|热榜|榜单|排行|热门)'
        r'|(?:热搜|热点|热榜|榜单|排行|热门).*?(?:微博|weibo)'
        r'|^(?:微博热点|微博热搜|热搜榜|今日热搜|热搜|全网热点)$',
        query,
        re.I,
    ) or re.search(
        r'(?:b站|bilibili|哔哩哔哩).*?(?:热搜|热点|热榜|榜单|排行|热门|热度)'
        r'|(?:热搜|热点|热榜|榜单|排行|热门|热度).*?(?:b站|bilibili|哔哩哔哩)',
        query,
        re.I,
    ):
        vertical_result = perform_web_search(
            query,
            max_results=max_results_per_query,
            freshness=extract_query_freshness(query),
            deadline=deadline,
            use_platform=False,
        )
        if vertical_result:
            return vertical_result[:max_chars]

    # 2. 针对纯气象意图调用高精度结构化气象源（排除社交热搜/榜单等非气象查询）
    if (
        re.search(r'(天气|预报|气温|下雨|晴天|降雨|温度|weather|forecast)', clean_q, re.I)
        and not re.search(r'(?:微博|weibo|热搜|热点|热榜|榜单|排行|热门|b站|bilibili)', clean_q, re.I)
    ):
        weather_res = fetch_weather(clean_q, deadline=deadline)
        if "实时权威气象与多日预报" in weather_res:
            return weather_res[:max_chars]

    query_plan = decompose_search_queries(query, max_queries=max_queries)
    freshness = extract_query_freshness(query)
    is_tech = bool(re.search(r'(插件|生态|库|sdk|开源|源码|报错|版本|release|github|install|api|框架)', query, re.I))
    source_policy = 'official-first' if is_tech else 'balanced'
    platform_result = perform_platform_web_search(
        query_plan[0],
        extra_queries=query_plan[1:],
        max_results=min(10, max_results_per_query * 2),
        freshness=freshness,
        source_policy=source_policy,
        deadline=deadline,
    )
    if platform_result:
        return platform_result[:max_chars]

    # Keep no-key organic search as a resilient fallback when the managed gateway is unavailable.
    sections = []
    seen_urls = set()
    indexed_results = {}
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=min(3, len(query_plan)))
    futures = {
        executor.submit(
            perform_web_search,
            planned_query,
            max_results_per_query,
            freshness,
            deadline,
            False,
        ): (idx, planned_query)
        for idx, planned_query in enumerate(query_plan, 1)
    }
    try:
        remaining = check_deadline(deadline, default_timeout=30.0)
        for future in concurrent.futures.as_completed(futures, timeout=remaining):
            idx, planned_query = futures[future]
            try:
                indexed_results[idx] = (planned_query, future.result())
            except Exception:
                indexed_results[idx] = (planned_query, "")
    except concurrent.futures.TimeoutError:
        pass
    finally:
        for future in futures:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)

    for idx, planned_query in enumerate(query_plan, 1):
        result = indexed_results.get(idx, (planned_query, ""))[1]
        if not result.strip():
            sections.append(f'【检索 {idx}/{len(query_plan)}：{planned_query}】\n- 暂未检索到有效结果。')
            continue

        kept_lines = []
        for line in result.splitlines():
            urls = re.findall(r'https?://[^\s)\]>"]+', line)
            if urls and all(url in seen_urls for url in urls):
                continue
            seen_urls.update(urls)
            kept_lines.append(line)
        if kept_lines:
            sections.append(
                f'【检索 {idx}/{len(query_plan)}：{planned_query}】\n' + '\n'.join(kept_lines)
            )
        if sum(len(section) for section in sections) >= max_chars:
            break

    coverage = '；'.join(query_plan)
    bundle = (
        f'【多查询联网检索覆盖】{coverage}\n'
        '说明：单次空结果不代表目标不存在；回答应综合多路证据，并优先采用官方文档、官方仓库和发布记录。\n\n'
        + '\n\n'.join(sections)
    )
    return bundle[:max_chars]


def is_enrichable_content_url(url: str) -> bool:
    """
    Standard URL evaluation: Determines whether a URL is an article/content page
    suitable for deep-fetch enrichment, or an internal search/aggregator/auth endpoint.
    Follows RFC/Web standards rather than site-specific hardcoding.
    """
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False

    path = parsed.path.lower()
    query = parsed.query.lower()

    # 1. 过滤内部检索/聚合/筛选端点 (Search queries & Aggregation feeds)
    search_query_keys = {"q", "query", "keyword", "kw", "wd", "search", "search_query"}
    params = urllib.parse.parse_qs(query)
    if any(k in params for k in search_query_keys):
        return False

    search_path_patterns = [
        r"^/(?:search|find|explore|browse|query|tag|tags|category|categories)(?:/.*)?$",
        r"/(?:search|hotsearch|trending|all|hub)(?:/.*)?$"
    ]
    if any(re.search(p, path) for p in search_path_patterns):
        return False

    # 2. 过滤 API/RPC/AJAX 纯数据接口
    if re.search(r"/(?:api|ajax|rpc|graphql)/", path):
        return False

    # 3. 过滤认证、登录、跳转与社交分享端点
    auth_patterns = [
        r"/(?:login|signin|auth|oauth|sso|signup|register|checkpoint|captcha)",
        r"/(?:share|intent|redirect|jump|outlink)"
    ]
    if any(re.search(p, path) for p in auth_patterns):
        return False

    # 4. 过滤二进制非文本静态资源
    binary_exts = (
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
        ".css", ".js", ".zip", ".tar", ".gz", ".exe", ".bin",
        ".mp4", ".mp3", ".woff", ".woff2", ".ttf"
    )
    if any(path.endswith(ext) for ext in binary_exts):
        return False

    return True


def enrich_search_context_with_pages(
    search_context: str,
    max_pages: int = 3,
    max_chars_per_page: int = 3_500,
    deadline: Optional[float] = None,
) -> str:
    """Fetch a small, ranked set of result pages for grounded synthesis."""
    urls = []
    seen = set()
    for url in re.findall(r'https?://[^\s)\]>"`]+', search_context or ''):
        clean_url = url.rstrip('.,;')
        key = clean_url.rstrip('/').casefold()
        if key not in seen:
            seen.add(key)
            if is_enrichable_content_url(clean_url):
                urls.append(clean_url)

    is_harness = bool(re.search(r'(?:harness|deepseek|dsh)', (search_context or '').casefold()))

    def page_priority(url: str):
        normalized = url.rstrip('/').casefold()
        if is_harness:
            if normalized == 'https://github.com/deepseek-ai/deepseek-harness':
                return (0, normalized)
            if normalized.startswith('https://github.com/deepseek-ai/deepseek-harness/releases'):
                return (1, normalized)
            if 'awesome-' in normalized or 'plugin-registry' in normalized:
                return (2, normalized)
            if '/discussions/' in normalized or 'github.com/topics/' in normalized:
                return (5, normalized)
            return (3, normalized)
        # General query: prioritize official documentation, releases, and guides
        if any(doc in normalized for doc in ('/docs', 'docs.', 'developer.', '/wiki', '/releases')):
            return (0, normalized)
        if '/discussions/' in normalized or 'github.com/topics/' in normalized or '/issues/' in normalized:
            return (5, normalized)
        if 'github.com' in normalized:
            return (1, normalized)
        return (2, normalized)

    selected = sorted(urls, key=page_priority)[:max(1, min(3, max_pages))]
    if not selected:
        return search_context

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=len(selected))
    futures = {
        executor.submit(fetch_page, url, max_chars_per_page, deadline): url
        for url in selected
    }
    fetched = {}
    try:
        remaining = check_deadline(deadline, default_timeout=5.0)
        for future in concurrent.futures.as_completed(futures, timeout=remaining):
            url = futures[future]
            try:
                content = future.result()
                if content and not content.startswith(('未能获取', '【安全拦截】', '获取网页内容失败')):
                    fetched[url] = content[:max_chars_per_page]
            except Exception:
                continue
    except concurrent.futures.TimeoutError:
        pass
    finally:
        for future in futures:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)

    if not fetched:
        return search_context
    sections = [search_context.rstrip(), '', '【高价值页面正文抓取】']
    for index, url in enumerate(selected, 1):
        content = fetched.get(url)
        if content:
            sections.extend([f'\n--- 页面 {index}: {url} ---', content])
    return '\n'.join(sections).strip()


def perform_platform_web_search(
    query: str,
    extra_queries: Optional[list[str]] = None,
    max_results: int = 8,
    freshness: Optional[str] = None,
    source_policy: str = 'balanced',
    deadline: Optional[float] = None,
) -> str:
    """Calls the credential-isolated platform search gateway and preserves result metadata."""
    days_map = {'day': 1, 'week': 7, 'month': 30}
    payload = {
        'query': query,
        'queries': (extra_queries or [])[:3],
        'maxResults': max(1, min(10, max_results)),
        'topic': 'news' if re.search(r'(新闻|资讯|news|热点|热搜)', query, re.I) else 'general',
        'searchDepth': 'advanced' if extra_queries else 'basic',
        'sourcePolicy': source_policy if source_policy in ('balanced', 'official-first') else 'balanced',
    }
    if freshness in days_map:
        payload['days'] = days_map[freshness]
    custom_keys = {}
    if os.environ.get("TAVILY_API_KEY", "").strip():
        custom_keys["TAVILY_API_KEY"] = os.environ["TAVILY_API_KEY"].strip()
    if os.environ.get("FIRECRAWL_API_KEY", "").strip():
        custom_keys["FIRECRAWL_API_KEY"] = os.environ["FIRECRAWL_API_KEY"].strip()
    if custom_keys:
        payload['customApiKeys'] = custom_keys
    endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/search/web"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {VIRTUAL_API_KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        timeout = check_deadline(deadline, default_timeout=25.0)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            envelope = json.loads(response.read().decode('utf-8'))
        if not envelope.get('success'):
            return ''
        output = envelope.get('output') or {}
        results = output.get('results') or []
        if not results:
            return ''
        providers = output.get('providers') or [output.get('provider')]
        lines = [
            f"【平台联网检索｜来源: {', '.join(str(item) for item in providers if item)}】",
            f"查询覆盖：{'；'.join([query] + list(extra_queries or []))}",
        ]
        for idx, item in enumerate(results, 1):
            title = str(item.get('title') or item.get('url') or '').strip()
            url = str(item.get('url') or '').strip()
            snippet = str(item.get('snippet') or '').strip()
            published = str(item.get('publishedAt') or '').strip()
            date_tag = f"  [发布时间: {published}]" if published else ''
            if title and url:
                lines.append(f"{idx}. [{title}]({url}){date_tag}\n    {snippet}")
        warnings = output.get('warnings') or []
        if warnings:
            lines.append('检索提示：' + '；'.join(str(item) for item in warnings))
        return '\n\n'.join(lines)
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return ''


def perform_web_search(
    query: str,
    max_results: int = 8,
    freshness: Optional[str] = None,
    deadline: Optional[float] = None,
    use_platform: bool = True,
) -> str:
    """Multi-source organic web search and weather query with optional freshness filtering (day/week/month/year)"""
    effective_freshness = freshness or extract_query_freshness(query)
    clean_q = normalize_search_query(query)

    # 1. 针对天气意图优先调用高精度结构化气象源
    if re.search(r'(天气|预报|气温|下雨|晴天|降雨|温度|weather|forecast)', clean_q, re.I):
        weather_res = fetch_weather(clean_q, deadline=deadline)
        if "实时权威气象与多日预报" in weather_res:
            return weather_res

    # 2. 针对微博热搜/热点的实时高频接口
    if re.search(r'(微博|weibo).*?(热搜|热点|榜|热门)', clean_q, re.I):
        to_weibo = check_deadline(deadline, default_timeout=10.0)
        try:
            url = "https://weibo.com/ajax/side/hotSearch"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://weibo.com"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=to_weibo) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            assert_not_timed_out(deadline, "weibo search")
            realtime = data.get("data", {}).get("realtime", [])
            results = ["【微博实时热搜榜最新排行】:"]
            for i, item in enumerate(realtime[:15]):
                word = item.get("word", "")
                num = item.get("num", 0)
                tag = item.get("label_name", "") or item.get("icon_desc", "")
                tag_str = f"[{tag}] " if tag else ""
                word_encoded = urllib.parse.quote(word)
                weibo_url = f"https://s.weibo.com/weibo?q={word_encoded}"
                results.append(f"{i+1}. {tag_str}[{word}]({weibo_url}) (热度值: {num})")
            if len(results) > 1:
                return "\n".join(results)
        except TimeoutError:
            raise
        except Exception:
            assert_not_timed_out(deadline, "weibo search")
            pass

    # 2.1 针对 B站 (bilibili) 实时热门/热搜榜的垂直高频接口
    if re.search(
        r'(?:b站|bilibili|哔哩哔哩).*?(?:热搜|热点|热榜|榜单|排行|热门|热度)'
        r'|(?:热搜|热点|热榜|榜单|排行|热门|热度).*?(?:b站|bilibili|哔哩哔哩)',
        clean_q,
        re.I,
    ):
        to_bili = check_deadline(deadline, default_timeout=10.0)
        try:
            bili_headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://www.bilibili.com",
            }
            results = ["【B站 (Bilibili) 实时热点与热门视频排行】:"]
            hot_url = "https://api.bilibili.com/x/web-interface/search/square?limit=10"
            req_hot = urllib.request.Request(hot_url, headers=bili_headers)
            with urllib.request.urlopen(req_hot, timeout=min(to_bili, 5.0)) as resp:
                square_data = json.loads(resp.read().decode("utf-8"))
            trending_list = square_data.get("data", {}).get("trending", {}).get("list", [])
            if trending_list:
                results.append("\n### 实时热搜榜:")
                for i, it in enumerate(trending_list[:8], 1):
                    kw = str(it.get("keyword") or it.get("show_name") or "").strip()
                    if kw:
                        link = f"https://search.bilibili.com/all?keyword={urllib.parse.quote(kw)}"
                        results.append(f"{i}. [{kw}]({link})")

            pop_url = "https://api.bilibili.com/x/web-interface/popular?ps=8"
            req_pop = urllib.request.Request(pop_url, headers=bili_headers)
            with urllib.request.urlopen(req_pop, timeout=min(to_bili, 5.0)) as resp:
                pop_data = json.loads(resp.read().decode("utf-8"))
            video_list = pop_data.get("data", {}).get("list", [])
            if video_list:
                results.append("\n### 热门视频精选:")
                for i, v in enumerate(video_list[:8], 1):
                    title = str(v.get("title") or "").strip()
                    bvid = str(v.get("bvid") or "").strip()
                    owner = str(v.get("owner", {}).get("name") or "").strip()
                    stat = v.get("stat") or {}
                    view = stat.get("view", 0)
                    view_str = f"{view // 10000}万" if isinstance(view, int) and view >= 10000 else str(view)
                    v_url = f"https://www.bilibili.com/video/{bvid}" if bvid else ""
                    if title and v_url:
                        author_str = f" (UP主: {owner}, 播放量: {view_str})" if owner else ""
                        results.append(f"{i}. [{title}]({v_url}){author_str}")

            if len(results) > 1:
                return "\n".join(results)
        except TimeoutError:
            raise
        except Exception:
            assert_not_timed_out(deadline, "bilibili search")
            pass

    # 3. 优先使用平台统一搜索网关；真实供应商凭据不会进入个人沙箱。
    if use_platform:
        platform_result = perform_platform_web_search(
            clean_q,
            max_results=max_results,
            freshness=effective_freshness,
            source_policy='balanced',
            deadline=deadline,
        )
        if platform_result:
            return platform_result

    # 4. 平台不可用或无有效结果时，保留管理员预置的免 Key modsearch/Bing 兜底。
    modsearch_plugin = Path(PLUGIN_DIR) / "modsearch.py"
    if modsearch_plugin.exists():
        to_mod = check_deadline(deadline, default_timeout=25.0)
        try:
            proc = subprocess.run(
                [sys.executable, str(modsearch_plugin), clean_q],
                text=True,
                capture_output=True,
                timeout=to_mod
            )
            assert_not_timed_out(deadline, "modsearch")
            out = proc.stdout.strip()
            if out and not out.startswith("Error:"):
                return out
        except subprocess.TimeoutExpired:
            assert_not_timed_out(deadline, "modsearch")
        except TimeoutError:
            raise
        except Exception:
            assert_not_timed_out(deadline, "modsearch")
            pass

    # 5. 通用必应搜索（含口语停用词归一化与结构化标题/链接提取）
    norm_q = normalize_search_query(clean_q)
    to_bing = check_deadline(deadline, default_timeout=10.0)
    results = []
    discard_re = re.compile(r'windows.*?(帮助|支持|客户端)|无法正常浏览.*?浏览器版本过低|人机身份验证|enable cookies|captcha|microsoft support', re.I)
    fresh_map = {"day": 'filters=ex1:"ez1"', "week": 'filters=ex1:"ez2"', "month": 'filters=ex1:"ez3"', "year": 'filters=ex1:"ez4"'}
    filter_param = f"&{fresh_map[effective_freshness.lower()]}" if (effective_freshness and effective_freshness.lower() in fresh_map) else ""
    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(norm_q)}{filter_param}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=to_bing) as response:
            html_raw = response.read().decode("utf-8", errors="ignore")
        assert_not_timed_out(deadline, "bing search")
        blocks = re.findall(r'<li class="b_algo"[^>]*>(.*?)</li>', html_raw, re.DOTALL)
        for b in blocks:
            m_h2 = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>(.*?)</a></h2>', b, re.DOTALL)
            m_p = re.search(r'<p[^>]*>(.*?)</p>', b, re.DOTALL)
            if not m_h2:
                continue
            link = m_h2.group(1).strip()
            title = html.unescape(re.sub(r'<[^>]+>', '', m_h2.group(2)).strip())
            snippet = html.unescape(re.sub(r'<[^>]+>', '', m_p.group(1)).strip()) if m_p else ""
            if discard_re.search(title) or discard_re.search(snippet):
                continue
            m_dt = re.search(r'<span class="[^"]*news_dt[^"]*">(.*?)</span>', b)
            dt_label = html.unescape(m_dt.group(1)).strip() if m_dt else ""
            if not dt_label:
                m_txt_dt = re.search(r'^(\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}|\d+\s*(?:小时|天|周|个月)前)', snippet)
                if m_txt_dt:
                    dt_label = m_txt_dt.group(1).strip()
            date_tag = f"  [发布时间: {dt_label}]" if dt_label else ""
            if title:
                results.append(f"[{title}]({link}){date_tag}\n    {snippet}")
            if len(results) >= max_results:
                break
        if results:
            tag = f", 时效: {freshness}" if freshness else ""
            return f"【联网检索实时结果 ({norm_q}{tag})】:\n" + "\n\n".join(results)
    except TimeoutError:
        raise
    except Exception:
        assert_not_timed_out(deadline, "bing search")
        pass

    assert_not_timed_out(deadline, "web search")
    return ""
