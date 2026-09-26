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
import urllib.request
import urllib.parse
import urllib.error
import http.client
import subprocess
import socket
import ipaddress
from pathlib import Path
from typing import Optional, Tuple

from .config import PLUGIN_DIR

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
                    day_labels = ["今天", "明天", "后天", "周四/第4天", "周五/第5天", "周六/第6天", "周日/第7天"]
                    for idx in range(min(7, len(dates))):
                        lbl = day_labels[idx] if idx < len(day_labels) else f"第{idx+1}天"
                        cond = WMO_WEATHER_CODES.get(codes[idx], "多云") if idx < len(codes) else "多云"
                        rain_pct = rain[idx] if idx < len(rain) and rain[idx] is not None else 0
                        lines.append(
                            f"- {lbl} ({dates[idx]}): 最低 {min_t[idx]}°C ~ 最高 {max_t[idx]}°C, "
                            f"天气状况: {cond}, 降水概率: {rain_pct}%"
                        )
                    has_7day = True
        except Exception:
            has_7day = False

    # 3. 若 7 天预报不可用，回退至 wttr.in 3 天预报
    if not has_7day and wttr_weather:
        for i, w in enumerate(wttr_weather[:3]):
            label = "今天" if i == 0 else ("明天" if i == 1 else "后天")
            hourly = w.get("hourly", [])
            noon_desc = hourly[4].get("weatherDesc", [{}])[0].get("value", "多云") if len(hourly) > 4 else "晴间多云"
            rain_chance = max([int(h.get("chanceofrain", "0")) for h in hourly]) if hourly else 0
            lines.append(
                f"- {label} ({w.get('date')}): 最低 {w.get('mintempC')}°C ~ 最高 {w.get('maxtempC')}°C, "
                f"天气状况: {noon_desc}, 降水概率: {rain_chance}%"
            )

    if len(lines) <= 1:
        return f"查询 {found_city} 气象数据暂无响应，请尝试调用 web_search 检索实时天气预报。"
    return "\n".join(lines)


FORBIDDEN_HOSTS = {
    'localhost',
    'metadata.google.internal',
    'instance-data',
    '169.254.169.254',
    'ops-postgres',
    'ops-redis',
    'ops-platform',
    'ops-session-broker',
    'ops-control-plane',
    'ops-ai-orchestrator',
    'session-broker',
    'control-plane',
    'platform',
    'ai-orchestrator',
}

MAX_FETCH_RESPONSE_BYTES = 5 * 1024 * 1024  # 5MB 响应读取硬上限


def resolve_and_validate_destination(host: str, port: int) -> Tuple[bool, str]:
    """
    Resolves host and verifies that resolved IP does not fall into forbidden/private/loopback ranges.
    Returns (True, safe_ip_str) or (False, error_reason).
    """
    clean_host = (host or '').strip().lower()
    if not clean_host:
        return False, "缺少主机名"

    if clean_host in FORBIDDEN_HOSTS or clean_host.endswith('.internal') or clean_host.endswith('.local'):
        return False, f"禁止访问内部网络或云元数据服务: {clean_host}"

    try:
        addr_info = socket.getaddrinfo(clean_host, port, proto=socket.IPPROTO_TCP)
    except Exception as dns_err:
        return False, f"无法解析目标主机: {dns_err}"

    if not addr_info:
        return False, f"无法解析目标域名: {clean_host}"

    for item in addr_info:
        ip_str = item[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False, f"禁止访问私有内网或元数据地址 ({ip_str})"
        except ValueError:
            return False, f"无效的 IP 地址: {ip_str}"

    return True, addr_info[0][4][0]


def is_safe_web_url(url: str) -> Tuple[bool, str]:
    """SSRF 校验：检查 URL 协议及目标 IP 是否属于私网、回环、保留地址或云元数据地址"""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False, f"不支持的 URL 协议: {parsed.scheme}，仅允许 http 与 https"

        hostname = (parsed.hostname or '').strip().lower()
        if not hostname:
            return False, "无效的 URL: 缺少主机名"

        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        safe, ip_or_err = resolve_and_validate_destination(hostname, port)
        if not safe:
            return False, ip_or_err
        return True, ""
    except Exception as e:
        return False, f"URL 解析或安全检查失败: {e}"


class SSRFPinnedHTTPConnection(http.client.HTTPConnection):
    """Pins socket connection directly to pre-validated IP to eliminate DNS rebinding attacks"""
    def connect(self):
        sys.audit("http.client.connect", self, self.host, self.port)
        safe, ip_or_err = resolve_and_validate_destination(self.host, self.port)
        if not safe:
            raise OSError(f"SSRF Blocked: {ip_or_err}")
        self.sock = self._create_connection(
            (ip_or_err, self.port), self.timeout, self.source_address
        )
        try:
            self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        if self._tunnel_host:
            self._tunnel()


class SSRFPinnedHTTPSConnection(http.client.HTTPSConnection):
    """Pins socket connection directly to pre-validated IP and performs SNI/cert verification with host"""
    def connect(self):
        safe, ip_or_err = resolve_and_validate_destination(self.host, self.port)
        if not safe:
            raise OSError(f"SSRF Blocked: {ip_or_err}")
        self.sock = self._create_connection(
            (ip_or_err, self.port), self.timeout, self.source_address
        )
        try:
            self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        server_hostname = self._tunnel_host if self._tunnel_host else self.host
        self.sock = self._context.wrap_socket(self.sock, server_hostname=server_hostname)


class SSRFHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(SSRFPinnedHTTPConnection, req)


class SSRFHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(
            SSRFPinnedHTTPSConnection,
            req,
            context=self._context,
            check_hostname=self._check_hostname
        )


class SSRFSafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """防止重定向跳转至内部网络或元数据服务的安全重定向处理器"""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe, err = is_safe_web_url(newurl)
        if not safe:
            raise urllib.error.HTTPError(newurl, 403, f"SSRF Blocked: {err}", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _read_limited_response(resp, max_bytes: int = MAX_FETCH_RESPONSE_BYTES) -> str:
    """分块读取 HTTP 响应并在达到字节上限时截断，防止大文件耗尽内存"""
    chunks = []
    total = 0
    while True:
        chunk = resp.read(64 * 1024)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total >= max_bytes:
            break
    return b"".join(chunks).decode("utf-8", errors="ignore")


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


def _fetch_jina_fallback(target_url: str, max_chars: int, timeout: float, deadline: Optional[float]) -> Tuple[Optional[str], Optional[str]]:
    """备用：调用 Jina Reader 智能转 Markdown"""
    jina_url = f"https://r.jina.ai/{target_url}"
    safe_jina, _ = is_safe_web_url(jina_url)
    if not safe_jina:
        return None, f"获取网页内容失败 ({target_url}): Jina Reader 地址受限"
    try:
        req = urllib.request.Request(jina_url, headers={"User-Agent": "Mozilla/5.0"})
        opener = urllib.request.build_opener(SSRFSafeRedirectHandler())
        with opener.open(req, timeout=timeout) as resp:
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
                return content[:max_chars] + hint, None
            return content, None
    except TimeoutError as timeout_err:
        assert_not_timed_out(deadline, "webpage fetch fallback")
        return None, f"获取网页内容超时 ({target_url}): {timeout_err}"
    except urllib.error.HTTPError as http_err:
        if http_err.code == 403 and "SSRF Blocked" in str(http_err):
            return None, f"【安全拦截】重定向目标受限 ({target_url}): {http_err.reason}"
        assert_not_timed_out(deadline, "webpage fetch fallback")
        return None, f"获取网页内容失败 ({target_url}): {http_err}"
    except Exception as e:
        assert_not_timed_out(deadline, "webpage fetch fallback")
        return None, f"获取网页内容失败 ({target_url}): {e}"
    return None, None


def fetch_page(url: str, max_chars: int = 20000, deadline: Optional[float] = None) -> str:
    """Universal webpage reader: extracts clean structured text, articles and links from any live URL"""
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    # SSRF 前置安全拦截
    safe, reason = is_safe_web_url(target_url)
    if not safe:
        return f"【安全拦截】无法访问目标网址 ({target_url}): {reason}"

    # 支持环境变量动态放宽
    env_limit = os.environ.get("DSH_FETCH_PAGE_MAX_CHARS")
    if env_limit and env_limit.isdigit():
        max_chars = int(env_limit)

    # 1. 优先采用直接 HTTP 请求与语义化结构提取（快速、可靠、无第三方限流）
    to1 = check_deadline(deadline, default_timeout=10.0)
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
        assert_not_timed_out(deadline, "webpage fetch")

        articles_summary = _parse_html_articles(raw_html, target_url)
        if articles_summary:
            return articles_summary

        main_summary = _parse_html_main(raw_html, target_url, max_chars)
        if main_summary:
            return main_summary
    except TimeoutError:
        # A socket/read timeout belongs to this source, not to the whole task. Only
        # propagate when the shared task deadline itself has actually elapsed.
        assert_not_timed_out(deadline, "webpage fetch")
    except urllib.error.HTTPError as http_err:
        if http_err.code == 403 and "SSRF Blocked" in str(http_err):
            return f"【安全拦截】重定向目标受限 ({target_url}): {http_err.reason}"
        assert_not_timed_out(deadline, "webpage fetch")
    except Exception:
        assert_not_timed_out(deadline, "webpage fetch")

    # 2. 备用：调用 Jina Reader 智能转 Markdown (仅当目标仍然合规时)
    to2 = check_deadline(deadline, default_timeout=10.0)
    jina_content, jina_err = _fetch_jina_fallback(target_url, max_chars, to2, deadline)
    if jina_content:
        return jina_content
    if jina_err:
        return jina_err

    assert_not_timed_out(deadline, "webpage fetch")
    return f"未能获取网页有效内容 ({target_url})"


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

    # 搜索只保留信息主题，剥离“总结、输出文件”等后续交付指令。
    # 这些动作由执行计划处理，不应污染搜索引擎关键词。
    cleaned = re.split(
        r'\s*(?:[，,；;]|然后|并且|并)\s*(?:请)?(?:总结|汇总|归纳|提炼|输出|生成|创建|导出|保存|写入|制作|做成)\b',
        cleaned,
        maxsplit=1,
        flags=re.I,
    )[0].strip()

    substance = re.sub(r'(今天|今日|现在|最新|最近|近年|历年|历届|的|热点|热搜|热门|动态|新闻|\s+)', '', cleaned)
    if len(substance) >= 2:
        cleaned = re.sub(
            r'^(近\s*\d+\s*年[的]?|近年[的]?|近几年[的]?|历年[的]?|往年[的]?|历届[的]?|最近\s*\d+\s*天[的]?|近\s*\d+\s*天[的]?|最近一个月[的]?|近一个月[的]?|最近[的]?|最新[的]?|当前[的]?|今天[的]?|今日[的]?)\s*',
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
            r'\s*(近\s*\d+\s*年[的]?|近年[的]?|近几年[的]?|历年[的]?|往年[的]?|历届[的]?|最近\s*\d+\s*天[的]?|近\s*\d+\s*天[的]?|最近一个月[的]?|近一个月[的]?|最近[的]?|最新[的]?|当前[的]?|今天[的]?|今日[的]?)$',
            '',
            cleaned,
            flags=re.I
        ).strip()

    return cleaned or q


def perform_web_search(query: str, max_results: int = 8, freshness: Optional[str] = None, deadline: Optional[float] = None) -> str:
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
                results.append(f"{i+1}. {tag_str}{word} (热度值: {num})")
            if len(results) > 1:
                return "\n".join(results)
        except TimeoutError:
            raise
        except Exception:
            assert_not_timed_out(deadline, "weibo search")
            pass

    # 3. 优先调用管理员预置的 modsearch 模块化搜索引擎插件
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

    # 4. 通用必应搜索（含口语停用词归一化与结构化标题/链接提取）
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
