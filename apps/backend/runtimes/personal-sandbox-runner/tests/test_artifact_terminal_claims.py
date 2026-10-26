"""Final artifact checks cannot be skipped by an unrelated tool success or intent routing."""
import os
import io
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules import agent_loop
from dsh_modules.runtime_policy import RuntimePolicy


class TerminalArtifactClaimTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.start = time.time()

    def verify(self, text):
        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
                patch.object(agent_loop, 'KNOWLEDGE_DIR', str(self.root / 'knowledge')):
            return agent_loop.detect_missing_claimed_artifacts(
                text, is_generate_intent=True, turn_start_time=self.start, verify_claims_only=True)

    def test_exact_failed_turn_claim_is_missing(self):
        text = '已按照您的要求，基于原始数据表完成了数据清洗、分组统计，并生成了文件 **`/workspace/部门别有偿统计.xlsx`**。'
        self.assertIn('部门别有偿统计.xlsx', self.verify(text))

    def test_dependency_install_and_script_are_not_the_report(self):
        (self.root / 'generate_report.py').write_text('import pandas')
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))

    def test_stale_and_empty_files_cannot_satisfy_a_new_claim(self):
        report = self.root / 'report.xlsx'
        report.write_bytes(b'')
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))
        report.write_bytes(b'old')
        os.utime(report, (self.start - 100, self.start - 100))
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))

    def test_existing_current_file_can_be_delivered(self):
        (self.root / 'report.txt').write_text('complete')
        self.assertEqual(self.verify('已生成文件 `/workspace/report.txt`。'), [])

    def test_references_questions_and_explicit_failure_are_not_success_claims(self):
        for text in ['来源：`/workspace/source.xlsx`。', '请查看 `/workspace/example.xlsx` 是否存在。',
                     '尚未生成文件 report.xlsx。', '示例路径：`/workspace/example.xlsx`。']:
            with self.subTest(text=text):
                self.assertEqual(self.verify(text), [])

    def test_loop_rejects_claim_even_after_normal_guards_allow_completion(self):
        reply = {'content': '已生成文件 `/workspace/report.xlsx`。', 'finish_reason': 'stop'}
        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
                patch.object(agent_loop, 'KNOWLEDGE_DIR', str(self.root / 'knowledge')), \
                patch.object(agent_loop, 'call_model_proxy', return_value=reply), \
                patch.object(agent_loop, 'parse_tool_calls', return_value=[]), \
                patch.object(agent_loop, '_check_no_tool_assertion_guard', return_value=('pass', None, 1)), \
                patch.object(agent_loop, '_finalize_agent_text', return_value=(reply['content'], [])), \
                redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'user', 'content': '保存为报告的skill'}], model='test',
                policy=RuntimePolicy(), tools=[], max_rounds=1,
                is_generate_intent=False, is_inspect_intent=True, turn_start_time=self.start)
        self.assertIn('本次文件生成未完成', result.final_text)
        self.assertNotIn('已生成文件', result.final_text)
        self.assertTrue(any(d['guard'] == 'artifact_delivery' for d in result.telemetry.guard_decisions))

    def test_html_report_fallback_rejects_warning_disclaimer(self):
        from dsh_modules.html_report_fallback import materialize_requested_html
        warning_text = (
            "文件已推送，请查收。\n\n"
            "⚠️ **【指标核算未完成声明】**\n\n"
            "**无法完成计算的原因：**\n"
            "- 本次尚未完成您要求的各分组统计。\n"
            "- 本次尚未完整执行您要求的筛选、排序或结果数量限制。\n\n"
            "尚未验证的项目不会被列为完成。"
        )
        path, created = materialize_requested_html(
            prompt="按部门统计金额，生成一张html的柱状图",
            final_text=warning_text,
            workspace_dir=str(self.root)
        )
        self.assertIsNone(path)
        self.assertFalse(created)

    def test_artifact_exporter_suppresses_success_banner_on_warning(self):
        from dsh_modules.artifact_exporter import ArtifactExporter
        chart_file = self.root / "index.html"
        chart_file.write_text("<!DOCTYPE html><html><body><svg>Real Chart</svg></body></html>", encoding="utf-8")
        os.utime(chart_file, (self.start, self.start))

        warning_text = (
            "文件已推送，请查收。\n\n"
            "⚠️ **【指标核算未完成声明】**\n"
            "无法完成计算的原因：未完成分组统计。"
        )
        final_text, exported = ArtifactExporter.export_html(
            final_text=warning_text,
            is_ppt_intent=False,
            workspace_dir=str(self.root),
            turn_start_time=self.start - 5.0,
            prompt="按部门统计金额，生成一张html的柱状图"
        )
        self.assertNotIn("✨ **交互式页面已生成完毕！**", final_text)
        self.assertIn("【指标核算未完成声明】", final_text)

    def test_artifact_exporter_rejects_warning_html_file(self):
        from dsh_modules.artifact_exporter import ArtifactExporter
        warning_file = self.root / "index.html"
        warning_file.write_text("<!DOCTYPE html><html><body><h1>指标核算未完成声明</h1></body></html>", encoding="utf-8")
        os.utime(warning_file, (self.start, self.start))

        final_text, exported = ArtifactExporter.export_html(
            final_text="文件已生成",
            is_ppt_intent=False,
            workspace_dir=str(self.root),
            turn_start_time=self.start - 5.0,
            prompt="生成html报告"
        )
        self.assertEqual(exported, [])
        self.assertNotIn("✨ **交互式页面已生成完毕！**", final_text)

    def test_analysis_validation_accepts_metric_when_delivered_and_computed(self):
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.analysis_validation import validate_reply_against_contract
        contract = build_analysis_contract("按 部门别 进行金额的统计 ，生成一张html的柱状图")
        messages = [
            {"role": "user", "content": "按 部门别 进行金额的统计 ，生成一张html的柱状图"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "bash", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "c1", "name": "bash", "content": "部门金额汇总: 华东MIS 677.58544 K, 华东BAS 328.78323 K, 总额 1887.73102 K"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c2", "type": "function", "function": {"name": "send_workspace_file", "arguments": '{"file_path": "/workspace/index.html"}'}}]},
            {"role": "tool", "tool_call_id": "c2", "name": "send_workspace_file", "content": '<<<DSH_OUTBOUND_FILE:10:{"fileName": "index.html"}>>>'}
        ]
        concise_reply = "文件已推送，请查收。"
        val_res = validate_reply_against_contract(
            contract=contract,
            reply_text=concise_reply,
            round_idx=3,
            max_rounds=3,
            messages=messages
        )
        self.assertTrue(val_res.is_pass)
        self.assertIn("金额", val_res.satisfied_metrics)

    def test_send_workspace_file_blocks_warning_html(self):
        from dsh_modules.file_tools import send_workspace_file
        warn_file = self.root / "index.html"
        warn_file.write_text("<!DOCTYPE html><html><body><h3>指标核算未完成声明</h3></body></html>", encoding="utf-8")
        with patch("dsh_modules.config.WORKSPACE_DIR", str(self.root)):
            res = send_workspace_file("index.html")
            self.assertIn("发送失败", res)
            self.assertIn("声明页面", res)

    def test_referential_terms_do_not_produce_fake_sheet_missing_files(self):
        import openpyxl
        wb = openpyxl.Workbook()
        wb.create_sheet('1023')
        wb_path = self.root / '工数3Q预实管理_1023_6.xlsx'
        wb.save(wb_path)

        text = '已生成 工数3Q预实管理_1023_6.xlsx，新增工作表 1023，已将数据回填至目标工作表。'
        missing = self.verify(text)
        self.assertNotIn('新工作表_目标.xlsx', missing)
        self.assertEqual(missing, [])

    def test_chart_artifact_delivery_does_not_inject_uncompleted_indicator_disclaimer(self):
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.analysis_validation import validate_reply_against_contract
        from dsh_modules.final_answer import finalize_agent_text
        from dsh_modules.telemetry import TelemetryStats
        from dsh_modules.runtime_policy import RuntimePolicy

        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图"
        html_reply = (
            "```html\n"
            "<!DOCTYPE html>\n"
            "<html>\n"
            "<head><title>部门金额统计看板</title></head>\n"
            "<body>\n"
            "  <div class='chart-container'><canvas id='deptChart'></canvas></div>\n"
            "  <table>\n"
            "    <tr><th>部门</th><th>金额合计 (K)</th></tr>\n"
            "    <tr><td>第一事业部</td><td>3,371.39 K</td></tr>\n"
            "    <tr><td>第二事业部</td><td>1,250.00 K</td></tr>\n"
            "  </table>\n"
            "  <script>\n"
            "    const data = [{ name: '第一事业部', value: 3371.39 }, { name: '第二事业部', value: 1250.00 }];\n"
            "    new Chart(ctx, { type: 'bar', data: { labels: data.map(d => d.name), datasets: [{ label: '金额合计 (K)', data: data.map(d => d.value) }] } });\n"
            "  </script>\n"
            "</body>\n"
            "</html>\n"
            "```"
        )

        # 1. 验证分析契约校验
        contract = build_analysis_contract(prompt)
        val_res = validate_reply_against_contract(
            contract=contract,
            reply_text=html_reply,
            round_idx=1,
            max_rounds=24
        )
        self.assertTrue(val_res.is_pass, f"Contract validation failed: {val_res}")
        self.assertIn("金额", val_res.satisfied_metrics[0])

        # 2. 验证 final_text 绝不注入指标核算未完成声明
        final_text, _ = finalize_agent_text(
            reply_text=html_reply,
            messages=[{"role": "user", "content": prompt}],
            model="default",
            policy=RuntimePolicy(),
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=[],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt=prompt,
            expected_deliverables=[".html"],
            execution_evidence=[],
            turn_start_time=self.start,
            call_model=None,
            workspace_dir=str(self.root),
            max_agent_rounds=24,
            max_spreadsheet_rounds=8,
        )
        self.assertNotIn("【指标核算未完成声明】", final_text)
        self.assertNotIn("已达成指标：无", final_text)
        self.assertNotIn("未完成原因", final_text)
        self.assertIn("部门金额统计看板", final_text)


if __name__ == '__main__':
    unittest.main()
