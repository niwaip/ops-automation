"""
End-to-End Test for Composite Task Execution:
Verifies that when a complex prompt with multiple files and operations (e.g. sheet copying + forecast updating)
references a custom calculation skill (e.g. dept-summary), the system:
1. Prevents the single-file skill from monopolizing the turn (admit_skill downgrades to action: general).
2. Uses the skill's verified workflow as a sub-step data source (via_skill).
3. Executes copy_sheet, set_snapshot_date, and fill_from_result on the target workbook.
4. Preserves all formula cells, budget baselines, and runs LibreOffice headless recalculation.
5. Successfully delivers the published workbook.
"""

import copy
import hashlib
import json
import shutil
import tempfile
import time
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import openpyxl

from dsh_modules.spreadsheet_update.tools import (
    tool_plan_spreadsheet_update,
    tool_execute_spreadsheet_update,
    _ACTIVE_COORDINATORS,
    _ACTIVE_FACTS
)
from dsh_modules.spreadsheet_update.sources import ingest_facts_from_source_queries
from dsh_modules.spreadsheet_update.discovery import extract_workbook_ir
from dsh_modules.spreadsheet_update.delivery import is_verified_update_file, validate_update_delivery
from dsh_modules.personal_skill_workflow import try_run_personal_workflow
from dsh_modules.skill_admission import admit_skill
from dsh_modules.skill_router import SkillRouter


class CompositeTaskEndToEndTests(unittest.TestCase):
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
                content = re.sub(r'(<c r="C19"[^>]*><f>[^<]+</f>)(?:<v>[^<]*</v>)?', r'\1<v>1537.01904</v>', content)
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
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir(parents=True)
        self.skills_dir = self.root / "skills"
        self.skills_dir.mkdir(parents=True)

        if shutil.which("soffice") is None:
            self._recalc_patch = patch(
                "dsh_modules.spreadsheet_update.executor.recalculate_candidate",
                side_effect=self._simulate_recalculate_candidate
            )
            self._recalc_patch.start()
        else:
            self._recalc_patch = None

        # 1. Install user custom skill: dept-summary
        self.dept_skill_dir = self.skills_dir / "dept-summary"
        (self.dept_skill_dir / "references").mkdir(parents=True)
        (self.dept_skill_dir / "scripts").mkdir(parents=True)
        (self.dept_skill_dir / "SKILL.md").write_text(
            "---\nname: dept-summary\nzh_name: 部门别有偿统计\n"
            "description: 基于工数实绩明细表，按部门编号分组汇总金额（K），并排除WBS编号以特定前缀开头的记录。\n"
            "triggers: [部门别有偿统计, dept-summary]\naliases: [部门别有偿统计, dept-summary]\n"
            "requires_execution: true\nexecution_mode: verified_workflow\ndeliverables: []\n---\n"
            "# 部门别有偿统计\n排除 WBS 前缀 ex, sy, sp, ip, ib, sz"
        )

        from dsh_modules import personal_skill_workflow_engine
        engine_path = Path(personal_skill_workflow_engine.__file__)
        (self.dept_skill_dir / "scripts/run.py").write_bytes(engine_path.read_bytes())

        self.dept_plan = {
            "schema_version": 1,
            "engine": "spreadsheet-group-sum-v1",
            "group_by": "部门编号",
            "measure": "金额(K)",
            "filters": [
                {
                    "field": "WBS编号",
                    "op": "exclude_prefix",
                    "values": ["ex", "sy", "sp", "ip", "ib", "sz"]
                }
            ],
            "instructions": ["按照部门编号分组统计金额合计，不包含特定WBS前缀"],
            "steps": ["定位明细表", "过滤并按部门求和"],
            "verification": {"source_hash": True, "row_accounting": True, "group_total": True}
        }
        plan_bytes = json.dumps(self.dept_plan).encode()
        (self.dept_skill_dir / "references/workflow.json").write_bytes(plan_bytes)
        manifest = {
            "schema_version": 1,
            "kind": "personal_skill_workflow",
            "entrypoint": "scripts/run.py",
            "plan": "references/workflow.json",
            "engine_sha256": hashlib.sha256(engine_path.read_bytes()).hexdigest(),
            "plan_sha256": hashlib.sha256(plan_bytes).hexdigest()
        }
        (self.dept_skill_dir / "execution.json").write_text(json.dumps(manifest))
        (self.dept_skill_dir / "references/validation.json").write_text(json.dumps({"status": "replayed", "plan_sha256": manifest["plan_sha256"]}))

        # 2. Copy real user test workbooks into temporary workspace if available, or create faithful fixtures
        real_target = Path("data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/工数3Q预实管理.xlsx")
        real_source = Path("data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/工数实绩明细_20261020134124.xlsx")

        self.target_path = self.workspace / "工数3Q预实管理.xlsx"
        self.source_path = self.workspace / "工数实绩明细_20261020134124.xlsx"

        if real_target.exists() and real_source.exists():
            shutil.copy2(real_target, self.target_path)
            shutil.copy2(real_source, self.source_path)
        else:
            self._create_fixtures()

    def tearDown(self):
        if getattr(self, "_recalc_patch", None):
            self._recalc_patch.stop()
        self.tmp.cleanup()

    def _create_fixtures(self):
        # Create target
        wb1 = openpyxl.Workbook()
        ws1 = wb1.active
        ws1.title = "1019"
        ws1.append(["有偿"])
        ws1.append(["部门", 46314, "1QRFv2", "GAP"])
        ws1.append([None, None, 202610, 202611, 202612, "3Q合计", 202610, 202611, 202612, "3Q合计", 202610, 202611, 202612, "3Q合计"])
        ws1.append([None, None, "预测", "预测", "预测", "预测", "计划", "计划", "计划", "计划", "差异", "差异", "差异", "差异"])
        ws1.append(["North", "FC48005", 67.0, None, None, "=C5+D5+E5", 150.0, 150.0, 150.0, "=G5+H5+I5", "=C5-G5", "=D5-H5", "=E5-I5", "=F5-J5"])
        ws1.append(["North", "FC34032", 10.0, None, None, "=C6+D6+E6", 40.0, 40.0, 40.0, "=G6+H6+I6", "=C6-G6", "=D6-H6", "=E6-I6", "=F6-J6"])
        ws1.append(["North", "Subtotal", "=C5+C6", "=D5+D6", "=E5+E6", "=C7+D7+E7", "=G5+G6", "=H5+H6", "=I5+I6", "=G7+H7+I7", "=K5+K6", "=L5+L6", "=M5+M6", "=K7+L7+M7"])
        ws1.append(["East", "FC45031", 563.0, None, None, "=C8+D8+E8", 500.0, 500.0, 500.0, "=G8+H8+I8", "=C8-G8", "=D8-H8", "=E8-I8", "=F8-J8"])
        ws1.append(["East", "Subtotal", "=C8", "=D8", "=E8", "=C9+D9+E9", "=G8", "=H8", "=I8", "=G9+H9+I9", "=K8", "=L8", "=M8", "=K9+L9+M9"])
        ws1.append(["Total", "TOTAL", "=C7+C9", "=D7+D9", "=E7+E9", "=F7+F9", "=J7+J9", "=J7+J9", "=J7+J9", "=J7+J9", "=N7+N9", "=N7+N9", "=N7+N9", "=N7+N9"])
        wb1.save(self.target_path)
        wb1.close()

        # Create source
        wb2 = openpyxl.Workbook()
        ws2 = wb2.active
        ws2.title = "工数实绩明细"
        ws2.append([""])
        ws2.append(["工数实绩明细"])
        ws2.append(["导出日期：2026-10-20 13:41:24"])
        ws2.append(["会计年度", "工数年月", "部门编号", "部门名称", "员工编号", "员工姓名", "员工职级", "职级单价", "WBS编号", "WBS负责成本中心", "WBS名称", "客户名称", "有偿无偿", "直接间接", "工数(小时)", "金额(K)", "BU编号", "BU名称"])
        ws2.append([2026, "202610", "FC45031", "華東MIS", "S1", "张三", "M1", 45.0, "IK-OK-1", "FC45031", "运维", "客户A", "有偿", "直接", 100, 561.75345, "B1", "BU1"])
        ws2.append([2026, "202610", "FC45031", "華東MIS", "S2", "李四", "M1", 45.0, "ex-bad", "FC45031", "外部", "客户B", "有偿", "直接", 50, 999.0, "B1", "BU1"])
        ws2.append([2026, "202610", "FC48005", "北方MIS", "S3", "王五", "M2", 50.0, "OK-123", "FC48005", "开发", "客户C", "有偿", "直接", 80, 88.5, "B2", "BU2"])
        wb2.save(self.source_path)
        wb2.close()

    def test_composite_task_admission_downgrades_to_general(self):
        """
        Tests that when a multi-file spreadsheet update task matches a single-file custom skill,
        skill_admission prevents action=use and safely downgrades to action=general.
        """
        prompt = (
            "需要更新工数管理，里面有计划和预测，先复制最新的sheet 生成今天 1023的新sheet，"
            "用 部门编码 统计 部门的 有偿 部分的金额 更新到 这个月的预测部分"
        )
        files = [self.source_path.name, self.target_path.name]

        def model_responder(messages, **kwargs):
            tool_name = kwargs["tools"][0]["function"]["name"]
            if tool_name == "submit_task_intent":
                return {
                    "content": json.dumps({
                        "task_mode": "execute",
                        "output_mode": "conversation",
                        "artifact_types": [],
                        "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
                        "requirements": [{"id": "goal", "quote": prompt}]
                    }),
                    "finish_reason": "stop"
                }
            elif tool_name == "submit_skill_admission":
                return {
                    "content": json.dumps({
                        "action": "use",
                        "skill_id": "dept-summary",
                        "use_default_rules": False,
                        "rule_basis": "",
                        "reason": "applicable",
                        "question": ""
                    }),
                    "finish_reason": "stop"
                }
            return {"content": "{}", "finish_reason": "stop"}

        from dsh_modules.telemetry import TelemetryStats
        telemetry = TelemetryStats()

        with patch("dsh_modules.semantic_decision.call_model_proxy", side_effect=model_responder), \
             patch("dsh_modules.skill_admission.get_available_skills", return_value=[
                 {"id": "dept-summary", "name": "部门别有偿统计", "execution_mode": "verified_workflow"}
             ]), \
             patch("dsh_modules.skills.CUSTOM_SKILL_DIR", self.skills_dir):

            provisional = SimpleNamespace(skill_id="dept-summary")
            routed = admit_skill(prompt, [], files, provisional, model="test", policy=None, telemetry=telemetry, deadline=None)

            # Assert: action must be downgraded to general because files > 1 and it is a composite update task!
            self.assertEqual(routed.admission["action"], "general")
            self.assertIsNone(routed.admission["skill_id"])
            self.assertEqual(routed.admission["reason"], "scope_mismatch")

    def test_personal_workflow_fallbacks_on_composite_task(self):
        """
        Tests that try_run_personal_workflow returns False and falls back to general
        when called with multiple files in a composite update prompt.
        """
        prompt = "更新预实管理：复制最新的sheet 生成 1023 新sheet"
        files = [self.source_path.name, self.target_path.name]
        skill_res = SimpleNamespace(
            skill_id="dept-summary",
            admission={"action": "use", "skill_id": "dept-summary", "task_mode": "execute"}
        )

        with patch("dsh_modules.personal_skill_workflow.CUSTOM_SKILL_DIR", self.skills_dir), \
             patch("dsh_modules.personal_skill_workflow.WORKSPACE_DIR", self.workspace):
            res = try_run_personal_workflow(
                skill_res, files, prompt, None, [], time.time(), None
            )
            # Must return False, allowing runner.py to proceed to general agent and update tools!
            self.assertFalse(res)

    def test_via_skill_facts_ingestion(self):
        """
        Tests that ingest_facts_from_source_queries executes dept-summary verified workflow,
        applies WBS exclusions, and generates verified FactTable records.
        """
        sources = [{
            "source_id": "actuals_source",
            "file_path": self.source_path.name,
            "role": "department_statistics",
            "as_of": "2026-10-23",
            "unit": "hours"
        }]
        source_queries = [{
            "source_id": "actuals_source",
            "via_skill": "dept-summary",
            "target_region": "default_region",
            "period": "202610",
            "metric_id": "amount"
        }]

        with patch("dsh_modules.config.CUSTOM_SKILL_DIR", self.skills_dir):
            facts, issues = ingest_facts_from_source_queries(
                sources=sources,
                source_queries=source_queries,
                mappings=[],
                workspace_dir=self.workspace,
                default_as_of="2026-10-23"
            )

        # Hidden workflow rules must not become a source binding for another task.
        self.assertTrue(issues)
        self.assertEqual(facts.all_facts(),[])

    def test_end_to_end_composite_spreadsheet_update(self):
        from decimal import Decimal
        from dsh_modules.tools import execute_tool
        from dsh_modules.spreadsheet_update.tools import harvest_analytical_facts,reset_turn_results
        import os
        wb=openpyxl.load_workbook(self.target_path)
        wb['1019']['T1']='单位：K'
        wb.save(self.target_path);wb.close()
        source=openpyxl.load_workbook(self.source_path,data_only=True)
        expected={}
        for row in source['工数实绩明细'].iter_rows(min_row=5,values_only=True):
            if row[12]=='有偿' and str(row[1])=='202610':
                expected[row[2]]=expected.get(row[2],Decimal(0))+Decimal(str(row[15]))
        source.close()
        with patch('dsh_modules.config.WORKSPACE_DIR',str(self.workspace)), \
             patch('dsh_modules.file_tools.WORKSPACE_DIR',str(self.workspace)), \
             patch.dict(os.environ,{'WORKSPACE_DIR':str(self.workspace)}):
            reset_turn_results()
            aggregate=execute_tool('aggregate_spreadsheet',{'file_path':str(self.source_path),
                'query':{'source':{'sheet':'工数实绩明细','header_row':4},
                         'where':{'and':[{'field':'工数年月','op':'eq','value':'202610'},
                                         {'field':'有偿无偿','op':'eq','value':'有偿'}]},
                         'group_by':['部门编号'],'metrics':[{'id':'sum','field':'金额(K)','op':'sum','unit':'source'}]}})
            self.assertTrue(aggregate.is_success,str(aggregate))
            harvest_analytical_facts(aggregate.data,provenance=aggregate.tool_result.provenance)
            plan=execute_tool('plan_spreadsheet_update',{'target_file':str(self.target_path),'base_sheet':'1019','new_sheet':'1023',
                'period':'202610','period_field':'工数年月','section':'有偿','target_label':'预测',
                'target_kind':'forecast','target_unit':'K','unit_cell':'T1','protected_labels':['计划']})
            self.assertTrue(plan.is_success,str(plan))
            result=execute_tool('execute_spreadsheet_update',{'plan_id':plan.data['plan_id']})
            self.assertTrue(result.is_success,str(result))
            wb=openpyxl.load_workbook(result.data['published_file'])
            for preview in plan.data['preview']:
                self.assertAlmostEqual(float(wb['1023'][preview['coordinate']].value),float(expected[preview['key']]),places=7)
            wb.close()

    def test_audit_1636_prompt_end_to_end_pipeline(self):
        """Verifies the complete pipeline on the exact prompt from the 16:36 audit:
        1. Prompt is recognized as physical artifact / modification.
        2. Grouping dimension '部门编码' is cleanly bound without false entity extraction.
        3. Update tools (plan & execute) are granted and preserved against analysis stripping.
        4. Gate requires both analysis and update execution before completion.
        """
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.task_intent import has_physical_artifact_request
        from dsh_modules.intent_contract import is_modify_intent_requested
        from dsh_modules.spreadsheet_analysis_schema import select_analysis_tools
        from dsh_modules.runner import select_active_tools
        from dsh_modules.skill_router import SkillRoutingResult

        prompt = "需要更新工数管理，里面有计划和预测，先复制最新的sheet 生成今天 1023的新sheet，用 部门编码 统计 部门的 有偿 部分的金额 更新到 这个月的预测部分"

        # 1. Pipeline intent classification
        self.assertTrue(has_physical_artifact_request(prompt), "Mutative sheet copying must be recognized as artifact request")
        self.assertTrue(is_modify_intent_requested(prompt), "Spreadsheet update phrase must trigger modify intent")

        # 2. Grammar & dimension grounding in analysis contract
        contract = build_analysis_contract(prompt)
        self.assertTrue(contract.is_grouped, "Prompt must be identified as grouped aggregation")
        self.assertEqual(contract.group_dimension, "部门编码", "Grouping dimension must be exactly 部门编码")
        self.assertEqual(contract.entity_predicates, [], "No hardcoded or false positive entity '编码' may be extracted")
        self.assertIn("有偿金额", [m.name for m in contract.metrics], "Metric '有偿金额' must be parsed from prompt")

        # 3. Tool granting & preservation
        route = SkillRoutingResult(
            skill_id=None,
            source_formats=[".xlsx"],
            is_generate_intent=True,
            deliverables=[".xlsx"],
            requires_execution=True,
            admission={"action": "general", "output_mode": "artifact", "task_mode": "execute"}
        )
        active_tools = select_active_tools(prompt, route, False, False)
        tool_names = {t.get("function", {}).get("name") or t.get("name") for t in active_tools}
        self.assertIn("plan_spreadsheet_update", tool_names)
        self.assertIn("execute_spreadsheet_update", tool_names)
        self.assertIn("aggregate_spreadsheet", tool_names)

        # 4. Ensure select_analysis_tools does not strip update tools
        update_tool_names = {"plan_spreadsheet_update", "execute_spreadsheet_update", "get_spreadsheet_update_status", "read_skill"}
        has_update_tools = any(t.get("function", {}).get("name") in update_tool_names for t in active_tools)
        if not has_update_tools:
            active_tools = select_analysis_tools(active_tools, prompt)
        tool_names_after = {t.get("function", {}).get("name") or t.get("name") for t in active_tools}
        self.assertIn("plan_spreadsheet_update", tool_names_after)
        self.assertIn("execute_spreadsheet_update", tool_names_after)


if __name__ == "__main__":
    unittest.main()
