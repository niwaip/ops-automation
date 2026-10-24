"""
Turn coordinator and atomic lifecycle runner for spreadsheet updates.
Coordinates discovery -> plan -> compile -> execute -> validate -> publish.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import json
import time

from .schema import validate_update_plan
from .contract import (
    compute_plan_hash,
    compute_request_hash,
    SpreadsheetUpdateReceipt,
)
from .capabilities import probe_workbook_capabilities
from .state import UpdateRunManager, compute_idempotency_key
from .discovery import extract_workbook_ir
from .sources import FactTable, FactRecord
from .compiler import compile_update_plan, CompiledUpdate
from .executor import execute_compiled_update, ExecutionResult
from .diff import compute_semantic_diff
from .validation import validate_scope_and_historical_errors
from .delivery import register_verified_update


@dataclass
class TurnCoordinatorResult:
    is_success: bool
    status: str
    run_id: str
    plan_id: str
    published_file: Optional[str] = None
    receipt: Optional[SpreadsheetUpdateReceipt] = None
    summary: str = ""
    issues: List[str] = None
    warnings: List[str] = None


class SpreadsheetUpdateTurnCoordinator:
    """Orchestrates an end-to-end safe spreadsheet update turn."""

    def __init__(self, run_manager: Optional[UpdateRunManager] = None):
        self.mgr = run_manager or UpdateRunManager()

    def plan_update(
        self,
        plan_dict: Dict[str, Any],
        user_id: str = "default_user"
    ) -> Dict[str, Any]:
        """Validates schema, checks capabilities, initializes run and locks plan."""
        # 1. Schema check
        valid_schema, schema_errs = validate_update_plan(plan_dict)
        if not valid_schema:
            return {
                "success": False,
                "status": "failed",
                "error": "Plan schema validation failed: " + "; ".join(schema_errs),
                "issues": schema_errs
            }

        target_file = Path(plan_dict.get("target_ref", "")).resolve()
        if not target_file.exists():
            return {
                "success": False,
                "status": "failed",
                "error": f"Target workbook '{target_file}' not found."
            }

        # 2. Capabilities probe
        cap_report = probe_workbook_capabilities(target_file)
        if not cap_report.is_supported:
            return {
                "success": False,
                "status": "unsupported",
                "error": "Workbook requires unsupported features: " + "; ".join(cap_report.unsupported_features),
                "unsupported_features": cap_report.unsupported_features
            }

        # 3. Compute deterministic hashes
        p_hash = compute_plan_hash(plan_dict)
        task_contract_ref = plan_dict.get("task_contract_ref", "")
        plan_id = f"plan_{p_hash[:12]}_{self.mgr.run_id}"

        # 4. Initialize transaction run directory & take immutable snapshot
        if not self.mgr.acquire_lock():
            return {
                "success": False,
                "status": "failed",
                "error": "Concurrent execution conflict on target resource."
            }

        try:
            state = self.mgr.initialize_run(
                user_id=user_id,
                target_file=target_file,
                idempotency_key=compute_idempotency_key(user_id, cap_report.file_hash, task_contract_ref, p_hash, plan_dict.get("as_of", ""))
            )
            state.plan_id = plan_id
            state.plan_hash = p_hash
            self.mgr.save_state(state)

            # Save plan into run dir
            plan_file = self.mgr.run_dir / "plan.json"
            plan_file.write_text(json.dumps(plan_dict, indent=2, ensure_ascii=False), encoding="utf-8")

            self.mgr.transition_to("planned", {"plan_id": plan_id, "plan_hash": p_hash})

            # Generate preview summary
            ops = plan_dict.get("operations", [])
            preview_summary = (
                f"计划已锁定 (ID: {plan_id})。目标Sheet: {plan_dict.get('snapshot', {}).get('new_sheet_name')}，"
                f"包含受限更新操作 {len(ops)} 项。"
            )

            return {
                "success": True,
                "status": "planned",
                "run_id": self.mgr.run_id,
                "plan_id": plan_id,
                "plan_hash": p_hash,
                "preview": preview_summary,
                "baseline_errors_count": len(cap_report.baseline_errors),
            }
        finally:
            self.mgr.release_lock()

    def execute_update(
        self,
        plan_id: str,
        expected_plan_hash: str,
        facts: FactTable
    ) -> TurnCoordinatorResult:
        """Executes compiled update, runs headless recalc, checks gates, and publishes."""
        plan_file = self.mgr.run_dir / "plan.json"
        if not plan_file.exists():
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=["Plan file not found in run context."]
            )

        plan_dict = json.loads(plan_file.read_text(encoding="utf-8"))
        actual_hash = compute_plan_hash(plan_dict)
        if expected_plan_hash and actual_hash != expected_plan_hash:
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=[f"Plan hash mismatch! Expected {expected_plan_hash[:12]}, got {actual_hash[:12]}."]
            )

        state = self.mgr.load_state()
        snapshot_p = Path(state.target_path)

        # Baseline errors
        cap_report = probe_workbook_capabilities(snapshot_p)

        # 1. Ingest facts from analytical evidence or source queries if not already populated
        if facts is None or len(facts.all_facts()) == 0:
            if facts is None:
                from .tools import _ACTIVE_FACTS
                facts = _ACTIVE_FACTS.get(self.mgr.run_id)

        if facts is None or len(facts.all_facts()) == 0:
            from .sources import ingest_facts_from_source_queries
            from ..config import WORKSPACE_DIR
            workspace_hint = Path(WORKSPACE_DIR)
            ingested_facts, ingest_issues = ingest_facts_from_source_queries(
                sources=plan_dict.get("sources", []),
                source_queries=plan_dict.get("source_queries", []),
                mappings=plan_dict.get("mappings", []),
                workspace_dir=workspace_hint,
                default_as_of=plan_dict.get("as_of")
            )
            if ingest_issues:
                self.mgr.transition_to("failed", {
                    "error": "; ".join(ingest_issues),
                    "plan_id": plan_id,
                    "plan_hash": expected_plan_hash
                })
                return TurnCoordinatorResult(
                    is_success=False,
                    status="failed",
                    run_id=self.mgr.run_id,
                    plan_id=plan_id,
                    issues=ingest_issues
                )
            if len(ingested_facts.all_facts()) > 0:
                facts = ingested_facts
            elif facts is None:
                facts = ingested_facts

        # Compile
        source_sheet = plan_dict.get("snapshot", {}).get("selected_sheet_id", "")
        target_sheet = plan_dict.get("snapshot", {}).get("new_sheet_name", "")

        sb = plan_dict.get("semantic_bindings", {})
        r_specs = sb.get("region_specs") if isinstance(sb, dict) else None
        if not r_specs and hasattr(self, "region_specs") and self.region_specs:
            r_specs = self.region_specs

        declared_rids = set()
        declared_mids = set()
        for op in plan_dict.get("operations", []):
            if isinstance(op, dict):
                if op.get("region_id"):
                    declared_rids.add(op.get("region_id"))
                if op.get("metric_id"):
                    declared_mids.add(op.get("metric_id"))
        if isinstance(sb, dict) and isinstance(sb.get("regions"), list):
            for r in sb.get("regions"):
                if isinstance(r, str):
                    declared_rids.add(r)
                elif isinstance(r, dict) and r.get("region_id"):
                    declared_rids.add(r.get("region_id"))

        ir = extract_workbook_ir(
            snapshot_p,
            source_sheet,
            region_specs=r_specs,
            declared_region_ids=declared_rids,
            declared_metric_ids=declared_mids
        )

        try:
            compiled = compile_update_plan(plan_dict, ir, facts)
        except Exception as compile_err:
            err_msg = f"Compilation failed: {compile_err}"
            self.mgr.transition_to("failed", {
                "error": err_msg,
                "plan_id": plan_id,
                "plan_hash": expected_plan_hash
            })
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=[err_msg]
            )

        # Execute on candidate
        cand_p = self.mgr.run_dir / "candidate.xlsx"
        exec_res = execute_compiled_update(snapshot_p, compiled, cand_p, recalculate=True)
        if not exec_res.is_success:
            err_msg = f"Execution or recalculation engine failed: {exec_res.error}"
            self.mgr.transition_to("failed", {
                "error": err_msg,
                "plan_id": plan_id,
                "plan_hash": expected_plan_hash
            })
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=[err_msg]
            )

        # Semantic diff verification
        diff_res = compute_semantic_diff(snapshot_p, cand_p, compiled)
        if not diff_res.is_valid:
            err_msg = f"Semantic diff gate rejected candidate: {'; '.join(diff_res.errors + diff_res.unexpected_modifications)}"
            self.mgr.transition_to("failed", {
                "error": err_msg,
                "plan_id": plan_id,
                "plan_hash": expected_plan_hash
            })
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=diff_res.errors + diff_res.unexpected_modifications
            )

        # Delivery gate & historical error isolation
        val_res = validate_scope_and_historical_errors(
            candidate_path=cand_p,
            target_sheet_name=target_sheet,
            baseline_errors=cap_report.baseline_errors
        )
        if not val_res.is_deliverable:
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=val_res.issues
            )
        val_res.warnings.extend(plan_dict.get('semantic_bindings', {}).get('warnings', []))
        if val_res.warnings:
            val_res.verdict = 'passed_with_warnings'

        # 2. Independent requirements coverage and business checks gate
        executed_op_ids = {op.get("op_id") for op in plan_dict.get("operations", []) if op.get("op_id")}
        requirements = plan_dict.get("requirements", {})
        if isinstance(requirements, dict):
            for req_id, targets in requirements.items():
                if not isinstance(targets, list) or len(targets) == 0:
                    return TurnCoordinatorResult(
                        is_success=False,
                        status="failed",
                        run_id=self.mgr.run_id,
                        plan_id=plan_id,
                        issues=[f"Requirement '{req_id}' must specify target operations or checks."]
                    )
                for tgt in targets:
                    if tgt not in executed_op_ids:
                        return TurnCoordinatorResult(
                            is_success=False,
                            status="failed",
                            run_id=self.mgr.run_id,
                            plan_id=plan_id,
                            issues=[f"Requirement '{req_id}' unsatisfied: target '{tgt}' was not executed or not defined."]
                        )

        from .business_checks import verify_business_checks
        check_errors = verify_business_checks(cand_p, target_sheet, compiled, plan_dict.get('checks', []))
        if check_errors:
            return TurnCoordinatorResult(is_success=False,status='failed',run_id=self.mgr.run_id,
                                         plan_id=plan_id,issues=check_errors)

        # 3. Atomic publish with strict path sanitization & anti-overwrite enforcement
        original_target_p = Path(plan_dict.get("target_ref", "")).resolve()
        import os
        from ..config import WORKSPACE_DIR
        ws_env = os.environ.get("WORKSPACE_DIR") or WORKSPACE_DIR
        ws_root = Path(ws_env).resolve() if ws_env and Path(ws_env).exists() else snapshot_p.parent.resolve()

        protected_input_paths: Set[Path] = {original_target_p, snapshot_p.resolve()}
        for s in plan_dict.get("sources", []):
            if isinstance(s, dict):
                fpath_str = s.get("file_path", "") or s.get("source_id", "")
                if fpath_str:
                    p_cand = Path(fpath_str)
                    if not p_cand.is_absolute():
                        p_cand = ws_root / fpath_str
                    if p_cand.exists():
                        protected_input_paths.add(p_cand.resolve())
                    alt_cand = ws_root / Path(fpath_str).name
                    if alt_cand.exists():
                        protected_input_paths.add(alt_cand.resolve())

        raw_output_name = plan_dict.get("output", {}).get("display_name", f"update_{target_sheet}.xlsx")
        pure_name = Path(raw_output_name).name.strip()
        if not pure_name or pure_name in (".", ".."):
            pure_name = f"update_{target_sheet}.xlsx"
        if not pure_name.lower().endswith(".xlsx"):
            pure_name += ".xlsx"

        publish_p = (self.mgr.run_dir / pure_name).resolve()
        if not str(publish_p).startswith(str(self.mgr.run_dir.resolve())):
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=["Security violation: Output path must stay strictly within transaction directory."]
            )

        if publish_p in protected_input_paths:
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=[f"Security violation: Output deliverable '{pure_name}' cannot overwrite source/target input file."]
            )

        if publish_p.exists() and publish_p != cand_p:
            return TurnCoordinatorResult(
                is_success=False,
                status="failed",
                run_id=self.mgr.run_id,
                plan_id=plan_id,
                issues=[f"Publish failed: Deliverable '{pure_name}' already exists in transaction directory."]
            )

        cand_p.replace(publish_p)

        import hashlib
        import shutil
        out_bytes = publish_p.read_bytes()
        out_hash = hashlib.sha256(out_bytes).hexdigest()

        # Also publish deliverable copy to workspace root if configured
        ws_publish_p = None
        if ws_env and Path(ws_env).exists():
            ws_target = (ws_root / pure_name).resolve()
            if not str(ws_target).startswith(str(ws_root)):
                return TurnCoordinatorResult(
                    is_success=False,
                    status="failed",
                    run_id=self.mgr.run_id,
                    plan_id=plan_id,
                    issues=["Security violation: Workspace output path must stay within WORKSPACE_DIR."]
                )
            if ws_target in protected_input_paths:
                return TurnCoordinatorResult(
                    is_success=False,
                    status="failed",
                    run_id=self.mgr.run_id,
                    plan_id=plan_id,
                    issues=[f"Security violation: Workspace output deliverable '{pure_name}' would overwrite an input source/target file."]
                )
            if ws_target.exists():
                return TurnCoordinatorResult(
                    is_success=False, status="failed", run_id=self.mgr.run_id,
                    plan_id=plan_id, issues=[f"Output already exists: {pure_name}; refusing to overwrite."]
                )
            try:
                shutil.copy2(str(publish_p), str(ws_target))
                register_verified_update(ws_target, out_hash)
                ws_publish_p = str(ws_target)
            except Exception as e:
                return TurnCoordinatorResult(
                    is_success=False,
                    status="failed",
                    run_id=self.mgr.run_id,
                    plan_id=plan_id,
                    issues=[f"Failed to copy deliverable to workspace: {e}"]
                )

        # Generate receipt
        receipt = SpreadsheetUpdateReceipt(
            schema_version="SpreadsheetUpdateReceipt/v1",
            run_id=self.mgr.run_id,
            plan_id=plan_id,
            plan_hash=actual_hash,
            request_hash=compute_request_hash({"req": plan_dict.get("task_contract_ref")}),
            target_id=str(snapshot_p),
            target_input_hash=cap_report.file_hash,
            output_hash=out_hash,
            output_path=ws_publish_p or str(publish_p),
            status="published",
            validation_verdict=val_res.verdict,
            warnings=val_res.warnings,
            applied_operations=plan_dict.get("operations", []),
            formula_health=exec_res.recalculated_meta
        )

        receipt_file = self.mgr.run_dir / "receipt.json"
        receipt_file.write_text(json.dumps(receipt.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")

        # Register in delivery gate cache
        register_verified_update(publish_p, out_hash)
        self.mgr.transition_to("published", {"published_hash": out_hash, "published_path": ws_publish_p or str(publish_p)})

        final_delivered_path = ws_publish_p or str(publish_p)
        summary_msg = (
            f"已创建 <{target_sheet}>，更新 {exec_res.applied_writes_count} 项；"
            f"计划基线保持原口径；检查通过 ({val_res.verdict})。\n"
            f"交付文件: {final_delivered_path} (SHA-256: {out_hash[:16]}...)"
        )

        return TurnCoordinatorResult(
            is_success=True,
            status="published",
            run_id=self.mgr.run_id,
            plan_id=plan_id,
            published_file=final_delivered_path,
            receipt=receipt,
            summary=summary_msg,
            warnings=val_res.warnings,
            issues=[]
        )
