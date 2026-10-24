"""
Unified delivery validation gate for spreadsheet update deliverables.
Connects receipt integrity, content hashes, and bypass mechanisms to prevent
invalid workbooks from exiting the sandbox while exempting verified updates from
harmful trailing recalculations.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import hashlib

from .contract import SpreadsheetUpdateReceipt
from ..workbook_delivery import inspect_generated_workbook

_VERIFIED_UPDATE_FILES: Dict[str, str] = {}  # file_path -> output_hash cache for current process


def register_verified_update(file_path: Union[str, Path], output_hash: str):
    """Registers a successfully published spreadsheet update in current process cache."""
    p_str = str(Path(file_path).resolve())
    _VERIFIED_UPDATE_FILES[p_str] = output_hash


def is_verified_update_file(file_path: Union[str, Path]) -> bool:
    """Checks if file is a verified update deliverable whose hash has not drifted."""
    p = Path(file_path).resolve()
    p_str = str(p)
    if p_str not in _VERIFIED_UPDATE_FILES:
        try:
            import json, os
            from ..config import WORKSPACE_DIR
            ws = os.environ.get("WORKSPACE_DIR") or WORKSPACE_DIR
            runs_dir = Path(ws) / ".dsh" / "spreadsheet-runs"
            if runs_dir.exists():
                for r_path in runs_dir.glob("*/receipt.json"):
                    r_data = json.loads(r_path.read_text(encoding="utf-8"))
                    out_p = r_data.get("output_path") or r_data.get("published_path")
                    if out_p and (Path(out_p).resolve() == p or Path(out_p).name == p.name):
                        _VERIFIED_UPDATE_FILES[p_str] = r_data.get("output_hash") or r_data.get("published_hash", "")
                        break
        except Exception:
            pass
    if p_str not in _VERIFIED_UPDATE_FILES:
        return False
    expected_hash = _VERIFIED_UPDATE_FILES[p_str]
    try:
        current_hash = hashlib.sha256(p.read_bytes()).hexdigest()
        return current_hash == expected_hash
    except Exception:
        return False


def validate_update_delivery(
    artifact_path: Union[str, Path],
    receipt: Optional[SpreadsheetUpdateReceipt] = None
) -> Tuple[bool, List[str]]:
    """
    Unified gate for spreadsheet deliverables across send_file, artifact discovery, and final answer.
    If receipt is present: validates cryptographic hash match and acceptable verdict.
    If file is known to be an update deliverable, hash drift is strictly fatal (NO fallback to legacy check).
    Only non-update plain spreadsheets fall back to inspect_generated_workbook.
    """
    p = Path(artifact_path).resolve()
    if not p.exists():
        return False, [f"Deliverable file {p} does not exist."]

    p_str = str(p)

    if receipt:
        # 1. Check receipt status
        if receipt.validation_verdict not in ("passed", "passed_with_warnings"):
            return False, [f"Update receipt verdict was '{receipt.validation_verdict}', not passed."]

        # 2. Check content hash match
        try:
            curr_bytes = p.read_bytes()
            curr_hash = hashlib.sha256(curr_bytes).hexdigest()
            if receipt.output_hash and curr_hash != receipt.output_hash:
                return False, [
                    f"Deliverable file hash drift detected! Expected {receipt.output_hash[:16]}, got {curr_hash[:16]}. "
                    f"Corrupted or modified updates strictly prohibited from delivery."
                ]
        except Exception as e:
            return False, [f"Failed to read file for delivery validation: {e}"]

        register_verified_update(p, curr_hash)
        return True, receipt.warnings

    # If file was registered as an update deliverable in current runtime
    if p_str in _VERIFIED_UPDATE_FILES:
        expected_hash = _VERIFIED_UPDATE_FILES[p_str]
        try:
            curr_hash = hashlib.sha256(p.read_bytes()).hexdigest()
            if curr_hash != expected_hash:
                return False, [
                    f"Security violation: Verified update file '{p.name}' was modified after validation! "
                    f"Hash drift ({expected_hash[:16]} -> {curr_hash[:16]}). Strictly prohibited from fallback."
                ]
            return True, []
        except Exception as e:
            return False, [f"Failed to verify update deliverable: {e}"]

    # Fallback ONLY for plain workbooks that were never registered as update deliverables
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        legacy_res = inspect_generated_workbook(p)
        return legacy_res.get("valid", False), legacy_res.get("issues", [])

    return True, []
