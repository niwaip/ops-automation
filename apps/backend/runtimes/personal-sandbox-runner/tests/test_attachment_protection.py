#!/usr/bin/env python3
"""
Unit tests for attachment protection, MIP encrypted file handling,
and intent routing safety in DSH sandbox runner.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[5]
DSH_MODULES_DIR = PROJECT_ROOT / "apps" / "backend" / "runtimes" / "personal-sandbox-runner" / "src" / "dsh_modules"

if str(DSH_MODULES_DIR.parent) not in sys.path:
    sys.path.insert(0, str(DSH_MODULES_DIR.parent))

from dsh_modules.file_tools import read_workspace_file, inspect_image
from dsh_modules.skill_router import SkillRouter
from dsh_modules.runner import select_active_tools
from dsh_modules.prompt_builder import build_user_turn
from dsh_modules.tool_dispatch import dispatch_tool_calls, normalize_tool_name
from dsh_modules.analysis_synthesis import synthesize_analysis_summary, _is_synthesis_grounded
from dsh_modules.analysis_turn import AnalysisTurn
from dsh_modules.tool_result import ToolResult, is_tool_error
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.runtime_policy import RuntimePolicy


class TestAttachmentProtection(unittest.TestCase):
    """Test suite for attachment corruption detection, MIP DRM security, and routing safety."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)
        os.environ["DSH_WORKSPACE_DIR"] = str(self.work_dir)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_mip_pfile_encrypted_image_detected(self):
        """MIP/RMS encrypted .pfile disguised as .png should be cleanly detected and diagnosed."""
        pfile_path = self.work_dir / "image001.png"
        payload = (
            b".pfile\x00\x00\x00\x00\r\n"
            b"This file uses Microsoft Information Protection solutions.\n"
            b"<rdf:Description xmlns:msip=\"http://www.microsoft.com/msip/1.0/\">\n"
            b"<msip:MSIP_Label_74566a3f_Name>FCIT-INTERNAL</msip:MSIP_Label_74566a3f_Name>\n"
            b"</rdf:Description>\n"
        )
        pfile_path.write_bytes(payload)

        # 1. Test read_workspace_file
        res_read = read_workspace_file(str(pfile_path))
        self.assertIn("【文件受企业安全加密保护无法解析】", res_read)
        self.assertIn("Microsoft Information Protection", res_read)
        self.assertIn("FCIT-INTERNAL", res_read)

        # 2. Test inspect_image
        res_inspect = inspect_image(str(pfile_path))
        self.assertIn("【文件受企业安全加密保护无法解析】", res_inspect)
        self.assertIn("FCIT-INTERNAL", res_inspect)

    def test_corrupted_png_detected(self):
        """Corrupted or non-standard image bytes should be intercepted before calling vision proxy."""
        corrupt_path = self.work_dir / "broken.png"
        corrupt_path.write_bytes(b"not_a_valid_png_header_and_data_123456789")

        res = inspect_image(str(corrupt_path))
        self.assertIn("【图片文件损坏或格式无效无法解析】", res)
        self.assertIn("broken.png", res)

    def test_attachment_query_routing(self):
        """User inquiries about attachments should be reliably routed to inspect intent without web search."""
        test_queries = [
            "【当前轮次用户上传附件】: image001.png\n用户指令：附件是什么？",
            "【当前轮次用户上传附件】: doc1.docx\n用户指令：这是什么？",
            "【当前轮次用户上传附件】: image001.png\n用户指令：上传的是什么？",
            "【当前轮次用户上传附件】: contract.pdf\n用户指令：这是啥",
            "【当前轮次用户上传附件】: sheet.xlsx\n用户指令：附件是什么内容？",
        ]
        for q in test_queries:
            routing = SkillRouter.route(q, files=["image001.png"])
            self.assertTrue(
                routing.is_inspect_intent,
                f"Query '{q}' should be classified as inspect_intent"
            )
            self.assertFalse(
                routing.is_search_intent,
                f"Query '{q}' should NOT be classified as search_intent"
            )

    def test_select_active_tools_attachment_isolation(self):
        """When user queries local attachments, web_search should be stripped and file tools guaranteed."""
        prompt = "【当前轮次用户上传附件】: image001.png\n用户指令：附件是什么？"
        routing = SkillRouter.route(prompt, files=["image001.png"])

        tools = select_active_tools(
            prompt,
            routing,
            is_search_intent=False,
            has_web_search_permission=True
        )
        tool_names = {t["function"]["name"] for t in tools}

        # web_search must be excluded to prevent conversational inertia hallucination
        self.assertNotIn("web_search", tool_names)
        self.assertNotIn("fetch_page", tool_names)

        # File inspection tools must be present
        self.assertIn("read_file", tool_names)
        self.assertIn("vision_inspect", tool_names)

    def test_prompt_builder_directive_on_attachment_error(self):
        """When attachment extraction reports an error/encrypted file, prompt builder must enforce direct disclosure."""
        prompt = "【当前轮次用户上传附件】: image001.png\n用户指令：附件是什么？"
        file_ctx = (
            "[Attached File Content - image001.png]:\n"
            "【文件受企业安全加密保护无法解析】\n"
            "- 文件名: image001.png\n"
            "- 实际数据类型: 微软企业信息保护 (Microsoft Information Protection / MIP) 加密的 .pfile 容器文件\n"
        )
        user_turn = build_user_turn(
            prompt=prompt,
            session_files=["image001.png"],
            file_context=file_ctx,
            is_inspect_intent=True
        )
        self.assertIn("【附件解析异常直接如实告知硬性要求 (Attachment Diagnostic Direct Response)】", user_turn)
        self.assertIn("直接、如实向用户解释该附件的真实状态", user_turn)
        self.assertIn("严禁受多轮对话历史影响去延续与附件无关的前序历史话题", user_turn)

    def test_canonical_tool_identity_and_strict_args_guards(self):
        """Prefixed tool names must not bypass authorization guards, and non-object JSON args must be rejected."""
        self.assertEqual(normalize_tool_name("functions.create_reminders"), "create_reminders")
        self.assertEqual(normalize_tool_name("default_api:search_web"), "web_search")

        messages = []
        executed = []
        evidence = []
        # 1. Prefixed reminder tool without reminder intent must be blocked
        dispatch_tool_calls(
            structured_calls=[{
                "id": "call-1",
                "function": {"name": "functions.create_reminders", "arguments": '{"reminders":[{"title":"t"}]}'}
            }],
            round_idx=1,
            messages=messages,
            telemetry=TelemetryStats(),
            policy=RuntimePolicy(),
            executed_calls_history=[],
            outbound_files=[],
            deadline=None,
            is_guide_intent=False,
            last_user_prompt="今天天气怎么样",
            execution_evidence=evidence,
            allowed_tool_names=["create_reminders"],
            execute_fn=lambda name, args, *_, **__: (executed.append((name, args)) or "ok"),
            error_fn=is_tool_error,
            preview_fn=lambda x, **kw: str(x),
        )
        self.assertEqual(executed, [])
        self.assertIn("严禁在未获明确授权时执行副作用提醒工具", messages[-1]["content"])

        # 2. Non-object JSON argument (e.g. list) must return error without crashing
        messages.clear()
        evidence.clear()
        dispatch_tool_calls(
            structured_calls=[{
                "id": "call-2",
                "function": {"name": "read_file", "arguments": "[1, 2, 3]"}
            }],
            round_idx=1,
            messages=messages,
            telemetry=TelemetryStats(),
            policy=RuntimePolicy(),
            executed_calls_history=[],
            outbound_files=[],
            deadline=None,
            is_guide_intent=False,
            last_user_prompt="读取文件",
            execution_evidence=evidence,
            allowed_tool_names=["read_file"],
            execute_fn=lambda name, args, *_, **__: "ok",
            error_fn=is_tool_error,
            preview_fn=lambda x, **kw: str(x),
        )
        self.assertEqual(evidence[0].status, "error")
        self.assertEqual(evidence[0].error_code, "invalid_arguments")

    def test_file_send_failure_does_not_mark_is_file_sent(self):
        """Missing file error during send_file_to_user must not set is_file_sent=True."""
        messages = []
        evidence = []
        is_sent = dispatch_tool_calls(
            structured_calls=[{
                "id": "call-send",
                "function": {"name": "send_file_to_user", "arguments": '{"file_path":"/workspace/missing.pdf"}'}
            }],
            round_idx=1,
            messages=messages,
            telemetry=TelemetryStats(),
            policy=RuntimePolicy(),
            executed_calls_history=[],
            outbound_files=[],
            deadline=None,
            is_guide_intent=False,
            last_user_prompt="发送文件",
            execution_evidence=evidence,
            allowed_tool_names=["send_file_to_user"],
            execute_fn=lambda name, args, *_, **__: "发送失败：文件不存在 /workspace/missing.pdf",
            error_fn=is_tool_error,
            preview_fn=lambda x, **kw: str(x),
        )
        self.assertFalse(is_sent)
        self.assertEqual(evidence[0].status, "error")

    def test_synthesis_grounding_and_informational_downgrade_gates(self):
        """Fact synthesis must reject fabricated numbers, and informational downgrade requires structure receipt."""
        receipts = [
            ToolResult.success(
                data={
                    "facts": [
                        {"label": "总收入", "value": 100.0},
                        {"label": "净利润", "value": 20.0},
                    ]
                },
                text="2026年总收入为 100.00 元，净利润为 20.00 元。",
            )
        ]
        self.assertFalse(_is_synthesis_grounded("2026年总收入为 999999 元，净利润为 -50000 元。", receipts))
        self.assertTrue(_is_synthesis_grounded("2026年总收入为 100.00 元，净利润为 20.00 元。", receipts))

        # Informational downgrade without evidence must not accept ungrounded text
        turn = AnalysisTurn("总结服务器配置清单内容")
        tel = TelemetryStats()
        fabricated = "这份表格包含 999 台服务器，全部已经安装并验收通过，没有任何配置或采购问题。"
        accepted = turn.render([], fabricated, tel)
        self.assertNotEqual(accepted, fabricated)

    def test_valid_image_skips_preprocessing_and_mounts_multimodal(self):
        """Valid image attachments must not call the LLM during preprocessing and must mount directly as image_url."""
        import base64
        from unittest.mock import patch
        from dsh_modules.file_tools import prepare_multimodal_image_attachment
        from dsh_modules.agent_loop_helpers import _extract_last_user_prompt

        # 1x1 transparent PNG
        valid_png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        img_path = self.work_dir / "diagram.png"
        img_path.write_bytes(valid_png_bytes)

        with patch("urllib.request.urlopen", side_effect=AssertionError("LLM HTTP call must not happen during preprocessing")):
            read_res = read_workspace_file(str(img_path))
            self.assertIn("本地预检通过", read_res)
            part, diag = prepare_multimodal_image_attachment(str(img_path))
            self.assertIsNone(diag)
            self.assertIsNotNone(part)
            self.assertEqual(part["type"], "image_url")
            self.assertTrue(part["image_url"]["url"].startswith("data:image/png;base64,"))

        multimodal_messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "[User Request]:\n附件是什么东西\n\n[Session Attachments]: diagram.png"},
                    part,
                ],
            }
        ]
        self.assertEqual(_extract_last_user_prompt(multimodal_messages), "附件是什么东西")


if __name__ == "__main__":
    unittest.main()

