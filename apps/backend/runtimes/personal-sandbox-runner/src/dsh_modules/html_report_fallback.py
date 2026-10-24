"""Deterministic HTML report recovery and compilation for model failures or declarative content."""

from html import escape
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple


def is_plausible_html_content(content: str, min_size: int = 40) -> bool:
    """Validates if an HTML string is a plausible deliverable rather than an empty/placeholder test probe."""
    if not content or len(content.strip()) < min_size:
        return False
    lower = content.lower().strip()
    if not ("<!doctype html" in lower or "<html" in lower):
        return False

    # 提取 body 纯文本
    body_m = re.search(r'<body[^>]*>(.*?)</body>', content, re.DOTALL | re.I)
    body_content = body_m.group(1).strip() if body_m else content.strip()
    visible_text = re.sub(r'<[^>]+>', ' ', body_content)
    visible_text = re.sub(r'\s+', ' ', visible_text).strip().lower()

    # 纯占位词或单词探针（如 <body>Test</body> 或 <body>Hello World</body>，且缺少语义内容标签）
    if visible_text in {"test", "hello world", "test page", "demo", "placeholder", "temp", "sample", ""}:
        has_semantic_tags = bool(re.search(r'<(?:h[1-6]|table|canvas|svg|form|main|article|ul|ol|p)\b', body_content, re.I))
        if not has_semantic_tags:
            return False

    return True


def is_plausible_html_file(file_path: Path, min_size: int = 40) -> bool:
    """Validates if an HTML file on disk is a genuine deliverable rather than an empty probe/placeholder."""
    try:
        if not file_path.exists() or not file_path.is_file():
            return False
        if file_path.stat().st_size < min_size:
            return False
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        return is_plausible_html_content(content, min_size=min_size)
    except Exception:
        return False


def _format_inline(text: str) -> str:
    """Formats basic markdown bold, italic, code, and links in HTML."""
    escaped = escape(text)
    # Bold **text** or __text__
    escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped)
    escaped = re.sub(r'__(.+?)__', r'<strong>\1</strong>', escaped)
    # Inline code `code`
    escaped = re.sub(r'`([^`]+)`', r'<code>\1</code>', escaped)
    return escaped


def _render_lines(source: str) -> str:
    parts = []
    in_list = False
    in_table = False
    table_header_done = False

    for raw in source.splitlines():
        line = raw.strip()
        if not line:
            if in_list:
                parts.append("</ul>")
                in_list = False
            if in_table:
                parts.append("</tbody></table>")
                in_table = False
                table_header_done = False
            continue

        # Check for table row: starts and ends with | or contains multiple |
        if "|" in line and (line.startswith("|") or line.endswith("|") or line.count("|") >= 2):
            # Check if this is a separator row like |:---|:---|
            if re.match(r'^[|\s\-:]+$', line):
                table_header_done = True
                continue

            raw_cells = [c.strip() for c in line.split("|")]
            # Strip empty first/last if table starts/ends with |
            if line.startswith("|") and len(raw_cells) > 0 and raw_cells[0] == "":
                raw_cells = raw_cells[1:]
            if line.endswith("|") and len(raw_cells) > 0 and raw_cells[-1] == "":
                raw_cells = raw_cells[:-1]

            if not raw_cells:
                continue

            if in_list:
                parts.append("</ul>")
                in_list = False

            if not in_table:
                in_table = True
                table_header_done = False
                parts.append("<table>")
                parts.append("<thead><tr>")
                for cell in raw_cells:
                    parts.append(f"<th>{_format_inline(cell)}</th>")
                parts.append("</tr></thead><tbody>")
            elif not table_header_done:
                parts.append("<tr>")
                for cell in raw_cells:
                    parts.append(f"<td>{_format_inline(cell)}</td>")
                parts.append("</tr>")
            else:
                parts.append("<tr>")
                for cell in raw_cells:
                    parts.append(f"<td>{_format_inline(cell)}</td>")
                parts.append("</tr>")
            continue

        if in_table:
            parts.append("</tbody></table>")
            in_table = False
            table_header_done = False

        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        bullet = re.match(r"^(?:[-*•]|\d+[.)])\s+(.+)$", line)
        if heading:
            if in_list:
                parts.append("</ul>")
                in_list = False
            level = min(3, len(heading.group(1)) + 1)
            parts.append(f"<h{level}>{_format_inline(heading.group(2))}</h{level}>")
        elif bullet:
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{_format_inline(bullet.group(1))}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<p>{_format_inline(line)}</p>")

    if in_list:
        parts.append("</ul>")
    if in_table:
        parts.append("</tbody></table>")

    return "\n".join(parts)


def materialize_html_from_content(
    title: str,
    content: str,
    workspace_dir: str,
    filename: str = "index.html",
    notice: Optional[str] = None,
) -> str:
    """Compiles markdown/plain report content into a polished HTML report document."""
    body = _render_lines(content)
    notice_html = f'<div class="notice">{escape(notice)}</div>' if notice else ""
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title><style>
:root{{--ink:#172033;--muted:#667085;--line:#e4e7ec;--brand:#2563eb;--paper:#fff;--bg:#f4f7fb}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.72 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}}
main{{width:min(1040px,calc(100% - 32px));margin:32px auto;background:var(--paper);padding:clamp(28px,5vw,64px);border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 50px #18223014}}
header{{border-bottom:3px solid var(--brand);padding-bottom:22px;margin-bottom:28px}}h1{{font-size:clamp(26px,4.5vw,42px);line-height:1.2;margin:0 0 10px;color:var(--ink)}}h2{{font-size:20px;margin:28px 0 10px;color:#1849a9}}h3{{font-size:16px;margin:20px 0 8px}}p{{margin:8px 0}}ul,ol{{padding-left:24px}}li{{margin:6px 0}}.meta{{color:var(--muted);font-size:13px}}
table{{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}}th,td{{padding:10px 14px;border:1px solid var(--line);text-align:left}}th{{background:#f8fafc;font-weight:600;color:var(--ink)}}tr:nth-child(even){{background:#fafbfd}}
code{{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;color:#e11d48}}
.notice{{margin-top:34px;padding:14px 16px;background:#eff6ff;border-left:4px solid var(--brand);color:#344054;border-radius:4px}}
@media print{{body{{background:#fff}}main{{margin:0;width:100%;border:0;box-shadow:none}}}}
</style></head><body><main><header><h1>{escape(title)}</h1><div class="meta">单页 HTML 报告 · 交互式呈现</div></header>
{body}
{notice_html}
</main></body></html>"""
    out_path = Path(workspace_dir) / filename
    out_path.write_text(document, encoding="utf-8")
    return str(out_path)


def materialize_html_report_fallback(
    prompt: str,
    history: List[Dict[str, Any]],
    workspace_dir: str,
    notice: Optional[str] = None,
) -> Optional[str]:
    """Compile recent, already-grounded conversation content into a readable page."""
    source = _recent_report_source(history)
    if not source:
        return None

    title = _infer_title(source)
    notice_text = notice or (
        "上游模型在文件写入阶段中断。本页面由运行时使用会话中已有的有效内容恢复生成，"
        "未补写新的事实或数据。"
    )
    return materialize_html_from_content(title, source, workspace_dir, filename="index.html", notice=notice_text)


def materialize_requested_html(
    prompt: str,
    final_text: str,
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
    is_design_intent: bool = False,
    is_ppt_intent: bool = False,
) -> Tuple[Optional[str], bool]:
    """
    Materializes a requested HTML deliverable when the model produced rich structured report content
    but omitted the ```html code block and did not call bash to write to workspace.
    Returns (absolute_path, created_now).
    """
    # 1. 若最终回复中已包含 ```html 代码块，交由主导出器处理
    if "```html" in (final_text or ""):
        return None, False

    # 2. 检查当前轮次工作区是否已由 bash 真实生成了非空 HTML 文件
    ws = Path(workspace_dir)
    if ws.exists():
        recent_htmls = [
            f for f in ws.glob("*.html")
            if f.is_file() and is_plausible_html_file(f) and (turn_start_time is None or f.stat().st_mtime >= turn_start_time - 2.0)
        ]
        if recent_htmls:
            return None, False

    # 3. 校验意图：用户明确要求 HTML / 网页 / 单页 / 报告，或模型声称输出了 HTML 文件
    p_lower = (prompt or "").lower()
    user_cmd = p_lower
    if "用户指令：" in user_cmd:
        user_cmd = user_cmd.split("用户指令：")[-1].strip()
    elif "用户指令:" in user_cmd:
        user_cmd = user_cmd.split("用户指令:")[-1].strip()
    else:
        user_cmd = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:[^\n]+\n?', '', user_cmd).strip()

    text_lower = (final_text or "").lower()
    names_non_web_format = bool(
        re.search(r'(?:pptx?|slides?|幻灯片|演示文稿|pdf|docx?|word|xlsx?|excel)', user_cmd, re.I)
    )
    html_cues = ["html", "单页", "页面", "网页", "原型", "demo", "大屏", "看板"]
    has_cue = (not names_non_web_format) and (
        is_design_intent
        or any(cue in user_cmd for cue in html_cues)
        or ("报告" in user_cmd and any(cue in user_cmd for cue in ["单页", "一页", "html", "网页"]))
    )
    claims_html = (not names_non_web_format) and (
        bool(re.search(r'(?:/workspace/|workspace/|`)([a-zA-Z0-9_\-]+\.html)', final_text or "", re.I)) or ("单页 html" in text_lower)
    )

    if not has_cue and not claims_html:
        return None, False

    # 4. 内容实质性校验：正文需包含足够报告信息（标题、列表或表格）
    if not final_text or len(final_text.strip()) < 120:
        return None, False

    # 严禁将系统错误声明、校验未通过声明或未完成警告编译为 HTML 报告
    error_cues = [
        "指标核算未完成声明",
        "本次尚未通过执行证据核验",
        "无法完成计算的原因",
        "未通过完整校验",
        "尚未完成您要求的各分组统计",
        "尚未完成您要求",
        "任务未完成最终交付",
        "收尾汇总时未输出",
        "上游模型未返回",
    ]
    if any(cue in final_text for cue in error_cues):
        return None, False

    # 5. 提取标题与目标文件名
    title = _infer_title(final_text)
    out_name = "presentation.html" if is_ppt_intent else "index.html"
    mentioned = re.findall(r'(?:/workspace/|workspace/|`)([a-zA-Z0-9_\-]+\.html)', final_text, re.I)
    for mn in mentioned:
        if mn.lower() not in ["presentation.html", "index.html"]:
            out_name = mn
            break

    out_path = materialize_html_from_content(title, final_text, workspace_dir, filename=out_name)
    return out_path, True


def _recent_report_source(history: List[Dict[str, Any]]) -> str:
    # 优先选取非方案规划的助手有效正文；若仅有方案规划且含实质结构化内容，作为保底来源
    planning_candidate = ""
    error_pattern = re.compile(
        r"(?:未生成可用文件|模型响应超时|上游模型未返回|文件已成功写入|收尾汇总时未输出|沙箱已成功调用工具|任务未完成最终交付|指标核算未完成声明|尚未通过执行证据核验|无法完成计算的原因|未通过完整校验)"
    )

    for item in reversed(history[-30:]):
        if not isinstance(item, dict) or item.get("role") != "assistant":
            continue
        content = str(item.get("content") or "").strip()
        if len(content) < 60:
            continue
        if error_pattern.search(content):
            continue
        if content.startswith("【方案规划】") or content.startswith("【规划阶段"):
            if not planning_candidate:
                cleaned_plan = re.sub(r"^【(?:方案规划|规划阶段)[^】]*】\s*", "", content).strip()
                if len(cleaned_plan) >= 60 and any(sym in cleaned_plan for sym in ["#", "-", "*", "|", ":", "："]):
                    planning_candidate = cleaned_plan[:24000]
            continue
        return content[:24000]

    return planning_candidate



def _infer_title(source: str) -> str:
    # 1. 优先提取明确的 Markdown 一/二级标题或加粗标题
    for line in source.splitlines():
        m_head = re.match(r"^#{1,3}\s+(.+)$", line.strip())
        if m_head:
            clean = re.sub(r"^[#*\s:：【】📄📊🎨]+|[*\s:：【】]+$", "", m_head.group(1)).strip()
            if 3 <= len(clean) <= 60:
                return clean
    for line in source.splitlines():
        m_bold = re.match(r"^\*\*(.+?)\*\*", line.strip())
        if m_bold:
            clean = re.sub(r"^[#*\s:：【】📄📊🎨]+|[*\s:：【】]+$", "", m_bold.group(1)).strip()
            if 3 <= len(clean) <= 60 and not clean.startswith("根据") and not clean.startswith("注"):
                return clean
    # 2. 兜底扫描首个非停用词的短行
    for line in source.splitlines():
        clean = re.sub(r"^[#*\s:：【】📄📊🎨]+|[*\s:：【】]+$", "", line).strip()
        if 4 <= len(clean) <= 80 and not any(clean.startswith(p) for p in ["文件", "该报告已", "根据", "你好", "以下是", "为您"]):
            return clean
    return "单页 HTML 报告"
