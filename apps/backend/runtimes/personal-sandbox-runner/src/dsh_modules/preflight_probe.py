"""
Pre-flight attachment probing and physical evidence extraction.
Runs deterministically (<50ms) before any LLM invocations, discovering
spreadsheet headers, data boundaries, vertical/horizontal layouts,
and domain cues to empower layered routing and eliminate regex blind-guessing.
"""
from pathlib import Path
from typing import List, Dict, Any, Optional
import os

from .config import WORKSPACE_DIR


def probe_session_attachments(
    session_files: Optional[List[str]],
    prompt: str = "",
    workspace_dir: str = WORKSPACE_DIR
) -> Dict[str, Any]:
    """
    Probe all attachments in the current session turn before intent or skill routing.
    Returns structured physical evidence:
        {
            "profiles": [ { "file_name": ..., "kind": ..., "domain": ..., "headers": ... } ],
            "primary_domain": "finance_fpna" | "timesheet_wbs" | "generic" | "document",
            "has_spreadsheet": bool,
            "has_docx": bool,
            "has_pdf": bool,
            "summary": str
        }
    """
    empty_result: Dict[str, Any] = {
        "profiles": [],
        "primary_domain": "generic",
        "has_spreadsheet": False,
        "has_docx": False,
        "has_pdf": False,
        "summary": ""
    }
    if not session_files:
        return empty_result

    profiles: List[Dict[str, Any]] = []
    has_spreadsheet = False
    has_docx = False
    has_pdf = False
    primary_domain = "generic"

    for fname in session_files:
        if not fname or not isinstance(fname, str):
            continue
        p = Path(fname)
        if not p.is_absolute():
            p = Path(workspace_dir) / fname
        if not p.exists() or not p.is_file():
            continue

        ext = p.suffix.lower()
        if ext in (".xlsx", ".xlsm"):
            has_spreadsheet = True
            try:
                from .spreadsheet_preflight import profile_spreadsheet_for_planning
                prof = profile_spreadsheet_for_planning(p, prompt=prompt, max_distinct_sample=8)
                domain_cue = prof.get("domain", "generic")
                if domain_cue != "generic" and primary_domain == "generic":
                    primary_domain = domain_cue
                raw_headers = list((prof.get("headers") or {}).values())
                # Deduplicate and keep first 12 headers
                seen = set()
                clean_headers = [h for h in raw_headers if h and not (h in seen or seen.add(h))][:12]
                profiles.append({
                    "file_name": p.name,
                    "kind": "spreadsheet",
                    "domain": domain_cue,
                    "sheet": prof.get("sheet", ""),
                    "headers": clean_headers,
                    "records": prof.get("records", 0),
                    "data_range": prof.get("data_range", ""),
                    "is_vertical_metric": bool(prof.get("is_vertical_metric_table")),
                })
            except Exception:
                profiles.append({
                    "file_name": p.name,
                    "kind": "spreadsheet",
                    "domain": "generic",
                    "sheet": "",
                    "headers": [],
                    "records": 0,
                    "data_range": "",
                    "is_vertical_metric": False,
                })
        elif ext in (".csv", ".tsv"):
            has_spreadsheet = True
            header_sample: List[str] = []
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    first_line = f.readline().strip()
                    delimiter = "\t" if ext == ".tsv" or "\t" in first_line else ","
                    header_sample = [c.strip().strip('"') for c in first_line.split(delimiter) if c.strip()][:12]
            except Exception:
                pass
            profiles.append({
                "file_name": p.name,
                "kind": "spreadsheet",
                "domain": "generic",
                "sheet": p.name,
                "headers": header_sample,
                "records": -1,
                "data_range": "",
                "is_vertical_metric": False,
            })
        elif ext == ".docx":
            has_docx = True
            profiles.append({
                "file_name": p.name,
                "kind": "docx",
                "domain": "document",
                "file_size_kb": round(p.stat().st_size / 1024, 1),
            })
        elif ext == ".pdf":
            has_pdf = True
            profiles.append({
                "file_name": p.name,
                "kind": "pdf",
                "domain": "document",
                "file_size_kb": round(p.stat().st_size / 1024, 1),
            })

    # Build concise single-line summary for LLM prompt injection
    summary_parts = []
    for pr in profiles:
        if pr.get("kind") == "spreadsheet":
            h_str = ", ".join(pr.get("headers", [])[:6])
            summary_parts.append(f"表格附件[{pr['file_name']}|Sheet:{pr.get('sheet')}|列:{h_str}|领域:{pr.get('domain')}]")
        elif pr.get("kind") in ("docx", "pdf"):
            summary_parts.append(f"{pr['kind'].upper()}附件[{pr['file_name']}|大小:{pr.get('file_size_kb', 0)}KB]")
    summary_text = "；".join(summary_parts)

    return {
        "profiles": profiles,
        "primary_domain": primary_domain,
        "has_spreadsheet": has_spreadsheet,
        "has_docx": has_docx,
        "has_pdf": has_pdf,
        "summary": summary_text
    }
