"""Structured result models and facts formatting for spreadsheet queries."""

from dataclasses import dataclass, field
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from .tool_result import ToolResult


@dataclass
class QueryResult:
    """Encapsulates the full execution lifecycle and evidence of a query."""
    rows: List[Dict[str, Any]]
    selected_row_ids: List[int]
    total_source_rows: int
    where_row_count: int
    group_count: int
    having_group_count: int
    final_row_count: int
    facts: List[Dict[str, Any]]
    coverage: List[Dict[str, Any]]
    visited_cells: List[str]
    ordered: bool = False
    evidence_id: Optional[str] = None
    stages: Dict[str, int] = field(default_factory=dict)

    def to_tool_result(
        self,
        source: Path,
        source_hash: str,
        requested_plan: Dict[str, Any],
        effective_plan: Dict[str, Any],
        plan_hash: str,
        amount_unit: str = "K",
    ) -> ToolResult:
        """Converts to a standardized ToolResult object with evidence ID and provenance."""
        data = {
            "kind": "spreadsheet_analysis",
            "query_ir_version": "1",
            "plan": effective_plan,
            "requested_plan": requested_plan,
            "plan_hash": plan_hash,
            "facts": self.facts,
            "rows": self.rows,
            "coverage": self.coverage,
            "visited_cells": sorted(self.visited_cells),
            "amount_unit": amount_unit,
            "stages": {
                "source_rows": self.total_source_rows,
                "where_rows": self.where_row_count,
                "groups_count": self.group_count,
                "having_groups_count": self.having_group_count,
                "final_rows": self.final_row_count,
            },
        }

        # Calculate evidence ID
        raw_evidence = source_hash + json.dumps(data, sort_keys=True, ensure_ascii=False, default=str)
        evidence_id = hashlib.sha256(raw_evidence.encode()).hexdigest()[:24]
        data["evidence_id"] = evidence_id
        self.evidence_id = evidence_id

        provenance = {
            "file_path": str(source),
            "workbook_id": source_hash,
            "plan_hash": plan_hash,
            "evidence_id": evidence_id,
        }

        # Compact view for agent / UI
        view = {
            "evidence_id": evidence_id,
            "amount_unit": amount_unit,
            "stages": data["stages"],
            "facts": [
                {k: v for k, v in f.items() if k != "source_cells"}
                for f in self.facts[:50]
            ],
            "total_facts": len(self.facts),
            "rows": self.rows[:50] if self.rows else [],
            "total_rows": len(self.rows) if self.rows else 0,
            "coverage": [
                {k: v for k, v in c.items() if k != "selected_rows"}
                for c in self.coverage
            ],
        }

        return ToolResult.success(
            data=data,
            provenance=provenance,
            text=json.dumps(view, ensure_ascii=False, default=str),
        )
