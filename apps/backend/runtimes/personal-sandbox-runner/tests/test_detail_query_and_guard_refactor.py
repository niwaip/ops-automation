"""Tests for detail query capability, fact grounding guardrail, and clarification protection."""

import json
import unittest
from decimal import Decimal
import openpyxl

import sys
from pathlib import Path
_src_dir = str(Path(__file__).resolve().parent.parent / "src")
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)

from dsh_modules.analysis_contract import (
    build_analysis_contract,
    TASK_TYPE_TABULAR_QUERY,
    TASK_TYPE_TABULAR_COMPUTE,
)
from dsh_modules.query_contract import (
    validate_query_plan,
    QueryContractError,
)
from dsh_modules.query_executor import execute_query_plan
from dsh_modules.query_result import QueryResult
from dsh_modules.analysis_turn import AnalysisTurn, is_clarification_response
from dsh_modules.analysis_synthesis import _is_synthesis_grounded, _has_unverified_numbers, _collect_allowed_numbers
from dsh_modules.report_presentation import analysis_overview, with_sources
from dsh_modules.tool_result import ToolResult, TextToolOutput
from dsh_modules.comparison_evidence import validate_execution_output


class TestDetailQueryAndGuardRefactor(unittest.TestCase):

    def test_detail_query_intent_recognition(self):
        """1. 验证明细查询意图解析，不强制聚合 SUM。"""
        contract = build_analysis_contract("查看 员工  s22014 的 工数明细")
        self.assertTrue(contract.is_detail_query, "应识别为明细查询")
        self.assertEqual(contract.task_type, TASK_TYPE_TABULAR_QUERY, "任务类型应为 tabular_query")
        self.assertIn("S22014", contract.entity_predicates, "应抽取员工编号实体")
        self.assertFalse(contract.is_explicit_calc, "用户提问是查看明细，不是显式计算")

        contract_calc = build_analysis_contract("统计各部门总工数和总金额")
        self.assertFalse(contract_calc.is_detail_query, "聚合统计不应判定为明细查询")
        self.assertEqual(contract_calc.task_type, TASK_TYPE_TABULAR_COMPUTE)

    def test_query_contract_row_projection(self):
        """2. 验证 Query IR 契约支持行记录投影（不需要 metrics）。"""
        available_cols = {"员工编号", "员工姓名", "工数(小时)", "金额(K)", "WBS编号"}
        # 允许 select / fields
        plan_select = {
            "source": {"sheet": "工数实绩明细"},
            "where": {"op": "eq", "field": "员工编号", "value": "S22014"},
            "select": ["员工编号", "员工姓名", "工数(小时)"]
        }
        try:
            validate_query_plan(plan_select, available_cols)
        except QueryContractError as e:
            self.fail(f"validate_query_plan 不应拒绝 select 投影: {e}")

        # 允许 mode: records
        plan_records = {
            "source": {"sheet": "工数实绩明细"},
            "where": {"op": "eq", "field": "员工编号", "value": "S22014"},
            "mode": "records"
        }
        try:
            validate_query_plan(plan_records, available_cols)
        except QueryContractError as e:
            self.fail(f"validate_query_plan 不应拒绝 mode: records: {e}")

    def test_query_executor_row_projection(self):
        """3. 验证 Query 执行器正确返回明细行数据并完整追踪单元格。"""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "工数明细"
        ws.append(["员工编号", "员工姓名", "WBS编号", "工数(小时)", "金额(K)"])
        ws.append(["S22014", "张三", "WBS-001", 10.5, 2.5])
        ws.append(["S22014", "张三", "WBS-002", 20.0, 5.0])
        ws.append(["S99999", "李四", "WBS-003", 8.0, 1.8])

        plan = {
            "source": {"sheet": "工数明细", "header_row": 1, "data_range": "A2:E4"},
            "where": {"op": "eq", "field": "员工编号", "value": "S22014"},
            "select": ["员工编号", "员工姓名", "WBS编号", "工数(小时)", "金额(K)"],
            "order_by": [{"ref": "工数(小时)", "direction": "desc"}]
        }
        res = execute_query_plan(wb, plan)
        self.assertEqual(len(res.rows), 2, "应匹配 2 行 S22014 记录")
        self.assertEqual(res.rows[0]["WBS编号"], "WBS-002", "按工数降序第一行应为 WBS-002")
        self.assertEqual(res.rows[0]["工数(小时)"], 20.0)
        self.assertEqual(res.rows[1]["工数(小时)"], 10.5)
        # 验证单元格追踪
        self.assertTrue(any("工数明细!D" in cell for cell in res.visited_cells), "应记录工数列访问坐标")

    def test_guardrail_pass_through_when_grounded(self):
        """4. 验证护栏双向锚定：模型正文真实有据且数值100%正确时直接放行。"""
        receipt = ToolResult.success(
            data={
                "kind": "spreadsheet_analysis",
                "evidence_id": "ev_test_123",
                "facts": [
                    {"id": "total_hours", "label": "总工数", "value": "170.59", "unit": "小时"},
                    {"id": "total_amount", "label": "总金额", "value": "45.16", "unit": "千元"}
                ],
                "rows": [
                    {"WBS编号": "WBS-A", "工数": 100.0, "金额": 25.0},
                    {"WBS编号": "WBS-B", "工数": 70.59, "金额": 20.16}
                ],
                "coverage": [{"id": "t1", "sheet": "Sheet1", "data_range": "A1:E10", "input_records": 10, "evaluated_records": 2}]
            },
            provenance={"file_path": "/workspace/test.xlsx", "workbook_id": "hash123"}
        )

        model_response = (
            "已为您查到员工 S22014 的工数明细如下：\n\n"
            "| WBS编号 | 工数(小时) | 金额(千元) |\n"
            "|---|---:|---:|\n"
            "| WBS-A | 100.0 | 25.0 |\n"
            "| WBS-B | 70.59 | 20.16 |\n\n"
            "核算总工数为 170.59 小时，总金额为 45.16 千元。"
        )

        audit_text = "来源：test.xlsx；证据 `ev_test_123`。"
        is_grounded = _is_synthesis_grounded(
            model_response,
            [receipt],
            prompt="查看 员工 s22014 的 工数明细并统计总工数和总金额",
            audit=audit_text
        )
        self.assertTrue(is_grounded, "模型回答中的每个数字均在底层 facts 和 rows 中，应判定为 100% Grounded")

    def test_guardrail_rejects_hallucinated_numbers(self):
        """5. 验证护栏底线：模型回答中若自造未核验假数字，坚决拦截。"""
        receipt = ToolResult.success(
            data={
                "kind": "spreadsheet_analysis",
                "evidence_id": "ev_test_456",
                "facts": [
                    {"id": "total_hours", "label": "总工数", "value": "170.59", "unit": "小时"}
                ],
                "rows": []
            },
            provenance={"file_path": "/workspace/test.xlsx", "workbook_id": "hash456"}
        )

        # 引入未经核验的虚构数字 999.88
        hallucinated_response = "核算总工数为 170.59 小时，其中额外补贴为 999.88 元。"
        is_grounded = _is_synthesis_grounded(
            hallucinated_response,
            [receipt],
            prompt="查看总工数",
            audit=""
        )
        self.assertFalse(is_grounded, "包含幻觉数字 999.88 应被护栏驳回")

    def test_clarification_protection_for_missing_data(self):
        """6. 验证元数据缺失时的澄清保护，不被 escape_rejected 阻断。"""
        prompt = "计算 2026年 净利润率"
        # 模型识别到表格中没有利润列并说明原因
        output_info = TextToolOutput(
            "数据缺口说明",
            ToolResult.success(
                data={
                    "kind": "informational_spreadsheet",
                    "reason": "原表格仅包含工数与金额列，未包含净利润或成本列，无法计算净利润率，请补充数据或确认口径。",
                    "clarification_missing_data": True
                },
                provenance={"file_path": "/workspace/test.xlsx"}
            )
        )
        validated = validate_execution_output(prompt, output_info)
        result = getattr(validated, "tool_result", None)
        self.assertTrue(result.is_success, "有依据的数据缺口说明应被正常放行，不得转化为 escape_rejected 错误")

        # 验证 is_clarification_response 正确保护模型澄清文本
        model_clarification = "原表格中缺少【净利润】和【成本】相关列，当前无法直接计算净利润率。请问您是否有包含利润数据的补充报表？"
        is_clarify = is_clarification_response(model_clarification, prompt=prompt)
        self.assertTrue(is_clarify, "模型合理的澄清问话应被保护")

    def test_group_by_aggregation_not_hijacked_by_detail_rows(self):
        """7. 验证客户要求按部门分组统计金额时，不被附件名中的'明细'字样误判，不出现明细表格倾泻。"""
        prompt = (
            "【当前轮次用户上传附件】: 工数实绩明细_20261020134124.xlsx（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n"
            "用户指令：按照 部门名称 分组 进行金额的统计"
        )
        contract = build_analysis_contract(prompt)
        self.assertFalse(contract.is_detail_query, "分组统计意图绝不应判定为明细查询")
        self.assertTrue(contract.is_grouped, "应识别为分组意图")
        self.assertEqual(contract.group_dimension, "部门名称", "应准确抽取分组维度：部门名称")
        self.assertEqual(contract.task_type, TASK_TYPE_TABULAR_COMPUTE, "任务类型应为 tabular_compute")

        # 模拟包含分组统计事实的回执
        receipt = ToolResult.success(
            data={
                "kind": "spreadsheet_analysis",
                "evidence_id": "ev_grp_test",
                "facts": [
                    {"id": "c1__華東MIS", "label": "華東MIS 各部門金額合計(K)", "value": "677.59", "unit": "K", "group_key": "華東MIS"},
                    {"id": "c1__華東BAS", "label": "華東BAS 各部門金額合計(K)", "value": "328.78", "unit": "K", "group_key": "華東BAS"}
                ],
                "rows": [
                    {"部门名称": "華東MIS", "员工姓名": "王晶云", "金额(K)": "2.385"},
                    {"部门名称": "華東BAS", "员工姓名": "许海涛", "金额(K)": "11.895"}
                ]
            },
            provenance={"file_path": "/workspace/工数实绩明细_20261020134124.xlsx"}
        )
        overview = analysis_overview([receipt], prompt)
        self.assertNotIn("已检索到符合条件的明细数据", overview, "未要求明细时不应展示明细数据卡片")
        self.assertIn("華東MIS 各部門金額合計(K)", overview, "应呈现分组统计结果")


if __name__ == "__main__":
    unittest.main()
