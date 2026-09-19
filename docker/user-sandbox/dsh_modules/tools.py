"""
Built-in execution tools for DeepSeek Harness:
Weather, web scraper, search engines, file parser, and shell executor.
"""

import os
import sys
import json
import re
import html
import time
import socket
import subprocess
import urllib.request
import urllib.parse
import urllib.error
import zipfile
from typing import Optional, Dict, Any
from xml.etree import ElementTree as ET
from pathlib import Path
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, PLUGIN_DIR, DEFAULT_PROXY_URL, VIRTUAL_API_KEY
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

SANDBOX_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "weather",
            "description": "查询指定城市或地区的实时气象、气温、风力及多日天气预报",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市中文名称或拼音，例如 '北京', '上海', '深圳', 'Guangzhou'"
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "使用联网搜索引擎检索实时新闻、事实数据、最新热点及技术文档",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词或短语"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_page",
            "description": "读取并提取公开网页或 URL 的正文内容（Markdown 格式）",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "网页 URL 地址，例如 'https://example.com'"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取沙箱工作区或知识库中的文件内容（支持代码文件、文本、markdown、docx、xlsx、pdf、json 等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "文件路径或文件名，例如 'report.md' 或 'src/index.ts'"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "在沙箱隔离 Linux 环境执行 Shell 命令行指令（如 python3, curl, jq, git, cat 等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "cmd": {
                        "type": "string",
                        "description": "要执行的 Shell 命令行指令"
                    }
                },
                "required": ["cmd"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scan_knowledge",
            "description": "扫描并读取挂载的个人知识库 (/knowledge) 中的参考文档与记忆",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_skill",
            "description": "读取系统专业技能指南或 PPT 设计规范模板",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "技能名称，例如 'guizang-ppt'"
                    }
                },
                "required": ["skill_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_file",
            "description": "将沙箱生成的文件直接推送/发送到用户的即时通讯（微信/网页）客户端",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要发送的文件路径或文件名"
                    },
                    "comment": {
                        "type": "string",
                        "description": "发送给用户的留言或说明"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vision_inspect",
            "description": "检查并深度分析沙箱工作区或知识库中的图片视觉内容（支持 png, jpg, jpeg, webp 等图片 OCR、排版与视觉理解）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "待分析的图片文件名或路径，例如 'screenshot.png' 或 'diagram.jpg'"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "针对该图片的具体分析指令或问题"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "image_gen",
            "description": "使用生图插件/生图模型生成或编辑图片文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "详细的生图或修图英文/中文提示词"
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "description": "生成图片的宽高比，如 '16:9', '1:1', '4:3', '9:16' 等"
                    },
                    "output_filename": {
                        "type": "string",
                        "description": "期望保存的图片文件名，例如 'hero_banner.png'"
                    }
                },
                "required": ["prompt"]
            }
        }
    }
]


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


def fetch_weather(query_or_city: str, deadline: Optional[float] = None) -> str:
    """Fetches high-accuracy real-time weather and 3-day forecast via structured weather API"""
    target = "Shanghai"
    found_city = "上海"
    for k, v in CITY_PINYIN.items():
        if k in query_or_city:
            target = v
            found_city = k
            break

    to = check_deadline(deadline, default_timeout=8.0)
    try:
        url = f"https://wttr.in/{target}?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=to) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert_not_timed_out(deadline, "weather query")
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
    except TimeoutError:
        raise
    except Exception as e:
        assert_not_timed_out(deadline, "weather query")
        return f"查询 {found_city} 气象数据反馈: {e}"


def fetch_page(url: str, max_chars: int = 8000, deadline: Optional[float] = None) -> str:
    """Universal webpage reader: extracts clean structured text, articles and links from any live URL"""
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

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
            return f"【网页内容解析 ({target_url})】:\n" + result[:max_chars]
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
            return cleaned_md[:max_chars].strip()
    except TimeoutError:
        raise
    except Exception as e:
        assert_not_timed_out(deadline, "webpage fetch fallback")
        return f"获取网页内容失败 ({target_url}): {e}"

    assert_not_timed_out(deadline, "webpage fetch")
    return f"未能获取网页有效内容 ({target_url})"


def normalize_search_query(q: str) -> str:
    """Removes conversational stop words to optimize search relevance without hardcoding"""
    cleaned = re.sub(r'^(帮我|请|给我)?(查一下|查询|搜索|查找|看下|看看|检索|了解一下|获取|search|find|lookup)\s*', '', q, flags=re.I).strip()
    substance = re.sub(r'(今天|今日|现在|最新|最近|的|热点|热搜|热门|动态|新闻|\s+)', '', cleaned)
    if len(substance) >= 2:
        cleaned = re.sub(r'(今天|今日|现在|最近的|最新的|当前)\s*', '', cleaned).strip()
    return cleaned or q


def perform_web_search(query: str, max_results: int = 8, deadline: Optional[float] = None) -> str:
    """Multi-source organic web search and weather query within sandbox"""
    clean_q = re.sub(r'^(搜索|查询|查找|帮我搜索|请搜索|查看|获取|search|find|lookup)\s*', '', query, flags=re.I).strip() or query

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
    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(norm_q)}"
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
            if title:
                results.append(f"[{title}]({link})\n    {snippet}")
            if len(results) >= max_results:
                break
        if results:
            return f"【联网检索实时结果 ({norm_q})】:\n" + "\n\n".join(results)
    except TimeoutError:
        raise
    except Exception:
        assert_not_timed_out(deadline, "bing search")
        pass

    assert_not_timed_out(deadline, "web search")
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


def inspect_image(image_path: str, prompt: str = "", max_chars: int = 15000, deadline: Optional[float] = None) -> str:
    """
    Inspects, analyzes, and extracts visual information/OCR text from an image file
    located in /workspace or /knowledge via the platform's multimodal vision model proxy.
    """
    assert_not_timed_out(deadline, "image vision inspection")
    import base64
    raw_name = image_path.strip().strip("'\"")
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
                    return f"图片文件未找到: {image_path}"

    suffix = p.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
    }

    image_bytes = None
    mime = "image/jpeg"

    if suffix == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(str(p))
            for page in reader.pages:
                if getattr(page, "images", None) and len(page.images) > 0:
                    sorted_imgs = sorted(page.images, key=lambda img: len(img.data), reverse=True)
                    best_img = sorted_imgs[0]
                    image_bytes = best_img.data
                    img_ext = Path(best_img.name).suffix.lower()
                    mime = mime_map.get(img_ext, "image/jpeg")
                    break
            if not image_bytes:
                # 智能降级：若是纯文字 PDF 且未嵌入独立位图对象，自动调用 read_workspace_file 提取文本，避免中断模型推理
                txt_fallback = read_workspace_file(str(p), max_chars=max_chars, deadline=deadline)
                return f"【PDF 识别提示】文档 {p.name} 为文字型 PDF（无独立位图对象），已自动为您提取文档文本内容：\n{txt_fallback}"
        except Exception as e:
            assert_not_timed_out(deadline, "image vision inspection")
            return f"从 PDF 提取页面图片失败 ({p.name}): {e}"
    elif suffix in mime_map:
        mime = mime_map[suffix]
        try:
            with open(p, "rb") as f:
                image_bytes = f.read()
        except Exception as e:
            return f"读取图片文件失败 ({p.name}): {e}"
    else:
        return f"【文件格式不支持】文件 ({p.name}) 并非支持的图片或扫描文档格式（支持 jpg, png, webp, gif, bmp, pdf）。"

    if not image_bytes or len(image_bytes) == 0:
        return f"图片内容为空: {p.name}"

    to_vision = check_deadline(deadline, default_timeout=120.0)
    try:
        b64_str = base64.b64encode(image_bytes).decode("ascii")

        analysis_prompt = prompt.strip() if prompt and prompt.strip() else (
            "请详细分析并解读这张图片的内容，识别并提取图中的所有关键文字（OCR）、物体、图表数据、界面元素或主体信息，给出清晰准确的中文说明。"
        )

        api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
        payload = {
            "model": "vision",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": analysis_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_str}",
                                "detail": "auto"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.2,
            "max_tokens": 4096,
            "stream": False
        }

        req = urllib.request.Request(
            api_endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {VIRTUAL_API_KEY}"
            }
        )

        with urllib.request.urlopen(req, timeout=to_vision) as response:
            resp_data = json.loads(response.read().decode("utf-8"))
            assert_not_timed_out(deadline, "image vision inspection")
            choices = resp_data.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                if content:
                    for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                        tp = p.parent / txt_name
                        if not tp.exists():
                            try:
                                tp.write_text(content, encoding="utf-8")
                            except Exception:
                                pass
                    return f"【图片 ({p.name}) 视觉分析与内容识别结果】:\n{content[:max_chars]}"
            return f"图片视觉识别未返回有效内容: {resp_data}"
    except TimeoutError:
        raise
    except urllib.error.URLError as ue:
        if isinstance(getattr(ue, "reason", None), socket.timeout) or "timed out" in str(ue).lower():
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Task total execution deadline exceeded during image vision inspection")
        assert_not_timed_out(deadline, "image vision inspection")
        return f"【系统提示】图片视觉分析网络请求失败: {ue}"
    except urllib.error.HTTPError as he:
        # 默认模型若为纯文本模型（如 DeepSeek），代理端会返回 400/404/500
        assert_not_timed_out(deadline, "image vision inspection")
        return "【系统提示】当前系统默认模型为纯文本模型，暂不支持视觉识别（无法解析图片内容）。"
    except Exception as e:
        assert_not_timed_out(deadline, "image vision inspection")
        return f"【系统提示】当前系统默认模型暂不支持视觉多模态能力: {e}"


def read_workspace_file(file_path: str, max_chars: int = 15000, deadline: Optional[float] = None) -> str:
    """Reads and extracts text from workspace or knowledge files, with native support for .docx, .xlsx, .txt, .md, .json, .py, .pdf, .jpg, .png"""
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
                    return f"文件未找到: {file_path}"

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

    # 3. PDF 文档 (.pdf) 原生提取 (基于 pypdf)
    elif suffix == ".pdf":
        txt_sibling = p.parent / f"{p.name}.txt"
        if not txt_sibling.exists():
            txt_sibling = p.parent / f"{p.stem}.txt"
        if txt_sibling.exists():
            try:
                return f"【PDF 文档 ({p.name}) 提取文本】:\n" + txt_sibling.read_text(encoding="utf-8", errors="ignore")[:max_chars]
            except Exception:
                pass
        try:
            import pypdf
            reader = pypdf.PdfReader(str(p))
            num_pages = len(reader.pages)
            pages_text = []
            has_images = False
            for i, page in enumerate(reader.pages):
                txt = (page.extract_text() or "").strip()
                if txt:
                    pages_text.append(f"--- 第 {i+1} 页 ---\n{txt}")
                if getattr(page, "images", None) and len(page.images) > 0:
                    has_images = True
            combined_text = "\n\n".join(pages_text).strip()
            if combined_text:
                for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                    tp = p.parent / txt_name
                    if not tp.exists():
                        try:
                            tp.write_text(combined_text, encoding="utf-8")
                        except Exception:
                            pass
                return f"【PDF 文档 ({p.name}) 内容提取，共 {num_pages} 页】:\n" + combined_text[:max_chars]
            elif has_images:
                return f"【PDF 文档 ({p.name}) 概要】: 共 {num_pages} 页，文档属于扫描版或图片型 PDF（包含嵌入图片对象，无直接文本层）。"
            else:
                return f"【PDF 文档 ({p.name}) 概要】: 共 {num_pages} 页，文档为空或未检测到文字内容。"
        except Exception as e:
            return f"PDF 文档解析失败 ({p.name}): {e}"

    # 4. 检查是否有已提取的同名 .txt
    txt_sibling = p.parent / f"{p.name}.txt"
    if not txt_sibling.exists():
        txt_sibling = p.parent / f"{p.stem}.txt"
    if txt_sibling.exists() and suffix in [".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
        try:
            return f"【文件 ({p.name}) 提取文本/视觉识别结果】:\n" + txt_sibling.read_text(encoding="utf-8", errors="ignore")[:max_chars]
        except Exception:
            pass

    # 5. 图片文件 (.jpg, .jpeg, .png, .webp, .gif, .bmp) 视觉识别与解析
    if suffix in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
        return inspect_image(str(p), max_chars=max_chars, deadline=deadline)

    # 5. 常规纯文本文件读取 (.txt, .md, .json, .py, .csv, .yml, .sql, .sh 等)
    try:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        return f"【文本文件 ({p.name}) 内容】:\n" + raw[:max_chars]
    except Exception as e:
        return f"读取文件异常 ({p.name}): {e}"


def send_workspace_file(file_path: str, comment: str = "") -> str:
    """
    Marks and delivers a file from /workspace or /knowledge to the user's WeChat / chat client.
    Generates <<<DSH_OUTBOUND_FILE:{...}>>> marker for upstream gateway dispatch.
    """
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
                    return f"发送失败：文件未找到: {file_path}"

    if not p.is_file():
        return f"发送失败：目标不是文件: {file_path}"

    rel_or_abs = str(p)
    marker = json.dumps({
        "filePath": rel_or_abs,
        "fileName": p.name,
        "comment": comment or ""
    }, ensure_ascii=False)
    # 输出机器标记以供上层平台调度器捕获外发多媒体文件
    print(f"\n<<<DSH_OUTBOUND_FILE:{marker}>>>\n")
    return f"【文件发送指令已就绪】已成功定位并为您调度发送文件: {p.name} ({p.stat().st_size} 字节)。系统已通过微信多媒体通道推送至您的聊天界面。"


def execute_tool(tool_name: str, params: dict, deadline: Optional[float] = None) -> str:
    """Executes the requested tool inside sandbox or network scraper, bound by task deadline"""
    if deadline is not None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Task total execution deadline exceeded before tool invocation")
    else:
        remaining = None

    name_clean = tool_name.strip().lower()
    res = ""

    if name_clean in ["weather", "get_weather", "query_weather"]:
        city = (
            params.get("city") or
            params.get("location") or
            params.get("query") or
            (str(list(params.values())[0]) if params else "上海")
        )
        res = fetch_weather(str(city), deadline=deadline)

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
        res = perform_web_search(query, deadline=deadline)

    elif name_clean in ["fetch_page", "read_url", "web_fetch", "curl_page", "browse", "get_page", "page_fetch"]:
        url = (
            params.get("url") or
            params.get("link") or
            params.get("href") or
            (str(list(params.values())[0]) if params else "")
        )
        res = fetch_page(str(url), deadline=deadline)

    elif name_clean in ["read_file", "cat", "view_file", "read_doc", "parse_file", "open_file", "read"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            params.get("name") or
            (str(list(params.values())[0]) if params else "")
        )
        res = read_workspace_file(str(fpath), deadline=deadline)

    elif name_clean in ["vision_inspect", "inspect_image", "image_inspect", "read_image", "ocr", "view_image", "analyze_image"]:
        fpath = (
            params.get("file_path") or
            params.get("image_path") or
            params.get("path") or
            params.get("file") or
            params.get("filename") or
            (str(list(params.values())[0]) if params else "")
        )
        prompt = params.get("prompt") or params.get("instruction") or params.get("query") or ""
        res = inspect_image(str(fpath), prompt, deadline=deadline)

    elif name_clean in ["bash", "cmd", "terminal", "sh", "exec"]:
        cmd = params.get("cmd") or params.get("command") or ""
        if not cmd and params:
            cmd = str(list(params.values())[0])
        bash_to = max(0.5, min(20.0, remaining)) if remaining is not None else 20.0
        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=WORKSPACE_DIR,
                text=True,
                capture_output=True,
                timeout=bash_to
            )
            res = proc.stdout.strip() or proc.stderr.strip() or "(命令执行完成，返回退出码 0)"
        except subprocess.TimeoutExpired:
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Task total execution deadline exceeded during bash command")
            res = f"命令执行超时 ({bash_to:.1f}s): {cmd[:60]}"
        except Exception as e:
            res = f"命令执行异常: {e}"

    elif name_clean in ["knowledge_search", "scan_knowledge"]:
        res = scan_personal_knowledge()

    elif name_clean in ["read_skill", "get_skill", "load_skill", "use_skill", "skill"]:
        skill_name = (
            params.get("skill_name") or
            params.get("name") or
            params.get("skill") or
            (str(list(params.values())[0]) if params else "")
        )
        res = read_skill(skill_name)

    elif name_clean in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat", "send_document", "deliver_file", "push_file"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            params.get("name") or
            (str(list(params.values())[0]) if params else "")
        )
        comment = params.get("comment") or params.get("desc") or params.get("message") or ""
        res = send_workspace_file(str(fpath), str(comment))

    elif name_clean in ["image_gen", "generate_image", "text_to_image", "draw_image", "paint"]:
        plugin_file = Path(PLUGIN_DIR) / "image_gen.py"
        if plugin_file.exists():
            gen_to = max(1.0, min(35.0, remaining)) if remaining is not None else 35.0
            try:
                proc = subprocess.run(
                    [sys.executable, str(plugin_file), json.dumps(params)],
                    text=True,
                    capture_output=True,
                    timeout=gen_to
                )
                res = proc.stdout.strip() or proc.stderr.strip()
            except subprocess.TimeoutExpired:
                if deadline is not None and time.monotonic() >= deadline:
                    raise TimeoutError("Task total execution deadline exceeded during image generation")
                res = f"生图执行超时 ({gen_to:.1f}s)"
            except Exception as e:
                res = f"生图插件执行异常: {e}"
        else:
            res = "【系统提示】当前对话模型具备多模态视觉理解能力（支持识图分析），但不支持原生图像生成/绘图（Text-to-Image）。如需生成图片文件，需在平台接入生图模型（如 Imagen / DALL-E / Flux / ComfyUI）。"

    else:
        plugin_file = Path(PLUGIN_DIR) / f"{tool_name}.py"
        if plugin_file.exists():
            plug_to = max(0.5, min(20.0, remaining)) if remaining is not None else 20.0
            try:
                proc = subprocess.run(
                    [sys.executable, str(plugin_file), json.dumps(params)],
                    text=True,
                    capture_output=True,
                    timeout=plug_to
                )
                res = proc.stdout.strip() or proc.stderr.strip()
            except subprocess.TimeoutExpired:
                if deadline is not None and time.monotonic() >= deadline:
                    raise TimeoutError(f"Task total execution deadline exceeded during plugin {tool_name}")
                res = f"插件执行超时 ({plug_to:.1f}s): {tool_name}"
            except Exception as e:
                res = f"插件执行异常: {e}"
        else:
            res = f"未识别工具名称: {tool_name}"

    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError(f"Task total execution deadline exceeded after tool {tool_name}")

    return res
