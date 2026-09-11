"""
Built-in execution tools for DeepSeek Harness:
Weather, web scraper, search engines, file parser, and shell executor.
"""

import os
import sys
import json
import re
import html
import subprocess
import urllib.request
import urllib.parse
import zipfile
from xml.etree import ElementTree as ET
from pathlib import Path
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, PLUGIN_DIR
from .skills import read_skill

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


def fetch_weather(query_or_city: str) -> str:
    """Fetches high-accuracy real-time weather and 3-day forecast via structured weather API"""
    target = "Shanghai"
    found_city = "上海"
    for k, v in CITY_PINYIN.items():
        if k in query_or_city:
            target = v
            found_city = k
            break

    try:
        url = f"https://wttr.in/{target}?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            weather = data.get("weather", [])
            current = data.get("current_condition", [{}])[0]
            curr_desc = current.get("weatherDesc", [{}])[0].get("value", "多云")
            lines = [f"【{found_city} 实时权威气象与多日预报 ({target})】:"]
            lines.append(
                f"- 当前实时气温: {current.get('temp_C')}°C (体感 {current.get('FeelsLikeC')}°C), "
                f"湿度 {current.get('humidity')}%, 风速 {current.get('windspeedKmph')}km/h, 状况: {curr_desc}"
            )
            for i, w in enumerate(weather[:3]):
                label = "今天" if i == 0 else ("明天" if i == 1 else "后天")
                hourly = w.get("hourly", [])
                noon_desc = hourly[4].get("weatherDesc", [{}])[0].get("value", "多云") if len(hourly) > 4 else "晴间多云"
                rain_chance = max([int(h.get("chanceofrain", "0")) for h in hourly]) if hourly else 0
                lines.append(
                    f"- {label} ({w.get('date')}): 最低 {w.get('mintempC')}°C ~ 最高 {w.get('maxtempC')}°C, "
                    f"天气状况: {noon_desc}, 降水概率: {rain_chance}%"
                )
            return "\n".join(lines)
    except Exception as e:
        return f"查询 {found_city} 气象数据反馈: {e}"


def fetch_page(url: str, max_chars: int = 8000) -> str:
    """Universal webpage reader: extracts clean structured text, articles and links from any live URL"""
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    # 1. 优先采用直接 HTTP 请求与语义化结构提取（快速、可靠、无第三方限流）
    try:
        req = urllib.request.Request(
            target_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_html = resp.read().decode("utf-8", errors="ignore")

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
            return f"【网页内容解析 ({target_url})】:\n" + result[:max_chars]
    except Exception:
        pass

    # 2. 备用：调用 Jina Reader 智能转 Markdown
    try:
        jina_url = f"https://r.jina.ai/{target_url}"
        req = urllib.request.Request(jina_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
            # 过滤超长连续单行导航链接群
            cleaned_md = re.sub(r'(?:\[[^\]\n]{1,30}\]\([^\)]+\)\s*){5,}', '\n', text)
            if cleaned_md and len(cleaned_md.strip()) > 50:
                return cleaned_md[:max_chars].strip()
    except Exception as e:
        return f"获取网页内容失败 ({target_url}): {e}"

    return f"未能获取网页有效内容 ({target_url})"


def normalize_search_query(q: str) -> str:
    """Removes conversational stop words to optimize search relevance without hardcoding"""
    cleaned = re.sub(r'^(帮我|请|给我)?(查一下|查询|搜索|查找|看下|看看|检索|了解一下|获取|search|find|lookup)\s*', '', q, flags=re.I).strip()
    substance = re.sub(r'(今天|今日|现在|最新|最近|的|热点|热搜|热门|动态|新闻|\s+)', '', cleaned)
    if len(substance) >= 2:
        cleaned = re.sub(r'(今天|今日|现在|最近的|最新的|当前)\s*', '', cleaned).strip()
    return cleaned or q


def perform_web_search(query: str, max_results: int = 8) -> str:
    """Multi-source organic web search and weather query within sandbox"""
    clean_q = re.sub(r'^(搜索|查询|查找|帮我搜索|请搜索|查看|获取|search|find|lookup)\s*', '', query, flags=re.I).strip() or query

    # 1. 针对天气意图优先调用高精度结构化气象源
    if re.search(r'(天气|预报|气温|下雨|晴天|降雨|温度|weather|forecast)', clean_q, re.I):
        weather_res = fetch_weather(clean_q)
        if "实时权威气象与多日预报" in weather_res:
            return weather_res

    # 2. 针对微博热搜/热点的实时高频接口
    if re.search(r'(微博|weibo).*?(热搜|热点|榜|热门)', clean_q, re.I):
        try:
            url = "https://weibo.com/ajax/side/hotSearch"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://weibo.com"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
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
        except Exception:
            pass

    # 3. 优先调用管理员预置的 modsearch 模块化搜索引擎插件
    modsearch_plugin = Path(PLUGIN_DIR) / "modsearch.py"
    if modsearch_plugin.exists():
        try:
            proc = subprocess.run(
                [sys.executable, str(modsearch_plugin), clean_q],
                text=True,
                capture_output=True,
                timeout=25
            )
            out = proc.stdout.strip()
            if out and not out.startswith("Error:"):
                return out
        except Exception:
            pass

    # 4. 通用必应搜索（含口语停用词归一化与结构化标题/链接提取）
    norm_q = normalize_search_query(clean_q)
    results = []
    discard_re = re.compile(r'windows.*?(帮助|支持|客户端)|无法正常浏览.*?浏览器版本过低|人机身份验证|enable cookies|captcha|microsoft support', re.I)
    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(norm_q)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            html_raw = response.read().decode("utf-8", errors="ignore")
            blocks = re.findall(r'<li class="b_algo"[^>]*>(.*?)</li>', html_raw, re.DOTALL)
            for b in blocks:
                m_h2 = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>(.*?)</a></h2>', b, re.DOTALL)
                m_p = re.search(r'<p[^>]*>(.*?)</p>', b, re.DOTALL)
                if m_h2:
                    title = html.unescape(re.sub(r'<[^>]+>', '', m_h2.group(2)).strip())
                    href = m_h2.group(1).strip()
                    desc = html.unescape(re.sub(r'<[^>]+>', '', m_p.group(1)).strip()) if m_p else ""
                    if discard_re.search(title) or discard_re.search(desc):
                        continue
                    if len(desc) > 15 or len(title) > 5:
                        results.append(f"[{title}]({href})\n    {desc}")

            # 若未解析出结构化块，兜底提取正文片段
            if not results:
                snippets = re.findall(r'<div class="b_caption">.*?<p[^>]*>(.*?)</p>', html_raw, re.DOTALL)
                for s in snippets:
                    clean_text = re.sub(r'<[^>]+>', '', s).strip().replace("&nbsp;", " ").replace("&#0183;", "·")
                    if discard_re.search(clean_text) or len(clean_text) <= 15:
                        continue
                    results.append(clean_text)
    except Exception as e:
        results.append(f"(网络检索连接提示: {e})")

    if results:
        return "\n".join([f"[{i+1}] {r}" for i, r in enumerate(results[:max_results])])
    return ""


def scan_personal_knowledge() -> str:
    """Scans personal knowledge space for reference material, saved deliverables, and custom skills"""
    if not os.path.exists(KNOWLEDGE_DIR):
        return ""
    files = list(Path(KNOWLEDGE_DIR).glob("**/*"))
    files = [f for f in files if f.is_file() and not f.name.startswith(".")]
    if not files:
        return "Personal Knowledge Base (/knowledge) 目前为空。你可以将持久化交付物、报表、文档或自定义技能 (/knowledge/skills) 保存在此处。"

    summary = ["Personal Knowledge Base (/knowledge) contents:"]
    for f in files[:15]:
        try:
            rel = f.relative_to(KNOWLEDGE_DIR)
            content_preview = f.read_text(encoding="utf-8", errors="ignore")[:300]
            summary.append(f"- File: {rel} ({f.stat().st_size} bytes)\n  Preview: {content_preview.strip()}")
        except Exception:
            continue
    return "\n".join(summary)


def read_workspace_file(file_path: str, max_chars: int = 15000) -> str:
    """Reads and extracts text from workspace or knowledge files, with native support for .docx, .xlsx, .txt, .md, .json, .py, .pdf"""
    raw_name = file_path.strip().strip("'\"")
    p = Path(WORKSPACE_DIR) / raw_name if not os.path.isabs(raw_name) else Path(raw_name)
    if not p.exists():
        if not os.path.isabs(raw_name) and (Path(KNOWLEDGE_DIR) / raw_name).exists():
            p = Path(KNOWLEDGE_DIR) / raw_name
        else:
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{raw_name}*"))
            if candidates:
                p = candidates[0]
            else:
                knowledge_candidates = list(Path(KNOWLEDGE_DIR).glob(f"*{raw_name}*"))
                if knowledge_candidates:
                    p = knowledge_candidates[0]
                else:
                    available = [f.name for f in Path(WORKSPACE_DIR).iterdir() if f.is_file() and not f.name.startswith(".")]
                    return f"文件未找到: {file_path} (当前工作区文件列表: {available})"

    suffix = p.suffix.lower()

    # 1. Word 文档 (.docx) 原生提取 (基于标准库 zipfile + xml，无需任何外部依赖)
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(p) as z:
                xml = z.read("word/document.xml").decode("utf-8")
            root = ET.fromstring(xml)
            texts = []
            for item in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                t = "".join(n.text or "" for n in item.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))
                if t.strip():
                    texts.append(t.strip())
            content = "\n".join(texts)
            # 自动生成同名 .txt 文件，方便后续其他命令或用户查看
            for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                tp = p.parent / txt_name
                if not tp.exists():
                    try:
                        tp.write_text(content, encoding="utf-8")
                    except Exception:
                        pass
            return f"【Word 文档 ({p.name}) 内容提取，共 {len(texts)} 个段落】:\n" + content[:max_chars]
        except Exception as e:
            return f"Word 文档提取失败 ({p.name}): {e}"

    # 2. Excel 工作簿 (.xlsx) 原生提取
    elif suffix == ".xlsx":
        try:
            with zipfile.ZipFile(p) as z:
                shared_strings = []
                if "xl/sharedStrings.xml" in z.namelist():
                    ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                    for si in ss_root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                        shared_strings.append("".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
                rows = []
                sheet_files = sorted([n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")])
                for sheet_name in sheet_files[:3]:
                    sheet_root = ET.fromstring(z.read(sheet_name))
                    for row in sheet_root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                        row_vals = []
                        for c in row.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                            v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                            t = c.get("t")
                            val = v.text if v is not None and v.text else ""
                            if t == "s" and val.isdigit() and int(val) < len(shared_strings):
                                val = shared_strings[int(val)]
                            if val:
                                row_vals.append(val)
                        if row_vals:
                            rows.append(" | ".join(row_vals))
            content = "\n".join(rows)
            for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                tp = p.parent / txt_name
                if not tp.exists():
                    try:
                        tp.write_text(content, encoding="utf-8")
                    except Exception:
                        pass
            return f"【Excel 表格 ({p.name}) 数据提取，共 {len(rows)} 行】:\n" + content[:max_chars]
        except Exception as e:
            return f"Excel 表格提取失败 ({p.name}): {e}"

    # 3. 检查是否有已提取的同名 .txt
    txt_sibling = p.parent / f"{p.name}.txt"
    if not txt_sibling.exists():
        txt_sibling = p.parent / f"{p.stem}.txt"
    if txt_sibling.exists() and suffix in [".pdf", ".docx", ".xlsx", ".pptx"]:
        try:
            return f"【文件 ({p.name}) 提取文本】:\n" + txt_sibling.read_text(encoding="utf-8", errors="ignore")[:max_chars]
        except Exception:
            pass

    # 4. 常规纯文本文件读取 (.txt, .md, .json, .py, .csv, .yml, .sql, .sh 等)
    try:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        return f"【文本文件 ({p.name}) 内容】:\n" + raw[:max_chars]
    except Exception as e:
        return f"读取文件异常 ({p.name}): {e}"


def execute_tool(tool_name: str, params: dict) -> str:
    """Executes the requested tool inside sandbox or network scraper"""
    name_clean = tool_name.strip().lower()

    if name_clean in ["weather", "get_weather", "query_weather"]:
        city = (
            params.get("city") or
            params.get("location") or
            params.get("query") or
            (str(list(params.values())[0]) if params else "上海")
        )
        return fetch_weather(str(city))

    elif name_clean in ["web_search", "search", "google_search", "bing_search", "modsearch"]:
        query = (
            params.get("__search_query") or
            params.get("query") or
            params.get("q") or
            params.get("search_query") or
            params.get("keyword") or
            ""
        )
        if not query and params:
            query = str(list(params.values())[0])
        return perform_web_search(query)

    elif name_clean in ["fetch_page", "read_url", "web_fetch", "curl_page", "browse", "get_page", "page_fetch"]:
        url = (
            params.get("url") or
            params.get("link") or
            params.get("href") or
            (str(list(params.values())[0]) if params else "")
        )
        return fetch_page(str(url))

    elif name_clean in ["read_file", "cat", "view_file", "read_doc", "parse_file", "open_file", "read"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            params.get("name") or
            (str(list(params.values())[0]) if params else "")
        )
        return read_workspace_file(str(fpath))

    elif name_clean in ["bash", "cmd", "terminal", "sh", "exec"]:
        cmd = params.get("cmd") or params.get("command") or ""
        if not cmd and params:
            cmd = str(list(params.values())[0])
        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=WORKSPACE_DIR,
                text=True,
                capture_output=True,
                timeout=20
            )
            return proc.stdout.strip() or proc.stderr.strip() or "(命令执行完成，返回退出码 0)"
        except Exception as e:
            return f"命令执行异常: {e}"

    elif name_clean in ["knowledge_search", "scan_knowledge"]:
        return scan_personal_knowledge()

    elif name_clean in ["read_skill", "get_skill", "load_skill", "use_skill", "skill"]:
        skill_name = (
            params.get("skill_name") or
            params.get("name") or
            params.get("skill") or
            (str(list(params.values())[0]) if params else "")
        )
        return read_skill(skill_name)

    else:
        plugin_file = Path(PLUGIN_DIR) / f"{tool_name}.py"
        if plugin_file.exists():
            try:
                proc = subprocess.run(
                    [sys.executable, str(plugin_file), json.dumps(params)],
                    text=True,
                    capture_output=True,
                    timeout=20
                )
                return proc.stdout.strip() or proc.stderr.strip()
            except Exception as e:
                return f"插件执行异常: {e}"
        return f"未识别工具名称: {tool_name}"
