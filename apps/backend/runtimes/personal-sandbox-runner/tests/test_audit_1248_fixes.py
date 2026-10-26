import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.spreadsheet_analysis import compile_legacy_filters_to_predicate
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.agent_loop import MAX_SPREADSHEET_ROUNDS_CEILING, MAX_AGENT_ROUNDS_HARD_CEILING
from dsh_modules.task_intent import has_physical_artifact_request, is_visual_artifact_requested, validate_intent
from dsh_modules.artifact_exporter import ArtifactExporter


class Audit1248FixesTests(unittest.TestCase):
    def test_legacy_exclude_prefixes_compiled_to_not_starts_with(self):
        # 12:48 生产环境直接触发的 bug: 模型提交 exclude_prefixes 但未传 op 键
        filters = [
            {"column": "WBS编号", "exclude_prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}
        ]
        predicate = compile_legacy_filters_to_predicate(filters)
        self.assertIsNotNone(predicate)
        self.assertEqual(predicate.get("op"), "not_starts_with")
        self.assertEqual(predicate.get("field"), "WBS编号")
        self.assertEqual(predicate.get("values"), ["ex", "sy", "sp", "ip", "ib", "sz"])

    def test_legacy_prefixes_compiled_to_starts_with(self):
        filters = [
            {"column": "WBS编号", "prefixes": ["IK", "SK"]}
        ]
        predicate = compile_legacy_filters_to_predicate(filters)
        self.assertIsNotNone(predicate)
        self.assertEqual(predicate.get("op"), "starts_with")
        self.assertEqual(predicate.get("values"), ["IK", "SK"])

    def test_chart_prompt_receives_deliverable_budget(self):
        policy = RuntimePolicy()
        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图"
        rounds = policy.determine_max_rounds(prompt)
        # 表格统计与图表可视化并存的复合任务，给予复合任务预算 (至少 8 轮)
        self.assertGreaterEqual(rounds, 8)

    def test_spreadsheet_ceiling_increased(self):
        # 全局放宽表格分析的硬上限 (至少 8 轮)
        self.assertGreaterEqual(MAX_SPREADSHEET_ROUNDS_CEILING, 8)

    def test_chart_request_recognized_as_physical_artifact(self):
        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图"
        self.assertTrue(has_physical_artifact_request(prompt))
        self.assertTrue(is_visual_artifact_requested(prompt))

    def test_validate_intent_promotes_visual_chart_to_artifact(self):
        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图"
        raw_intent = {
            "instruction_relation": "standalone",
            "task_mode": "execute",
            "output_mode": "conversation",
            "artifact_types": [],
            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
            "requirements": [{"id": "req_1", "quote": prompt}]
        }
        validated = validate_intent(raw_intent, prompt, [], [])
        self.assertEqual(validated["output_mode"], "artifact")
        self.assertIn(".html", validated["artifact_types"])


if __name__ == "__main__":
    unittest.main()
