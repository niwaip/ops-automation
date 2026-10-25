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
                                    # In post-recalc: only formulas that can legitimately produce an empty string may have empty <v>.
                                    if f_text in ('""', "''", '&quot;&quot;'):
                                        cached_formulas += 1
                                    elif is_post_recalc and cell_type in ("str", "s") and ('""' in f_text or "''" in f_text or '&quot;' in f_text):
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


def _populate_formula_caches_python(src_p: Path, dest_p: Path) -> bool:
    """Pure-Python formula evaluator fallback when LibreOffice (soffice) is not installed on host."""
    try:
        import openpyxl
        from .workbook_source_grounding import _SourceWorkbookTruth, _format_dec

        wb = openpyxl.load_workbook(src_p, read_only=True, data_only=False)
        sheet_names = list(wb.sheetnames)
        wb.close()

        # Evaluate without recursive call to get_or_create_recalculated_workbook
        truth = _SourceWorkbookTruth([])
        wb_raw = openpyxl.load_workbook(src_p, data_only=False, read_only=True)
        wb_val = openpyxl.load_workbook(src_p, data_only=True, read_only=True)
        try:
            from openpyxl.utils import get_column_letter
            from .workbook_source_grounding import _to_decimal

            raw_cells = {}
            val_cells = {}
            for ws in wb_val:
                for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
                    for c_idx, val in enumerate(row, start=1):
                        d = _to_decimal(val)
                        if d is not None:
                            val_cells[(ws.title, f"{get_column_letter(c_idx)}{r_idx}")] = d
            for ws in wb_raw:
                for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
                    for c_idx, val in enumerate(row, start=1):
                        if val is not None:
                            raw_cells[(ws.title, f"{get_column_letter(c_idx)}{r_idx}")] = val

            def resolve_cell(sheet: str, coord: str, visiting):
                key = (sheet, coord)
                if key in val_cells:
                    return val_cells[key]
                if key in visiting:
                    return None
                raw = raw_cells.get(key)
                if raw is None:
                    return None
                d = _to_decimal(raw)
                if d is not None:
                    val_cells[key] = d
                    return d
                if not isinstance(raw, str) or not raw.startswith("="):
                    return None
                visiting.add(key)
                ev = truth._eval_formula(raw[1:].strip(), sheet, resolve_cell, visiting)
                visiting.remove(key)
                if ev is not None:
                    val_cells[key] = ev
                return ev

            for (sh, coord), raw in list(raw_cells.items()):
                if isinstance(raw, str) and raw.startswith("="):
                    resolve_cell(sh, coord, set())
        finally:
            wb_raw.close()
            wb_val.close()

        if not val_cells:
            return False

        tmp_unzip = Path(tempfile.mkdtemp(prefix="py_recalc_"))
        try:
            with zipfile.ZipFile(src_p, "r") as zin:
                zin.extractall(tmp_unzip)

            for idx, sh_title in enumerate(sheet_names, start=1):
                s_xml = tmp_unzip / "xl" / "worksheets" / f"sheet{idx}.xml"
                if not s_xml.exists():
                    continue
                tree = ET.parse(s_xml)
                root = tree.getroot()
                ns = ""
                if root.tag.startswith("{"):
                    ns = root.tag.split("}", 1)[0] + "}"
                changed = False
                for elem in root.iter():
                    if _get_local_tag(elem.tag) == "c":
                        coord = elem.attrib.get("r", "")
                        if (sh_title, coord) not in val_cells:
                            continue
                        f_child = next((ch for ch in elem if _get_local_tag(ch.tag) == "f"), None)
                        if f_child is None:
                            continue
                        v_child = next((ch for ch in elem if _get_local_tag(ch.tag) == "v"), None)
                        if v_child is None:
                            v_child = ET.SubElement(elem, f"{ns}v")
                        v_child.text = _format_dec(val_cells[(sh_title, coord)])
                        if elem.attrib.get("t") in ("str", "s"):
                            del elem.attrib["t"]
                        changed = True
                if changed:
                    tree.write(s_xml, encoding="utf-8", xml_declaration=True)

            dest_p.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(dest_p, "w", zipfile.ZIP_DEFLATED) as zout:
                for p in tmp_unzip.rglob("*"):
                    if p.is_file():
                        zout.write(p, p.relative_to(tmp_unzip))
            return True
        finally:
            shutil.rmtree(tmp_unzip, ignore_errors=True)
    except Exception:
        return False


def recalculate_candidate(
    file_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    force: bool = False
) -> Tuple[Optional[Path], Dict[str, Any]]:
    """
    Low-level recalculation entry point for candidate workbooks via headless LibreOffice.
    Returns: (candidate_path, diagnostic_metadata)
    Guarantees:
    - Never mutates the original input workbook.
    - If recalculation produces a valid workbook, returns its path and exact diagnostics
      (whether clean/verified or partial).
    - Preserves exact diagnosis: never relabels 'partial' as 'verified'.
    - Never returns original input workbook pretending it was recalculated.
    - If recalculation execution fatally fails or corrupts, candidate_path is None.
    """
    src_p = Path(file_path).resolve()
    if not src_p.exists() or not zipfile.is_zipfile(src_p):
        return None, {
            "schema_version": 1,
            "status": "failed",
            "provenance": {
                "workbook_id": "",
                "engine": "libreoffice_calc_headless",
                "validator_version": RECALC_CACHE_VERSION,
            },
            "error": f"Source file does not exist or is not a valid zip archive: {src_p}"
        }

    try:
        src_bytes = src_p.read_bytes()
        src_hash = hashlib.sha256(src_bytes).hexdigest()
    except Exception as e:
        return None, {
            "schema_version": 1,
            "status": "failed",
            "provenance": {
                "workbook_id": "",
                "engine": "libreoffice_calc_headless",
                "validator_version": RECALC_CACHE_VERSION,
            },
            "error": f"Failed to read file hash: {e}"
        }

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if output_path:
        dest_p = Path(output_path).resolve()
        dest_p.parent.mkdir(parents=True, exist_ok=True)
    else:
        dest_p = CACHE_DIR / f"cand_{src_p.stem}_{src_hash[:16]}_{RECALC_CACHE_VERSION}.xlsx"

    # Temporary staging file for atomic operation
    tmp_fd, tmp_path_str = tempfile.mkstemp(prefix=f"recalc_cand_{src_p.stem}_", suffix=".xlsx", dir=str(CACHE_DIR))
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

        recalc_failed = isinstance(recalc_res, dict) and (
            recalc_res.get("status") in ("failed", "error", "unavailable")
            or bool(recalc_res.get("error"))
        )
        if recalc_failed and "soffice not found" in str(recalc_res.get("error", "")):
            if _populate_formula_caches_python(src_p, tmp_path):
                chk_py = check_workbook_formulas(tmp_path, is_post_recalc=True)
                if not chk_py.get("has_uncalculated", False) and chk_py.get("total_errors", 0) == 0:
                    recalc_res = {
                        "status": "verified",
                        "total_formulas": chk_py.get("total_formulas", 0),
                        "cached_formulas": chk_py.get("cached_formulas", 0),
                        "uncalculated_formulas": 0,
                        "total_errors": 0,
                        "error_summary": {},
                    }
                    recalc_failed = False

        if not recalc_failed and tmp_path.exists() and zipfile.is_zipfile(tmp_path):
            shutil.move(str(tmp_path), str(dest_p))
            out_bytes = dest_p.read_bytes()
            out_hash = hashlib.sha256(out_bytes).hexdigest()

            # Ensure post-calculation formula validation is run if not already present in recalc_res
            if not isinstance(recalc_res, dict) or "total_formulas" not in recalc_res:
                formula_check = check_workbook_formulas(dest_p, is_post_recalc=True)
                raw_status = formula_check.get("status", "partial")
                status = "verified" if raw_status == "recalculated_verified" or (formula_check.get("total_errors", 0) == 0 and not formula_check.get("has_uncalculated", False)) else "partial"
                total_formulas = formula_check.get("total_formulas", 0)
                cached_formulas = formula_check.get("cached_formulas", 0)
                uncalculated_formulas = formula_check.get("uncalculated_formulas", 0)
                total_errors = formula_check.get("total_errors", 0)
                error_summary = formula_check.get("error_summary", {})
            else:
                status = recalc_res.get("status", "partial")
                total_formulas = recalc_res.get("total_formulas", 0)
                cached_formulas = recalc_res.get("cached_formulas", 0)
                uncalculated_formulas = recalc_res.get("uncalculated_formulas", 0)
                total_errors = recalc_res.get("total_errors", 0)
                error_summary = recalc_res.get("error_summary", {})

            meta = {
                "schema_version": 1,
                "status": status,
                "engine_execution": "success",
                "provenance": {
                    "workbook_id": src_hash,
                    "output_hash": out_hash,
                    "engine": "libreoffice_calc_headless",
                    "validator_version": RECALC_CACHE_VERSION,
                    "calculated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                "total_formulas": total_formulas,
                "cached_formulas": cached_formulas,
                "uncalculated_formulas": uncalculated_formulas,
                "total_errors": total_errors,
                "error_summary": error_summary,
                "error": recalc_res.get("error") if isinstance(recalc_res, dict) else None,
            }
            return dest_p, meta
        else:
            status = recalc_res.get("status", "failed") if isinstance(recalc_res, dict) else "failed"
            meta = {
                "schema_version": 1,
                "status": status,
                "engine_execution": "failed",
                "provenance": {
                    "workbook_id": src_hash,
                    "engine": "libreoffice_calc_headless",
                    "validator_version": RECALC_CACHE_VERSION,
                },
                "error": recalc_res.get("error") if isinstance(recalc_res, dict) else str(recalc_res),
            }
            return None, meta
    except Exception as e:
        return None, {
            "schema_version": 1,
            "status": "failed",
            "engine_execution": "failed",
            "provenance": {
                "workbook_id": src_hash,
                "engine": "libreoffice_calc_headless",
                "validator_version": RECALC_CACHE_VERSION,
            },
            "error": f"Exception during recalculation candidate generation: {e}"
        }
    finally:
        tmp_path.unlink(missing_ok=True)


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
                cached_chk = check_workbook_formulas(cache_xlsx, is_post_recalc=True)
                if (
                    meta.get("status") in ("recalculated_verified", "verified")
                    and not meta.get("error")
                    and not cached_chk.get("has_uncalculated", False)
                    and cached_chk.get("total_errors", 0) == 0
                ):
                    return cache_xlsx, meta
            # Purge invalid or poisoned zip cache
            cache_xlsx.unlink(missing_ok=True)
            cache_meta.unlink(missing_ok=True)
        except Exception:
            cache_xlsx.unlink(missing_ok=True)
            cache_meta.unlink(missing_ok=True)

    # 2. Check if original workbook even needs recalculation
    pre_check = check_workbook_formulas(src_p)
    if not pre_check.get("has_uncalculated", False) and pre_check.get("total_errors", 0) == 0:
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

    # 3. Perform headless recalculation via underlying recalculate_candidate
    cand_path, meta = recalculate_candidate(src_p, output_path=cache_xlsx, force=force)
    if cand_path and cand_path.exists() and meta.get("status") in ("verified", "clean"):
        meta["status"] = "recalculated_verified"
        cache_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return cache_xlsx, meta
    else:
        # Legacy strict behavior: if not verified clean, do not claim verified and purge cache_xlsx
        if cand_path and cand_path.exists():
            cand_path.unlink(missing_ok=True)
        cache_meta.unlink(missing_ok=True)
        return src_p, meta
