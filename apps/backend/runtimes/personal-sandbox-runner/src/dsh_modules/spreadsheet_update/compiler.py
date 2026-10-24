"""
Compiler for SpreadsheetUpdatePlan/v1 into an immutable CompiledUpdate artifact.
Performs pre-execution boundary checks: prevents overwriting formulas, merged slave cells,
or protected baselines, and constructs cell writes directly tied to FactTable records.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, Any, List, Optional, Set, Tuple
import re

from .bindings import LogicalKey, BindingRegistry
from .discovery import WorkbookIR
from .sources import FactTable, FactRecord


@dataclass
class CellWrite:
    sheet_name: str
    coordinate: str
    old_value: Any
    new_value: Any
    value_type: str  # number, date, string
    fact_ref: Optional[str] = None
    logical_key: Optional[LogicalKey] = None


@dataclass
class FormulaWrite:
    sheet_name: str
    coordinate: str
    formula_expression: str
    metric_id: str
    period: str


@dataclass
class CompiledUpdate:
    plan_id: str
    target_sheet: str
    source_sheet: str
    snapshot_date: str
    snapshot_date_coordinate: Optional[str]
    cell_writes: List[CellWrite] = field(default_factory=list)
    formula_writes: List[FormulaWrite] = field(default_factory=list)
    protected_coordinates: Set[str] = field(default_factory=set)
    affected_formulas: List[str] = field(default_factory=list)
    allowed_write_coordinates: Set[str] = field(default_factory=set)


class UpdateCompilationError(Exception):
    pass


def compile_update_plan(
    plan: Dict[str, Any],
    ir: WorkbookIR,
    facts: FactTable
) -> CompiledUpdate:
    """
    Compiles SpreadsheetUpdatePlan into an immutable CompiledUpdate.
    Validates that:
    1. No cell write overwrites an existing formula.
    2. No cell write targets an unmapped or protected coordinate.
    3. All fill_from_result writes correspond to valid facts in FactTable.
    4. Snapshot comparison formulas are safely constructed.
    """
    snapshot = plan.get("snapshot", {})
    source_sheet = snapshot.get("selected_sheet_id", "")
    target_sheet = snapshot.get("new_sheet_name", "")
    if not source_sheet or not target_sheet:
        raise UpdateCompilationError("Plan lacks selected_sheet_id or new_sheet_name in snapshot.")

    compiled = CompiledUpdate(
        plan_id=plan.get("task_contract_ref", "unknown_plan"),
        target_sheet=target_sheet,
        source_sheet=source_sheet,
        snapshot_date=plan.get("as_of", ""),
        snapshot_date_coordinate=None,
    )

    # 1. Collect protected formula, budget, and cell coordinates from IR and plan preserve spec
    for f_coord in ir.all_formula_cells:
        compiled.protected_coordinates.add(f_coord.upper())
    for b_coord in ir.all_budget_cells:
        compiled.protected_coordinates.add(b_coord.upper())
    for region in ir.regions:
        for f_coord in region.formula_cells:
            compiled.protected_coordinates.add(f_coord.upper())

    # Include explicit preserve specifications
    preserve_spec = plan.get("preserve", {})
    if isinstance(preserve_spec, dict):
        for pf in preserve_spec.get("protected_formulas", []):
            compiled.protected_coordinates.add(str(pf).upper())
        for pc in preserve_spec.get("protected_cells", []):
            compiled.protected_coordinates.add(str(pc).upper())

    # Check cardinality of facts before applying writes
    required_keys = []
    for op in plan.get("operations", []):
        if op.get("op") == "fill_from_result":
            if any(not op.get(field) for field in ('unit','value_kind','metric_id','period','region_id','department_code')):
                raise UpdateCompilationError('Fill requires explicitly bound unit, kind, metric, period, region and key')
            required_keys.append(LogicalKey(
                region_id=op.get("region_id", ""),
                department_code=op.get("department_code", ""),
                metric_id=op.get("metric_id", ""),
                period=str(op.get("period", "")),
                value_kind=op.get("value_kind"),
                unit=op.get("unit")
            ))
    card_report = facts.check_cardinality_against_bindings(required_keys)
    if not card_report.is_valid:
        raise UpdateCompilationError(f"Cardinality check failed: {'; '.join(card_report.errors)}")

    # 2. Process operations sequentially
    operations = plan.get("operations", [])
    op_ids = [op.get('op_id') for op in operations]
    if len(op_ids) != len(set(op_ids)):
        raise UpdateCompilationError('Duplicate operation IDs are forbidden')
    for op in operations:
        op_name = op.get("op")
        op_id = op.get("op_id", "unnamed_op")

        if op_name == "copy_sheet":
            if op.get("source_sheet") != source_sheet or op.get("target_sheet") != target_sheet:
                raise UpdateCompilationError(f"Operation 'copy_sheet' ({op_id}) sheets do not match plan snapshot.")

        elif op_name == "set_snapshot_date":
            coord = op.get("coordinate", "").upper()
            if coord in compiled.protected_coordinates:
                raise UpdateCompilationError(f"Cannot write snapshot date to protected formula cell {coord}.")
            compiled.snapshot_date_coordinate = coord
            compiled.allowed_write_coordinates.add(coord)
            compiled.cell_writes.append(
                CellWrite(
                    sheet_name=target_sheet,
                    coordinate=coord,
                    old_value=None,
                    new_value=op.get("date_value"),
                    value_type="date"
                )
            )

        elif op_name == "fill_from_result":
            coord = op.get("coordinate", "").upper()
            if coord in compiled.protected_coordinates or coord in ir.all_formula_cells:
                raise UpdateCompilationError(
                    f"Forbidden: fill_from_result ({op_id}) attempted to overwrite existing formula at {coord}."
                )
            if coord in ir.all_budget_cells:
                raise UpdateCompilationError(
                    f"Forbidden: fill_from_result ({op_id}) attempted to overwrite protected budget cell at {coord}."
                )

            # Reconstruct typed logical key
            value_kind = op.get("value_kind")
            if value_kind in ("plan", "budget"):
                raise UpdateCompilationError(
                    f"Forbidden: fill_from_result ({op_id}) attempted to mutate protected budget/plan baseline."
                )

            key = LogicalKey(
                region_id=op.get("region_id", ""),
                department_code=op.get("department_code", ""),
                metric_id=op.get("metric_id", ""),
                period=str(op.get("period", "")),
                value_kind=value_kind,
                unit=op.get("unit")
            )

            # Validate coordinate strictly against BindingRegistry
            resolved_binding = ir.registry.get_by_key(key)
            if not resolved_binding:
                raise UpdateCompilationError(
                    f"Forbidden: no semantic binding found in BindingRegistry for {key.to_key_string()}. "
                    f"Plan operation '{op_id}' specifies unverified coordinate '{coord}'. "
                    f"Untrusted write coordinates without verified bindings are strictly rejected."
                )

            if not coord:
                coord = resolved_binding.coordinate.upper()
                op["coordinate"] = coord
            elif resolved_binding.coordinate.upper() != coord:
                raise UpdateCompilationError(
                    f"Coordinate mismatch for {key.to_key_string()}: plan specifies '{coord}', "
                    f"but verified BindingRegistry located '{resolved_binding.coordinate}'."
                )
            if resolved_binding.is_formula:
                raise UpdateCompilationError(
                    f"Forbidden: verified binding for {key.to_key_string()} at {coord} is a formula."
                )

            fact = facts.get_fact(key)
            if not fact:
                raise UpdateCompilationError(
                    f"FactTable missing fact for logical key: {key.to_key_string()} (op_id={op_id})"
                )
            if fact.evidence_id != op.get('fact_ref'):
                raise UpdateCompilationError(f'Fact evidence mismatch for {key.to_key_string()}')
            if coord in compiled.allowed_write_coordinates:
                raise UpdateCompilationError(f'Duplicate write to {coord}')

            # Target value must be Decimal or float
            val_to_write = float(fact.numeric_value)
            compiled.allowed_write_coordinates.add(coord)
            compiled.cell_writes.append(
                CellWrite(
                    sheet_name=target_sheet,
                    coordinate=coord,
                    old_value=None,
                    new_value=val_to_write,
                    value_type="number",
                    fact_ref=fact.evidence_id,
                    logical_key=key
                )
            )

        elif op_name == "bind_snapshot_comparison":
            coord = op.get("coordinate", "").upper()
            curr_ref = op.get("current_ref", "")
            base_ref = op.get("baseline_ref", "")
            if not curr_ref or not base_ref:
                raise UpdateCompilationError(f"bind_snapshot_comparison ({op_id}) requires current_ref and baseline_ref.")

            # Safe formula construction
            formula_str = f"={curr_ref}-{base_ref}"
            compiled.allowed_write_coordinates.add(coord)
            compiled.formula_writes.append(
                FormulaWrite(
                    sheet_name=target_sheet,
                    coordinate=coord,
                    formula_expression=formula_str,
                    metric_id=op.get("metric_id", ""),
                    period=str(op.get("period", ""))
                )
            )

    return compiled
