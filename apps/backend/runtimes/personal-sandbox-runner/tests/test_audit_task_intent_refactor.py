"""Tests for audit-driven task_intent refactoring: cancellation safety, pure validation, negation handling."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.task_intent import (
    is_cancellation_or_abort,
    is_physical_export_negated,
    has_physical_artifact_request,
    is_visual_artifact_requested,
    is_spreadsheet_mutation_requested,
    validate_intent,
)
from dsh_modules.user_declarations import unit_confirmation, section_confirmation


class TaskIntentAuditRefactorTests(unittest.TestCase):

    def test_cancellation_and_abort_detection(self):
        self.assertTrue(is_cancellation_or_abort("取消任务，不要修改文件"))
        self.assertTrue(is_cancellation_or_abort("请先暂停"))
        self.assertTrue(is_cancellation_or_abort("算了不用改了"))
        self.assertTrue(is_cancellation_or_abort("先别做"))
        self.assertTrue(is_cancellation_or_abort("终止操作"))
        self.assertTrue(is_cancellation_or_abort("不要修改工作簿"))
        self.assertFalse(is_cancellation_or_abort("按部门统计金额的合计"))
        self.assertFalse(is_cancellation_or_abort("确认按*P写入"))
        self.assertFalse(is_cancellation_or_abort("把A1改成10"))

    def test_physical_export_negation(self):
        self.assertTrue(is_physical_export_negated("不要导出文件，只在聊天中解释"))
        self.assertTrue(is_physical_export_negated("分析 input.xlsx，不生成文件"))
        self.assertTrue(is_physical_export_negated("请画流程图，只在对话中展示，不生成文件"))
        self.assertTrue(is_physical_export_negated("只在聊天中说明结果，无需导出"))
        self.assertFalse(is_physical_export_negated("按部门统计金额，生成柱状图"))
        self.assertFalse(is_physical_export_negated("导出为excel工作簿"))

    def test_has_physical_artifact_request_respects_negation(self):
        self.assertFalse(has_physical_artifact_request("不要导出文件，只在聊天中解释"))
        self.assertFalse(has_physical_artifact_request("分析 input.xlsx，不生成文件"))
        self.assertTrue(has_physical_artifact_request("分析 input.xlsx，导出为报表"))
        self.assertTrue(has_physical_artifact_request("生成柱状图"))

    def test_spreadsheet_mutation_negation_and_expansion(self):
        # 否定识别
        self.assertFalse(is_spreadsheet_mutation_requested("解释如何更新工作表，暂不执行"))
        self.assertFalse(is_spreadsheet_mutation_requested("不要修改工作簿，只读数据"))
        # 动词扩充
        self.assertTrue(is_spreadsheet_mutation_requested("把旧工作表删掉"))
        self.assertTrue(is_spreadsheet_mutation_requested("将 A1 改成 10"))
        self.assertTrue(is_spreadsheet_mutation_requested("更新预实工作表"))
        self.assertTrue(is_spreadsheet_mutation_requested("复制sheet生成预测"))

    def test_visual_artifact_expansion(self):
        self.assertTrue(is_visual_artifact_requested("请绘制直方图"))
        self.assertTrue(is_visual_artifact_requested("生成柱状图"))
        self.assertTrue(is_visual_artifact_requested("做个箱线图看板"))

    def test_cancellation_in_clarification_prevents_escalation_to_execute(self):
        # 模拟审计场景：上一轮助手追问请确认，用户本轮回答取消
        history = [
            {"role": "user", "content": "更新工作簿中的金额"},
            {"role": "assistant", "content": "请确认写入单位是万元还是千元？"},
        ]
        user_request = "取消任务，不要修改文件"
        raw_intent = {
            "instruction_relation": "standalone",
            "task_mode": "consult",
            "output_mode": "conversation",
            "artifact_types": [],
            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
            "requirements": [{"id": "req1", "quote": "取消任务"}],
        }

        validated = validate_intent(
            raw_intent,
            user_request,
            users=["更新工作簿中的金额"],
            skill_names=[],
            history=history,
        )

        # 核心红线验证：取消请求绝对不能被篡改为 execute 或 artifact!
        self.assertEqual(validated["task_mode"], "consult")
        self.assertEqual(validated["output_mode"], "conversation")
        self.assertEqual(validated["artifact_types"], [])
        self.assertIsNone(validated.get("unit_confirmation"))

    def test_pause_request_in_followup_preserves_consult(self):
        history = [
            {"role": "user", "content": "请帮我分析工数"},
            {"role": "assistant", "content": "好的，正在分析..."},
        ]
        user_request = "请先暂停"
        raw_intent = {
            "instruction_relation": "followup",
            "task_mode": "consult",
            "output_mode": "conversation",
            "artifact_types": [],
            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
            "requirements": [{"id": "req1", "quote": "请先暂停"}],
        }

        validated = validate_intent(
            raw_intent,
            user_request,
            users=["请帮我分析工数"],
            skill_names=[],
            history=history,
        )

        self.assertEqual(validated["task_mode"], "consult")
        self.assertEqual(validated["output_mode"], "conversation")

    def test_validate_intent_is_pure_function_without_premature_side_effects(self):
        # 构造一个携带声明但在要求校验阶段必然失败的契约
        invalid_intent = {
            "instruction_relation": "standalone",
            "task_mode": "execute",
            "output_mode": "conversation",
            "artifact_types": [],
            "unit_confirmation": {"unit": "万元", "quote": "万元"},
            "section_confirmation": None,
            "skill_invocation": {"mode": "none", "name": "", "replace_defaults": False},
            "requirements": [{"id": "bad_req", "quote": "不存在的文字引用"}],
        }

        with self.assertRaises(ValueError):
            validate_intent(
                invalid_intent,
                "测试单位万元",
                users=[],
                skill_names=[],
            )

        # 纯函数保证：在契约未合法通过前，绝对不能提前触发声明绑定与状态污染
        self.assertIsNone(unit_confirmation())
        self.assertIsNone(section_confirmation())


if __name__ == "__main__":
    unittest.main()
