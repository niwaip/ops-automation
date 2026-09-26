"""Deterministic contracts for Markdown file deliverables."""

import json
import re
from pathlib import Path
from typing import Optional, Tuple

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
    """Removes one fence when the entire response is a Markdown document code block."""
    cleaned = (text or "").strip()
    match = re.fullmatch(
        r"```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*",
        cleaned,
        re.I,
    )
    return match.group(1).strip() if match else cleaned


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
    if re.match(r"^write_markdown\s*\(", cleaned, re.I):
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
    if not re.fullmatch(r"[a-zA-Z0-9_\-\u4e00-\u9fa5]+\.md", clean_name, re.I):
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
