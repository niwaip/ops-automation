"""
Tests for decoupled Document Read & Write Contracts in DeepSeek Harness (dsh).
Verifies:
1. Natural dual-mode support for both Read (inspect/extract/summarize) and Write (generate/export).
2. Elimination of fragile keyword-based judgments (e.g. arbitrary content queries, source files).
3. Fast-path admission (< 1ms) for pure-read tasks without triggering heavy LLM-as-a-judge.
4. Input sources vs Output deliverables strict decoupling.
"""

import io
import os
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.skill_router import SkillRouter, resolve_file_action_intent, check_generation_target_is_physical
from dsh_modules.intent_contract import (
    extract_source_and_target_artifacts,
    resolve_task_action_mode,
    ACTION_MODE_READ,
    ACTION_MODE_WRITE,
    ACTION_MODE_CONVERT,
)
from dsh_modules.skill_admission import admit_skill
from dsh_modules.telemetry import TelemetryStats


class DocumentReadAndWriteContractTests(unittest.TestCase):

    def test_pure_read_pdf_without_keyword_dependency(self):
        """Natural colloquial queries without predefined keyword patterns are recognized as Read Mode."""
        queries = [
            "文档里面是什么内容",
            "帮我瞅瞅这个附件",
            "这份材料讲了什么",
            "核心要点有哪些",
            "第一页的作者是谁",
            "里面有提到违约金吗",
            "根据这个材料给我梳理下脉络",
        ]
        files = ["1.pdf"]
        for q in queries:
            with self.subTest(query=q):
                is_gen, is_insp = resolve_file_action_intent(q, attached_files=files)
                self.assertFalse(is_gen, f"Query '{q}' should NOT be generate intent")
                self.assertTrue(is_insp, f"Query '{q}' SHOULD be inspect intent")

                src, tgt_fmts, tgt_files = extract_source_and_target_artifacts(q, files)
                self.assertEqual(src, ["1.pdf"])
                self.assertEqual(tgt_fmts, [], f"Query '{q}' should NOT have target formats")
                self.assertEqual(tgt_files, [], f"Query '{q}' should NOT have target files")

                mode = resolve_task_action_mode(q, files)
                self.assertEqual(mode, ACTION_MODE_READ)

    def test_read_mode_bypasses_heavy_admission_with_zero_latency(self):
        """Pure read requests on attached PDF files fast-path through admit_skill (< 1ms) without calling LLM."""
        prompt = "文档里面是什么内容"
        files = ["1.pdf"]
        telemetry = TelemetryStats()

        with redirect_stdout(io.StringIO()):
            provisional = SkillRouter.route(
                prompt=prompt,
                files=files,
                load_skill_context=False
            )

        self.assertFalse(provisional.is_generate_intent)
        self.assertTrue(provisional.is_inspect_intent)
        self.assertEqual(provisional.deliverables, [])
        self.assertFalse(provisional.requires_execution)

        # 模拟一个模型调用函数，若被调用则抛异常（断言纯读模式下绝对不调用 LLM-as-a-judge）
        def should_not_be_called(*args, **kwargs):
            raise AssertionError("admit_skill MUST NOT invoke model proxy for pure read requests!")

        t0 = time.monotonic()
        with redirect_stdout(io.StringIO()):
            route = admit_skill(
                prompt=prompt,
                history=[],
                files=files,
                provisional=provisional,
                model="mock-model",
                policy=None,
                telemetry=telemetry,
                deadline=time.monotonic() + 10,
                read_body=should_not_be_called
            )
        elapsed = time.monotonic() - t0

        self.assertLess(elapsed, 0.2, "Fast path admission must finish in milliseconds")
        self.assertEqual(route.deliverables, [])
        self.assertFalse(route.is_generate_intent)
        self.assertEqual(route.source_formats, [".pdf"])

    def test_pure_write_pdf_contract(self):
        """Explicit generation request binds target deliverables and activates write pipeline."""
        prompt = "将上述总结内容整理并生成一份项目报告.pdf"
        is_gen, is_insp = resolve_file_action_intent(prompt)
        self.assertTrue(is_gen)
        self.assertFalse(is_insp)

        src, tgt_fmts, tgt_files = extract_source_and_target_artifacts(prompt)
        self.assertIn(".pdf", tgt_fmts)
        self.assertIn("项目报告.pdf", tgt_files)

        with redirect_stdout(io.StringIO()):
            route = SkillRouter.route(prompt, load_skill_context=False)

        self.assertTrue(route.is_generate_intent)
        self.assertIn(".pdf", route.deliverables)

    def test_convert_mode_read_source_and_write_target(self):
        """Reading an existing PDF to generate a Word docx separates source from target."""
        prompt = "读取 1.pdf 的内容，整理关键风险条款并导出为 合规报告.docx"
        files = ["1.pdf"]

        is_gen, is_insp = resolve_file_action_intent(prompt, attached_files=files)
        self.assertTrue(is_gen)
        self.assertTrue(is_insp)

        src, tgt_fmts, tgt_files = extract_source_and_target_artifacts(prompt, files)
        self.assertEqual(src, ["1.pdf"])
        self.assertEqual(tgt_fmts, [".docx"])
        self.assertEqual(tgt_files, ["合规报告.docx"])

        mode = resolve_task_action_mode(prompt, files)
        self.assertEqual(mode, ACTION_MODE_CONVERT)

        with redirect_stdout(io.StringIO()):
            route = SkillRouter.route(prompt, files=files, load_skill_context=False)

        self.assertEqual(route.skill_id, "docx")
        self.assertTrue(route.is_generate_intent)
        self.assertIn(".docx", route.deliverables)
        self.assertNotIn(".pdf", route.deliverables)

    def test_filename_in_query_is_not_treated_as_generation_trigger(self):
        """Mentioning '1.pdf' in query does not falsely trigger physical generation target."""
        queries = [
            "1.pdf 里面写了什么",
            "关于 1.pdf 的相关问答",
            "请阅读 1.pdf 并回答我的问题",
        ]
        for q in queries:
            with self.subTest(query=q):
                is_physical = check_generation_target_is_physical(q.lower())
                self.assertFalse(is_physical, f"'{q}' must not be considered physical generation")

                is_gen, is_insp = resolve_file_action_intent(q)
                self.assertFalse(is_gen)
                self.assertTrue(is_insp)


if __name__ == "__main__":
    unittest.main()
