"""Domain knowledge memory storage and retrieval.

Persists grounded business concept mappings (e.g., section mappings, template rules)
outside code in workspace memory so they can be loaded across turns and sessions.
"""
import copy
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Fallback in-memory cache when running without persistent workspace storage
_IN_MEMORY_STORE: Dict[str, Dict[str, Any]] = {}


def extract_template_name(file_name_or_path: Optional[str]) -> Optional[str]:
    """Extract a canonical template identifier by stripping date/version suffixes and extensions.

    Examples:
      - '工数3Q预实管理_1024.xlsx' -> '工数3Q预实管理'
      - '工数3Q预实管理_1023_14.xlsx' -> '工数3Q预实管理'
      - '工数3Q预实管理.xlsx' -> '工数3Q预实管理'
      - '财务损益表_202610.xlsx' -> '财务损益表'
    """
    if not file_name_or_path:
        return None
    stem = Path(file_name_or_path).stem
    # Strip trailing version/date patterns like _1024, _202610, _1024_14, _v2, etc.
    cleaned = re.sub(r'(_\d{3,8}|_\d{1,4}|_v\d+)+$', '', stem)
    return cleaned if cleaned else stem


def _get_memory_path(workspace: Optional[str] = None) -> Optional[Path]:
    ws = workspace or os.environ.get("WORKSPACE_DIR") or os.environ.get("WORKSPACE") or "/workspace"
    if not ws:
        return None
    try:
        p = Path(ws).resolve() / ".dsh" / "memory" / "domain_knowledge.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    except Exception:
        return None


def _load_raw_store(workspace: Optional[str] = None) -> Dict[str, Any]:
    p = _get_memory_path(workspace)
    if p and p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception as exc:
            logger.warning("Failed to read domain knowledge memory file: %s", exc)
    return copy.deepcopy(_IN_MEMORY_STORE)


def _save_raw_store(data: Dict[str, Any], workspace: Optional[str] = None) -> None:
    global _IN_MEMORY_STORE
    _IN_MEMORY_STORE = copy.deepcopy(data)
    p = _get_memory_path(workspace)
    if p:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to persist domain knowledge memory file: %s", exc)


def load_domain_knowledge(
    file_hash: Optional[str] = None,
    file_name: Optional[str] = None,
    template_name: Optional[str] = None,
    workspace: Optional[str] = None
) -> Dict[str, Any]:
    """Load domain knowledge for a specific workbook template or the general workspace.

    Priority Order:
      1. Template name derived from filename (e.g. '工数3Q预实管理' across months)
      2. Specific exact file_hash (if registered)
      3. General workspace fallback
    """
    store = _load_raw_store(workspace)
    general_knowledge = copy.deepcopy(store.get("general", {}))

    tpl_key = template_name or extract_template_name(file_name)
    templates = store.get("templates", {})

    merged = copy.deepcopy(general_knowledge)

    # Layer 1: Template-level knowledge (e.g. across different month editions of the same workbook)
    if tpl_key and tpl_key in templates:
        tpl_entry = copy.deepcopy(templates[tpl_key])
        for k, v in tpl_entry.items():
            if isinstance(v, dict) and k in merged and isinstance(merged[k], dict):
                merged[k].update(v)
            else:
                merged[k] = v

    # Layer 2: Exact file_hash-level knowledge
    if file_hash and file_hash in templates:
        hash_entry = copy.deepcopy(templates[file_hash])
        for k, v in hash_entry.items():
            if isinstance(v, dict) and k in merged and isinstance(merged[k], dict):
                merged[k].update(v)
            else:
                merged[k] = v

    return merged


def resolve_section_mapping(
    section_name: str,
    file_hash: Optional[str] = None,
    file_name: Optional[str] = None,
    template_name: Optional[str] = None,
    workspace: Optional[str] = None
) -> Optional[str]:
    """Resolve a business section name to an observed worksheet block title from domain memory.

    Returns target_title only if grounded in domain memory for this template/workspace.
    """
    if not section_name:
        return None
    knowledge = load_domain_knowledge(
        file_hash=file_hash,
        file_name=file_name,
        template_name=template_name,
        workspace=workspace
    )
    mappings = knowledge.get("section_mappings", {})
    entry = mappings.get(section_name)
    if isinstance(entry, dict):
        return entry.get("target_title")
    elif isinstance(entry, str):
        return entry
    return None


def save_section_mapping(
    section_name: str,
    target_title: str,
    file_hash: Optional[str] = None,
    file_name: Optional[str] = None,
    template_name: Optional[str] = None,
    quote: Optional[str] = None,
    workspace: Optional[str] = None
) -> None:
    """Save an approved section mapping grounded in user confirmation.

    Persists strictly scoped to:
      - template-level memory (e.g., '工数3Q预实管理' across months)
      - file_hash-level memory (if hash provided)
      - general workspace memory (only when completely untargeted)
    """
    store = _load_raw_store(workspace)
    entry = {
        "target_title": target_title,
        "source": "user_confirmation",
        "quote": quote or ""
    }
    tpl_key = template_name or extract_template_name(file_name)
    templates = store.setdefault("templates", {})

    if tpl_key:
        tpl_dict = templates.setdefault(tpl_key, {})
        tpl_mappings = tpl_dict.setdefault("section_mappings", {})
        tpl_mappings[section_name] = entry

    if file_hash:
        target_dict = templates.setdefault(file_hash, {})
        mappings = target_dict.setdefault("section_mappings", {})
        mappings[section_name] = entry

    if not tpl_key and not file_hash:
        gen_dict = store.setdefault("general", {})
        gen_mappings = gen_dict.setdefault("section_mappings", {})
        gen_mappings[section_name] = entry

    _save_raw_store(store, workspace)


def clear_domain_memory(workspace: Optional[str] = None) -> None:
    """Clear in-memory and persisted domain knowledge (for testing/reset)."""
    global _IN_MEMORY_STORE
    _IN_MEMORY_STORE = {}
    p = _get_memory_path(workspace)
    if p and p.exists():
        try:
            p.unlink()
        except Exception:
            pass
