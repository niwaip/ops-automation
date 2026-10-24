from spreadsheet_update_fixture_support import bind_fixture_regions
"""
End-to-end full closure test for PR 6:
Reproduces the complete multi-source Excel update lifecycle:
1. Target workbook with historical snapshot '1019' containing isolated legacy #DIV/0! error.
2. External department statistics source workbook.
3. Automated plan creation, locking, compilation, execution, LibreOffice recalc,
   semantic diff, scope dependency gate, and receipt issuance.
"""

import unittest
import tempfile
import shutil
from decimal import Decimal
from pathlib import Path
import openpyxl

from dsh_modules.spreadsheet_update import (
    SpreadsheetUpdatePlan,
    SCHEMA_VERSION_V1,
    extract_workbook_ir,
    FactRecord,
    FactTable,
    LogicalKey,
    compute_plan_hash,
    tool_plan_spreadsheet_update,
    tool_execute_spreadsheet_update,
    tool_get_spreadsheet_update_status,
    register_turn_facts,
    validate_update_delivery,
    is_verified_update_file,
)
from dsh_modules.workbook_delivery_recalc import recalculate_generated_workbooks


class TestSpreadsheetUpdateE2EFull(unittest.TestCase):

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
                content = re.sub(r'(<c [^>]*t="e"[^>]*><f>[^<]+</f><v>)(</v>)', r'\1#DIV/0!\2', content)
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
        self.test_dir = Path(tempfile.mkdtemp(prefix="test_update_e2e_"))
        self.target_path = self.test_dir / "工数预实工作簿_target.xlsx"
        self.source_path = self.test_dir / "部门统计来源_source.xlsx"
        self._build_target_workbook()
        self._build_source_workbook()
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

    def _build_target_workbook(self):
        """Creates target workbook with a retained historical sheet '0919' containing legacy error,
        and current snapshot '1019' to be duplicated."""
        wb = openpyxl.Workbook()

        # Historical sheet 0919 with legacy unreferenced error
        ws_hist = wb.active
        ws_hist.title = "0919"
        ws_hist["B2"] = "快照日期"
        ws_hist["C2"] = "2026-09-19"
        ws_hist["B4"] = "部门编码"
        ws_hist["B5"] = "FC001"
        ws_hist["D5"] = 90
        # Legacy error in retained historical sheet
        ws_hist["Z99"] = "=1/0"
        ws_hist["Z99"].data_type = 'e'
        ws_hist["Z99"].value = "#DIV/0!"

        # Current snapshot sheet 1019
        ws = wb.create_sheet("1019")

        # Metadata
        ws["B2"] = "快照日期"
        ws["C2"] = "2026-10-19"

        # Headers
        ws["B4"] = "部门编码"
        ws["C4"] = "部门名称"
        ws["D4"] = "202610"
        ws["E4"] = "202611"
        ws["F4"] = "202612"
        ws["G4"] = "3Q"

        # Rows FC001 to FC003
        departments = [
            ("FC001", "基础平台组", 100, 110, 120),
            ("FC002", "算法工程组", 200, 210, 220),
            ("FC003", "自动化组",   150, 160, 170),
        ]

        for idx, (code, name, m10, m11, m12) in enumerate(departments, start=5):
            ws[f"B{idx}"] = code
            ws[f"C{idx}"] = name
            ws[f"D{idx}"] = m10
            ws[f"E{idx}"] = m11
            ws[f"F{idx}"] = m12
            ws[f"G{idx}"] = f"=SUM(D{idx}:F{idx})"

        # Grand total
        ws["B8"] = "合计"
        ws["D8"] = "=SUM(D5:D7)"
        ws["E8"] = "=SUM(E5:E7)"
        ws["F8"] = "=SUM(F5:F7)"
        ws["G8"] = "=SUM(G5:G7)"

        wb.save(self.target_path)
        wb.close()

    def _build_source_workbook(self):
        """Creates department actual hours source workbook."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "实绩工数"

        ws["A1"] = "DeptCode"
        ws["B1"] = "ActualHours"
        ws["C1"] = "Period"

        ws["A2"] = "FC001"
        ws["B2"] = 125.5
        ws["C2"] = "202610"

        ws["A3"] = "FC002"
        ws["B3"] = 240.0
        ws["C3"] = "202610"

        ws["A4"] = "FC003"
        ws["B4"] = 180.0
        ws["C4"] = "202610"

        wb.save(self.source_path)
        wb.close()

    def test_full_spreadsheet_update_e2e_closure(self):
        # 1. Structure discovery
        region_specs = [{
            "region_id": "engineering_paid",
            "title": "有偿工数",
            "min_row": 4,
            "min_col": 2,
            "max_row": 7,
            "max_col": 7,
            "header_row": 4,
            "key_col": 2,
            "metric_id": "paid_hours",
            "unit": "hours"
        }]
        ir = extract_workbook_ir(self.target_path, "1019", region_specs=bind_fixture_regions(self.target_path, "1019", region_specs))
        self.assertEqual(len(ir.regions), 1)

        # 2. Ingest source facts
        facts = FactTable()
        source_wb = openpyxl.load_workbook(self.source_path, data_only=True)
        ws_src = source_wb["实绩工数"]
        for r in range(2, 5):
            code = ws_src[f"A{r}"].value
            val = Decimal(str(ws_src[f"B{r}"].value))
            period = str(ws_src[f"C{r}"].value)
            key = LogicalKey("engineering_paid", code, "paid_hours", period, "actual", "hours")
            facts.add_fact(
                FactRecord(
                    logical_key=key,
                    numeric_value=val,
                    unit="hours",
                    period=period,
                    as_of="2026-10-23",
                    source_id="src_dept_001",
                    source_row=r,
                    source_coordinate=f"B{r}",
                    evidence_id=f"ev_src_{code}"
                )
            )
        source_wb.close()

        # 3. Construct update plan
        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "task_contract_oct23_e2e",
            "target_ref": str(self.target_path),
            "sources": [{"source_id": "src_dept_001", "role": "department_statistics"}],
            "as_of": "2026-10-23",
            "snapshot": {
                "candidate_date_evidence": "sheet_1019_header",
                "selected_sheet_id": "1019",
                "new_sheet_name": "1023",
                "same_day_conflict_strategy": "reject"
            },
            "semantic_bindings": {"regions": ["engineering_paid"]},
            "source_queries": [],
            "mappings": [],
            "operations": [
                {
                    "op": "copy_sheet",
                    "op_id": "op_copy",
                    "source_sheet": "1019",
                    "target_sheet": "1023"
                },
                {
                    "op": "set_snapshot_date",
                    "op_id": "op_date",
                    "sheet": "1023",
                    "coordinate": "C2",
                    "date_value": "2026-10-23"
                },
                {
                    "op": "fill_from_result",
                    "op_id": "op_fill_fc1",
                    "target_sheet": "1023",
                    "coordinate": "D5",
                    "fact_ref": "ev_src_FC001",
                    "region_id": "engineering_paid",
                    "department_code": "FC001",
                    "metric_id": "paid_hours",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours"
                },
                {
                    "op": "fill_from_result",
                    "op_id": "op_fill_fc2",
                    "target_sheet": "1023",
                    "coordinate": "D6",
                    "fact_ref": "ev_src_FC002",
                    "region_id": "engineering_paid",
                    "department_code": "FC002",
                    "metric_id": "paid_hours",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours"
                },
                {
                    "op": "fill_from_result",
                    "op_id": "op_fill_fc3",
                    "target_sheet": "1023",
                    "coordinate": "D7",
                    "fact_ref": "ev_src_FC003",
                    "region_id": "engineering_paid",
                    "department_code": "FC003",
                    "metric_id": "paid_hours",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours"
                }
            ],
            "preserve": {
                "sheets": ["0919", "1019"],
                "protected_formulas": ["G5", "G6", "G7", "D8", "E8", "F8", "G8"]
            },
            "checks": [],
            "requirements": {
                "req_snapshot": ["op_copy", "op_date"],
                "req_fill": ["op_fill_fc1", "op_fill_fc2", "op_fill_fc3"]
            },
            "output": {"display_name": "工数预实核算_20261023_delivered.xlsx"}
        }

        # Internal IR/operation contract test; public semantic tools have separate coverage.
        from dsh_modules.spreadsheet_update.turn import SpreadsheetUpdateTurnCoordinator
        from dsh_modules.spreadsheet_update.state import UpdateRunManager
        coord=SpreadsheetUpdateTurnCoordinator(UpdateRunManager(base_dir=self.test_dir/'runs'))
        plan['semantic_bindings']={'region_specs':region_specs}
        plan_data=coord.plan_update(plan)
        self.assertTrue(plan_data['success'],plan_data)
        run_id=plan_data['run_id']
        exec_res=coord.execute_update(plan_data['plan_id'],plan_data['plan_hash'],facts)
        self.assertTrue(exec_res.is_success,exec_res.issues)
        self.assertEqual(exec_res.status,'published')
        published_file=Path(exec_res.published_file)
        self.assertTrue(published_file.exists())

        # 6. Verify Content and Formulas in Published Deliverable
        wb_pub = openpyxl.load_workbook(published_file, data_only=False)
        self.assertIn("1019", wb_pub.sheetnames)
        self.assertIn("1023", wb_pub.sheetnames)

        ws_1023 = wb_pub["1023"]
        self.assertEqual(ws_1023["C2"].value, "2026-10-23")
        self.assertEqual(ws_1023["D5"].value, 125.5)
        self.assertEqual(ws_1023["D6"].value, 240.0)
        self.assertEqual(ws_1023["D7"].value, 180.0)

        # 3Q and total formulas are intact
        self.assertEqual(ws_1023["G5"].value, "=SUM(D5:F5)")
        self.assertEqual(ws_1023["G6"].value, "=SUM(D6:F6)")
        self.assertEqual(ws_1023["D8"].value, "=SUM(D5:D7)")
        wb_pub.close()

        # 7. Check historical error isolation in published deliverable
        # Sheet 0919 must still retain the legacy error untouched
        wb_pub_data = openpyxl.load_workbook(published_file, data_only=True)
        ws_0919_d = wb_pub_data["0919"]
        self.assertEqual(ws_0919_d["Z99"].value, "#DIV/0!")
        wb_pub_data.close()

        # 8. Verify delivery gate and receipt verification
        self.assertTrue(is_verified_update_file(published_file))
        is_deliverable, gate_issues = validate_update_delivery(published_file)
        self.assertTrue(is_deliverable)

        # 9. Verify that trailing auto-recalc will not mutate verified deliverable
        recalculated = recalculate_generated_workbooks(str(published_file.parent))
        self.assertNotIn(str(published_file), recalculated, "Verified update deliverable must be protected from trailing recalc.")


if __name__ == "__main__":
    unittest.main()
