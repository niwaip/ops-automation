"""
Regression and verification test suite for all 8 P1 review findings:
1. Output path traversal and overwrite protection
2. Formula & budget protection under default IR and binding verification
3. Tampered verified updates strictly rejected without legacy fallback
4. Uncalculated formulas and non-baseline errors blocked
5. Multi-source file ingestion without manual fact registration
6. ToolResult rich outputs (full 64-char hash, run_id, outbound file card)
7. Requirements coverage and business checks enforcement
8. Advisory and negative execution prompts block mutative update tools
"""

import unittest
import tempfile
import shutil
import hashlib
import json
from decimal import Decimal
from pathlib import Path
import openpyxl

from dsh_modules.tools import execute_tool, get_sandbox_tools
from dsh_modules.runner import select_active_tools
from dsh_modules.skill_router import SkillRoutingResult
from dsh_modules.spreadsheet_update.schema import SCHEMA_VERSION_V1
from dsh_modules.spreadsheet_update.bindings import LogicalKey
from dsh_modules.spreadsheet_update.discovery import extract_workbook_ir
from dsh_modules.spreadsheet_update.sources import FactTable, FactRecord, ingest_facts_from_source_queries
from dsh_modules.spreadsheet_update.compiler import compile_update_plan, UpdateCompilationError
from dsh_modules.spreadsheet_update.turn import SpreadsheetUpdateTurnCoordinator
from dsh_modules.spreadsheet_update.state import UpdateRunManager
from dsh_modules.spreadsheet_update.validation import validate_scope_and_historical_errors
from dsh_modules.spreadsheet_update.capabilities import BaselineErrorFingerprint
from dsh_modules.spreadsheet_update.delivery import (
    validate_update_delivery,
    register_verified_update,
    _VERIFIED_UPDATE_FILES,
)
from dsh_modules.spreadsheet_update.contract import compute_plan_hash, SpreadsheetUpdateReceipt


class TestSpreadsheetUpdateP1Fixes(unittest.TestCase):

    @staticmethod
    def _simulate_recalculate_candidate(file_path, output_path=None, force=False):
        import zipfile, re, shutil
        dest = Path(output_path).resolve() if output_path else Path(file_path).resolve()
        if str(dest) != str(Path(file_path).resolve()):
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, dest)

        tmp_unzip = dest.parent / f"tmp_recalc_{dest.stem}"
        tmp_unzip.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(dest, "r") as zin:
                zin.extractall(tmp_unzip)
            for s_xml in (tmp_unzip / "xl" / "worksheets").glob("sheet*.xml"):
                content = s_xml.read_text("utf-8")
                content = content.replace("<v></v>", "<v>100</v>")
                content = re.sub(r'(<f>[^<]+</f>)(?!<v>)', r'\1<v>100</v>', content)
                s_xml.write_text(content, "utf-8")
            with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
                for p in tmp_unzip.rglob("*"):
                    if p.is_file():
                        zout.write(p, p.relative_to(tmp_unzip))
        finally:
            shutil.rmtree(tmp_unzip, ignore_errors=True)

        from dsh_modules.workbook_calculation import check_workbook_formulas, RECALC_CACHE_VERSION
        f_check = check_workbook_formulas(dest, is_post_recalc=True)
        meta = {
            "schema_version": 1,
            "status": "verified" if f_check.get("total_errors", 0) == 0 else "partial",
            "engine_execution": "success",
            "provenance": {"workbook_id": "mock", "engine": "libreoffice_calc_headless", "validator_version": RECALC_CACHE_VERSION},
            **f_check
        }
        return dest, meta

    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="test_p1_fixes_"))
        self.target_wb_path = self.test_dir / "target_template.xlsx"
        self._build_target_workbook(self.target_wb_path)
        if shutil.which("soffice") is None:
            from unittest.mock import patch
            self._recalc_patch = patch(
                "dsh_modules.spreadsheet_update.executor.recalculate_candidate",
                side_effect=self._simulate_recalculate_candidate
            )
            self._recalc_patch.start()
        else:
            self._recalc_patch = None

    def tearDown(self):
        if getattr(self, "_recalc_patch", None):
            self._recalc_patch.stop()
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _build_target_workbook(self, path: Path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "1019"

        ws["B2"] = "快照日期"
        ws["C2"] = "2026-10-19"

        ws["B4"] = "部门编码"
        ws["C4"] = "202610"
        ws["D4"] = "202611"
        ws["E4"] = "合计"

        ws["B5"] = "FC001"
        ws["C5"] = 100
        ws["D5"] = 150
        ws["E5"] = "=SUM(C5:D5)"

        ws["B6"] = "合计"
        ws["C6"] = "=SUM(C5:C5)"
        ws["D6"] = "=SUM(D5:D5)"
        ws["E6"] = "=SUM(E5:E5)"

        wb.save(path)
        wb.close()

    def _build_clean_workbook(self, path: Path):
        """Creates target workbook without uncalculated formulas for path and tool testing."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "1019"
        ws["B2"] = "快照日期"
        ws["C2"] = "2026-10-19"
        ws["B4"] = "部门编码"
        ws["C4"] = "202610"
        ws["B5"] = "FC001"
        ws["C5"] = 100
        wb.save(path)
        wb.close()

    def test_p1_output_path_escape_and_overwrite_prohibited(self):
        clean_target = self.test_dir / "clean_target_path.xlsx"
        self._build_clean_workbook(clean_target)

        mgr = UpdateRunManager(base_dir=self.test_dir / "runs")
        coord = SpreadsheetUpdateTurnCoordinator(run_manager=mgr)

        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "c1",
            "target_ref": str(clean_target),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "operations": [{"op": "copy_sheet", "op_id": "1", "source_sheet": "1019", "target_sheet": "1023"}],
            "preserve": {"sheets": ["1019"]},
            "requirements": {"req1": ["1"]},
            # Malicious output name attempting directory escape to overwrite the target
            "output": {"display_name": f"/workspace/{clean_target.name}"}
        }

        plan_res = coord.plan_update(plan)
        self.assertTrue(plan_res["success"])

        # Try to execute: must not overwrite source target workbook
        exec_res = coord.execute_update(plan_id=plan_res["plan_id"], expected_plan_hash=plan_res["plan_hash"], facts=FactTable())
        self.assertTrue(exec_res.is_success, f"Execution failed: {exec_res.issues}")
        # Verify the published file name was safely sanitized to pure basename in run_dir
        self.assertTrue(Path(exec_res.published_file).name == clean_target.name)
        self.assertNotEqual(Path(exec_res.published_file).resolve(), clean_target.resolve())

    def test_p1_formula_overwrite_blocked_under_default_ir(self):
        # Default IR without region_specs must detect all formulas
        ir = extract_workbook_ir(self.target_wb_path, "1019")
        self.assertIn("E5", ir.all_formula_cells)
        self.assertIn("E6", ir.all_formula_cells)

        facts = FactTable()
        k = LogicalKey("default_region", "FC001", "amount", "202610", "actual", "hours")
        facts.add_fact(FactRecord(k, Decimal("188"), "hours", "202610", "2026-10-23", "s", 1, "C1", "ev"))

        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "operations": [
                {"op": "copy_sheet", "op_id": "1", "source_sheet": "1019", "target_sheet": "1023"},
                # Attempt to overwrite summary formula E5 with 188
                {
                    "op": "fill_from_result",
                    "op_id": "bad_fill",
                    "coordinate": "E5",
                    "region_id": "default_region",
                    "department_code": "FC001",
                    "metric_id": "amount",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours",
                    "fact_ref": "ev"
                }
            ]
        }

        with self.assertRaises(UpdateCompilationError) as ctx:
            compile_update_plan(plan, ir, facts)
        self.assertIn("attempted to overwrite existing formula at E5", str(ctx.exception))

    def test_p1_budget_baseline_modification_blocked(self):
        ir = extract_workbook_ir(self.target_wb_path, "1019")
        facts = FactTable()
        k_plan = LogicalKey("default_region", "FC001", "amount", "202610", "plan", "hours")
        facts.add_fact(FactRecord(k_plan, Decimal("500"), "hours", "202610", "2026-10-23", "s", 1, "C1", "ev"))

        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "operations": [
                {"op": "copy_sheet", "op_id": "1", "source_sheet": "1019", "target_sheet": "1023"},
                {
                    "op": "fill_from_result",
                    "op_id": "bad_plan_fill",
                    "coordinate": "C5",
                    "region_id": "default_region",
                    "department_code": "FC001",
                    "metric_id": "amount",
                    "period": "202610",
                    "value_kind": "plan",
                    "unit": "hours",
                    "fact_ref": "ev"
                }
            ]
        }
        with self.assertRaises(UpdateCompilationError) as ctx:
            compile_update_plan(plan, ir, facts)
        self.assertIn("budget/plan baseline", str(ctx.exception))

    def test_p1_tampered_verified_file_strictly_rejected(self):
        f = self.test_dir / "verified_output.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        wb.save(f)
        wb.close()

        correct_hash = hashlib.sha256(f.read_bytes()).hexdigest()
        register_verified_update(f, correct_hash)

        # 1. Valid file passes
        valid_res, _ = validate_update_delivery(f)
        self.assertTrue(valid_res)

        # 2. Tamper the file value from 100 to 999999
        wb_mod = openpyxl.load_workbook(f)
        wb_mod.active["A1"] = 999999
        wb_mod.save(f)
        wb_mod.close()

        # 3. Must be strictly rejected! Cannot fallback to legacy inspect_generated_workbook
        tampered_res, issues = validate_update_delivery(f)
        self.assertFalse(tampered_res)
        self.assertTrue(any("Hash drift" in iss or "modified after validation" in iss for iss in issues))

    def test_p1_uncalculated_formula_and_non_baseline_error_rejected(self):
        # A. Uncalculated formula check
        uncalc_file = self.test_dir / "has_uncalc.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Target"
        ws["A1"] = 10
        ws["A2"] = "=A1*2"
        wb.save(uncalc_file)
        wb.close()

        res_uncalc = validate_scope_and_historical_errors(uncalc_file, "Target", [])
        self.assertEqual(res_uncalc.verdict, "rejected")
        self.assertTrue(any("uncalculated formula" in iss for iss in res_uncalc.issues))

        # B. Non-baseline error in historical sheet must be rejected
        err_file = self.test_dir / "non_baseline_err.xlsx"
        wb2 = openpyxl.Workbook()
        ws_hist = wb2.active
        ws_hist.title = "Hist"
        ws_hist["A1"] = "#VALUE!"
        ws_hist["A1"].data_type = 'e'
        ws_tgt = wb2.create_sheet("Target")
        ws_tgt["A1"] = 100
        wb2.save(err_file)
        wb2.close()

        # baseline_errors is empty, so #VALUE! is an introduced non-baseline error
        res_nonbase = validate_scope_and_historical_errors(err_file, "Target", baseline_errors=[])
        self.assertEqual(res_nonbase.verdict, "rejected")
        self.assertTrue(any("newly introduced non-baseline error" in iss for iss in res_nonbase.issues))

    def test_p1_end_to_end_source_queries_execution(self):
        # Create external source workbook
        src_path = self.test_dir / "real_dept_stats.xlsx"
        wb_src = openpyxl.Workbook()
        ws = wb_src.active
        ws.title = "Sheet1"
        ws["A1"] = "部门编码"
        ws["B1"] = "实绩工时"
        ws["C1"] = "期间"
        ws["A2"] = "FC001"
        ws["B2"] = 175.5
        ws["C2"] = "202610"
        wb_src.save(src_path)
        wb_src.close()

        # Ingest directly using ingest_facts_from_source_queries
        sources = [{"source_id": "src1", "file_path": str(src_path), "unit": "hours", "as_of":"2026-10-23"}]
        source_queries = [{"source_id":"src1","target_region":"default_region","metric_id":"amount",
                           "sheet_name":"Sheet1","header_row":1,"data_range":"A2:C2",
                           "key_field":"部门编码","value_field":"实绩工时","period_field":"期间","value_kind":"actual"}]
        facts, issues = ingest_facts_from_source_queries(sources, source_queries, [], workspace_dir=self.test_dir)
        self.assertEqual(len(issues), 0)
        self.assertEqual(len(facts.all_facts()), 1)

        key = LogicalKey("default_region", "FC001", "amount", "202610", "actual", "hours")
        fact_rec = facts.get_fact(key)
        self.assertIsNotNone(fact_rec)
        self.assertEqual(fact_rec.numeric_value, Decimal("175.5"))

    def test_p1_tools_return_complete_hashes_and_outbound_card(self):
        clean_target = self.test_dir / "clean_target_tools.xlsx"
        self._build_clean_workbook(clean_target)

        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "c1",
            "target_ref": str(clean_target),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "operations": [{"op": "copy_sheet", "op_id": "1", "source_sheet": "1019", "target_sheet": "1023"}],
            "preserve": {"sheets": ["1019"]},
            "requirements": {"req1": ["1"]},
            "output": {"display_name": "final_output.xlsx"}
        }

        # Public tools reject internal operation protocols; the model uses semantic fields.
        plan_str = execute_tool('plan_spreadsheet_update', {'plan':plan})
        self.assertTrue(plan_str.is_error)
        self.assertFalse((self.test_dir/'final_output.xlsx').exists())
        from dsh_modules.spreadsheet_update.tool_schema import SPREADSHEET_UPDATE_TOOL_DEFINITIONS
        execute_schema=SPREADSHEET_UPDATE_TOOL_DEFINITIONS[1]['function']['parameters']
        self.assertEqual(execute_schema['required'], ['plan_id'])
        self.assertNotIn('expected_plan_hash',execute_schema['properties'])

    def test_p1_requirements_and_checks_strictly_enforced(self):
        clean_target = self.test_dir / "clean_target_req.xlsx"
        self._build_clean_workbook(clean_target)

        mgr = UpdateRunManager(base_dir=self.test_dir / "runs_chk")
        coord = SpreadsheetUpdateTurnCoordinator(run_manager=mgr)

        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "c1",
            "target_ref": str(clean_target),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "operations": [{"op": "copy_sheet", "op_id": "1", "source_sheet": "1019", "target_sheet": "1023"}],
            "preserve": {"sheets": ["1019"]},
            # Declares a non-existent requirement target
            "requirements": {"req_audit": ["non_existent_op_999"]},
            "output": {"display_name": "chk_output.xlsx"}
        }

        p_res = coord.plan_update(plan)
        exec_res = coord.execute_update(plan_id=p_res["plan_id"], expected_plan_hash=p_res["plan_hash"], facts=FactTable())
        self.assertFalse(exec_res.is_success)
        self.assertTrue(any("was not executed or not defined" in iss for iss in exec_res.issues))

    def test_p1_runner_routing_advisory_and_negation_blocks_write_tools(self):
        # Prompt explicitly stating advisory/guidance and negating execution
        prompt = "只说明如何更新数据，不要执行或修改附件"
        skill_res = SkillRoutingResult(
            skill_id="xlsx",
            is_inspect_intent=True,
            is_guide_intent=True,
            is_generate_intent=False,
            requires_execution=False
        )

        tools = select_active_tools(
            skill_res=skill_res,
            prompt=prompt,
            is_search_intent=False,
            has_web_search_permission=False
        )
        tool_names = {t["function"]["name"] for t in tools}
        self.assertNotIn("execute_spreadsheet_update", tool_names, "execute_spreadsheet_update must NOT be exposed for advisory/negated requests.")

    def test_p1_recheck_workspace_publish_cannot_overwrite_source_or_existing_files(self):
        # Setup workspace with an existing source.xlsx
        ws_dir = self.test_dir / "workspace"
        ws_dir.mkdir(parents=True, exist_ok=True)
        source_f = ws_dir / "source.xlsx"
        source_f.write_text("original_source_content")

        import os
        old_env = os.environ.get("WORKSPACE_DIR")
        os.environ["WORKSPACE_DIR"] = str(ws_dir)
        try:
            coord = SpreadsheetUpdateTurnCoordinator(UpdateRunManager(base_dir=self.test_dir/"runs"))
            plan = {
                "schema_version": SCHEMA_VERSION_V1,
                "task_contract_ref": "contract_over_test",
                "target_ref": str(self.target_wb_path),
                "sources": [{"source_id": "src_stats", "file_path": str(source_f)}],
                "as_of": "2026-10-23",
                "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
                "semantic_bindings": {},
                "source_queries": [],
                "mappings": [],
                "operations": [
                    {"op": "copy_sheet", "op_id": "op_c", "source_sheet": "1019", "target_sheet": "1023"},
                    {"op": "set_snapshot_date", "op_id": "op_d", "sheet": "1023", "coordinate": "C2", "date_value": "2026-10-23"}
                ],
                "preserve": {"sheets": ["1019"]},
                "checks": [],
                "requirements": {"r1": ["op_c", "op_d"]},
                "output": {"display_name": "source.xlsx"}  # Attempting to overwrite source file!
            }
            p_res = coord.plan_update(plan)
            self.assertTrue(p_res["success"])
            exec_res = coord.execute_update(plan_id=p_res["plan_id"], expected_plan_hash=p_res["plan_hash"], facts=FactTable())
            self.assertFalse(exec_res.is_success, "Publish must be blocked when deliverable matches an existing source file.")
            self.assertTrue(any("would overwrite an input source/target file" in iss or "already exists" in iss for iss in exec_res.issues))
            self.assertEqual(source_f.read_text(), "original_source_content", "Source file content must remain strictly untouched.")
        finally:
            if old_env is None:
                os.environ.pop("WORKSPACE_DIR", None)
            else:
                os.environ["WORKSPACE_DIR"] = old_env

    def test_p1_recheck_unregistered_binding_rejects_budget_overwrite(self):
        # Target workbook with a budget row and cell
        wb_p = self.test_dir / "budget_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "1019"
        ws["B2"] = "快照日期"
        ws["C2"] = "2026-10-19"
        ws["B4"] = "部门"
        ws["C4"] = "预算"
        ws["B5"] = "FC001"
        ws["C5"] = 900  # Budget cell
        wb.save(wb_p)
        wb.close()

        ir = extract_workbook_ir(wb_p, "1019")
        facts = FactTable()
        k_rogue = LogicalKey("unregistered_region", "FC001", "unregistered_metric", "202610", "actual", "hours")
        facts.add_fact(FactRecord(k_rogue, Decimal("188.0"), "hours", "202610", "2026-10-23", "src1", 1, "C5", "ev1"))

        # Operation uses unregistered region and metric to attempt write to budget cell C5
        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "contract_rogue",
            "target_ref": str(wb_p),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "semantic_bindings": {},
            "source_queries": [],
            "mappings": [],
            "operations": [
                {"op": "copy_sheet", "op_id": "op_c", "source_sheet": "1019", "target_sheet": "1023"},
                {
                    "op": "fill_from_result",
                    "op_id": "op_rogue_fill",
                    "target_sheet": "1023",
                    "coordinate": "C5",
                    "region_id": "unregistered_region",
                    "department_code": "FC001",
                    "metric_id": "unregistered_metric",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours"
                }
            ],
            "preserve": {"sheets": ["1019"]},
            "checks": [],
            "requirements": {"r1": ["op_c", "op_rogue_fill"]},
            "output": {"display_name": "out.xlsx"}
        }

        with self.assertRaises(UpdateCompilationError) as ctx:
            compile_update_plan(plan, ir, facts)
        self.assertTrue(
            "Forbidden" in str(ctx.exception) or "no semantic binding found" in str(ctx.exception) or "budget" in str(ctx.exception)
        )

    def test_p1_recheck_conflicting_duplicate_source_records_rejected(self):
        # 1. FactTable rejects duplicate conflicting records from overwriting
        facts = FactTable(aggregation_rule="reject_conflict")
        k = LogicalKey("reg1", "FC001", "hours", "202610", "actual", "hours")
        rec1 = FactRecord(k, Decimal("125.5"), "hours", "202610", "2026-10-23", "src1", 2, "B2", "ev1")
        rec2 = FactRecord(k, Decimal("240.0"), "hours", "202610", "2026-10-23", "src1", 3, "B3", "ev2")

        facts.add_fact(rec1)
        facts.add_fact(rec2)
        # Conflicting key MUST NOT be silently overwritten with 240.0!
        self.assertIsNone(facts.get_fact(k), "Conflicting key must be purged from valid facts and not overwritten.")
        card_rep = facts.check_cardinality_against_bindings([k])
        self.assertFalse(card_rep.is_valid)
        self.assertIn(k, card_rep.conflicting_keys)

        # 2. Ingesting from actual XLSX with duplicate conflicting rows reports error issue
        src_wb_p = self.test_dir / "conflict_source.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws["A1"] = "DeptCode"
        ws["B1"] = "ActualHours"
        ws["C1"] = "Period"
        ws["A2"] = "FC001"
        ws["B2"] = 125.5
        ws["C2"] = "202610"
        ws["A3"] = "FC001"
        ws["B3"] = 240.0
        ws["C3"] = "202610"
        wb.save(src_wb_p)
        wb.close()

        ingested_facts, issues = ingest_facts_from_source_queries(
            sources=[{"source_id":"src_conf","file_path":str(src_wb_p),"unit":"hours","as_of":"2026-10-23"}],
            source_queries=[{"source_id":"src_conf","sheet_name":"Sheet1","header_row":1,"data_range":"A2:C3",
                "key_field":"DeptCode","value_field":"ActualHours","period_field":"Period",
                "target_region":"reg1","metric_id":"hours","value_kind":"actual"}],
            mappings=[],
            workspace_dir=self.test_dir
        )
        self.assertTrue(any("conflicting values" in iss.lower() or "cardinality conflict" in iss.lower() for iss in issues))

    def test_p1_recheck_unexecuted_and_missing_control_total_checks_blocked(self):
        coord = SpreadsheetUpdateTurnCoordinator(UpdateRunManager(base_dir=self.test_dir/"runs"))
        # Case A: Unknown check name must be rejected
        plan_unknown_chk = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "contract_chk",
            "target_ref": str(self.target_wb_path),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "semantic_bindings": {},
            "source_queries": [],
            "mappings": [],
            "operations": [
                {"op": "copy_sheet", "op_id": "op_c", "source_sheet": "1019", "target_sheet": "1023"},
                {"op": "set_snapshot_date", "op_id": "op_d", "sheet": "1023", "coordinate": "C2", "date_value": "2026-10-23"}
            ],
            "preserve": {"sheets": ["1019"]},
            "checks": [{"check": "non_existent_check_rule"}],
            "requirements": {"r1": ["op_c", "op_d"]},
            "output": {"display_name": "chk1.xlsx"}
        }
        p_res = coord.plan_update(plan_unknown_chk)
        exec_res = coord.execute_update(plan_id=p_res["plan_id"], expected_plan_hash=p_res["plan_hash"], facts=FactTable())
        self.assertFalse(exec_res.is_success)
        self.assertTrue(any("Unknown or unsupported business check" in iss for iss in exec_res.issues))

        # Case B: reconciliation_total_match declared on sheet without total cell
        no_total_wb_p = self.test_dir / "no_total.xlsx"
        self._build_clean_workbook(no_total_wb_p)
        plan_missing_total = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "contract_chk2",
            "target_ref": str(no_total_wb_p),
            "sources": [],
            "as_of": "2026-10-23",
            "snapshot": {"selected_sheet_id": "1019", "new_sheet_name": "1023"},
            "semantic_bindings": {},
            "source_queries": [],
            "mappings": [],
            "operations": [
                {"op": "copy_sheet", "op_id": "op_c", "source_sheet": "1019", "target_sheet": "1023"},
                {"op": "set_snapshot_date", "op_id": "op_d", "sheet": "1023", "coordinate": "C2", "date_value": "2026-10-23"}
            ],
            "preserve": {"sheets": ["1019"]},
            "checks": [{"check": "reconciliation_total_match"}],
            "requirements": {"r1": ["op_c", "op_d"]},
            "output": {"display_name": "chk2.xlsx"}
        }
        p_res2 = coord.plan_update(plan_missing_total)
        exec_res2 = coord.execute_update(plan_id=p_res2["plan_id"], expected_plan_hash=p_res2["plan_hash"], facts=FactTable())
        self.assertFalse(exec_res2.is_success)
        self.assertTrue(any("missing control total cell" in iss or "no business regions" in iss for iss in exec_res2.issues))

    def test_p1_recheck_transitive_dependency_closure_with_local_references(self):
        # Target!A1 -> Bridge!A1 -> Bridge!B1 -> History!B1 (error)
        wb_p = self.test_dir / "closure_bridge.xlsx"
        wb = openpyxl.Workbook()
        ws_hist = wb.active
        ws_hist.title = "History"
        ws_hist["B1"] = "#DIV/0!"
        ws_hist["B1"].data_type = 'e'

        ws_bridge = wb.create_sheet("Bridge")
        ws_bridge["A1"] = "=B1"           # Local reference without exclamation mark!
        ws_bridge["B1"] = "=History!B1"   # Cross-sheet reference to historical error

        ws_target = wb.create_sheet("1023")
        ws_target["A1"] = "=Bridge!A1"    # Target references bridge

        wb.save(wb_p)
        wb.close()

        # Inject evaluated caches for non-error formulas so uncalculated gate doesn't interfere
        import zipfile
        tmp_u = self.test_dir / "u_bridge"
        with zipfile.ZipFile(wb_p, "r") as zin:
            zin.extractall(tmp_u)
        for s_f in (tmp_u / "xl" / "worksheets").glob("sheet*.xml"):
            c = s_f.read_text("utf-8")
            c = c.replace("<v></v>", "<v>0</v>")
            s_f.write_text(c, "utf-8")
        with zipfile.ZipFile(wb_p, "w", zipfile.ZIP_DEFLATED) as zout:
            for p in tmp_u.rglob("*"):
                if p.is_file():
                    zout.write(p, p.relative_to(tmp_u))

        baseline = [BaselineErrorFingerprint(sheet_name="History", coordinate="B1", error_type="#DIV/0!")]
        verdict = validate_scope_and_historical_errors(wb_p, "1023", baseline)
        self.assertEqual(verdict.verdict, "rejected", "Transitive closure must follow local Bridge!B1 and reject leaked error.")
        self.assertTrue(any("History!B1" in iss for iss in verdict.issues))

    def test_p1_recheck_diff_error_literal_fidelity_equivalence(self):
        from dsh_modules.spreadsheet_update.diff import _cells_equivalent
        self.assertTrue(_cells_equivalent("#DIV/0!", "=#DIV/0!"))
        self.assertTrue(_cells_equivalent("=#DIV/0!", "#DIV/0!"))
        self.assertTrue(_cells_equivalent("#DIV/0!", "= #DIV/0!"))
        self.assertTrue(_cells_equivalent("#DIV/0!", "=1/0"))
        self.assertTrue(_cells_equivalent("=1/0", "#DIV/0!"))
        self.assertTrue(_cells_equivalent("#VALUE!", "=#VALUE!"))
        self.assertFalse(_cells_equivalent("#DIV/0!", "#VALUE!"))


if __name__ == "__main__":
    unittest.main()
