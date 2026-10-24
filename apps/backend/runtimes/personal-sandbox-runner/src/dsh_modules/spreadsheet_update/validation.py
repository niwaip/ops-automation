"""
Scope dependency analysis, historical error isolation gates, and semantic reconciliation.
Enforces the zero-tolerance policy on target deliverable sheets while proving isolation
for baseline errors retained in historical sheets.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple, Optional, Union
import openpyxl
from openpyxl.formula.tokenizer import Tokenizer
from openpyxl.utils import range_boundaries

from .capabilities import BaselineErrorFingerprint
from ..workbook_calculation import check_workbook_formulas, EXCEL_ERRORS


@dataclass
class DeliveryValidationVerdict:
    verdict: str  # passed, passed_with_warnings, rejected
    is_deliverable: bool
    target_sheet_errors_count: int
    historical_isolated_errors_count: int
    unresolved_dependencies_count: int
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def _cell_in_range(cell_coord: str, ref_range: str) -> bool:
    """Checks whether cell_coord (e.g. 'A5') falls inside ref_range (e.g. 'A1:B10' or 'A5')."""
    try:
        min_c, min_r, max_c, max_r = range_boundaries(ref_range)
        c_col, c_row, _, _ = range_boundaries(cell_coord)
        return min_c <= c_col <= max_c and min_r <= c_row <= max_r
    except Exception:
        return False


def validate_scope_and_historical_errors(
    candidate_path: Union[str, Path],
    target_sheet_name: str,
    baseline_errors: List[BaselineErrorFingerprint]
) -> DeliveryValidationVerdict:
    """
    Validates deliverability of candidate workbook:
    1. Target sheet MUST have ZERO formula errors and zero missing caches.
    2. Historical sheets errors are checked against baseline:
       If an error is identical to baseline AND provably not referenced by target sheet,
       it is classified as an acceptable warning.
       If target sheet directly or indirectly references a historical error, it is rejected.
    """
    cand_p = Path(candidate_path).resolve()
    formula_summary = check_workbook_formulas(cand_p, is_post_recalc=True)

    issues: List[str] = []
    warnings: List[str] = []

    # 1. Strict check: reject if any formulas lack calculated cache
    uncalc_count = formula_summary.get("uncalculated_formulas", 0)
    if formula_summary.get("has_uncalculated", False) or uncalc_count > 0:
        issues.append(f"Workbook contains {uncalc_count} uncalculated formula(s) lacking evaluated cache.")

    # Map baseline error coordinates and fingerprints
    baseline_map = {f"{b.sheet_name.lower()}!{b.coordinate.upper()}": b for b in baseline_errors}

    # Open workbook to inspect formulas and references in target sheet
    wb = openpyxl.load_workbook(cand_p, data_only=False)
    if target_sheet_name not in wb.sheetnames:
        wb.close()
        return DeliveryValidationVerdict(
            verdict="rejected",
            is_deliverable=False,
            target_sheet_errors_count=0,
            historical_isolated_errors_count=0,
            unresolved_dependencies_count=0,
            issues=[f"Target sheet '{target_sheet_name}' not found in candidate."]
        )

    target_ws = wb[target_sheet_name]
    target_referenced_cells: Set[str] = set()

    # Extract all formula tokens from target sheet and detect unresolvable dynamic refs
    for row in target_ws.iter_rows():
        for cell in row:
            if cell.data_type == 'f' or str(cell.value or '').startswith('='):
                formula_str = str(cell.value)
                upper_f = formula_str.upper()

                # Reject unknown/dynamic dependencies that cannot be proven isolated
                for dyn_func in ["INDIRECT(", "OFFSET(", "INDEX(", "VLOOKUP(", "XLOOKUP("]:
                    if dyn_func in upper_f and "!" in upper_f:
                        issues.append(f"Target sheet has dynamic cross-sheet formula '{formula_str}' whose dependency closure cannot be statically proven.")

                if "[" in formula_str or "]" in formula_str:
                    issues.append(f"Target sheet contains external workbook link: '{formula_str}'.")

                try:
                    toks = Tokenizer(formula_str).items
                    for t in toks:
                        if t.subtype == 'RANGE':
                            raw_t = t.value.replace("'", "").strip()
                            if '!' in raw_t:
                                target_referenced_cells.add(raw_t)
                            else:
                                target_referenced_cells.add(f"{target_sheet_name}!{raw_t}")
                except Exception as ex:
                    issues.append(f"Failed to tokenize formula in target sheet at {cell.coordinate}: {ex}")

    # Build transitive dependency closure across referenced sheets
    full_dependency_closure: Set[str] = set()
    queue = list(target_referenced_cells)
    visited_refs = set(queue)

    while queue:
        ref_item = queue.pop(0)
        full_dependency_closure.add(ref_item)
        if '!' in ref_item:
            s_name, range_str = ref_item.split('!', 1)
            # Find worksheet if in candidate
            matching_sheets = [s for s in wb.sheetnames if s.lower() == s_name.lower()]
            if matching_sheets:
                actual_s_name = matching_sheets[0]
                src_sheet = wb[actual_s_name]
                try:
                    min_c, min_r, max_c, max_r = range_boundaries(range_str)
                    for r_idx in range(min_r, max_r + 1):
                        for c_idx in range(min_c, max_c + 1):
                            c_val = src_sheet.cell(r_idx, c_idx).value
                            if str(c_val or '').startswith('='):
                                f_str = str(c_val)
                                upper_f = f_str.upper()
                                for dyn_func in ["INDIRECT(", "OFFSET(", "INDEX(", "VLOOKUP(", "XLOOKUP("]:
                                    if dyn_func in upper_f and "!" in upper_f:
                                        issues.append(
                                            f"Intermediate sheet '{actual_s_name}' cell ({r_idx},{c_idx}) has dynamic cross-sheet "
                                            f"formula '{f_str}' whose dependency closure cannot be statically proven."
                                        )

                                for tok in Tokenizer(f_str).items:
                                    if tok.subtype == 'RANGE':
                                        raw_val = tok.value.replace("'", "").strip()
                                        if '!' in raw_val:
                                            child_ref = raw_val
                                        else:
                                            # Local reference in intermediate worksheet actual_s_name
                                            child_ref = f"{actual_s_name}!{raw_val}"

                                        if child_ref not in visited_refs:
                                            visited_refs.add(child_ref)
                                            queue.append(child_ref)
                except Exception:
                    pass

    # Now inspect with data_only=True to evaluate cell errors in candidate
    wb_data = openpyxl.load_workbook(cand_p, data_only=True)
    target_errors = 0
    isolated_historical_errors = 0
    leaked_historical_errors = 0

    try:
        for s_name in wb_data.sheetnames:
            ws_d = wb_data[s_name]
            for row in ws_d.iter_rows():
                for cell in row:
                    val_str = str(cell.value or '')
                    if cell.data_type == 'e' or val_str in EXCEL_ERRORS:
                        coord = cell.coordinate.upper()
                        full_ref = f"{s_name}!{coord}"
                        norm_key = f"{s_name.lower()}!{coord}"

                        if s_name.lower() == target_sheet_name.lower():
                            # Error located in target sheet -> ZERO TOLERANCE
                            target_errors += 1
                            issues.append(f"Target sheet '{target_sheet_name}' has formula error at {coord}: {val_str}")
                        else:
                            # Error located in historical sheet
                            # 1. Must exist in baseline errors and match error type
                            if norm_key not in baseline_map:
                                issues.append(
                                    f"Historical sheet '{s_name}' has newly introduced non-baseline error at {coord}: {val_str}."
                                )
                                target_errors += 1
                                continue

                            base_err = baseline_map[norm_key]
                            if base_err.error_type != val_str:
                                issues.append(
                                    f"Historical error at {full_ref} changed error type ({base_err.error_type} -> {val_str})."
                                )
                                target_errors += 1
                                continue

                            # 2. Check if referenced anywhere in full dependency closure
                            is_referenced = False
                            for target_ref in full_dependency_closure:
                                if '!' in target_ref:
                                    ref_sheet, ref_range = target_ref.split('!', 1)
                                    if ref_sheet.lower() == s_name.lower():
                                        if _cell_in_range(coord, ref_range):
                                            is_referenced = True
                                            break

                            if is_referenced:
                                leaked_historical_errors += 1
                                issues.append(
                                    f"Target sheet depends on historical error cell {full_ref} ({val_str}) via dependency closure."
                                )
                            else:
                                isolated_historical_errors += 1
                                warnings.append(
                                    f"Isolated historical error in sheet '{s_name}' at {coord} ({val_str}) "
                                    f"matches verified baseline and is not referenced by target deliverable."
                                )
    finally:
        wb.close()
        wb_data.close()

    if target_errors > 0 or leaked_historical_errors > 0 or len(issues) > 0:
        verdict = "rejected"
        is_deliverable = False
    elif isolated_historical_errors > 0 or len(warnings) > 0:
        verdict = "passed_with_warnings"
        is_deliverable = True
    else:
        verdict = "passed"
        is_deliverable = True

    return DeliveryValidationVerdict(
        verdict=verdict,
        is_deliverable=is_deliverable,
        target_sheet_errors_count=target_errors,
        historical_isolated_errors_count=isolated_historical_errors,
        unresolved_dependencies_count=leaked_historical_errors,
        issues=issues,
        warnings=warnings
    )
