"""
Contract and canonical hashing structures for SpreadsheetUpdate runs.
Guarantees plan immutability, request hash binding, and reproducible execution evidence.
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional
import hashlib
import json
import datetime


def compute_plan_hash(plan: Dict[str, Any]) -> str:
    """
    Computes deterministic SHA-256 hash of a SpreadsheetUpdatePlan.
    Normalizes keys, sorts lists of operations, and excludes volatile runtime IDs.
    """
    normalized = json.dumps(plan, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def compute_request_hash(task_contract: Dict[str, Any]) -> str:
    """
    Computes deterministic SHA-256 hash of the trusted task contract to ensure
    plan alignment with original user utterance and boundaries.
    """
    normalized = json.dumps(task_contract, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


@dataclass
class PreserveSpec:
    """Explicit collection of immutable workbook assets that must be verified post-execution."""
    sheets: List[str] = field(default_factory=list)
    protected_formulas: List[str] = field(default_factory=list)  # cell coordinates or ranges
    baseline_metrics: List[str] = field(default_factory=list)
    preserve_styles: bool = True
    preserve_page_setup: bool = True


@dataclass
class RequirementCoverage:
    """Requirement ID to operation and check coverage relation."""
    requirement_id: str
    quote: str
    target_operations: List[str] = field(default_factory=list)
    target_checks: List[str] = field(default_factory=list)
    verified: bool = False


@dataclass
class SpreadsheetUpdateReceipt:
    """
    Immutable receipt of a completed spreadsheet update execution.
    Serves as the cryptographically tied authorization for delivery.
    """
    schema_version: str
    run_id: str
    plan_id: str
    plan_hash: str
    request_hash: str
    target_id: str
    target_input_hash: str
    output_hash: Optional[str]
    output_path: Optional[str]
    status: str  # One of EXECUTION_STATUSES
    validation_verdict: str  # passed, passed_with_warnings, rejected
    warnings: List[str] = field(default_factory=list)
    applied_operations: List[Dict[str, Any]] = field(default_factory=list)
    evidence_refs: List[str] = field(default_factory=list)
    formula_health: Dict[str, Any] = field(default_factory=dict)
    requirement_coverages: List[Dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SpreadsheetUpdateReceipt":
        return cls(**data)
