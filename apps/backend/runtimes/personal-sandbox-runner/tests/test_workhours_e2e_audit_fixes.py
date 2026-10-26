"""Regression tests for Workhours E2E audit fixes (K01, K02, K04R, K05, K05R, K06, K07, K09, K09R, K10)."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.analysis_clarification import review_clarification
from dsh_modules.analysis_contract import build_analysis_contract
from dsh_modules.analysis_synthesis import (
    _is_synthesis_grounded,
    build_verified_facts_digest,
)
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.query_executor import execute_query_plan
from dsh_modules.runner import select_active_tools
from dsh_modules.skill_admission import admit_skill
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_analysis_evidence import (
    canonical_response,
    evidence_error,
    requires_spreadsheet_analysis,
)
from dsh_modules.spreadsheet_update.routing import (
    is_custom_workbook_or_row_edit,
    is_workbook_update,
)
from dsh_modules.task_intent import validate_intent
from dsh_modules.telemetry import TelemetryStats


class WorkhoursE2EAuditFixesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.wb_path = self._build_workhours_fixture()

    def _build_workhours_fixture(self) -> Path:
        path = self.root / "工数实绩明细_20261020134124.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "工数实绩明细"
        ws["A1"] = "工数实绩明细"
        ws.append([])
        ws.append([])
        headers = [
            "部门编号", "部门名称", "员工编号", "员工姓名", "项目名称", "WBS编号",
            "客户名称", "有偿/无偿", "工数年月", "工数(小时)", "职级", "单价",
            "金额(K)", "成本中心", "负责中心", "备注1", "备注2", "状态"
        ]
        ws.append(headers)  # Row 4
        rows_data = [
            ["S22014", "第一开发部", "10539", "张敏", "P-A", "IK-A22019", "客户A", "有偿", "202610", 174.0, "G4", 0.25, 43.5, "C1", "华东", "", "", "已确认"],
            ["S22014", "第一开发部", "10186", "李华", "P-B", "IK-A22020", "", "有偿", "202610", 85.0, "G4", 0.25, 21.25, "C1", "华东", "", "", "已确认"],
            ["S22024", "第二开发部", "10548", "王强", "P-C", "IK-A22021", "", "无偿", "202610", 52.0, "G3", 0.20, 10.4, "C2", "华北", "", "", "已确认"],
            ["S22024", "第二开发部", "10549", "赵六", "P-C", "IK-A22021", "客户B", "有偿", "202610", 40.0, "G3", 0.20, 8.0, "C2", "华北", "", "", "已确认"],
        ]
        for r in rows_data:
            ws.append(r)  # Rows 5..8
        ws.append(["查询条件：工数年月=202610"])  # Row 9 footer
        wb.save(path)
        return path

    def test_k01_contract_does_not_fabricate_range_record_count_and_distinct_labels_are_clear(self):
        prompt = (
            "请核验附件《工数实绩明细_20261020134124.xlsx》的结构与全表基线，并说明排除非业务行的依据："
            "给出工作表名称、有效表头所在行、业务明细范围、业务记录数、总工数、金额(K)合计、去重员工数、去重WBS数、工数年月范围。"
        )
        contract = build_analysis_contract(prompt)
        metric_names = [m.name for m in contract.metrics]
        self.assertNotIn("业务明细范围记录数", metric_names)

        r_agg = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "metrics": [
                {"id": "rec_cnt", "label": "业务记录数", "op": "count", "field": "员工编号"},
                {"id": "tot_hrs", "label": "总工数", "op": "sum", "field": "工数(小时)"},
                {"id": "tot_amt", "label": "金额(K)合计", "op": "sum", "field": "金额(K)"},
            ],
        }})
        r_emp = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "distinct": True,
            "distinct_fields": ["员工编号"],
        }})
        r_wbs = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "distinct": True,
            "distinct_fields": ["WBS编号"],
        }})
        r_ym = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "distinct": True,
            "distinct_fields": ["工数年月"],
        }})
        evidence = [r_agg, r_emp, r_wbs, r_ym]
        self.assertTrue(any("去重员工数" in f["label"] for f in r_emp.data["facts"]))
        self.assertTrue(any("去重WBS数" in f["label"] for f in r_wbs.data["facts"]))
        self.assertTrue(any(f["value"] == "202610" for f in r_ym.data["facts"]))

        err = evidence_error(canonical_response(evidence), evidence, prompt=prompt)
        self.assertIsNone(err)

    def test_k05_audit_checks_require_duplicate_evidence_and_surface_all_row_numbers(self):
        prompt = (
            "请对附件做数据质量核验：检查所有18列完全相同的重复业务行、客户名称为空的业务行、"
            "工数(小时)<=0或>24的业务行、金额(K)<=0的业务行。分别给出条数和原Excel行号。"
        )
        contract = build_analysis_contract(prompt)
        self.assertEqual(len(contract.audit_checks), 4)

        # Only checking missing 客户名称 without duplicate check must fail completeness
        r_missing_only = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "where": {"field": "客户名称", "op": "is_blank"},
        }})
        state_incomplete = analysis_task_state([r_missing_only], prompt)
        self.assertFalse(state_incomplete["complete"])
        self.assertIn("audit_checks_incomplete", [i["code"] for i in state_incomplete["issues"]])

        # Grounding check rejects unverified zero-duplicate claim when no duplicate check was run
        self.assertFalse(
            _is_synthesis_grounded(
                "所有18列完全相同的重复业务行：0条；客户名称为空：2条（原表行号6、7）。",
                [r_missing_only],
                prompt=prompt,
            )
        )

        # Running validate_spreadsheet_rows with full-row unique rule + not_empty + number_range succeeds
        r_qual = calculate_spreadsheet_analysis(self.wb_path, {
            "tables": [{"id": "detail", "sheet": "工数实绩明细", "header_row": 4, "data_range": "A5:R8"}],
            "rules": [
                {"id": "r_dup", "label": "全18列重复检查", "table": "detail", "column": "*", "kind": "unique", "assumptions": "检查整行完全重复"},
                {"id": "r_cust", "label": "客户名称非空", "table": "detail", "column": "客户名称", "kind": "not_empty", "assumptions": "检查客户名称为空"},
                {"id": "r_hrs", "label": "工数范围", "table": "detail", "column": "工数(小时)", "kind": "number_range", "min": 0.0001, "max": 24, "assumptions": "0<工数<=24"},
                {"id": "r_amt", "label": "金额正数", "table": "detail", "column": "金额(K)", "kind": "number_range", "min": 0.0001, "assumptions": "金额>0"},
            ],
        })
        self.assertTrue(r_qual.is_success)
        rules_by_id = {rl["id"]: rl for rl in r_qual.data["rules"]}
        self.assertEqual(rules_by_id["r_dup"]["violation_count"], 0)
        self.assertEqual(rules_by_id["r_cust"]["violation_rows"], [6, 7])
        self.assertEqual(rules_by_id["r_hrs"]["violation_rows"], [5, 6, 7, 8])

        digest = build_verified_facts_digest([r_qual], prompt=prompt)
        self.assertIn("6, 7", digest)
        self.assertIn("全表整行完全重复记录数：0 条", digest)

    def test_k09_and_k10_expose_bash_and_exclude_plan_spreadsheet_update(self):
        for prompt in (
            "在原附件副本中执行三项修改并分别验证，原附件不改：1）删除第5行；2）新增一条记录；3）把新增记录的工数改为10.00；最后保存为 workhours_crud_verified.xlsx 并提供下载。",
            "只处理上一步第3项：在副本中把新增那条记录（员工编号99901、WBS编号IK-TEST-202610）的工数改为10.00、金额(K)改为2.00000，保存为 workhours_update_verified.xlsx 并提供下载。",
            "基于原附件生成新的三工作表管理报表 workhours_management_report.xlsx 并提供下载：Sheet1为部门汇总并插入柱形图。",
        ):
            self.assertTrue(is_custom_workbook_or_row_edit(prompt), prompt)
            self.assertFalse(is_workbook_update(prompt), prompt)
            skill_res = SimpleNamespace(
                skill_id="xlsx",
                source_formats=[".xlsx"],
                is_generate_intent=True,
                is_modify_intent=True,
                is_inspect_intent=False,
                is_guide_intent=False,
                requires_execution=True,
                is_send_intent=True,
                is_knowledge_intent=False,
                admission={"task_mode": "execute", "output_mode": "artifact", "artifact_types": [".xlsx"]},
            )
            self.assertFalse(requires_spreadsheet_analysis(prompt, skill_res))
            tools = select_active_tools(prompt, skill_res, False, False)
            tool_names = {t["function"]["name"] for t in tools}
            self.assertIn("bash", tool_names)
            self.assertIn("aggregate_spreadsheet", tool_names)
            self.assertNotIn("plan_spreadsheet_update", tool_names)
            self.assertNotIn("execute_spreadsheet_update", tool_names)

    def test_k10_duration_metric_with_amount_unit_keeps_hours_and_column_quote_is_not_unit_confirmation(self):
        # 1. query_executor should keep '小时' when target_unit='amount' on duration column '工数(小时)'
        res = calculate_spreadsheet_analysis(self.wb_path, {"query": {
            "source": {"sheet": "工数实绩明细", "header_row": 4, "start_row": 5, "end_row": 8},
            "group_by": ["部门编号"],
            "metrics": [
                {"id": "hrs", "label": "总工数", "op": "sum", "field": "工数(小时)", "unit": "amount"},
                {"id": "amt", "label": "金额合计", "op": "sum", "field": "金额(K)", "unit": "amount"},
            ],
        }})
        self.assertTrue(res.is_success)
        hrs_facts = [f for f in res.data["facts"] if f["id"].startswith("hrs")]
        self.assertTrue(all(f["unit"] == "小时" for f in hrs_facts))

        # 2. task_intent should ignore parenthetical column header quotes like '金额(K)合计' in unit_confirmation
        intent = validate_intent({
            "instruction_relation": "standalone",
            "task_mode": "execute",
            "output_mode": "artifact",
            "artifact_types": [".xlsx"],
            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
            "unit_confirmation": {"unit": "K", "quote": "金额(K)合计"},
            "requirements": [{"id": "r1", "quote": "金额(K)合计"}],
        }, "汇总每个部门总工数、金额(K)合计", [], [])
        self.assertIsNone(intent.get("unit_confirmation"))

    def test_k02_and_k04r_downgrade_verified_workflow_to_general_and_k10_accepts_xlsx_skill(self):
        # K02 / K04R: multi-step analysis with row numbers or cross-tabulation downgrades dept-summary to general
        for prompt in (
            "只筛选部门编号为 S22014 的业务明细：给出记录条数、工数合计、金额(K)合计，并按工数从高到低列出前5条记录的原Excel行号、员工编号、员工姓名、WBS编号、工数(小时)、金额(K)。",
            "只看5个部门 S22014、S22024：分别给出有偿工数、无偿工数、总工数、有偿占比、金额(K)合计，并核对5个部门合计是否等于全表总计。",
        ):
            def responder(messages, **kwargs):
                tname = kwargs["tools"][0]["function"]["name"]
                if tname == "submit_task_intent":
                    return {
                        "content": json.dumps({
                            "instruction_relation": "standalone",
                            "task_mode": "execute",
                            "output_mode": "conversation",
                            "artifact_types": [],
                            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
                            "requirements": [{"id": "g", "quote": prompt[:15]}],
                        }),
                        "finish_reason": "stop",
                    }
                return {
                    "content": json.dumps({
                        "action": "use",
                        "skill_id": "dept-summary",
                        "use_default_rules": False,
                        "rule_basis": "",
                        "reason": "applicable",
                        "question": "",
                    }),
                    "finish_reason": "stop",
                }

            with patch("dsh_modules.semantic_decision.call_model_proxy", side_effect=responder), \
                 patch("dsh_modules.skill_admission.get_available_skills", return_value=[
                     {"id": "dept-summary", "name": "部门别有偿统计", "execution_mode": "verified_workflow", "type": "custom"}
                 ]), \
                 patch("dsh_modules.skill_admission.read_skill", return_value="skill body"):
                routed = admit_skill(
                    prompt, [], [self.wb_path.name], SimpleNamespace(skill_id="dept-summary"),
                    model="test", policy=None, telemetry=TelemetryStats(), deadline=None
                )
                self.assertEqual(routed.admission["action"], "general")
                self.assertIsNone(routed.skill_id)

        # K10: built-in certified format skill 'xlsx' with mode='execute' and use_default_rules=False is accepted
        k10_prompt = "基于原附件使用 xlsx 生成新的三工作表管理报表 workhours_management_report.xlsx 并提供下载"
        def k10_responder(messages, **kwargs):
            tname = kwargs["tools"][0]["function"]["name"]
            if tname == "submit_task_intent":
                return {
                    "content": json.dumps({
                        "instruction_relation": "standalone",
                        "task_mode": "execute",
                        "output_mode": "artifact",
                        "artifact_types": [".xlsx"],
                        "skill_invocation": {"mode": "execute", "name": "xlsx", "replace_defaults": False},
                        "requirements": [{"id": "g", "quote": "生成新的三工作表管理报表"}],
                    }),
                    "finish_reason": "stop",
                }
            return {
                "content": json.dumps({
                    "action": "use",
                    "skill_id": "xlsx",
                    "use_default_rules": False,
                    "rule_basis": "",
                    "reason": "applicable",
                    "question": "",
                }),
                "finish_reason": "stop",
            }

        with patch("dsh_modules.semantic_decision.call_model_proxy", side_effect=k10_responder), \
             patch("dsh_modules.skill_admission.get_available_skills", return_value=[
                 {"id": "xlsx", "name": "Excel 表格", "type": "certified"}
             ]), \
             patch("dsh_modules.skill_admission.read_skill", return_value="xlsx skill body"):
            routed_k10 = admit_skill(
                k10_prompt, [], [self.wb_path.name], SimpleNamespace(skill_id="xlsx"),
                model="test", policy=None, telemetry=TelemetryStats(), deadline=None
            )
            self.assertEqual(routed_k10.admission["action"], "use")
            self.assertEqual(routed_k10.skill_id, "xlsx")

    def test_k06_and_k07_review_clarification_does_not_ask_to_reupload_attached_file(self):
        original_text = (
            "由于您的指令中“工数异常”和“重点项目成本”定义为多种可选口径，当前附件包含《工数实绩明细_20261020134124.xlsx》"
            "（含工数(小时)、金额(K)、项目名称、WBS编号等字段），但缺少预算或人天单价标准。请确认："
            "1. 工数异常的阈值口径；2. 重点项目的筛选范围。"
        )
        with patch.dict(os.environ, {"DSH_SESSION_ATTACHMENTS": json.dumps([self.wb_path.name])}), \
             patch("dsh_modules.config.WORKSPACE_DIR", str(self.root)), \
             patch("dsh_modules.task_completeness_judge.TaskCompletenessJudge.judge_task_completeness", return_value={
                 "action": "clarify",
                 "category": "missing_data",
                 "complete": False,
                 "dismissed_issue_codes": [],
                 "supporting_fact_ids": [],
                 "reason": "missing file",
                 "repair_instruction": "",
                 "user_question": "请上传包含员工编号、工数(小时)的原始表格文件，并明确口径。",
             }):
            delivered, _ = review_clarification(
                original_text, [], "帮我看看谁的工数异常，顺便算一下重点项目的成本", model="test"
            )
            self.assertNotIn("请上传", delivered)
            self.assertEqual(delivered, original_text)

    def test_interrogative_pronoun_not_extracted_as_entity(self):
        cases = [
            ("查看 部门工数 合计 超过 500K的 有哪些部门", [], True, "部门"),
            ("工数超过100小时的有哪些员工", [], True, "员工"),
            ("有哪些项目是有偿的", [], True, "项目"),
            ("查看员工 杨烨的 工数 明细", ["杨烨"], False, None),
            ("查看部门 華東MIS 的总工数", ["華東MIS"], False, None),
        ]
        for prompt, exp_entities, exp_grouped, exp_grp_dim in cases:
            contract = build_analysis_contract(prompt)
            self.assertEqual(set(contract.entity_predicates), set(exp_entities), f"Entities failed for {prompt}")
            self.assertEqual(contract.is_grouped, exp_grouped, f"is_grouped failed for {prompt}")
            self.assertEqual(contract.group_dimension, exp_grp_dim, f"group_dimension failed for {prompt}")


if __name__ == "__main__":
    unittest.main()
