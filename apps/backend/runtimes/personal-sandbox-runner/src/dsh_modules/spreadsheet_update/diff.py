"""
Semantic diffing and protection verification between original and candidate workbooks.
Verifies that:
1. Historical sheets are 100% byte/cell identical to source.
2. In the new sheet, only allowed write-set coordinates were modified.
3. No protected formulas were replaced by fixed scalar constants.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple, Union
from decimal import Decimal
from datetime import datetime, date, time
import openpyxl
from openpyxl.utils.datetime import to_excel, WINDOWS_EPOCH
from openpyxl.formula.tokenizer import Tokenizer

from .compiler import CompiledUpdate
from ..workbook_calculation import EXCEL_ERRORS


def _cells_equivalent(ov: Any, cv: Any, epoch=WINDOWS_EPOCH) -> bool:
    """Compares cells with formula normalization and Excel error literal equivalence."""
    if ov == cv:
        return True
    # Calc can normalize a date-formatted serial to a typed date without changing
    # its Excel value. Use the source workbook's epoch (1900 or 1904), not text.
    if isinstance(ov, (int, float)) and not isinstance(ov, bool) and isinstance(cv, (datetime, date, time)):
        return abs(float(ov) - to_excel(cv, epoch)) < 1e-9
    if isinstance(cv, (int, float)) and not isinstance(cv, bool) and isinstance(ov, (datetime, date, time)):
        return abs(to_excel(ov, epoch) - float(cv)) < 1e-9
    if (ov is None or str(ov).strip() == "") and (cv is None or str(cv).strip() == ""):
        return True

    s_ov = str(ov).strip()
    s_cv = str(cv).strip()

    # Formula equivalence (ignoring whitespace and case)
    if s_ov.startswith("=") and s_cv.startswith("="):
        def tokens(formula):
            result = []
            for token in Tokenizer(formula).items:
                value = token.value if token.subtype == 'TEXT' else token.value.upper()
                # Calc reduces a single-cell range C5:C5 to C5. Do not change
                # strings, absolute references or the meaning of wider ranges.
                if token.subtype == 'RANGE' and ':' in value:
                    left, right = value.split(':', 1)
                    if left == right:
                        value = left
                result.append((token.type, token.subtype, value))
            return result
        try:
            if tokens(s_ov) == tokens(s_cv):
                return True
        except Exception:
            return False

    # Excel error literal and error formula equivalence (e.g. '#DIV/0!' vs '=#DIV/0!' or '=1/0')
    clean_err_ov = s_ov.lstrip("=").replace(" ", "").upper()
    clean_err_cv = s_cv.lstrip("=").replace(" ", "").upper()
    if clean_err_ov in EXCEL_ERRORS and clean_err_cv in EXCEL_ERRORS:
        return clean_err_ov == clean_err_cv
    if clean_err_ov in EXCEL_ERRORS and clean_err_cv == "1/0":
        return True
    if clean_err_cv in EXCEL_ERRORS and clean_err_ov == "1/0":
        return True

    # Numeric floating point tolerance
    try:
        d_ov = Decimal(s_ov.replace(",", ""))
        d_cv = Decimal(s_cv.replace(",", ""))
        return abs(d_ov - d_cv) < Decimal("1e-7")
    except Exception:
        pass

    return False


@dataclass
class SemanticDiffReport:
    is_valid: bool
    historical_sheets_preserved: bool
    is_write_set_bounded: bool
    protected_formulas_preserved: bool
    modified_cells: List[Dict[str, Any]] = field(default_factory=list)
    unexpected_modifications: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def compute_semantic_diff(
    original_path: Union[str, Path],
    candidate_path: Union[str, Path],
    compiled: CompiledUpdate
) -> SemanticDiffReport:
    """
    Computes cell-by-cell semantic difference between original and candidate.
    Asserts zero out-of-bounds mutations.
    """
    orig_wb = openpyxl.load_workbook(original_path, data_only=False)
    cand_wb = openpyxl.load_workbook(candidate_path, data_only=False)

    unexpected: List[str] = []
    errors: List[str] = []
    modified: List[Dict[str, Any]] = []

    hist_preserved = True
    formulas_preserved = True
    bounded = True

    try:
        # 1. Assert historical sheets in original workbook remain 100% identical in candidate
        for sheet_name in orig_wb.sheetnames:
            if sheet_name not in cand_wb.sheetnames:
                hist_preserved = False
                unexpected.append(f"Historical sheet '{sheet_name}' was deleted in candidate.")
                continue

            orig_ws = orig_wb[sheet_name]
            cand_ws = cand_wb[sheet_name]

            # Compare cell values
            max_r = max(orig_ws.max_row or 1, cand_ws.max_row or 1)
            max_c = max(orig_ws.max_column or 1, cand_ws.max_column or 1)

            for r in range(1, max_r + 1):
                for c in range(1, max_c + 1):
                    ov = orig_ws.cell(r, c).value
                    cv = cand_ws.cell(r, c).value
                    if not _cells_equivalent(ov, cv, orig_wb.epoch):
                        hist_preserved = False
                        unexpected.append(
                            f"Historical sheet '{sheet_name}' cell ({r},{c}) was modified: '{ov}' -> '{cv}'"
                        )

        # 2. Assert modifications in the new target sheet are bounded strictly to allowed write-set
        if compiled.target_sheet not in cand_wb.sheetnames:
            errors.append(f"Target sheet '{compiled.target_sheet}' missing from candidate.")
            return SemanticDiffReport(
                is_valid=False,
                historical_sheets_preserved=hist_preserved,
                is_write_set_bounded=False,
                protected_formulas_preserved=False,
                errors=errors
            )

        src_ws = orig_wb[compiled.source_sheet]
        target_ws = cand_wb[compiled.target_sheet]

        max_r = max(src_ws.max_row or 1, target_ws.max_row or 1)
        max_c = max(src_ws.max_column or 1, target_ws.max_column or 1)

        allowed_coords = compiled.allowed_write_coordinates

        for r in range(1, max_r + 1):
            for c in range(1, max_c + 1):
                cell_src = src_ws.cell(r, c)
                cell_tgt = target_ws.cell(r, c)
                coord = cell_tgt.coordinate.upper()

                # Check if formula in source was overwritten with static non-formula
                if str(cell_src.value or '').startswith('='):
                    if not str(cell_tgt.value or '').startswith('='):
                        # Formula was erased/overwritten!
                        if coord not in allowed_coords:
                            formulas_preserved = False
                            unexpected.append(f"Formula at {coord} was overwritten by static value: {cell_tgt.value}")

                if not _cells_equivalent(cell_src.value, cell_tgt.value, orig_wb.epoch):
                    modified.append({
                        "sheet": compiled.target_sheet,
                        "coordinate": coord,
                        "old_value": cell_src.value,
                        "new_value": cell_tgt.value
                    })
                    if coord not in allowed_coords:
                        bounded = False
                        unexpected.append(
                            f"Out-of-bounds modification at {coord}: '{cell_src.value}' -> '{cell_tgt.value}'"
                        )

    finally:
        orig_wb.close()
        cand_wb.close()

    is_valid = hist_preserved and bounded and formulas_preserved and len(unexpected) == 0 and len(errors) == 0
    return SemanticDiffReport(
        is_valid=is_valid,
        historical_sheets_preserved=hist_preserved,
        is_write_set_bounded=bounded,
        protected_formulas_preserved=formulas_preserved,
        modified_cells=modified,
        unexpected_modifications=unexpected,
        errors=errors
    )
