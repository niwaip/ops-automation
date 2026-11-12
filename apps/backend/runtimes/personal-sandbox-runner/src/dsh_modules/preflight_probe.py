"""
Pre-flight attachment probing and physical evidence extraction.
Runs locally before any LLM invocations, using bounded page samples for PDF visual needs and discovering
spreadsheet headers, data boundaries, vertical/horizontal layouts,
and domain cues to empower layered routing and eliminate regex blind-guessing.
"""
from pathlib import Path
from typing import List, Dict, Any, Optional
import os

from .config import WORKSPACE_DIR


def _profile_single_docx(p: Path) -> Dict[str, Any]:
    """Lightweight (<20ms) OOXML inspection for DOCX files without heavy dependencies."""
    import zipfile
    import xml.etree.ElementTree as ET

    res = {
        "file_name": p.name,
        "kind": "docx",
        "domain": "document",
        "file_size_kb": round(p.stat().st_size / 1024, 1),
        "paragraphs": 0,
        "tables": 0,
        "has_footers": False,
        "has_headers": False,
        "has_dynamic_page": False,
        "page_size": "A4",
    }
    try:
        with zipfile.ZipFile(p, "r") as z:
            names = set(z.namelist())
            footers = [n for n in names if n.startswith("word/footer") and n.endswith(".xml")]
            headers = [n for n in names if n.startswith("word/header") and n.endswith(".xml")]
            res["has_footers"] = bool(footers)
            res["has_headers"] = bool(headers)

            for fn in footers:
                content = z.read(fn).decode("utf-8", errors="ignore")
                if "PAGE" in content:
                    res["has_dynamic_page"] = True
                    break

            if "word/document.xml" in names:
                doc_xml = z.read("word/document.xml")
                root = ET.fromstring(doc_xml)
                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                res["paragraphs"] = len(root.findall(".//w:p", ns))
                res["tables"] = len(root.findall(".//w:tbl", ns))
                sectPr = root.find(".//w:sectPr", ns)
                if sectPr is not None:
                    pgSz = sectPr.find("w:pgSz", ns)
                    if pgSz is not None:
                        w_val = pgSz.attrib.get(f"{{{ns['w']}}}w")
                        code_val = pgSz.attrib.get(f"{{{ns['w']}}}code")
                        if code_val == "9" or w_val == "11906":
                            res["page_size"] = "A4"
                        elif w_val == "12240":
                            res["page_size"] = "Letter"
    except Exception:
        pass
    return res


def _probe_xlsx_ooxml_features(p: Path) -> Dict[str, int]:
    """Lightweight (<5ms) inspection of XLSX OOXML features (dropdowns, conditional formattings)."""
    import zipfile
    info = {"dropdowns": 0, "conditional_formattings": 0}
    try:
        with zipfile.ZipFile(p, "r") as z:
            sheet_files = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
            for s in sheet_files:
                content = z.read(s).decode("utf-8", errors="ignore")
                info["dropdowns"] += content.count("<dataValidation ")
                info["conditional_formattings"] += content.count("<conditionalFormatting")
    except Exception:
        pass
    return info


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
            ooxml_features = _probe_xlsx_ooxml_features(p)
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
                    "dropdowns": ooxml_features.get("dropdowns", 0),
                    "conditional_formattings": ooxml_features.get("conditional_formattings", 0),
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
                    "dropdowns": ooxml_features.get("dropdowns", 0),
                    "conditional_formattings": ooxml_features.get("conditional_formattings", 0),
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
            profiles.append(_profile_single_docx(p))
        elif ext == ".pdf":
            has_pdf = True
            from .visual_reading_policy import profile_pdf
            profiles.append({
                "file_name": p.name,
                "kind": "pdf",
                "domain": "document",
                "file_size_kb": round(p.stat().st_size / 1024, 1),
                **profile_pdf(p),
            })

    # Build concise single-line summary for LLM prompt injection
    summary_parts = []
    for pr in profiles:
        if pr.get("kind") == "spreadsheet":
            h_str = ", ".join(pr.get("headers", [])[:6])
            extra_cues = []
            if pr.get("dropdowns", 0) > 0:
                extra_cues.append(f"下拉框:{pr['dropdowns']}处")
            if pr.get("conditional_formattings", 0) > 0:
                extra_cues.append(f"条件格式:{pr['conditional_formattings']}处")
            extra_str = f"|{'|'.join(extra_cues)}" if extra_cues else ""
            summary_parts.append(f"表格附件[{pr['file_name']}|Sheet:{pr.get('sheet')}|列:{h_str}{extra_str}|领域:{pr.get('domain')}]")
        elif pr.get("kind") == "docx":
            footer_desc = "含动态页脚" if pr.get("has_dynamic_page") else ("有页脚" if pr.get("has_footers") else "无页脚")
            summary_parts.append(
                f"DOCX附件[{pr['file_name']}|段落:{pr.get('paragraphs', 0)}|表格:{pr.get('tables', 0)}|{footer_desc}|规格:{pr.get('page_size', 'A4')}]"
            )
        elif pr.get("kind") == "pdf":
            summary_parts.append(f"PDF附件[{pr['file_name']}|大小:{pr.get('file_size_kb', 0)}KB|读取:{pr.get('reading_mode', 'unknown')}]")
    summary_text = "；".join(summary_parts)

    return {
        "profiles": profiles,
        "primary_domain": primary_domain,
        "has_spreadsheet": has_spreadsheet,
        "has_docx": has_docx,
        "has_pdf": has_pdf,
        "summary": summary_text
    }
