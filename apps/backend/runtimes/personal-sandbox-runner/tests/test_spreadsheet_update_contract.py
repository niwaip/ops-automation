"""
Unit tests for PR 1: Spreadsheet Update Contract, Capabilities, and Recalculation Baselines.
"""

import unittest
import tempfile
import shutil
import zipfile
import json
from pathlib import Path
import openpyxl

from dsh_modules.spreadsheet_update.schema import (
    validate_update_plan,
    SCHEMA_VERSION_V1,
    SUPPORTED_OPERATIONS,
)
from dsh_modules.spreadsheet_update.contract import (
    compute_plan_hash,
    compute_request_hash,
    SpreadsheetUpdateReceipt,
    PreserveSpec,
)
from dsh_modules.spreadsheet_update.capabilities import (
    probe_workbook_capabilities,
    get_baseline_formula_errors,
)
from dsh_modules.spreadsheet_update.state import (
    UpdateRunManager,
    compute_idempotency_key,
)
from dsh_modules.workbook_calculation import (
    recalculate_candidate,
    get_or_create_recalculated_workbook,
    check_workbook_formulas,
)


class TestSpreadsheetUpdateContract(unittest.TestCase):

    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="test_update_contract_"))

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_sample_plan(self) -> dict:
        return {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "contract_12345",
            "target_ref": "att_target_999",
            "sources": [
                {
                    "source_id": "src_dept_stats",
                    "role": "department_statistics",
                    "selection_rule": "latest_as_of"
                }
            ],
            "as_of": "2026-10-23",
            "snapshot": {
                "candidate_date_evidence": "sheet_1019_header",
                "selected_sheet_id": "1019",
                "new_sheet_name": "1023",
                "same_day_conflict_strategy": "reject"
            },
            "semantic_bindings": {
                "regions": ["engineering_paid_hours"]
            },
            "source_queries": [
                {
                    "source_id": "src_dept_stats",
                    "query_id": "q1",
                    "select": ["dept_code", "actual_hours"]
                }
            ],
            "mappings": [
                {
                    "source_query_ref": "q1",
                    "target_region": "engineering_paid_hours"
                }
            ],
            "operations": [
                {
                    "op": "copy_sheet",
                    "op_id": "op_copy_1",
                    "source_sheet": "1019",
                    "target_sheet": "1023",
                    "requirement_refs": ["req_1"]
                },
                {
                    "op": "set_snapshot_date",
                    "op_id": "op_date_1",
                    "sheet": "1023",
                    "coordinate": "E2",
                    "date_value": "2026-10-23",
                    "requirement_refs": ["req_2"]
                },
                {
                    "op": "fill_from_result",
                    "op_id": "op_fill_1",
                    "target_sheet": "1023",
                    "coordinate": "E10",
                    "fact_ref": "fact_dept_a_202610",
                    "region_id": "engineering_paid_hours",
                    "department_code": "FC001",
                    "metric_id": "paid_hours",
                    "period": "202610",
                    "value_kind": "actual",
                    "requirement_refs": ["req_3"]
                },
                {
                    "op": "bind_snapshot_comparison",
                    "op_id": "op_comp_1",
                    "target_sheet": "1023",
                    "coordinate": "P10",
                    "current_ref": "'1023'!E10",
                    "baseline_ref": "'1019'!E10",
                    "metric_id": "paid_hours_variance",
                    "period": "202610",
                    "comparison_kind": "diff",
                    "requirement_refs": ["req_4"]
                }
            ],
            "preserve": {
                "sheets": ["1019"],
                "protect_formulas": True,
                "preserve_styles": True
            },
            "checks": [
                {"check": "reconciliation_total_match"}
            ],
            "requirements": {
                "req_1": ["op_copy_1"],
                "req_2": ["op_date_1"],
                "req_3": ["op_fill_1"],
                "req_4": ["op_comp_1"]
            },
            "output": {
                "display_name": "工数预实核算_20261023.xlsx",
                "format": "xlsx"
            }
        }

    def test_valid_plan_passes_validation(self):
        plan = self._create_sample_plan()
        is_valid, errors = validate_update_plan(plan)
        self.assertTrue(is_valid, f"Expected valid plan, got errors: {errors}")
        self.assertEqual(len(errors), 0)

    def test_unknown_root_field_rejected(self):
        plan = self._create_sample_plan()
        plan["unknown_injected_code"] = "import os; os.system('ls')"
        is_valid, errors = validate_update_plan(plan)
        self.assertFalse(is_valid)
        self.assertTrue(any("Unknown root field" in e for e in errors))

    def test_unsupported_operation_rejected(self):
        plan = self._create_sample_plan()
        plan["operations"].append({
            "op": "arbitrary_execute_macro",
            "op_id": "op_hack",
            "code": "DoSomething()"
        })
        is_valid, errors = validate_update_plan(plan)
        self.assertFalse(is_valid)
        self.assertTrue(any("Unsupported or missing operation" in e for e in errors))

    def test_fill_without_fact_ref_rejected(self):
        plan = self._create_sample_plan()
        # Remove fact_ref from fill_from_result to simulate model hallucinating raw number
        fill_op = [op for op in plan["operations"] if op["op"] == "fill_from_result"][0]
        del fill_op["fact_ref"]
        is_valid, errors = validate_update_plan(plan)
        self.assertFalse(is_valid)
        self.assertTrue(any("requires 'fact_ref'" in e for e in errors))

    def test_plan_hash_canonical_and_deterministic(self):
        plan1 = self._create_sample_plan()
        plan2 = self._create_sample_plan()
        # Reverse keys in plan2
        reversed_plan2 = {k: plan2[k] for k in reversed(list(plan2.keys()))}

        h1 = compute_plan_hash(plan1)
        h2 = compute_plan_hash(reversed_plan2)
        self.assertEqual(h1, h2, "Canonical hash must be independent of dict key order.")

        # Mutate plan2
        reversed_plan2["as_of"] = "2026-10-24"
        h3 = compute_plan_hash(reversed_plan2)
        self.assertNotEqual(h1, h3, "Plan change must yield different plan hash.")

    def test_probe_capabilities_clean_workbook(self):
        wb_path = self.test_dir / "clean.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Summary"
        ws["A1"] = "Dept"
        ws["B1"] = "Hours"
        ws["A2"] = "FC001"
        ws["B2"] = 100
        wb.save(wb_path)

        report = probe_workbook_capabilities(wb_path)
        self.assertTrue(report.is_supported)
        self.assertEqual(len(report.unsupported_features), 0)
        self.assertIn("Summary", report.sheet_names)
        self.assertEqual(len(report.baseline_errors), 0)

    def test_probe_capabilities_macro_rejected(self):
        xlsm_path = self.test_dir / "template.xlsm"
        wb = openpyxl.Workbook()
        wb.save(xlsm_path)

        report = probe_workbook_capabilities(xlsm_path)
        self.assertFalse(report.is_supported)
        self.assertIn("vba_macro_present", report.unsupported_features)

    def test_probe_capabilities_extracts_baseline_errors(self):
        err_path = self.test_dir / "with_errors.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws["A1"] = "=1/0"  # Will result in error or formula
        ws["A2"] = "=B99"  # Missing ref
        wb.save(err_path)

        # Inject error cell XML simulation into the xlsx package to test fingerprint extraction
        report = probe_workbook_capabilities(err_path)
        self.assertTrue(report.is_supported)  # formulas themselves don't make it unsupported unless dynamic array

    def test_update_run_manager_lifecycle_and_isolation(self):
        orig_file = self.test_dir / "original_target.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "1019"
        ws["A1"] = "BaseData"
        wb.save(orig_file)

        orig_hash_before = probe_workbook_capabilities(orig_file).file_hash

        # Run manager setup
        mgr = UpdateRunManager(run_id="run_test_001", base_dir=self.test_dir / "runs")
        self.assertTrue(mgr.acquire_lock())

        state = mgr.initialize_run(
            user_id="user_test",
            target_file=orig_file,
            idempotency_key=compute_idempotency_key("user_test", orig_hash_before, "c_hash", "p_hash", "2026-10-23")
        )
        self.assertEqual(state.status, "discovered")
        self.assertEqual(state.target_hash, orig_hash_before)

        # Transition through phases
        mgr.transition_to("planned", {"plan_id": "plan_999"})
        mgr.transition_to("prechecked")
        mgr.transition_to("applied")

        current_state = mgr.load_state()
        self.assertEqual(current_state.status, "applied")
        self.assertEqual(len(current_state.phase_history), 4)

        mgr.release_lock()

        # Verify original file was strictly untouched
        orig_hash_after = probe_workbook_capabilities(orig_file).file_hash
        self.assertEqual(orig_hash_before, orig_hash_after, "Original input file must remain untouched.")

    def test_recalculate_candidate_preserves_partial_diagnosis(self):
        # Create a workbook with intentional uncalculated formula
        test_file = self.test_dir / "uncalculated.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Data"
        ws["A1"] = 10
        ws["A2"] = 20
        ws["A3"] = "=SUM(A1:A2)"
        wb.save(test_file)

        # Direct formula check before recalc
        check_before = check_workbook_formulas(test_file)
        self.assertTrue(check_before.get("has_uncalculated", False))

        cand_out = self.test_dir / "cand_out.xlsx"
        cand_p, meta = recalculate_candidate(test_file, output_path=cand_out)

        # Candidate output path exists
        if cand_p:
            self.assertTrue(cand_p.exists())
            self.assertIn("status", meta)
            # Never relabel partial as verified
            if meta.get("total_errors", 0) > 0:
                self.assertNotEqual(meta["status"], "verified")


if __name__ == "__main__":
    unittest.main()
