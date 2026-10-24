"""
Unit tests for PR 5: Tool Interface, Turn Coordinator, and Tool Dispatch Integration.
"""

import unittest
import tempfile
import shutil
from decimal import Decimal
from pathlib import Path
import openpyxl

from dsh_modules.tools import execute_tool, SANDBOX_TOOLS
from dsh_modules.spreadsheet_update.schema import SCHEMA_VERSION_V1
from dsh_modules.spreadsheet_update.bindings import LogicalKey
from dsh_modules.spreadsheet_update.sources import FactTable, FactRecord
from dsh_modules.spreadsheet_update.tools import register_turn_facts
from dsh_modules.spreadsheet_update.delivery import is_verified_update_file


class TestSpreadsheetUpdateToolsAndTurn(unittest.TestCase):

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
        self.test_dir = Path(tempfile.mkdtemp(prefix="test_update_tools_"))
        self.target_wb_path = self.test_dir / "target_1019.xlsx"
        self._build_test_workbook(self.target_wb_path)
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

    def _build_test_workbook(self, path: Path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "1019"

        # Headers
        ws["B2"] = "快照日期"
        ws["C2"] = "2026-10-19"

        ws["B4"] = "部门"
        ws["C4"] = "202610"
        ws["D4"] = "202611"
        ws["E4"] = "合计"

        # Rows
        ws["B5"] = "FC001"
        ws["C5"] = 100
        ws["D5"] = 150
        ws["E5"] = "=SUM(C5:D5)"

        wb.save(path)

    def test_tools_registered_in_sandbox_tools(self):
        names = [t["function"]["name"] for t in SANDBOX_TOOLS]
        self.assertIn("plan_spreadsheet_update", names)
        self.assertIn("execute_spreadsheet_update", names)
        self.assertIn("get_spreadsheet_update_status", names)

    def test_end_to_end_tool_planning_and_execution_lifecycle(self):
        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "task_contract_ref": "contract_e2e_001",
            "target_ref": str(self.target_wb_path),
            "sources": [{"source_id": "src_1", "role": "dept_stats"}],
            "as_of": "2026-10-23",
            "snapshot": {
                "selected_sheet_id": "1019",
                "new_sheet_name": "1023",
            },
            "semantic_bindings": {},
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
                    "op_id": "op_fill",
                    "target_sheet": "1023",
                    "coordinate": "C5",
                    "fact_ref": "ev_fact_1",
                    "region_id": "default_region",
                    "department_code": "FC001",
                    "metric_id": "hours",
                    "period": "202610",
                    "value_kind": "actual",
                    "unit": "hours"
                }
            ],
            "preserve": {"sheets": ["1019"]},
            "checks": [],
            "requirements": {"req_1": ["op_copy", "op_fill"]},
            "output": {"display_name": "target_1023_delivered.xlsx"}
        }

        # Low-level operation plans belong to the engine, not the public model API.
        from dsh_modules.spreadsheet_update.turn import SpreadsheetUpdateTurnCoordinator
        from dsh_modules.spreadsheet_update.state import UpdateRunManager
        coord = SpreadsheetUpdateTurnCoordinator(UpdateRunManager(base_dir=self.test_dir/'runs'))
        plan['semantic_bindings'] = {'region_specs': [{
            'region_id':'default_region','header_row':4,'key_col':2,
            'min_row':4,'max_row':5,'min_col':3,'max_col':3,
            'metric_id':'hours','unit':'hours','period_columns':{'202610':3},
            'department_rows':{'FC001':5},'value_kind':'actual'}]}
        planned=coord.plan_update(plan)
        self.assertTrue(planned['success'],planned)
        facts=FactTable()
        key=LogicalKey('default_region','FC001','hours','202610','actual','hours')
        facts.add_fact(FactRecord(key,Decimal('188.0'),'hours','202610','2026-10-23','src_1',2,'C2','ev_fact_1'))
        result=coord.execute_update(planned['plan_id'],planned['plan_hash'],facts)
        self.assertTrue(result.is_success,result.issues)
        wb=openpyxl.load_workbook(result.published_file)
        self.assertEqual(wb['1023']['C5'].value,188)
        self.assertEqual(wb['1019']['C5'].value,100)
        wb.close()
        self.assertEqual(coord.mgr.load_state().status,'published')

    def test_auto_execute_and_operations_expansion(self):
        from dsh_modules.spreadsheet_update.tools import _SESSION_FACTS
        from dsh_modules.spreadsheet_update.sources import FactRecord
        from dsh_modules.spreadsheet_update.bindings import LogicalKey
        from decimal import Decimal

        # 1. Register analytical fact in session (simulating aggregate_spreadsheet)
        k = LogicalKey("default_region", "FC001", "有偿金额", "202610", "forecast", "K")
        _SESSION_FACTS.add_fact(FactRecord(k, Decimal("320.5"), "K", "202610", "2026-10-23", "src_test", 5, "C5", "ev_fact_auto"))

        # 2. Call plan_spreadsheet_update with a generic fill_from_result and auto_execute=True
        plan = {
            "schema_version": SCHEMA_VERSION_V1,
            "target_ref": str(self.target_wb_path),
            "as_of": "2026-10-23",
            "snapshot": {
                "selected_sheet_id": "1019",
                "new_sheet_name": "1023",
            },
            "operations": [
                {
                    "op": "copy_sheet",
                    "source_sheet": "1019",
                    "target_sheet": "1023"
                },
                {
                    "op": "fill_from_result",
                    "target_sheet": "1023",
                    "value_kind": "forecast",
                    "period": "202610"
                }
            ],
            "auto_execute": True,
            "output": {"display_name": "auto_delivered_1023.xlsx"}
        }

        res_str = execute_tool('plan_spreadsheet_update', {'plan':plan})
        self.assertTrue(res_str.is_error)
        self.assertIn('不支持',str(res_str))
        self.assertFalse((self.test_dir/'auto_delivered_1023.xlsx').exists())

    def test_oral_intent_leakage_recovery(self):
        from dsh_modules.spreadsheet_update.tools import _SESSION_FACTS
        from dsh_modules.spreadsheet_update.sources import FactRecord
        from dsh_modules.spreadsheet_update.bindings import LogicalKey
        from decimal import Decimal

        # 1. Simulate harvested facts in session
        k = LogicalKey("default_region", "FC001", "有偿金额", "202610", "forecast", "K")
        _SESSION_FACTS.add_fact(FactRecord(k, Decimal("320.5"), "K", "202610", "2026-10-23", "src_test", 5, "C5", "ev_fact_auto"))

        # 2. Simulate agent loop running where model outputs oral thought leakage
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from unittest.mock import patch

        oral_text = (
            "现在有了所有必要数据。让我使用 `execute_spreadsheet_update` 来完成最终的物理写盘。"
            "但首先我需要用 `plan_spreadsheet_update` 来创建计划。等等，我还没有调用 `plan_spreadsheet_update`。让我先提交计划。"
        )

        def mock_call_proxy(messages, *args, **kwargs):
            if len(messages) <= 3:
                return {"content": oral_text, "tool_calls": []}
            return {"content": "已更新完成", "tool_calls": []}

        with patch("dsh_modules.config.WORKSPACE_DIR", str(self.test_dir)), \
             patch("dsh_modules.agent_loop.WORKSPACE_DIR", str(self.test_dir)), \
             patch("dsh_modules.agent_loop.call_model_proxy", side_effect=mock_call_proxy):
            res = run_agent_loop(
                messages=[{"role": "user", "content": f"更新工数预实管理，复制1019生成1023并回填预测数据至 {self.target_wb_path}"}],
                model="test_model",
                policy=RuntimePolicy.from_env(),
                max_rounds=2,
                tools=SANDBOX_TOOLS,
                user_prompt=f"更新工数预实管理，复制1019生成1023并回填预测数据至 {self.target_wb_path}"
            )
            self.assertFalse(any(
                getattr(e, 'name', '') == 'plan_spreadsheet_update' or (getattr(e, 'provenance', None) or {}).get('tool') == 'plan_spreadsheet_update'
                for e in res.execution_evidence
            ))


if __name__ == "__main__":
    unittest.main()
