"""Deterministic contracts for Markdown file deliverables."""

import json
import re
import sys
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List

from .action_protocol import is_internal_plan_output
from .telemetry import format_dsh_marker


MARKDOWN_REQUEST_RE = re.compile(
    r"(?:\.md\b|\bmarkdown\b|(?:输出|生成|创建|导出|保存|写入|制作|做成)[^，。\n]{0,16}\bmd\b|"
    r"(?:md|markdown)\s*(?:格式)?\s*文件)",
    re.I,
)
MARKDOWN_FILE_RE = re.compile(
    r"(?:/workspace/|workspace/)?([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.md)\b",
    re.I,
)
QUOTED_MARKDOWN_RE = re.compile(
    r"[\"“'‘`「](?:/workspace/|workspace/)?([^\"”'’`」\n\r]+\.md)[\"”'’`」]",
    re.I,
)
MARKDOWN_ACTION_PREFIX_RE = re.compile(
    r"^(?:(?:请|帮我|为我|麻烦|务必)?(?:生成|创建|输出|制作|导出|保存|写入|做成|提供|整理)(?:为|成)?(?:一个|一份|可下载(?:的)?|的)?|"
    r"(?:可下载(?:的)?|一份|一个|名称为|名为|叫)+|的)+",
    re.I,
)


def clean_markdown_filename(name: str) -> str:
    """Strips natural language action/verb prefixes and quoting punctuation from candidate markdown filenames."""
    cleaned = Path(str(name or "")).name.strip(" \t\n\r`\"'“”‘’「」")
    if not cleaned:
        return ""
    ext = ".md" if cleaned.lower().endswith(".md") else ""
    base = cleaned[:-len(ext)] if ext else cleaned
    prefix_match = MARKDOWN_ACTION_PREFIX_RE.match(base)
    if prefix_match:
        stripped_base = base[prefix_match.end():].strip("-_./\\ \t\"'“”‘’「」")
        if stripped_base:
            base = stripped_base
    base = base.strip("-_./\\ \t\"'“”‘’「」")
    return f"{base}{ext}"



def unwrap_outer_markdown_fence(text: str) -> str:
    """Removes one fence when the response contains a Markdown document code block."""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    # 彻底杜绝任何偶发协议标记残片
    cleaned = re.sub(r"^len=\d+:\s*", "", cleaned).strip()

    # 1. 完整包裹的代码块（首尾无其他多余文本）
    match = re.fullmatch(
        r"```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*",
        cleaned,
        re.I,
    )
    if match:
        return match.group(1).strip()

    # 2. 带有前后过渡引导语或后置说明的代码块
    m_block = re.search(r"```(?:markdown|md)\s*\n([\s\S]*?)\n```", cleaned, re.I)
    if m_block:
        pre = cleaned[:m_block.start()].strip()
        body = m_block.group(1).strip()
        post = cleaned[m_block.end():].strip()
        parts = [p for p in (pre, body, post) if p]
        return "\n\n".join(parts)

    # 3. 因 Token 上限截断未闭合的代码块
    m_unclosed = re.search(r"```(?:markdown|md)\s*\n([\s\S]*)$", cleaned, re.I)
    if m_unclosed:
        pre = cleaned[:m_unclosed.start()].strip()
        body = m_unclosed.group(1).strip()
        parts = [p for p in (pre, body) if p]
        return "\n\n".join(parts)

    return cleaned


def requests_markdown_artifact(prompt: str) -> bool:
    if not prompt:
        return False
    from .skill_router import is_text_only_request, is_term_negated
    if is_text_only_request(prompt):
        return False
    if is_term_negated(prompt, "md") or is_term_negated(prompt, "markdown") or is_term_negated(prompt, "文件"):
        return False
    # If the prompt merely specifies markdown format/table in chat without requesting a physical file
    is_pure_formatting = (
        re.search(r'(?:markdown|md)\s*(?:格式|表格|对比|排版|语法|样式)', prompt, re.I)
        and not re.search(r'(?:\.md\b|md\s*文件|markdown\s*文件|写入\s*md|生成\s*md|导出\s*md|可下载|下载)', prompt, re.I)
    )
    if is_pure_formatting:
        return False
    return bool(MARKDOWN_REQUEST_RE.search(prompt))


def resolve_markdown_filename(prompt: str, candidate_text: str = "") -> str:
    """Resolves an explicit safe filename or derives a stable default from the request topic."""
    for source in (prompt or "", candidate_text or ""):
        q_match = QUOTED_MARKDOWN_RE.search(source)
        if q_match:
            candidate = clean_markdown_filename(Path(q_match.group(1)).name)
            if candidate and candidate.lower().endswith(".md") and candidate != ".md":
                return candidate

    for source in (prompt or "", candidate_text or ""):
        match = MARKDOWN_FILE_RE.search(source)
        if match:
            candidate = clean_markdown_filename(Path(match.group(1)).name)
            if candidate and candidate.lower().endswith(".md") and candidate != ".md":
                return candidate

    lower = (prompt or "").lower()
    parts = []
    if any(token in lower for token in ("最新", "近期", "latest", "recent")):
        parts.append("latest")
    if re.search(r"\bai\b|人工智能", lower, re.I):
        parts.append("ai")
    if any(token in lower for token in ("新闻", "资讯", "动态", "news")):
        parts.append("news")
    if parts:
        return "_".join(dict.fromkeys(parts)) + ".md"
    return "result.md"


def is_substantive_final_content(text: str) -> bool:
    """Rejects planning traces and diagnostic/failure text as artifact body content."""
    cleaned = (text or "").strip()
    if len(cleaned) < 120 or is_internal_plan_output(cleaned):
        return False
    if re.match(r"^(?:write_markdown|create_reminders)\s*\(", cleaned, re.I):
        return False
    if cleaned.startswith("⚠️") or cleaned.startswith("❌"):
        return False
    failure_markers = (
        "未返回有效回复",
        "模型连接中断",
        "执行超时",
        "无法完成",
        "建议重新发送",
    )
    return not any(marker in cleaned for marker in failure_markers)


def write_markdown_artifact(workspace_dir: str, file_path: str, content: str) -> str:
    """Writes a Markdown artifact inside the workspace and returns an outbound-file marker."""
    clean_name = Path(str(file_path or "result.md")).name
    if not clean_name.lower().endswith(".md"):
        raise ValueError("write_markdown only accepts .md files")
    if not re.fullmatch(r"[a-zA-Z0-9_\-\.\u4e00-\u9fa5]+\.md", clean_name, re.I):
        raise ValueError("invalid Markdown file name")
    body = unwrap_outer_markdown_fence(str(content or ""))
    if not body:
        raise ValueError("Markdown content must not be empty")

    workspace = Path(workspace_dir)
    workspace.mkdir(parents=True, exist_ok=True)
    target = workspace / clean_name
    target.write_text(body.rstrip() + "\n", encoding="utf-8")
    payload = json.dumps(
        {"filePath": str(target), "fileName": target.name},
        ensure_ascii=False,
    )
    return format_dsh_marker("OUTBOUND_FILE", payload)


def materialize_requested_markdown(
    prompt: str,
    final_text: str,
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
) -> Tuple[Optional[str], bool]:
    """
    Materializes a requested Markdown deliverable from a substantive final response.

    Returns (absolute_path, created_now). Existing non-empty files from the current turn are reused.
    """
    if not requests_markdown_artifact(prompt) or not is_substantive_final_content(final_text):
        return None, False

    filename = resolve_markdown_filename(prompt, final_text)
    workspace = Path(workspace_dir)
    target = workspace / filename
    if target.exists() and target.is_file() and target.stat().st_size > 0:
        if turn_start_time is None or target.stat().st_mtime >= turn_start_time - 2.0:
            return str(target), False

    # Check if existing current-turn file matches (by filename, cleaned name, or fallback if unspecific)
    if turn_start_time is not None and workspace.exists():
        cutoff = turn_start_time - 2.0
        recent_markdowns = [
            item
            for item in workspace.glob("*.md")
            if item.is_file()
            and item.stat().st_size > 0
            and item.stat().st_mtime >= cutoff
        ]
        # Check if any recent file matches the target filename (case-insensitive or after cleaning)
        for item in recent_markdowns:
            if item.name.lower() == filename.lower() or clean_markdown_filename(item.name).lower() == filename.lower():
                return str(item), False

        # If the model already used write_markdown with a sensible custom filename, reuse that
        # current-turn artifact instead of creating a second default-named copy.
        has_explicit_filename = (
            QUOTED_MARKDOWN_RE.search(prompt or "") is not None
            or MARKDOWN_FILE_RE.search(prompt or "") is not None
        )
        if not has_explicit_filename and recent_markdowns:
            recent_markdowns.sort(key=lambda item: item.stat().st_mtime, reverse=True)
            return str(recent_markdowns[0]), False

    marker = write_markdown_artifact(workspace_dir, filename, final_text)
    if not marker:
        return None, False
    return str(target), True


def extract_python_script_block(text: str) -> Optional[str]:
    """Extracts candidate python script block from model output."""
    if not text:
        return None
    matches = re.findall(r'```(?:python|py)\s*\n([\s\S]*?)```', text, re.I)
    for block in matches:
        b_str = block.strip()
        has_save = any(k in b_str for k in [".save(", ".output(", "to_excel(", "to_csv("])
        has_lib = any(mod in b_str for mod in ["docx", "openpyxl", "xlsxwriter", "fpdf", "reportlab", "pandas"])
        if has_save and has_lib and len(b_str.splitlines()) >= 3:
            return b_str
    return None


def materialize_script_deliverable(
    reply_text: str,
    workspace_dir: str,
    expected_deliverables: Optional[List[str]] = None,
    turn_start_time: Optional[float] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return execution feedback; a prose code block is never an invocation."""
    if not expected_deliverables or not extract_python_script_block(reply_text):
        return None, None
    return None, (
        "检测到尚未执行的Python脚本。正文代码不会自动运行，也没有生成交付物；"
        "请通过Function Calling显式调用当前可用的执行工具完成写盘。"
    )


def is_code_or_script_content(text: str) -> bool:
    """Detects if content is executable script/code rather than document text."""
    if not text:
        return False
    from .llm import detect_unexecuted_script_leak
    if detect_unexecuted_script_leak(text):
        return True
    if extract_python_script_block(text):
        return True
    cleaned = unwrap_outer_markdown_fence(text).strip()
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return False
    script_starters = ("import ", "from ", "def ", "class ", "subprocess.", "print(", "#!/")
    if any(lines[0].startswith(st) for st in script_starters):
        code_lines = sum(1 for line in lines[:10] if any(line.startswith(st) for st in script_starters))
        if code_lines >= 2:
            return True
    return False


def resolve_pdf_filename(prompt: str, fallback_stem: str = "result") -> str:
    """Resolves an explicit safe PDF filename from the prompt or derives a stable default."""
    if prompt:
        m_explicit = re.search(
            r'(?:文件名|名为|命名为|保存为|输出为|生成为)\s*[:：=]?\s*[\'"`]?([a-zA-Z0-9_\-\.\u4e00-\u9fa5]+\.pdf)[\'"`]?',
            prompt, re.I
        )
        if m_explicit:
            cand = Path(m_explicit.group(1)).name
            if cand.lower().endswith(".pdf") and cand != ".pdf":
                return cand

        m_pdf = re.search(r'[\'"`]?([a-zA-Z0-9_\-\.\u4e00-\u9fa5]+\.pdf)[\'"`]?', prompt, re.I)
        if m_pdf:
            cand = Path(m_pdf.group(1)).name
            if cand.lower().endswith(".pdf") and cand != ".pdf" and not cand.lower().startswith("result"):
                return cand

        m_title = re.search(r'《([^》\r\n]{2,30})》', prompt)
        if m_title:
            cand_stem = re.sub(r'[\\/*?:"<>|]', '_', m_title.group(1).strip())
            if cand_stem:
                return f"{cand_stem}.pdf"

    clean_fallback = Path(fallback_stem).stem if fallback_stem else "result"
    return f"{clean_fallback}.pdf"


def resolve_pdf_template(prompt: str) -> str:
    """Resolves target template from prompt: handout, editorial, mobile, or report."""
    p_lower = (prompt or "").lower()
    if any(k in p_lower for k in ["handout", "讲义", "手册"]):
        return "handout"
    if any(k in p_lower for k in ["editorial", "长文"]):
        return "editorial"
    if any(k in p_lower for k in ["mobile", "手机"]):
        return "mobile"
    return "report"


def resolve_pdf_theme(prompt: str) -> str:
    """Resolves target theme from prompt: warm, emerald, slate, burgundy, or blue."""
    p_lower = (prompt or "").lower()
    if any(k in p_lower for k in ["warm", "暖色", "橙色", "棕色"]):
        return "warm"
    if any(k in p_lower for k in ["emerald", "绿色", "薄荷"]):
        return "emerald"
    if any(k in p_lower for k in ["slate", "灰色", "灰色调"]):
        return "slate"
    if any(k in p_lower for k in ["burgundy", "酒红", "红色"]):
        return "burgundy"
    return "blue"


def resolve_pdf_page_bounds(prompt: str) -> Tuple[Optional[int], Optional[int]]:
    """Resolves min_pages and max_pages from prompt if specified."""
    if not prompt:
        return None, None
    m_range = re.search(r'(\d+)\s*(?:到|-|至)\s*(\d+)\s*页', prompt)
    if m_range:
        try:
            return int(m_range.group(1)), int(m_range.group(2))
        except (ValueError, TypeError):
            pass
    m_exact = re.search(r'共\s*(\d+)\s*页', prompt)
    if m_exact:
        try:
            p = int(m_exact.group(1))
            return p, p
        except (ValueError, TypeError):
            pass
    return None, None


def resolve_pdf_cover(prompt: str) -> bool:
    """Detects whether cover is explicitly requested or explicitly excluded."""
    if not prompt:
        return False
    if re.search(r'(?:不要|无需|不用|避免|无)\s*(?:独立)?\s*封面', prompt):
        return False
    return bool(re.search(r'(?:带|加|有|需要|包含)\s*(?:独立)?\s*封面', prompt))


def materialize_pdf_from_markdown(
    prompt: str,
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
    expected_deliverables: Optional[List[str]] = None,
    final_text: str = "",
) -> Optional[str]:
    """
    When a PDF deliverable is requested/expected, automatically compiles an existing
    or freshly created Markdown file (or substantive text in final_text) into a PDF
    using the built-in generate_report_pdf.py script.
    """
    has_pdf_intent = (
        (expected_deliverables and any(ext.lower() == ".pdf" for ext in expected_deliverables))
        or bool(re.search(r"(?:生成|导出|制作|转为|转成|做成)[^，。\n]{0,8}pdf", prompt or "", re.I))
        or "pdf" in (prompt or "").lower()
    )
    if not has_pdf_intent:
        return None

    workspace = Path(workspace_dir)
    if not workspace.exists():
        return None

    cutoff = (turn_start_time - 2.0) if turn_start_time is not None else 0.0

    target_pdf_name = resolve_pdf_filename(prompt)
    preferred_pdf = workspace / target_pdf_name

    # 1. 检查当前轮次是否已经生成了有效的目标 PDF 文件
    if preferred_pdf.is_file() and preferred_pdf.stat().st_size > 50 and preferred_pdf.stat().st_mtime >= cutoff:
        return str(preferred_pdf)

    for f in workspace.glob("*.pdf"):
        if f.is_file() and f.stat().st_size > 50 and f.stat().st_mtime >= cutoff:
            if ".pdf-preview" not in str(f):
                return str(f)

    # 2. 寻找生成报告使用的 generate_report_pdf.py 脚本
    candidate_scripts = [
        Path("/opt/dsh/skills/pdf/scripts/generate_report_pdf.py"),
        Path(__file__).resolve().parent.parent.parent / "skills" / "pdf" / "scripts" / "generate_report_pdf.py",
        workspace.parent / "data" / "shared" / "dsh-skills" / "pdf" / "scripts" / "generate_report_pdf.py",
    ]
    script_path = None
    for s in candidate_scripts:
        if s.exists() and s.is_file():
            script_path = s
            break
    if not script_path:
        return None

    # 3. 寻找当前轮次创建或更新的 Markdown 候选文件（必须是实质文档，严禁代码脚本）
    md_candidates = []
    for f in workspace.glob("*.md"):
        if f.is_file() and f.stat().st_size > 50 and f.stat().st_mtime >= cutoff:
            try:
                content = f.read_text(encoding="utf-8", errors="ignore")
                if not is_code_or_script_content(content):
                    md_candidates.append(f)
            except Exception:
                pass

    md_target = None
    if md_candidates:
        md_candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
        md_target = md_candidates[0]
    elif is_substantive_final_content(final_text) and not is_code_or_script_content(final_text):
        stem = target_pdf_name.replace(".pdf", "")
        temp_md = workspace / f"{stem}.md"
        try:
            temp_md.write_text(unwrap_outer_markdown_fence(final_text), encoding="utf-8")
            md_target = temp_md
        except Exception:
            pass

    if not md_target or not md_target.exists():
        return None

    target_pdf = workspace / resolve_pdf_filename(prompt, md_target.stem)

    template = resolve_pdf_template(prompt)
    theme = resolve_pdf_theme(prompt)
    min_pages, max_pages = resolve_pdf_page_bounds(prompt)
    want_cover = resolve_pdf_cover(prompt)

    m_title = re.search(r'《([^》\r\n]{2,30})》', prompt or "")
    doc_title = m_title.group(1).strip() if m_title else None
    m_sub = re.search(r'副标题(?:为|是)?[：:\s]*[“"]?([^”"\n]+)[”"]?', prompt or "")
    doc_subtitle = m_sub.group(1).strip() if m_sub else None
    m_auth = re.search(r'署名(?:为|是)?[：:\s]*[“"]?([^”"\n]+)[”"]?', prompt or "")
    doc_author = m_auth.group(1).strip() if m_auth else None

    cmd = [
        sys.executable, str(script_path),
        "--input", str(md_target),
        "--output", str(target_pdf),
        "--template", template,
        "--theme", theme,
    ]
    if doc_title:
        cmd.extend(["--title", doc_title])
    if doc_subtitle:
        cmd.extend(["--subtitle", doc_subtitle])
    if doc_author:
        cmd.extend(["--author", doc_author])
    if want_cover:
        cmd.append("--cover")
    if min_pages is not None:
        cmd.extend(["--min-pages", str(min_pages)])
    if max_pages is not None:
        cmd.extend(["--max-pages", str(max_pages)])

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workspace),
            timeout=30,
            capture_output=True,
            text=True
        )
        if proc.returncode == 0 and target_pdf.exists() and target_pdf.stat().st_size > 50:
            print(f"✨ [Harness Deliverable Compiler] 已通过内置脚本自动将 Markdown 编译为目标 PDF: {target_pdf}", flush=True)
            return str(target_pdf)
        # 若因严格页数校验导致编译失败，降级为不带页数边界再试一次，确保物理产物保全
        if (min_pages is not None or max_pages is not None) and proc.returncode != 0:
            relaxed_cmd = [
                sys.executable, str(script_path),
                "--input", str(md_target),
                "--output", str(target_pdf),
                "--template", template,
                "--theme", theme,
            ]
            if doc_title:
                relaxed_cmd.extend(["--title", doc_title])
            if doc_subtitle:
                relaxed_cmd.extend(["--subtitle", doc_subtitle])
            if doc_author:
                relaxed_cmd.extend(["--author", doc_author])
            if want_cover:
                relaxed_cmd.append("--cover")
            proc_relaxed = subprocess.run(
                relaxed_cmd,
                cwd=str(workspace),
                timeout=30,
                capture_output=True,
                text=True
            )
            if proc_relaxed.returncode == 0 and target_pdf.exists() and target_pdf.stat().st_size > 50:
                print(f"✨ [Harness Deliverable Compiler] 降级放宽页数限制后成功编译目标 PDF: {target_pdf}", flush=True)
                return str(target_pdf)
    except Exception as exc:
        print(f"⚠️ [Harness Deliverable Compiler] 编译 PDF 异常: {exc}", file=sys.stderr)

    return None


def materialize_config_or_code_deliverable(
    prompt: str,
    final_text: str,
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
) -> List[str]:
    """
    Extracts and materializes technical script or configuration deliverables (e.g. Dockerfile,
    docker-compose.yml, *.sh, *.sql, *.py) from model response when requested by user prompt.
    Returns list of absolute file paths created or detected.
    """
    from .skill_router import is_text_only_request, is_term_negated

    if not prompt or not final_text or is_text_only_request(prompt):
        return []

    # Quick pre-filter: only proceed if prompt contains technical keywords
    wants_any_tech = bool(
        re.search(r'(?:dockerfile|docker-compose|脚本|\.sh\b|\.py\b|\.sql\b)', prompt, re.I)
    )
    if not wants_any_tech:
        return []

    workspace = Path(workspace_dir)
    cutoff = (turn_start_time - 2.0) if turn_start_time is not None else 0.0
    materialized = []

    def _safe_write(target_path: Path, text: str, is_exec: bool = False) -> bool:
        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(text, encoding="utf-8")
            if is_exec:
                try:
                    target_path.chmod(0o755)
                except Exception:
                    pass
            return True
        except (OSError, IOError) as exc:
            print(f"⚠️ [Harness Deliverable Materializer] 写入文件失败 ({target_path}): {exc}")
            return False

    # 1. Dockerfile
    if not is_term_negated(prompt, "dockerfile"):
        wants_dockerfile = bool(re.search(r'\bdockerfile\b', prompt, re.I))
        if wants_dockerfile:
            target = workspace / "Dockerfile"
            try:
                if target.exists() and target.is_file() and target.stat().st_size > 0 and target.stat().st_mtime >= cutoff:
                    materialized.append(str(target))
                else:
                    df_match = re.search(r'```(?:dockerfile|docker)\s*\n([\s\S]*?)```', final_text, re.I)
                    if not df_match:
                        df_match = re.search(r'```(?:[a-zA-Z0-9_\-]*)\s*\n(FROM\s+[\s\S]*?)```', final_text)
                    if df_match:
                        content = df_match.group(1).strip()
                        if "FROM " in content and _safe_write(target, content + "\n"):
                            materialized.append(str(target))
                            print(f"✨ [Harness Deliverable Materializer] 成功从正文提取并落盘 Dockerfile: {target}", flush=True)
            except (OSError, IOError):
                pass

    # 2. docker-compose.yml
    if not is_term_negated(prompt, "docker-compose"):
        wants_compose = bool(re.search(r'\bdocker-compose(?:\.ya?ml)?\b', prompt, re.I))
        if wants_compose:
            target = workspace / "docker-compose.yml"
            try:
                if target.exists() and target.is_file() and target.stat().st_size > 0 and target.stat().st_mtime >= cutoff:
                    materialized.append(str(target))
                else:
                    compose_matches = re.findall(r'```(?:ya?ml)\s*\n([\s\S]*?)```', final_text, re.I)
                    for compose_code in compose_matches:
                        content = compose_code.strip()
                        if ("services:" in content or "version:" in content) and len(content.splitlines()) >= 3:
                            if _safe_write(target, content + "\n"):
                                materialized.append(str(target))
                                print(f"✨ [Harness Deliverable Materializer] 成功从正文提取并落盘 docker-compose.yml: {target}", flush=True)
                            break
            except (OSError, IOError):
                pass

    # 3. Named / Requested Shell Script (*.sh)
    if not is_term_negated(prompt, "脚本") and not is_term_negated(prompt, ".sh") and not is_term_negated(prompt, "bash"):
        sh_names = re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.sh)[\"”\'’`」]?', prompt, re.I)
        wants_sh = bool(sh_names or re.search(r'(?:bash|shell|运维)\s*脚本|\b\.sh\b', prompt, re.I))
        if wants_sh:
            target_sh_name = sh_names[0] if sh_names else "script.sh"
            target = workspace / target_sh_name
            try:
                if target.exists() and target.is_file() and target.stat().st_size > 0 and target.stat().st_mtime >= cutoff:
                    materialized.append(str(target))
                else:
                    sh_match = re.search(r'```(?:bash|sh|shell)\s*\n([\s\S]*?)```', final_text, re.I)
                    if sh_match:
                        content = sh_match.group(1).strip()
                        if len(content.splitlines()) >= 2 and _safe_write(target, content + "\n", is_exec=True):
                            materialized.append(str(target))
                            print(f"✨ [Harness Deliverable Materializer] 成功从正文提取并落盘 Shell 脚本: {target}", flush=True)
            except (OSError, IOError):
                pass

    # 4. Named / Requested Python Script (*.py)
    if not is_term_negated(prompt, "python") and not is_term_negated(prompt, ".py"):
        py_names = re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.py)[\"”\'’`」]?', prompt, re.I)
        wants_py = bool(py_names or re.search(r'python(?:\s*3)?\s*(?:自动化|清洗|处理|巡检)?\s*脚本', prompt, re.I))
        if wants_py:
            target_py_name = py_names[0] if py_names else "script.py"
            target = workspace / target_py_name
            try:
                if target.exists() and target.is_file() and target.stat().st_size > 0 and target.stat().st_mtime >= cutoff:
                    materialized.append(str(target))
                else:
                    py_matches = re.findall(r'```(?:python|py)\s*\n([\s\S]*?)```', final_text, re.I)
                    for py_code in py_matches:
                        c_str = py_code.strip()
                        if any(lib in c_str for lib in ["docx", "fpdf", "openpyxl", "reportlab"]):
                            continue
                        if len(c_str.splitlines()) >= 3 and _safe_write(target, c_str + "\n"):
                            materialized.append(str(target))
                            print(f"✨ [Harness Deliverable Materializer] 成功从正文提取并落盘 Python 脚本: {target}", flush=True)
                            break
            except (OSError, IOError):
                pass

    # 5. Named / Requested SQL Script (*.sql)
    if not is_term_negated(prompt, "sql"):
        sql_names = re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.sql)[\"”\'’`」]?', prompt, re.I)
        wants_sql = bool(sql_names or re.search(r'sql\s*脚本', prompt, re.I))
        if wants_sql:
            target_sql_name = sql_names[0] if sql_names else "query.sql"
            target = workspace / target_sql_name
            try:
                if target.exists() and target.is_file() and target.stat().st_size > 0 and target.stat().st_mtime >= cutoff:
                    materialized.append(str(target))
                else:
                    sql_match = re.search(r'```sql\s*\n([\s\S]*?)```', final_text, re.I)
                    if sql_match:
                        content = sql_match.group(1).strip()
                        if len(content.splitlines()) >= 2 and _safe_write(target, content + "\n"):
                            materialized.append(str(target))
                            print(f"✨ [Harness Deliverable Materializer] 成功从正文提取并落盘 SQL 脚本: {target}", flush=True)
            except (OSError, IOError):
                pass

    return list(dict.fromkeys(materialized))

