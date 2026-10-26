"""Artifact discovery and physical deliverable verification for sandbox executions."""
import logging
import os
from pathlib import Path
from typing import List, Optional, Set, Dict, Any

from .tool_result import ToolResult

logger = logging.getLogger(__name__)


def is_valid_regular_file(path: Path) -> bool:
    """Returns True if the path exists, is a regular file, and has positive size."""
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def discover_physical_artifacts(
    workspace_dir: str,
    expected_deliverables: Optional[List[str]] = None,
    turn_start_time: Optional[float] = None,
    input_attachments: Optional[List[str]] = None,
) -> List[Path]:
    """Discovers verified, non-empty physical deliverable files in workspace_dir.

    Verification guarantees:
    - Must be a regular file (is_file) and not a directory or symlink loop
    - Must have positive size (st_size > 0)
    - Excludes lock/temp/hidden files (~$*, .*, tmp*, temp*)
    - Excludes files that were uploaded as input attachments
    - Checks modification time against turn_start_time if provided
    - Extension matching is case-insensitive (e.g. .PDF matches .pdf)
    """
    ws = Path(workspace_dir)
    if not ws.exists() or not ws.is_dir():
        return []

    input_names = {Path(att).name.lower() for att in (input_attachments or [])}
    expected_exts = {
        ext.lower() if ext.startswith('.') else f'.{ext.lower()}'
        for ext in (expected_deliverables or [])
    }

    min_mtime = (turn_start_time - 2.0) if turn_start_time is not None else 0.0

    valid_artifacts: List[Path] = []
    try:
        for entry in ws.iterdir():
            if not entry.is_file():
                continue
            name_lower = entry.name.lower()
            if name_lower.startswith(('~$', '.', 'tmp', 'temp')):
                continue
            if name_lower in input_names:
                continue
            try:
                stat = entry.stat()
                if stat.st_size <= 0:
                    continue
                if turn_start_time is not None and stat.st_mtime < min_mtime:
                    continue
            except OSError:
                continue

            if expected_exts:
                if entry.suffix.lower() in expected_exts:
                    valid_artifacts.append(entry)
            else:
                valid_artifacts.append(entry)
    except Exception as e:
        logger.debug("Error discovering physical artifacts: %s", e)

    return valid_artifacts


def has_all_expected_artifacts(
    artifacts: List[Path],
    expected_deliverables: Optional[List[str]]
) -> bool:
    """Returns True if every expected deliverable extension has at least one valid artifact."""
    if not expected_deliverables:
        return bool(artifacts)
    expected_exts = {
        ext.lower() if ext.startswith('.') else f'.{ext.lower()}'
        for ext in expected_deliverables
    }
    found_exts = {a.suffix.lower() for a in artifacts}
    return expected_exts.issubset(found_exts)


def has_verified_published_receipt(
    execution_evidence: Optional[List[ToolResult]],
    workspace_dir: str
) -> bool:
    """Checks if execution evidence contains an explicit, successful published receipt
    whose published_file exists on disk and is non-empty.
    """
    if not execution_evidence:
        return False
    ws = Path(workspace_dir)
    for ev in execution_evidence:
        if not getattr(ev, 'is_success', False):
            continue
        data = getattr(ev, 'data', None)
        if isinstance(data, dict):
            status = data.get('status')
            pub_file = data.get('published_file')
            if status == 'published' and pub_file:
                target = Path(pub_file)
                if not target.is_absolute():
                    target = ws / target
                if is_valid_regular_file(target):
                    return True
    return False
