"""Sanitizes and repairs image links in agent outputs to prevent broken image renders."""
import logging
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.svg', '.webp'}


def _find_candidate_images(
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
    preferred_keyword: Optional[str] = None
) -> List[Path]:
    """Finds valid image files in workspace_dir, sorted by relevance and recency."""
    ws = Path(workspace_dir)
    if not ws.exists() or not ws.is_dir():
        return []

    min_mtime = (turn_start_time - 2.0) if turn_start_time is not None else 0.0
    candidates: List[Tuple[int, float, Path]] = []

    try:
        for entry in ws.iterdir():
            if not entry.is_file():
                continue
            name_lower = entry.name.lower()
            if name_lower.startswith(('~$', '.', 'tmp', 'temp')):
                continue
            if entry.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            try:
                stat = entry.stat()
                if stat.st_size <= 0:
                    continue
                score = 0
                if preferred_keyword:
                    kw_lower = preferred_keyword.lower()
                    if kw_lower in name_lower:
                        score += 10
                    # Common chart keywords
                    chart_kws = ["chart", "图表", "柱状图", "折线图", "饼图", "bar", "plot"]
                    if any(k in kw_lower for k in chart_kws) and any(k in name_lower for k in chart_kws):
                        score += 5
                if stat.st_mtime >= min_mtime:
                    score += 5
                candidates.append((score, stat.st_mtime, entry))
            except OSError:
                continue
    except Exception as e:
        logger.debug("Error listing candidate images: %s", e)

    # Sort descending by score, then by mtime
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [c[2] for c in candidates]


def sanitize_and_repair_markdown_images(
    text: str,
    workspace_dir: str,
    turn_start_time: Optional[float] = None
) -> str:
    """Repairs or removes invalid/broken image links in markdown.

    Handles:
    1. Fabricated 'blob:' URLs (e.g. ![柱状图](blob:https://...))
    2. Relative workspace image links (e.g. ![图表](dept_chart.png) -> ![图表](/workspace/dept_chart.png))
    3. Missing file links (if a real image exists in workspace, bind it; otherwise remove the broken tag)
    4. HTML <img src="..."> tags with broken/blob sources
    """
    if not text:
        return text

    ws = Path(workspace_dir)

    def _resolve_image(alt: str, url: str) -> Optional[str]:
        trimmed = url.strip()
        # 1. Base64 data URL: keep
        if trimmed.startswith('data:image/'):
            return trimmed

        # 2. External HTTP/HTTPS URL (not blob): keep
        if (trimmed.startswith('http://') or trimmed.startswith('https://')) and not trimmed.startswith('blob:'):
            return trimmed

        # 3. Check if target exists on disk in workspace
        clean_name = Path(trimmed.split('?')[0].split('#')[0]).name
        if clean_name:
            target_path = ws / clean_name
            if target_path.is_file() and target_path.stat().st_size > 0:
                return f"/workspace/{clean_name}"

        # 4. If broken (e.g. blob: or non-existent file), attempt repair with workspace candidate
        candidates = _find_candidate_images(workspace_dir, turn_start_time, preferred_keyword=alt)
        if candidates:
            best_candidate = candidates[0]
            logger.info("Repaired broken image link '%s' -> '/workspace/%s'", url, best_candidate.name)
            return f"/workspace/{best_candidate.name}"

        # 5. No candidate exists: remove broken reference
        logger.warning("Stripped broken image link '%s' (no valid image file in workspace)", url)
        return None

    # Replace markdown image links: ![alt](url)
    def _md_replacer(match: re.Match) -> str:
        alt = match.group(1).strip()
        url = match.group(2).strip()
        resolved = _resolve_image(alt, url)
        if resolved is not None:
            return f"![{alt}]({resolved})"
        return ""

    result = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _md_replacer, text)

    # Replace HTML <img> tags: <img ... src="..." ...>
    def _html_replacer(match: re.Match) -> str:
        tag_str = match.group(0)
        src_match = re.search(r'src=["\']([^"\']+)["\']', tag_str)
        alt_match = re.search(r'alt=["\']([^"\']+)["\']', tag_str)
        alt = alt_match.group(1).strip() if alt_match else ""
        url = src_match.group(1).strip() if src_match else ""
        if not url:
            return ""
        resolved = _resolve_image(alt, url)
        if resolved is not None:
            return re.sub(r'src=["\'][^"\']+["\']', f'src="{resolved}"', tag_str)
        return ""

    result = re.sub(r'<img\s+[^>]*src=["\'][^"\']+["\'][^>]*>', _html_replacer, result)

    # Clean up empty orphan headings or intro lines left by removed images
    # e.g. "柱状图已根据以下真实数据生成：\n\n\n" with nothing following
    orphan_patterns = [
        r'(?:^|\n)(?:#{1,4}\s*[^#\n]*(?:图|预览|看板)[^\n]*\n+)?(?:[^\n]*(?:已生成|预览如下|如下图所示|已根据以下真实数据生成)[^\n]*:?\s*\n+)(?=\n|#|\Z)',
    ]
    # Only clean up orphan intro text if it's immediately before empty lines or end of text
    for op in orphan_patterns:
        result = re.sub(op, '\n', result)

    # Collapse multiple blank lines
    result = re.sub(r'\n{3,}', '\n\n', result)

    return result
