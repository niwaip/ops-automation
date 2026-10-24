"""
Schema definitions and strict validators for SpreadsheetUpdatePlan/v1.
Enforces closed-world validation: rejects unknown root fields, unknown operations,
and enforces bounded mutation operations.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple, Set, Union
import re

SCHEMA_VERSION_V1 = "SpreadsheetUpdatePlan/v1"

SUPPORTED_OPERATIONS: Set[str] = {
    "copy_sheet",
    "set_snapshot_date",
    "fill_from_result",
    "bind_snapshot_comparison",
}

EXECUTION_STATUSES: Set[str] = {
    "discovered",
    "planned",
    "prechecked",
    "applied",
    "recalculated",
    "validated",
    "published",
    "needs_input",
    "unsupported",
    "failed",
}

ALLOWED_ROOT_FIELDS: Set[str] = {
    "schema_version",
    "task_contract_ref",
    "target_ref",
    "sources",
    "as_of",
    "snapshot",
    "semantic_bindings",
    "source_queries",
    "mappings",
    "operations",
    "preserve",
    "checks",
    "requirements",
    "output",
}


@dataclass
class CopySheetOp:
    op: str
    op_id: str
    source_sheet: str
    target_sheet: str
    requirement_refs: List[str] = field(default_factory=list)


@dataclass
class SetSnapshotDateOp:
    op: str
    op_id: str
    sheet: str
    coordinate: str
    date_value: str
    display_format: Optional[str] = None
    requirement_refs: List[str] = field(default_factory=list)


@dataclass
class FillFromResultOp:
    op: str
    op_id: str
    target_sheet: str
    coordinate: str
    fact_ref: str
    region_id: str
    department_code: str
    metric_id: str
    period: str
    value_kind: str
    unit: str
    requirement_refs: List[str] = field(default_factory=list)


@dataclass
class BindSnapshotComparisonOp:
    op: str
    op_id: str
    target_sheet: str
    coordinate: str
    current_ref: str
    baseline_ref: str
    metric_id: str
    period: str
    comparison_kind: str = "diff"  # diff, variance, ratio
    requirement_refs: List[str] = field(default_factory=list)


@dataclass
class SpreadsheetUpdatePlan:
    schema_version: str
    task_contract_ref: str
    target_ref: str
    sources: List[Dict[str, Any]]
    as_of: str
    snapshot: Dict[str, Any]
    semantic_bindings: Dict[str, Any]
    source_queries: List[Dict[str, Any]]
    mappings: List[Dict[str, Any]]
    operations: List[Dict[str, Any]]
    preserve: Dict[str, Any]
    checks: List[Dict[str, Any]]
    requirements: Dict[str, List[str]]
    output: Dict[str, Any]


_CELL_COORD_REGEX = re.compile(r"^[A-Z]{1,3}\d+$")
_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_update_plan(plan: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Strict validation of SpreadsheetUpdatePlan/v1 dictionary.
    Rejects unknown fields, unsupported operations, illegal coordinates or missing constraints.
    Returns: (is_valid, list_of_error_messages)
    """
    errors: List[str] = []
    if not isinstance(plan, dict):
        return False, ["Plan must be a valid JSON object/dict."]

    # 1. Unknown root fields check
    for key in plan.keys():
        if key not in ALLOWED_ROOT_FIELDS:
            errors.append(f"Unknown root field in plan: '{key}'. Strict schema disallows unverified properties.")

    # 2. Check schema_version
    ver = plan.get("schema_version")
    if ver != SCHEMA_VERSION_V1:
        errors.append(f"Invalid schema_version: '{ver}'. Expected '{SCHEMA_VERSION_V1}'.")

    # 3. Check required string references
    for req_field in ["task_contract_ref", "target_ref", "as_of"]:
        val = plan.get(req_field)
        if not val or not isinstance(val, str):
            errors.append(f"Field '{req_field}' is required and must be a non-empty string.")

    # 4. Check as_of date format
    as_of = plan.get("as_of", "")
    if isinstance(as_of, str) and as_of and not _DATE_REGEX.match(as_of):
        errors.append(f"Field 'as_of' must follow YYYY-MM-DD format (got '{as_of}').")

    # 5. Check snapshot section
    snapshot = plan.get("snapshot")
    if not isinstance(snapshot, dict):
        errors.append("Field 'snapshot' is required and must be a dictionary.")
    else:
        for s_field in ["selected_sheet_id", "new_sheet_name"]:
            if not snapshot.get(s_field):
                errors.append(f"Snapshot specification lacks required property '{s_field}'.")

    # 6. Check operations
    ops = plan.get("operations")
    if not isinstance(ops, list) or len(ops) == 0:
        errors.append("Field 'operations' must be a non-empty list of update operations.")
    else:
        for idx, op_item in enumerate(ops):
            if not isinstance(op_item, dict):
                errors.append(f"Operation at index {idx} must be an object.")
                continue
            op_name = op_item.get("op")
            if not op_name or op_name not in SUPPORTED_OPERATIONS:
                errors.append(f"Unsupported or missing operation '{op_name}' at index {idx}. "
                              f"Supported operations: {sorted(list(SUPPORTED_OPERATIONS))}")
                continue

            op_id = op_item.get("op_id")
            if not op_id:
                errors.append(f"Operation '{op_name}' at index {idx} lacks required 'op_id'.")

            # Detail checks per op
            if op_name == "copy_sheet":
                if not op_item.get("source_sheet") or not op_item.get("target_sheet"):
                    errors.append(f"Operation 'copy_sheet' ({op_id}) requires 'source_sheet' and 'target_sheet'.")
            elif op_name == "set_snapshot_date":
                coord = op_item.get("coordinate", "")
                if not _CELL_COORD_REGEX.match(coord):
                    errors.append(f"Operation 'set_snapshot_date' ({op_id}) has invalid coordinate '{coord}'.")
                if not op_item.get("date_value"):
                    errors.append(f"Operation 'set_snapshot_date' ({op_id}) requires 'date_value'.")
            elif op_name == "fill_from_result":
                coord = op_item.get("coordinate", "")
                if coord and not _CELL_COORD_REGEX.match(coord):
                    errors.append(f"Operation 'fill_from_result' ({op_id}) has invalid coordinate '{coord}'.")
                if not op_item.get("fact_ref") and not op_item.get("value"):
                    errors.append(f"Operation 'fill_from_result' ({op_id}) requires 'fact_ref' or 'value'. Models cannot write arbitrary numbers.")
            elif op_name == "bind_snapshot_comparison":
                coord = op_item.get("coordinate", "")
                if not _CELL_COORD_REGEX.match(coord):
                    errors.append(f"Operation 'bind_snapshot_comparison' ({op_id}) has invalid coordinate '{coord}'.")
                if not op_item.get("current_ref") or not op_item.get("baseline_ref"):
                    errors.append(f"Operation 'bind_snapshot_comparison' ({op_id}) requires 'current_ref' and 'baseline_ref'.")

    # 7. Check preserve specification
    preserve = plan.get("preserve")
    if not isinstance(preserve, dict):
        errors.append("Field 'preserve' is required and must define protected sheets/formulas/styles.")

    # 8. Check requirements coverage mapping
    reqs = plan.get("requirements")
    if not isinstance(reqs, dict):
        errors.append("Field 'requirements' must be a dictionary mapping requirement IDs to operations/checks.")

    # 9. Check output specification
    out = plan.get("output")
    if not isinstance(out, dict) or not out.get("display_name"):
        errors.append("Field 'output' must be a dictionary specifying at least 'display_name'.")

    return len(errors) == 0, errors
