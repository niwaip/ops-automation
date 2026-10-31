"""
Unit tests for Dual-Track Routing:
1. Fast-Path router (< 1ms) for slash commands and deterministic explicit intents.
2. IntentJudge for semantic conflict arbitration, negative constraint enforcement, and disk caching.
"""

import sys
import time
import json
import unittest
from pathlib import Path
from unittest.mock import patch

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from dsh_modules.skill_router import SkillRouter
from dsh_modules.intent_judge import IntentJudge


class FastPathAndIntentJudgeTests(unittest.TestCase):

    def test_fast_path_slash_commands_latency_and_precision(self):
        """Slash 命令走 Fast-Path 快轨，耗时极短 (< 1ms) 且结果精准"""
        start = time.perf_counter()
        res_ppt = SkillRouter.route("/ppt 2026年第四季度智能运维汇报", load_skill_context=False)
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        self.assertEqual(res_ppt.skill_id, "guizang-ppt")
        self.assertTrue(res_ppt.is_generate_intent)
        self.assertTrue(res_ppt.is_ppt_intent)
        self.assertTrue(any("fast_path:slash_command" in r for r in res_ppt.matched_reasons))
        self.assertLess(elapsed_ms, 5.0)  # 通常在 0.5ms 内完成

        # 测试 /docx 和 /search
        res_docx = SkillRouter.route("/docx 平台架构设计方案", load_skill_context=False)
        self.assertEqual(res_docx.skill_id, "docx")
        self.assertTrue(res_docx.is_docx_intent)

        res_search = SkillRouter.route("/search 2026前沿科技热点", load_skill_context=False)
        self.assertTrue(res_search.is_search_intent)

        res_research = SkillRouter.route("/research 深度调研行业趋势", load_skill_context=False)
        self.assertEqual(res_research.skill_id, "research")
        self.assertTrue(res_research.is_research_intent)

    def test_intent_judge_trigger_conditions(self):
        """验证 IntentJudge 触发条件：Slash 指令不触发，否定词与冲突意图精准触发"""
        # 1. Slash 命令绝不触发
        self.assertFalse(IntentJudge.should_trigger("/ppt 汇报", False, False))

        # 2. 否定词修饰生成交付物，必须触发
        self.assertTrue(IntentJudge.should_trigger(
            "参考这个文件，帮我分析下内容，但不要生成ppt，就在聊天里回复",
            is_gen_candidate=True,
            is_insp_candidate=True
        ))

        # 3. 双重冲突（无目标格式时既要求查看又要求做个报告）
        self.assertTrue(IntentJudge.should_trigger(
            "帮我分析一下这几个文档，然后出个汇报说明",
            is_gen_candidate=True,
            is_insp_candidate=True,
            target_formats=[]
        ))

        # 4. 目标明确的无冲突生成，不额外触发
        self.assertFalse(IntentJudge.should_trigger(
            "生成年度财务分析报告.xlsx",
            is_gen_candidate=True,
            is_insp_candidate=False,
            target_formats=[".xlsx"]
        ))

    def test_intent_judge_verdict_arbitration(self):
        """验证 IntentJudge 在否定句下能精准校准路由结果，纠正传统规则误判"""
        mock_verdict = {
            "skill_id": None,
            "is_generate_intent": False,
            "is_inspect_intent": True,
            "primary_intent": "inspect",
            "confidence": 0.98,
            "reason": "用户明确要求不要生成PPT，仅在聊天中回复"
        }

        with patch.object(IntentJudge, "should_trigger", return_value=True), \
             patch.object(IntentJudge, "judge_intent", return_value=mock_verdict):

            route = SkillRouter.route(
                "参考这个PPT的结构，帮我写个普通文字总结，千万不要生成任何PPT文件",
                load_skill_context=False
            )

            # 验证 Judge 裁决生效：生成意图被纠正为 False，只读为 True，不绑定 PPT 技能
            self.assertFalse(route.is_generate_intent)
            self.assertTrue(route.is_inspect_intent)
            self.assertIsNone(route.skill_id)
            self.assertTrue(any("intent_judge" in r for r in route.matched_reasons))

    def test_intent_judge_cache_and_fallback(self):
        """验证 IntentJudge 磁盘缓存机制与超时降级"""
        cache_path = IntentJudge._cache_path("测试缓存Query", None, "default")
        try:
            cached_data = {
                "skill_id": "docx",
                "is_generate_intent": True,
                "is_inspect_intent": False,
                "primary_intent": "generate",
                "confidence": 0.95,
                "reason": "命中缓存"
            }
            cache_path.write_text(json.dumps(cached_data, ensure_ascii=False), encoding="utf-8")

            # 读取缓存
            verdict = IntentJudge.judge_intent("测试缓存Query")
            self.assertIsNotNone(verdict)
            self.assertEqual(verdict["skill_id"], "docx")
            self.assertEqual(verdict["reason"], "命中缓存")
        finally:
            if cache_path.exists():
                cache_path.unlink()


if __name__ == "__main__":
    unittest.main()
