"""Unit tests verifying engineering fixes for audit regressions (22:17 call reaudit).

Ensures:
1. Attachment-wrapped input prompts (.xlsx) do not trigger deliverable/visualization routing.
2. Markdown headings (e.g. '### 2. 盈利能力变化计算') or list numbering are not extracted as metric values.
3. Abstract analysis goals (e.g. '盈利能力变化') are filtered out from mandatory contract metrics.
4. Legacy un-versioned corrupted contract caches are discarded.
"""

import unittest
from types import SimpleNamespace
from dsh_modules.analysis_validation import _extract_metric_value_from_reply
from dsh_modules.analysis_contract import _contract_from_judge_verdict
from dsh_modules.semantic_contract_judge import SemanticContractJudge
import re


class TestAuditReauditEngineeringFixes(unittest.TestCase):
    def test_attachment_wrapped_prompt_does_not_trigger_deliverable_routing(self):
        """Input attachment wrapper mentioning .xlsx must not switch routing to visual/deliverable."""
        wrapped = "【当前轮次用户上传附件】: AI能力测试_财务报表.xlsx（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n用户指令：解释下半年盈利能力变化。"

        visual_terms = ("图表", "柱状图", "折线图", "饼图", "散点图", "雷达图", "html", "看板", "大屏", "网页", "可视化", "绘图", "画图", "生成图")
        artifact_terms = ("word文档", "pdf文件", "ppt演示", "下载链接")
        _target_prompt = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】:[^\n]+', '', wrapped or '')

        has_visual_or_deliverable = bool(
            any(k in _target_prompt.lower() for k in visual_terms)
            or any(doc in _target_prompt.lower() for doc in artifact_terms)
            or bool(re.search(r'(?:生成|导出|输出|制作|做成|保存为|下载).*(?:\.xlsx|\.docx|\.pdf|\.pptx|word|excel|ppt|表|文档)', _target_prompt, re.I))
        )
        self.assertFalse(has_visual_or_deliverable, "Input file attachment must not trigger deliverable routing")

        # Explicit export request should still trigger deliverable routing
        export_wrapped = "【当前轮次用户上传附件】: data.xlsx\n用户指令：导出下半年分析为 report.xlsx"
        _target_export = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】:[^\n]+', '', export_wrapped or '')
        has_export_deliverable = bool(
            any(k in _target_export.lower() for k in visual_terms)
            or any(doc in _target_export.lower() for doc in artifact_terms)
            or bool(re.search(r'(?:生成|导出|输出|制作|做成|保存为|下载).*(?:\.xlsx|\.docx|\.pdf|\.pptx|word|excel|ppt|表|文档)', _target_export, re.I))
        )
        self.assertTrue(has_export_deliverable, "Explicit export request must trigger deliverable routing")

    def test_markdown_heading_numbers_are_not_extracted_as_metric_values(self):
        """Section header numbers like '### 2. 盈利能力变化计算' must never satisfy numeric metrics."""
        metric_goal = SimpleNamespace(name="盈利能力变化", aliases=["盈利能力变化"], expected_type="number")
        contract = SimpleNamespace(dimension=None, comparison=None)

        # 1. Pure section header
        sat, val, is_year = _extract_metric_value_from_reply(metric_goal, "### 2. 盈利能力变化计算", contract)
        self.assertFalse(sat, f"Header line was falsely marked satisfied with value: {val}")
        self.assertIsNone(val)

        # 2. Numbered list item containing actual value
        metric_profit = SimpleNamespace(name="净利润", aliases=["净利润"], expected_type="number")
        sat, val, is_year = _extract_metric_value_from_reply(metric_profit, "2. 净利润：9757.35 万元", contract)
        self.assertTrue(sat)
        self.assertEqual(val, "9757.35万元", "Should extract the metric amount, not the leading list index '2'")

        # 3. Header containing an actual statement with value
        sat, val, is_year = _extract_metric_value_from_reply(metric_profit, "### 2. 下半年净利润为 9757.35 万元", contract)
        self.assertTrue(sat)
        self.assertEqual(val, "9757.35万元")

    def test_abstract_analysis_goals_are_filtered_from_contract_metrics(self):
        """Abstract analysis goal terms must not become raw mandatory numeric column metrics."""
        verdict = {
            "task_type": "tabular_compute",
            "is_grouped": False,
            "group_dimension": None,
            "is_audit": False,
            "entity_predicates": [],
            "metrics": ["盈利能力变化", "净利润", "基准值"],
            "filter_conditions": ["月份 >= 7 AND 月份 <= 12"],
            "audit_checks": [],
            "period": "下半年",
            "operation": None,
            "dimension": None,
            "comparison": None,
            "comparison_basis": "yoy",
            "ranking": None,
            "limit": None
        }

        contract = _contract_from_judge_verdict("解释下半年盈利能力变化", verdict, "finance")
        metric_names = [m.name for m in contract.metrics]

        self.assertNotIn("盈利能力变化", metric_names, "Abstract analysis goal should be filtered")
        self.assertNotIn("基准值", metric_names, "Scenario column should be filtered")
        self.assertIn("净利润", metric_names, "Real financial indicator should be kept")
        self.assertEqual(contract.comparison_basis, "period_comparison", "H2 vs H1 in same year should be period_comparison, not yoy")

    def test_semantic_contract_judge_cache_version_and_invalidation(self):
        """Cache version must be v6 and legacy corrupted cache paths must be discarded."""
        self.assertEqual(SemanticContractJudge._CACHE_VERSION, "v6")
        path = SemanticContractJudge._cache_path("解释下半年盈利能力变化", ["月份", "净利润"], "finance")
        self.assertTrue(path.name.endswith(".json"))
        self.assertFalse(path.name.startswith("2aaafb7d"), "Must not resolve to legacy corrupted cache 2aaafb7d")

    def test_weather_and_general_queries_do_not_require_spreadsheet_analysis(self):
        """General questions like weather must never require spreadsheet analysis even if xlsx is attached."""
        from dsh_modules.spreadsheet_analysis_evidence import requires_spreadsheet_analysis
        skill_res_weather = SimpleNamespace(
            skill_id=None,
            source_formats=['.xlsx'],
            admission={'action': 'general', 'skill_id': None, 'reason': 'no_skill_needed'},
            is_search_intent=True,
            is_research_intent=False,
            is_generate_intent=False,
            is_modify_intent=False,
            requires_execution=False,
            is_guide_intent=False
        )
        prompt_weather = "【当前会话有效附件清单】: AI能力测试_财务报表.xlsx\n用户指令：明天上海的天气"
        self.assertFalse(
            requires_spreadsheet_analysis(prompt_weather, skill_res_weather),
            "Weather query with no_skill_needed admission must not require spreadsheet analysis"
        )

        # Tabular calculation query should still require spreadsheet analysis
        skill_res_calc = SimpleNamespace(
            skill_id='xlsx',
            source_formats=['.xlsx'],
            admission={'action': 'use', 'skill_id': 'xlsx', 'use_default_rules': True},
            is_search_intent=False,
            is_research_intent=False,
            is_generate_intent=False,
            is_modify_intent=False,
            requires_execution=False,
            is_guide_intent=False
        )
        prompt_calc = "【当前会话有效附件清单】: AI能力测试_财务报表.xlsx\n用户指令：总结2026年营业收入与净利润"
        self.assertTrue(
            requires_spreadsheet_analysis(prompt_calc, skill_res_calc),
            "Tabular metric query must require spreadsheet analysis"
        )

    def test_weather_and_search_queries_do_not_trigger_inspect_mode(self):
        """Prompt builder must not enter Inspect Mode for weather or web search tasks."""
        from dsh_modules.prompt_builder import build_user_turn
        user_turn = build_user_turn(
            prompt="明天上海的天气",
            session_files=["AI能力测试_财务报表.xlsx"],
            file_context="",
            knowledge_context="",
            skill_context="",
            search_context="【上海 实时天气】: 18°C",
            is_send_intent=False,
            is_search_intent=True,
            is_ppt_intent=False,
            is_design_intent=False,
            is_docx_intent=False,
            is_office_intent=False,
            is_research_intent=False,
            is_inspect_intent=False,
            is_generate_intent=False,
            is_guide_intent=False,
            existing_history=[],
            max_skill_chars=2000,
            timestamp_str="2026-10-27 08:30:00",
            available_tool_names=["web_search"]
        )
        self.assertNotIn("【Inspect Mode】只做解决问题所需的本地检查", user_turn)
        self.assertNotIn("只读审阅与内容归纳规范", user_turn)

    def test_analysis_turn_does_not_treat_search_receipts_as_spreadsheet_success(self):
        """AnalysisTurn must not treat web_search receipts as spreadsheet aggregation successes."""
        from dsh_modules.analysis_turn import AnalysisTurn
        from dsh_modules.tool_result import adapt_tool_output
        from dsh_modules.telemetry import TelemetryStats
        from dsh_modules.runtime_policy import RuntimePolicy

        receipt = adapt_tool_output("【上海实时天气】: 18°C")
        receipt.provenance = {"tool": "web_search", "phase": "prefetch"}

        turn = AnalysisTurn("【当前会话有效附件清单】: AI能力测试_财务报表.xlsx\n用户指令：明天上海的天气")
        telemetry = TelemetryStats()
        policy = RuntimePolicy()
        model_text = "根据实时气象数据，明天上海天气为多云转晴，气温 14°C ~ 21°C。"

        rendered = turn.render([receipt], model_text, telemetry, policy=policy)
        self.assertNotIn("部分指标核验未完成", rendered, "web_search receipt must not trigger spreadsheet partial verification disclaimer")
        self.assertNotIn("执行核验状态", rendered)


if __name__ == '__main__':
    unittest.main()
