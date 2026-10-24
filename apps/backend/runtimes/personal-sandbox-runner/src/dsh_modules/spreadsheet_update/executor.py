"""
Sandbox workbook execution engine for CompiledUpdate.
Performs faithful worksheet duplication, applies constrained cell writes,
and invokes the underlying headless LibreOffice recalculation candidate pipeline.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import openpyxl
import shutil

from .compiler import CompiledUpdate
from ..workbook_calculation import recalculate_candidate


@dataclass
class ExecutionResult:
    is_success: bool
    candidate_path: Optional[Path]
    recalculated_meta: Dict[str, Any]
    applied_writes_count: int
    applied_formulas_count: int
    error: Optional[str] = None


def duplicate_worksheet_faithfully(
    wb: openpyxl.Workbook,
    source_sheet_name: str,
    target_sheet_name: str
) -> openpyxl.worksheet.worksheet.Worksheet:
    """
    Duplicates worksheet with explicit fidelity preserving row dimensions,
    column dimensions, merged cells, and freeze panes.
    """
    if source_sheet_name not in wb.sheetnames:
        raise ValueError(f"Source worksheet '{source_sheet_name}' does not exist.")

    src_ws = wb[source_sheet_name]
    target_ws = wb.copy_worksheet(src_ws)
    target_ws.title = target_sheet_name

    # Preserve view and pane setup
    target_ws.freeze_panes = src_ws.freeze_panes

    # Preserve column dimensions
    for col_letter, col_dim in src_ws.column_dimensions.items():
        target_ws.column_dimensions[col_letter].width = col_dim.width
        target_ws.column_dimensions[col_letter].hidden = col_dim.hidden

    # Preserve row dimensions
    for row_idx, row_dim in src_ws.row_dimensions.items():
        target_ws.row_dimensions[row_idx].height = row_dim.height
        target_ws.row_dimensions[row_idx].hidden = row_dim.hidden

    return target_ws


def execute_compiled_update(
    source_workbook_path: Union[str, Path],
    compiled: CompiledUpdate,
    candidate_output_path: Union[str, Path],
    recalculate: bool = True
) -> ExecutionResult:
    """
    Applies compiled update to a fresh sandbox copy of the source workbook,
    saves the candidate, and triggers headless LibreOffice recalculation.
    Never alters the original source workbook.
    """
    src_p = Path(source_workbook_path).resolve()
    cand_p = Path(candidate_output_path).resolve()
    cand_p.parent.mkdir(parents=True, exist_ok=True)

    if not src_p.exists():
        return ExecutionResult(
            is_success=False,
            candidate_path=None,
            recalculated_meta={},
            applied_writes_count=0,
            applied_formulas_count=0,
            error=f"Source workbook {src_p} does not exist."
        )

    # 1. Load source workbook preserving formulas
    wb = openpyxl.load_workbook(src_p, data_only=False)

    try:
        # 2. Duplicate worksheet
        target_ws = duplicate_worksheet_faithfully(wb, compiled.source_sheet, compiled.target_sheet)

        # 3. Apply cell writes
        writes_count = 0
        for write in compiled.cell_writes:
            cell = target_ws[write.coordinate]
            write.old_value = cell.value
            cell.value = write.new_value
            writes_count += 1

        # 4. Apply formula writes
        formulas_count = 0
        for f_write in compiled.formula_writes:
            cell = target_ws[f_write.coordinate]
            cell.value = f_write.formula_expression
            formulas_count += 1

        # 5. Save candidate workbook
        wb.save(cand_p)
    except Exception as e:
        return ExecutionResult(
            is_success=False,
            candidate_path=None,
            recalculated_meta={},
            applied_writes_count=0,
            applied_formulas_count=0,
            error=f"Failed to apply writes to candidate: {e}"
        )
    finally:
        wb.close()

    # 6. Recalculate via headless LibreOffice candidate engine
    if recalculate:
        recalc_out, meta = recalculate_candidate(cand_p, output_path=cand_p, force=True)
        return ExecutionResult(
            is_success=bool(recalc_out and recalc_out.exists()),
            candidate_path=cand_p,
            recalculated_meta=meta,
            applied_writes_count=writes_count,
            applied_formulas_count=formulas_count,
            error=meta.get("error")
        )
    else:
        return ExecutionResult(
            is_success=True,
            candidate_path=cand_p,
            recalculated_meta={"status": "uncalculated"},
            applied_writes_count=writes_count,
            applied_formulas_count=formulas_count
        )
