"""
Spreadsheet Update Package.
Implements bounded, immutable, verifiable multi-source spreadsheet updates in DSH.
"""

from .schema import (
    SpreadsheetUpdatePlan,
    SCHEMA_VERSION_V1,
    SUPPORTED_OPERATIONS,
    EXECUTION_STATUSES,
    validate_update_plan,
)
from .contract import (
    SpreadsheetUpdateReceipt,
    PreserveSpec,
    compute_plan_hash,
    compute_request_hash,
)
from .capabilities import (
    probe_workbook_capabilities,
    WorkbookCapabilityReport,
    get_baseline_formula_errors,
)
from .state import (
    UpdateRunManager,
    UpdateRunState,
    compute_idempotency_key,
)
from .bindings import (
    LogicalKey,
    CellBinding,
    BindingRegistry,
)
from .discovery import (
    WorkbookIR,
    BusinessRegion,
    extract_workbook_ir,
)
from .sources import (
    SourceDescriptor,
    FactRecord,
    FactTable,
    CardinalityReport,
    ingest_facts_from_source_queries,
)
from .compiler import (
    CellWrite,
    FormulaWrite,
    CompiledUpdate,
    compile_update_plan,
    UpdateCompilationError,
)
from .executor import (
    ExecutionResult,
    execute_compiled_update,
    duplicate_worksheet_faithfully,
)
from .diff import (
    SemanticDiffReport,
    compute_semantic_diff,
)
from .validation import (
    DeliveryValidationVerdict,
    validate_scope_and_historical_errors,
)
from .delivery import (
    validate_update_delivery,
    register_verified_update,
    is_verified_update_file,
)
from .turn import (
    SpreadsheetUpdateTurnCoordinator,
    TurnCoordinatorResult,
)
from .tools import (
    tool_plan_spreadsheet_update,
    tool_execute_spreadsheet_update,
    tool_get_spreadsheet_update_status,
    SPREADSHEET_UPDATE_TOOL_DEFINITIONS,
    register_turn_facts,
)

__all__ = [
    "SpreadsheetUpdatePlan",
    "SCHEMA_VERSION_V1",
    "SUPPORTED_OPERATIONS",
    "EXECUTION_STATUSES",
    "validate_update_plan",
    "SpreadsheetUpdateReceipt",
    "PreserveSpec",
    "compute_plan_hash",
    "compute_request_hash",
    "probe_workbook_capabilities",
    "WorkbookCapabilityReport",
    "get_baseline_formula_errors",
    "UpdateRunManager",
    "UpdateRunState",
    "compute_idempotency_key",
    "LogicalKey",
    "CellBinding",
    "BindingRegistry",
    "WorkbookIR",
    "BusinessRegion",
    "extract_workbook_ir",
    "SourceDescriptor",
    "FactRecord",
    "FactTable",
    "CardinalityReport",
    "ingest_facts_from_source_queries",
    "CellWrite",
    "FormulaWrite",
    "CompiledUpdate",
    "compile_update_plan",
    "UpdateCompilationError",
    "ExecutionResult",
    "execute_compiled_update",
    "duplicate_worksheet_faithfully",
    "SemanticDiffReport",
    "compute_semantic_diff",
    "DeliveryValidationVerdict",
    "validate_scope_and_historical_errors",
    "validate_update_delivery",
    "register_verified_update",
    "is_verified_update_file",
    "SpreadsheetUpdateTurnCoordinator",
    "TurnCoordinatorResult",
    "tool_plan_spreadsheet_update",
    "tool_execute_spreadsheet_update",
    "tool_get_spreadsheet_update_status",
    "SPREADSHEET_UPDATE_TOOL_DEFINITIONS",
    "register_turn_facts",
]
