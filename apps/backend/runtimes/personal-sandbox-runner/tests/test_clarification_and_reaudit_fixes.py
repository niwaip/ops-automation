"""Unit tests for clarification protection and re-audit F1-F6 fixes."""

import unittest
from decimal import Decimal
import openpyxl
import tempfile
from pathlib import Path

from dsh_modules.analysis_turn import is_clarification_response, AnalysisTurn
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.query_predicates import eval_predicate_3vl
from dsh_modules.spreadsheet_preflight import profile_spreadsheet_for_planning
from dsh_modules.analysis_contract import build_analysis_contract


class ClarificationAndReauditFixesTests(unittest.TestCase):

    def test_clarification_response_detection(self):
        # 1. Asking for user clarification on missing columns
        text1 = "您好，表格中包含【员工职级】和【工数】列，但未找到【利润率】对应列。请问您需要如何核算，或者需要补充哪张工作表？"
        self.assertTrue(is_clarification_response(text1))

        # 2. Asking user to confirm ambiguous definition
        text2 = "请确认您所指的“有偿”是按照【有偿无偿】字段中的“有偿”筛选，还是包含特定客户的合同款项？请补充确认口径。"
        self.assertTrue(is_clarification_response(text2))

        # 3. Fabricated numbers claiming to be verified table output must NOT pass as clarification
        text3 = "请确认以下核算结果：\n| 部门 | 核算结果 |\n| A部门 | 100 K |\n| B部门 | 200 K |"
        self.assertFalse(is_clarification_response(text3))

        # 4. Raw JSON evidence output is not clarification
        text4 = '{"evidence_ids": ["abc12345"], "hypotheses": []}'
        self.assertFalse(is_clarification_response(text4))

    def test_analysis_turn_clarification_protection(self):
        prompt = "统计各产品的净利润率"
        turn = AnalysisTurn(prompt)
        telemetry = TelemetryStats()

        clarification_msg = "在上传的工作簿中未找到【净利润率】字段，请问您是指按照毛利率计算，还是需要补充利润表数据？请明确统计口径。"
        self.assertTrue(turn.is_clarification([], clarification_msg))

        # response() should accept clarification message directly
        res = turn.response([], clarification_msg)
        self.assertEqual(res, clarification_msg)

        # render() should deliver clarification directly to user without intercepting with unverified error
        rendered = turn.render([], clarification_msg, telemetry)
        self.assertEqual(rendered, clarification_msg)
        self.assertIn("clarification_requested", [g.get("reason") or g.get("error_code") for g in telemetry.guard_decisions])

    def test_query_predicates_operator_aliases(self):
        row = {"hours": Decimal("25"), "status": "active"}

        # ">" alias for gt
        node_gt = {"op": ">", "field": "hours", "value": 20}
        self.assertTrue(eval_predicate_3vl(node_gt, row))

        node_gt_false = {"op": ">", "field": "hours", "value": 30}
        self.assertFalse(eval_predicate_3vl(node_gt_false, row))

        # "<=" alias for lte
        node_lte = {"op": "<=", "field": "hours", "value": 25}
        self.assertTrue(eval_predicate_3vl(node_lte, row))

        # "==" alias for eq
        node_eq = {"op": "==", "field": "status", "value": "active"}
        self.assertTrue(eval_predicate_3vl(node_eq, row))

        # "!=" alias for ne
        node_ne = {"op": "!=", "field": "status", "value": "inactive"}
        self.assertTrue(eval_predicate_3vl(node_ne, row))

    def test_preflight_price_role_and_sampling(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fpath = Path(tmpdir) / "test_sheet.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "明细"

            headers = ["部门编号", "职级单价", "WBS负责成本中心", "工数(小时)", "金额(K)"]
            ws.append(headers)
            for i in range(10):
                ws.append(["D01", 45 + i, "FC34000", 8.0, 360.0])
            wb.save(fpath)
            wb.close()

            profile = profile_spreadsheet_for_planning(fpath)
            cols = {c["name"]: c for c in profile["columns"]}

            # "职级单价" should be currency, not categorical
            self.assertEqual(cols["职级单价"]["dimension"], "currency")
            # "WBS负责成本中心" should be categorical
            self.assertEqual(cols["WBS负责成本中心"]["dimension"], "categorical")
            # "工数(小时)" should be duration
            self.assertEqual(cols["工数(小时)"]["dimension"], "duration")

    def test_suffix_filter_intent_contract(self):
        prompt = "WBS编号以-001结尾，统计条数、金额(K)与工数(小时)。"
        contract = build_analysis_contract(prompt)
        self.assertTrue(contract.has_filters)

    def test_reflection_text_not_misidentified_as_clarification(self):
        # Retrospective review / declaration of completion must NOT be classified as clarification
        reflection_text = (
            "用户要求按「部门名称」分组统计金额。第一轮我只调用了全局汇总，未执行分组聚合，"
            "导致缺少按部门的分拆数据。现在我已补充完成按部门的金额、工数及记录数分组统计，"
            "所有部门数据已完整获取。"
        )
        self.assertFalse(is_clarification_response(reflection_text))

    def test_inverted_measure_syntax_in_contract(self):
        # Inverted measure syntax: "按照 部门名称 分组 进行金额的统计"
        prompt = "按照 部门名称 分组 进行金额的统计"
        contract = build_analysis_contract(prompt)
        self.assertTrue(contract.is_grouped)
        self.assertEqual(contract.group_dimension, "部门名称")
        self.assertIn("金额", [m.name for m in contract.metrics])

        # Other inverted variants
        contract2 = build_analysis_contract("针对工数进行汇总")
        self.assertIn("工数", [m.name for m in contract2.metrics])

        contract3 = build_analysis_contract("做部门费用的核算")
        self.assertIn("费用", [m.name for m in contract3.metrics])
        metric3 = next(m for m in contract3.metrics if m.name == "费用")
        self.assertTrue(any("部门费用" in a for a in metric3.aliases))


if __name__ == '__main__':
    unittest.main()
