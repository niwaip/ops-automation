"""
WorkbookCalculation: Unified Excel calculation engine, namespace-aware validator, and provenance manager.
Provides a single, standardized formula verification engine for both pre-inspection and post-recalculation,
resolving namespace edge cases, dual-rule contradictions, and false-trust cache labeling.
"""

import os
import sys
import re
import json
import shutil
import hashlib
import tempfile
import zipfile
import datetime
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import xml.etree.ElementTree as ET

# Excel error literals recognized across standards
EXCEL_ERRORS = [
    "#VALUE!",
    "#DIV/0!",
    "#REF!",
    "#NAME?",
    "#NULL!",
    "#NUM!",
    "#N/A",
]

RECALC_CACHE_VERSION = "v3_unified"
CACHE_DIR = Path("/tmp/.dsh_xlsx_recalc")


def _get_local_tag(tag: str) -> str:
    """Extracts local tag name regardless of XML namespace (e.g. '{...}c' -> 'c')."""
    if not tag:
        return ""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def check_workbook_formulas(
    file_path: Union[str, Path],
    is_post_recalc: bool = False
) -> Dict[str, Any]:
    """
    Namespace-aware unified formula validator.
    Inspects all worksheet XML parts in the zip package:
    - Reliably matches cell (<c>), formula (<f>), and value (<v>) tags with or without XML namespaces/prefixes (e.g. ss:c).
    - Detects whether formulas lack calculated cache (<v> tag).
    - Detects explicit Excel error values (#DIV/0!, #VALUE!, etc.).
    - Returns standardized status:
      * 'recalculated_verified': Only applied when verified post-engine recalculation.
      * 'cached_unverified': Existing formulas have cached values, but not verified by recalc engine.
      * 'uncalculated': One or more formulas lack cached values.
      * 'partial': Some formulas calculated, but errors or missing caches present.
      * 'failed': All formulas failed or severe parsing corruption.
    """
    p = Path(file_path)
    if not p.exists() or not zipfile.is_zipfile(p):
        return {
            "status": "failed",
            "total_formulas": 0,
            "cached_formulas": 0,
            "uncalculated_formulas": 0,
            "uncalculated_locations": [],
            "total_errors": 0,
            "error_summary": {},
            "has_uncalculated": True,
            "error": "File does not exist or is not a valid zip/xlsx archive."
        }

    total_formulas = 0
    cached_formulas = 0
    uncalculated_cells = []
    error_summary: Dict[str, List[str]] = {err: [] for err in EXCEL_ERRORS}
    total_errors = 0

    try:
        with zipfile.ZipFile(p, "r") as z:
            sheet_files = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
            for sf in sheet_files:
                sheet_label = Path(sf).stem
                raw_xml = z.read(sf)
                try:
                    root = ET.fromstring(raw_xml)
                except Exception:
                    continue

                for elem in root.iter():
                    if _get_local_tag(elem.tag) == "c":
                        cell_coord = elem.attrib.get("r", "Unknown")
                        cell_type = elem.attrib.get("t", "")

                        f_elem = None
                        v_elem = None
                        for child in elem:
                            lt = _get_local_tag(child.tag)
                            if lt == "f":
                                f_elem = child
                            elif lt == "v":
                                v_elem = child

                        if f_elem is not None:
                            total_formulas += 1
                            f_text = (f_elem.text or "").strip()

                            # Check value cache
                            if v_elem is None:
                                # Completely missing <v> cache tag
                                if f_text in ('""', "''", '&quot;&quot;'):
                                    cached_formulas += 1
                                else:
                                    uncalculated_cells.append(f"{sheet_label}!{cell_coord}")
                            else:
                                v_text = (v_elem.text or "").strip()
                                if len(v_text) == 0:
                                    # <v></v> empty content:
                                    # In pre-check: only literal empty string formula is acceptable as pre-calculated.
                                    # In post-recalc: an empty string with t="str" produced by LibreOffice is an evaluated empty string.
                                    if f_text in ('""', "''", '&quot;&quot;'):
                                        cached_formulas += 1
                                    elif is_post_recalc and cell_type in ("str", "s"):
                                        cached_formulas += 1
                                    else:
                                        uncalculated_cells.append(f"{sheet_label}!{cell_coord}")
                                else:
                                    # Has non-empty value
                                    cached_formulas += 1
                                    if cell_type == "e" or v_text in EXCEL_ERRORS:
                                        err_type = v_text if v_text in EXCEL_ERRORS else "#VALUE!"
                                        error_summary.setdefault(err_type, []).append(f"{sheet_label}!{cell_coord}")
                                        total_errors += 1
                        else:
                            # Non-formula cell: check for static error value (e.g. pasted #DIV/0!)
                            if v_elem is not None:
                                v_text = (v_elem.text or "").strip()
                                if cell_type == "e" or v_text in EXCEL_ERRORS:
                                    err_type = v_text if v_text in EXCEL_ERRORS else "#VALUE!"
                                    error_summary.setdefault(err_type, []).append(f"{sheet_label}!{cell_coord}")
                                    total_errors += 1

    except Exception as e:
        return {
            "status": "failed",
            "total_formulas": total_formulas,
            "cached_formulas": cached_formulas,
            "uncalculated_formulas": len(uncalculated_cells),
            "uncalculated_locations": uncalculated_cells,
            "total_errors": total_errors,
            "error_summary": {k: v for k, v in error_summary.items() if v},
            "has_uncalculated": True,
            "error": str(e)
        }

    uncalc_count = len(uncalculated_cells)
    clean_error_summary = {k: v for k, v in error_summary.items() if v}

    # Status classification
    if total_formulas == 0:
        status = "cached_unverified" if total_errors == 0 else "partial"
    elif uncalc_count > 0:
        status = "failed" if (uncalc_count == total_formulas and total_formulas > 0) else "partial"
    elif total_errors > 0:
        status = "partial"
    else:
        # All existing formulas have cached values, but not yet verified by headless calculation engine
        status = "cached_unverified"

    return {
        "status": status,
        "total_formulas": total_formulas,
        "cached_formulas": cached_formulas,
        "uncalculated_formulas": uncalc_count,
        "uncalculated_locations": uncalculated_cells,
        "total_errors": total_errors,
        "error_summary": clean_error_summary,
        "has_uncalculated": (uncalc_count > 0)
    }


def has_uncalculated_formulas(file_path: Union[str, Path]) -> bool:
    """Standardized single-source check for uncalculated formulas."""
    res = check_workbook_formulas(file_path)
    return res.get("has_uncalculated", False)


def get_or_create_recalculated_workbook(
    file_path: Union[str, Path],
    force: bool = False
) -> Tuple[Path, Dict[str, Any]]:
    """
    Retrieves or generates an atomic, content-addressed recalculated workbook via headless LibreOffice.
    Returns: (output_path, provenance_metadata)
    Guarantees:
    - Never mutates the original input workbook.
    - Uses SHA-256 content addressing for cache verification.
    - If cache is corrupt or missing, generates a new one.
    - If recalculation succeeds and passes verification, marks status as 'recalculated_verified'.
    """
    src_p = Path(file_path).resolve()
    if not src_p.exists():
        return src_p, {"status": "failed", "error": f"File {src_p} does not exist"}

    try:
        src_bytes = src_p.read_bytes()
        src_hash = hashlib.sha256(src_bytes).hexdigest()
    except Exception as e:
        return src_p, {"status": "failed", "error": f"Failed to read file hash: {e}"}

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_base = CACHE_DIR / f"{src_p.stem}_{src_hash[:20]}_{RECALC_CACHE_VERSION}"
    cache_xlsx = cache_base.with_suffix(".xlsx")
    cache_meta = cache_base.with_suffix(".json")

    # 1. Check existing verified cache
    if not force and (cache_xlsx.exists() or cache_meta.exists()):
        try:
            if cache_xlsx.exists() and zipfile.is_zipfile(cache_xlsx) and cache_meta.exists():
                meta = json.loads(cache_meta.read_text(encoding="utf-8"))
                if meta.get("status") in ("recalculated_verified", "verified"):
                    return cache_xlsx, meta
            else:
                # Purge invalid zip cache
                cache_xlsx.unlink(missing_ok=True)
                cache_meta.unlink(missing_ok=True)
        except Exception:
            cache_xlsx.unlink(missing_ok=True)
            cache_meta.unlink(missing_ok=True)

    # 2. Check if original workbook even needs recalculation
    pre_check = check_workbook_formulas(src_p)
    if not pre_check.get("has_uncalculated", False) and pre_check.get("total_errors", 0) == 0:
        # Original has full cache, but as per audit requirements, label as cached_unverified
        # Unless caller specifically requests recalculation, we can return original with cached_unverified status
        meta = {
            "schema_version": 1,
            "status": "cached_unverified",
            "provenance": {
                "workbook_id": src_hash,
                "engine": "none",
                "validator_version": RECALC_CACHE_VERSION,
                "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            "formula_check": pre_check
        }
    # 3. Perform headless recalculation via recalc.py using atomic temporary file
    tmp_fd, tmp_path_str = tempfile.mkstemp(prefix=f"recalc_{src_p.stem}_", suffix=".xlsx", dir=str(CACHE_DIR))
    os.close(tmp_fd)
    tmp_path = Path(tmp_path_str)

    try:
        recalc_res = None
        recalc_script = None
        for cand in [
            Path("/opt/dsh/skills/xlsx/scripts/recalc.py"),
            Path(__file__).resolve().parent.parent.parent / "skills" / "xlsx" / "scripts" / "recalc.py",
            Path("/workspace/skills/xlsx/scripts/recalc.py"),
        ]:
            if cand.exists():
                recalc_script = cand
                break

        if recalc_script:
            env = os.environ.copy()
            python_paths = ["/usr/local/bin", str(Path(__file__).resolve().parent.parent)]
            if "PYTHONPATH" in env:
                python_paths.append(env["PYTHONPATH"])
            env["PYTHONPATH"] = ":".join(p for p in python_paths if p)

            sub_proc = subprocess.run(
                [sys.executable, str(recalc_script), str(src_p), "-o", str(tmp_path), "--force"],
                capture_output=True,
                text=True,
                env=env,
                timeout=45
            )
            if sub_proc.returncode == 0 and sub_proc.stdout.strip():
                try:
                    recalc_res = json.loads(sub_proc.stdout.strip())
                except Exception:
                    recalc_res = {"status": "failed", "error": f"Invalid JSON output: {sub_proc.stdout[:200]}"}
            else:
                err_msg = sub_proc.stderr.strip() or sub_proc.stdout.strip() or f"recalc exit code {sub_proc.returncode}"
                recalc_res = {"status": "failed", "error": err_msg}
        else:
            try:
                import recalc
                recalc_res = recalc.recalc(str(src_p), output=str(tmp_path), force=True)
            except Exception as ex:
                recalc_res = {"status": "failed", "error": f"recalc script not found: {ex}"}

        if isinstance(recalc_res, dict) and recalc_res.get("status") == "verified" and tmp_path.exists() and zipfile.is_zipfile(tmp_path):
            os.replace(str(tmp_path), str(cache_xlsx))
            out_bytes = cache_xlsx.read_bytes()
            out_hash = hashlib.sha256(out_bytes).hexdigest()
            meta = {
                "schema_version": 1,
                "status": "recalculated_verified",
                "provenance": {
                    "workbook_id": src_hash,
                    "output_hash": out_hash,
                    "engine": "libreoffice_calc_headless",
                    "validator_version": RECALC_CACHE_VERSION,
                    "calculated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                "total_formulas": recalc_res.get("total_formulas", 0),
                "cached_formulas": recalc_res.get("cached_formulas", 0),
                "uncalculated_formulas": recalc_res.get("uncalculated_formulas", 0),
                "total_errors": recalc_res.get("total_errors", 0),
                "error_summary": recalc_res.get("error_summary", {}),
            }
            cache_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
            return cache_xlsx, meta
        else:
            status = recalc_res.get("status", "failed") if isinstance(recalc_res, dict) else "failed"
            meta = {
                "schema_version": 1,
                "status": status,
                "provenance": {
                    "workbook_id": src_hash,
                    "engine": "libreoffice_calc_headless",
                    "validator_version": RECALC_CACHE_VERSION,
                },
                "error": recalc_res.get("error") if isinstance(recalc_res, dict) else str(recalc_res),
            }
            return src_p, meta
    except Exception as e:
        return src_p, {
            "schema_version": 1,
            "status": "failed",
            "provenance": {
                "workbook_id": src_hash,
                "engine": "libreoffice_calc_headless",
                "validator_version": RECALC_CACHE_VERSION,
            },
            "error": f"Exception during recalculation: {e}"
        }
    finally:
        tmp_path.unlink(missing_ok=True)
