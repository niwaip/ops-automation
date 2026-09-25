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
import subprocess
from pathlib import Path
from typing import Optional

from .config import PLUGIN_DIR

CITY_PINYIN = {
    "北京": "Beijing", "上海": "Shanghai", "广州": "Guangzhou", "深圳": "Shenzhen", "杭州": "Hangzhou",
    "南京": "Nanjing", "苏州": "Suzhou", "成都": "Chengdu", "武汉": "Wuhan", "重庆": "Chongqing",
    "西安": "Xi_an", "天津": "Tianjin", "长沙": "Changsha", "郑州": "Zhengzhou", "济南": "Jinan",
    "青岛": "Qingdao", "沈阳": "Shenyang", "大连": "Dalian", "哈尔滨": "Harbin", "长春": "Changchun",
    "福州": "Fuzhou", "厦门": "Xiamen", "合肥": "Hefei", "南昌": "Nanchang", "昆明": "Kunming",
    "贵阳": "Guiyang", "南宁": "Nanning", "海口": "Haikou", "三亚": "Sanya", "石家庄": "Shijiazhuang",
    "太原": "Taiyuan", "呼和浩特": "Hohhot", "兰州": "Lanzhou", "西宁": "Xining", "银川": "Yinchuan",
    "乌鲁木齐": "Urumqi", "拉萨": "Lhasa", "香港": "Hong_Kong", "澳门": "Macau", "台北": "Taipei"
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
    target = "Shanghai"
    found_city = "上海"
    for k, v in CITY_PINYIN.items():
        if k in query_or_city:
            target = v
            found_city = k
            break

    to = check_deadline(deadline, default_timeout=8.0)
    lines = [f"【{found_city} 实时权威气象与多日预报 ({target})】:"]

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


def fetch_page(url: str, max_chars: int = 20000, deadline: Optional[float] = None) -> str:
    """Universal webpage reader: extracts clean structured text, articles and links from any live URL"""
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

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
        with urllib.request.urlopen(req, timeout=to1) as resp:
            raw_html = resp.read().decode("utf-8", errors="ignore")
        assert_not_timed_out(deadline, "webpage fetch")

        # 针对榜单、信息流、趋势卡片（包含多个标准 <article> 语义标签）
        articles = re.findall(r'<article\b[^>]*>(.*?)</article>', raw_html, re.DOTALL | re.I)
        if len(articles) >= 2:
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

        # 针对常规正文提取 (<main> 或 <body>)
        main_m = re.search(r'<(?:main|body)\b[^>]*>(.*?)</(?:main|body)>', raw_html, re.DOTALL | re.I)
        content = main_m.group(1) if main_m else raw_html

        # 剥离脚本、样式、导航、页眉页脚、侧边栏
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
        if len(result) > 50:
            if len(result) > max_chars:
                hint = (
                    f"\n\n[⚠️ 网页长文本截断提醒]: 网页解析总长 {len(result)} 字符，已展示前 {max_chars} 字符。"
                    f"\n💡 [通用建议]: 如需获取网页特定段落或深入信息，请结合页面核心关键词重新调用 web_search 精准检索相关主题]"
                )
                return f"【网页内容解析 ({target_url})】:\n" + result[:max_chars] + hint
            return f"【网页内容解析 ({target_url})】:\n" + result
    except TimeoutError:
        raise
    except Exception:
        assert_not_timed_out(deadline, "webpage fetch")
        pass

    # 2. 备用：调用 Jina Reader 智能转 Markdown
    to2 = check_deadline(deadline, default_timeout=10.0)
    try:
        jina_url = f"https://r.jina.ai/{target_url}"
        req = urllib.request.Request(jina_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=to2) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
        assert_not_timed_out(deadline, "webpage fetch fallback")
        # 过滤超长连续单行导航链接群
        cleaned_md = re.sub(r'(?:\[[^\]\n]{1,30}\]\([^\)]+\)\s*){5,}', '\n', text)
        if cleaned_md and len(cleaned_md.strip()) > 50:
            content = cleaned_md.strip()
            if len(content) > max_chars:
                hint = (
                    f"\n\n[⚠️ 网页长文本截断提醒]: 网页 Markdown 总长 {len(content)} 字符，已展示前 {max_chars} 字符。"
                    f"\n💡 [通用建议]: 如需查看特定章节，请结合具体关键词检索]"
                )
                return content[:max_chars] + hint
            return content
    except TimeoutError:
        raise
    except Exception as e:
        assert_not_timed_out(deadline, "webpage fetch fallback")
        return f"获取网页内容失败 ({target_url}): {e}"

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
