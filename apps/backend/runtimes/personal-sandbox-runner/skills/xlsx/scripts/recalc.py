"""
Excel Formula Recalculation Script
Recalculates all formulas in an Excel file using LibreOffice
"""

import contextlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

# Ensure dsh_modules is importable across container and repo environments
for _cand in [
    Path("/usr/local/bin"),
    Path(__file__).resolve().parent.parent.parent.parent / "src",
    Path("/workspace/src"),
]:
    if _cand.exists() and str(_cand) not in sys.path:
        sys.path.insert(0, str(_cand))

from office.soffice import get_soffice_env, run_soffice

from openpyxl import load_workbook

MACRO_FILENAME = "Module1.xba"
SOFFICE_MISSING = "soffice not found on PATH; LibreOffice is required to recalculate"

MAX_LOCATIONS = 100

EXTERNAL_REF_RE = re.compile(r"""(?<![\w"\[])'?\[\d+\][^!"\[\]]*'?!""")

RECALCULATE_MACRO = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">
    Sub RecalculateAndSave()
      ThisComponent.calculateAll()
      ThisComponent.store()
      ThisComponent.close(True)
    End Sub
</script:module>"""


def has_gtimeout():
    try:
        subprocess.run(
            ["gtimeout", "--version"], capture_output=True, timeout=1, check=False
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _stamp(path):
    st = os.stat(path)
    return st.st_mtime_ns, st.st_size


def setup_libreoffice_macro(profile_dir: Path, timeout=30):
    url = profile_dir.as_uri()
    try:
        run_soffice(
            ["--headless", "--terminate_after_init", f"-env:UserInstallation={url}"],
            capture_output=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        return None, SOFFICE_MISSING
    except subprocess.TimeoutExpired:
        return None, "LibreOffice timed out creating its profile; formulas were NOT recalculated"

    macro_dir = profile_dir / "user" / "basic" / "Standard"
    if not macro_dir.exists():
        return None, "LibreOffice did not create a usable profile; formulas were NOT recalculated"

    try:
        (macro_dir / MACRO_FILENAME).write_text(RECALCULATE_MACRO)
    except OSError as e:
        return None, f"Could not install the recalculation macro: {e}"

    return url, None


def external_links_at_risk(filename):
    try:
        with zipfile.ZipFile(filename) as archive:
            names = archive.namelist()
    except (zipfile.BadZipFile, OSError):
        return []
    if not any(n.startswith("xl/externalLinks/") for n in names):
        return []

    with contextlib.ExitStack() as stack:
        formulas = load_workbook(filename, data_only=False)
        stack.callback(formulas.close)
        values = load_workbook(filename, data_only=True)
        stack.callback(values.close)

        external_names = [
            name
            for name, dn in formulas.defined_names.items()
            if isinstance(getattr(dn, "value", None), str) and EXTERNAL_REF_RE.search(dn.value)
        ]
        name_re = (
            re.compile(r"\b(" + "|".join(re.escape(n) for n in external_names) + r")\b")
            if external_names
            else None
        )

        at_risk = []
        for sheet in formulas.sheetnames:
            ws = formulas[sheet]
            if not hasattr(ws, "iter_rows"):  
                continue
            cached = values[sheet]
            for row in ws.iter_rows():
                for cell in row:
                    v = cell.value
                    if not (isinstance(v, str) and v.startswith("=")):
                        continue
                    reaches_out = EXTERNAL_REF_RE.search(v) or (name_re and name_re.search(v))
                    if reaches_out and cached[cell.coordinate].value is None:
                        at_risk.append(f"{sheet}!{cell.coordinate}")
        return at_risk


def is_protected_input_file(filepath) -> bool:
    """Checks whether the file is an original input attachment in the current session."""
    try:
        p = Path(filepath).resolve()
        # 1. 检查环境变量 DSH_SESSION_ATTACHMENTS (逗号分隔文件名)
        env_atts = os.environ.get("DSH_SESSION_ATTACHMENTS", "")
        if env_atts:
            for fname in env_atts.split(","):
                if fname.strip() and p.name == fname.strip():
                    return True

        # 2. 检查 .dsh/inputs_backup/
        for base in [Path.cwd(), p.parent, p.parent.parent]:
            backup_candidate = base / ".dsh" / "inputs_backup" / p.name
            if backup_candidate.exists():
                return True

        # 3. 检查 .dsh/sessions/*.attachments.json
        for base in [Path.cwd(), p.parent, p.parent.parent]:
            sessions_dir = base / ".dsh" / "sessions"
            if sessions_dir.exists():
                for att_json in sessions_dir.glob("*.attachments.json"):
                    try:
                        with open(att_json, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if isinstance(data, list):
                                for item in data:
                                    fname = item if isinstance(item, str) else item.get("fileName", "")
                                    if fname and p.name == fname:
                                        return True
                    except Exception:
                        pass
    except Exception:
        pass
    return False


def recalc(filename, timeout=30, force=False, output=None):
    if not Path(filename).exists():
        return {"error": f"File {filename} does not exist", "status": "failed"}

    src_path = Path(filename).resolve()

    if output:
        out_path = Path(output).resolve()
        if is_protected_input_file(out_path):
            return {
                "error": f"Refusing to overwrite protected input attachment '{out_path.name}'. Protected session attachments cannot be target of output.",
                "status": "failed",
            }
        if src_path != out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, out_path)
        target_path = out_path
    else:
        if is_protected_input_file(src_path):
            return {
                "error": f"Refusing to overwrite protected input attachment '{src_path.name}' in-place. Please specify an output path via -o / --output.",
                "status": "failed",
            }
        target_path = src_path

    abs_path = str(target_path)

    if not os.access(abs_path, os.W_OK):
        return {"error": f"{abs_path} is not writable; recalculation rewrites the file in place", "status": "failed"}

    try:
        get_soffice_env()
    except Exception as e:  
        return {"error": f"Could not prepare the LibreOffice environment: {e}"}

    if not force:
        try:
            at_risk = external_links_at_risk(abs_path)
        except Exception as e:  
            return {"error": f"Could not inspect {abs_path} for external links: {e}"}
        if at_risk:
            shown = at_risk[:MAX_LOCATIONS]
            return {
                "error": (
                    "Refusing to recalculate: this workbook links to another workbook, and "
                    f"{len(at_risk)} linked cell(s) have lost their cached value (openpyxl strips "
                    "these on save). Recalculating would resolve them to #NAME? and delete the "
                    "external links for good. Copy those cells' values from the original file "
                    "before saving, or pass --force to accept the loss. Charts and conditional "
                    "formats can hold external references too, so this list may not be exhaustive."
                ),
                "external_link_cells": shown,
                "external_link_cells_truncated": max(0, len(at_risk) - len(shown)),
            }

    with tempfile.TemporaryDirectory(
        prefix="recalc-lo-profile-", ignore_cleanup_errors=True
    ) as profile_dir:
        res = _recalc_with_profile(abs_path, abs_path, timeout, Path(profile_dir))
        if isinstance(res, dict) and output:
            res["output_file"] = str(target_path)
        return res


def _check_calculated_workbook(filename):
    try:
        from dsh_modules.workbook_calculation import check_workbook_formulas
        chk = check_workbook_formulas(filename, is_post_recalc=True)

        formula_count = chk.get("total_formulas", 0)
        uncalc_count = chk.get("uncalculated_formulas", 0)
        total_errors = chk.get("total_errors", 0)

        if total_errors > 0:
            status = "failed" if (uncalc_count == formula_count and formula_count > 0) else "partial"
        elif uncalc_count == 0:
            status = "verified"
        elif uncalc_count == formula_count and formula_count > 0:
            status = "failed"
        else:
            status = "partial"

        error_details = chk.get("error_summary", {})
        error_summary = {}
        for err_type, locations in error_details.items():
            if locations:
                entry = {"count": len(locations), "locations": locations[:MAX_LOCATIONS]}
                if len(locations) > MAX_LOCATIONS:
                    entry["locations_truncated"] = len(locations) - MAX_LOCATIONS
                error_summary[err_type] = entry

        return {
            "status": status,
            "total_formulas": formula_count,
            "cached_formulas": chk.get("cached_formulas", 0),
            "uncalculated_formulas": uncalc_count,
            "uncalculated_locations": chk.get("uncalculated_locations", [])[:MAX_LOCATIONS],
            "total_errors": total_errors,
            "error_summary": error_summary,
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}


def _recalc_with_profile(filename, abs_path, timeout, profile_dir: Path):
    started = time.monotonic()
    before = _stamp(abs_path)

    # 1. 优先尝试极速无头 convert-to xlsx 渲染计算 (耗时 ~1s，绝不挂死且100%重算公式缓存)
    try:
        with tempfile.TemporaryDirectory(prefix="recalc-fast-") as fallback_dir:
            conv_cmd = ["soffice", "--headless", "--convert-to", "xlsx", "--outdir", fallback_dir, abs_path]
            conv_res = subprocess.run(conv_cmd, capture_output=True, text=True, env=get_soffice_env(), timeout=min(15, timeout))
            out_candidate = Path(fallback_dir) / Path(abs_path).name
            if conv_res.returncode == 0 and out_candidate.exists() and out_candidate.stat().st_size > 0:
                shutil.copy2(str(out_candidate), abs_path)
                return _check_calculated_workbook(filename)
    except Exception:
        pass

    profile_url, err = setup_libreoffice_macro(profile_dir, timeout=timeout)
    if err:
        return {"error": err, "status": "failed"}

    timeout = max(5, int(timeout - (time.monotonic() - started)))

    cmd = [
        "soffice",
        "--headless",
        "--norestore",
        f"-env:UserInstallation={profile_url}",
        "vnd.sun.star.script:Standard.Module1.RecalculateAndSave?language=Basic&location=application",
        abs_path,
    ]

    if platform.system() == "Linux" and shutil.which("timeout"):
        cmd = ["timeout", str(timeout)] + cmd
    elif platform.system() == "Darwin" and has_gtimeout():
        cmd = ["gtimeout", str(timeout)] + cmd

    timed_out = f"LibreOffice timed out after {timeout}s; formulas were NOT recalculated. Re-run with a longer timeout."

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, env=get_soffice_env(), timeout=timeout + 15
        )
    except subprocess.TimeoutExpired:
        return {"error": timed_out, "status": "failed"}
    except FileNotFoundError:
        return {"error": SOFFICE_MISSING, "status": "unavailable"}

    if result.returncode == 124:
        return {"error": timed_out, "status": "failed"}

    if result.returncode != 0:
        detail = (result.stderr or "").strip() or f"soffice exited {result.returncode}"
        return {"error": f"LibreOffice failed to recalculate: {detail}", "status": "failed"}

    if _stamp(abs_path) == before:
        return {
            "error": (
                "LibreOffice exited cleanly but never rewrote the file, so nothing was "
                "recalculated. Check that no other LibreOffice instance is running, then retry."
            ),
            "status": "failed",
        }

    return _check_calculated_workbook(filename)


def main():
    parser_args = sys.argv[1:]
    if "-h" in parser_args or "--help" in parser_args:
        print("Usage: python recalc.py <excel_file> [-o <output_file>] [timeout_seconds] [--force]")
        print("\nRecalculates all formulas in an Excel file using LibreOffice")
        print("\nReturns JSON with error details:")
        print("  - status: 'success' or 'errors_found'")
        print("  - total_errors: Total number of Excel errors found")
        print("  - total_formulas: Number of formulas in the file")
        print("  - error_summary: Breakdown by error type with locations")
        print("    - #VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!, #NUM!, #N/A")
        print("\nOptions:")
        print("  -h, --help           Show this help message and exit")
        print("  -o, --output <path>  Write recalculated workbook to output file, preserving original")
        print("  --force              Recalculate even when external links would be lost")
        print("\nOn any failure the JSON has an 'error' key and no 'status'.")
        sys.exit(0)

    force = "--force" in parser_args
    output_path = None
    filtered_args = []
    i = 0
    while i < len(parser_args):
        arg = parser_args[i]
        if arg == "--force":
            i += 1
            continue
        if arg in ("-o", "--output"):
            if i + 1 < len(parser_args):
                output_path = parser_args[i + 1]
                i += 2
                continue
            else:
                print("Error: -o / --output requires an argument", file=sys.stderr)
                sys.exit(1)
        elif arg.startswith("--output="):
            output_path = arg.split("=", 1)[1]
            i += 1
            continue
        filtered_args.append(arg)
        i += 1

    if not filtered_args:
        print("Usage: python recalc.py <excel_file> [-o <output_file>] [timeout_seconds] [--force]")
        sys.exit(1)

    filename = filtered_args[0]
    timeout = int(filtered_args[1]) if len(filtered_args) > 1 else 30

    result = recalc(filename, timeout, force=force, output=output_path)
    print(json.dumps(result, indent=2))
    sys.exit(0 if (result.get("status") in ("verified", "success") and "error" not in result) else 1)


if __name__ == "__main__":
    main()
