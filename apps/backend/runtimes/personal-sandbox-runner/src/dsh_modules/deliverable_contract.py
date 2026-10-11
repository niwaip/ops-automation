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
    return bool(prompt and MARKDOWN_REQUEST_RE.search(prompt))


def resolve_markdown_filename(prompt: str, candidate_text: str = "") -> str:
    """Resolves an explicit safe filename or derives a stable default from the request topic."""
    for source in (prompt or "", candidate_text or ""):
        match = MARKDOWN_FILE_RE.search(source)
        if match:
            return Path(match.group(1)).name

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

    # If the model already used write_markdown with a sensible custom filename, reuse that
    # current-turn artifact instead of creating a second default-named copy.
    has_explicit_filename = MARKDOWN_FILE_RE.search(prompt or "") is not None
    if not has_explicit_filename and turn_start_time is not None and workspace.exists():
        recent_markdown = sorted(
            (
                item
                for item in workspace.glob("*.md")
                if item.is_file()
                and item.stat().st_size > 0
                and item.stat().st_mtime >= turn_start_time - 2.0
            ),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        if recent_markdown:
            return str(recent_markdown[0]), False

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
    """
    Safely executes a Python script found in model output when a physical deliverable
    (.docx, .xlsx, .pdf) is expected and missing.
    Returns (created_file_path, error_message).
    """
    if not expected_deliverables:
        return None, None
    script = extract_python_script_block(reply_text)
    if not script:
        return None, None

    # 安全检查：禁止明显的破坏性指令
    danger_patterns = [r"\brm\s+-rf\b", r"\bos\.system\(", r"\bshutil\.rmtree\b", r"\bsubprocess\."]
    if any(re.search(p, script) for p in danger_patterns):
        return None, "安全拦截：脚本包含未授权的系统或文件删除指令"

    workspace = Path(workspace_dir)
    workspace.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", suffix=".py", encoding="utf-8", delete=False) as tmp_f:
        tmp_script_path = tmp_f.name
        tmp_f.write(script)

    try:
        proc = subprocess.run(
            [sys.executable, tmp_script_path],
            cwd=str(workspace),
            timeout=45,
            capture_output=True,
            text=True
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            return None, err[:500]

        # 检查是否生成了目标扩展名的物理产物
        norm_expected = [ext.lower() for ext in expected_deliverables]
        cutoff = (turn_start_time - 2.0) if turn_start_time is not None else 0.0

        candidates = []
        for f in workspace.iterdir():
            if f.is_file() and f.suffix.lower() in norm_expected and f.stat().st_size > 0:
                if f.stat().st_mtime >= cutoff:
                    candidates.append(f)

        if candidates:
            # 优先选择最新生成的产物
            candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
            return str(candidates[0]), None

        return None, "脚本执行成功但未在 /workspace/ 下生成目标文件"
    except subprocess.TimeoutExpired:
        return None, "脚本执行超时 (45s)"
    except Exception as e:
        return None, f"脚本执行异常: {e}"
    finally:
        try:
            Path(tmp_script_path).unlink(missing_ok=True)
        except Exception:
            pass


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

    # 1. 检查当前轮次是否已经生成了有效的目标 PDF 文件
    for f in workspace.glob("*.pdf"):
        if f.is_file() and f.stat().st_size > 50 and f.stat().st_mtime >= cutoff:
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

    # 3. 寻找当前轮次创建或更新的 Markdown 候选文件
    md_candidates = []
    for f in workspace.glob("*.md"):
        if f.is_file() and f.stat().st_size > 50 and f.stat().st_mtime >= cutoff:
            md_candidates.append(f)

    md_target = None
    if md_candidates:
        md_candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
        md_target = md_candidates[0]
    elif is_substantive_final_content(final_text):
        stem = resolve_markdown_filename(prompt, final_text).replace(".md", "")
        temp_md = workspace / f"{stem}.md"
        try:
            temp_md.write_text(unwrap_outer_markdown_fence(final_text), encoding="utf-8")
            md_target = temp_md
        except Exception:
            pass

    if not md_target or not md_target.exists():
        return None

    pdf_name = f"{md_target.stem}.pdf"
    target_pdf = workspace / pdf_name

    try:
        proc = subprocess.run(
            [sys.executable, str(script_path), "--input", str(md_target), "--output", str(target_pdf), "--theme", "blue"],
            cwd=str(workspace),
            timeout=30,
            capture_output=True,
            text=True
        )
        if proc.returncode == 0 and target_pdf.exists() and target_pdf.stat().st_size > 50:
            print(f"✨ [Harness Deliverable Compiler] 已通过内置脚本自动将 Markdown 编译为目标 PDF: {target_pdf}", flush=True)
            return str(target_pdf)
    except Exception as exc:
        print(f"⚠️ [Harness Deliverable Compiler] 编译 PDF 异常: {exc}", file=sys.stderr)

    return None

