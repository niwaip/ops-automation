"""User metric selection must not inherit metric names from attachment metadata."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from dsh_modules.spreadsheet_chart_delivery import SpreadsheetChartDelivery, chart_dataset
from dsh_modules.telemetry import TelemetryStats


def receipt(source):
    return SimpleNamespace(data={
        'evidence_id': 'verified',
        'plan': {'group_by': ['部门名称'], 'metrics': [
            {'id': 'amount', 'op': 'sum', 'field': '金额(K)'},
            {'id': 'hours', 'op': 'sum', 'field': '工数(小时)'}],
            'source': {'sheet': '明细', 'data_range': 'A2:C4'},
            'where': {'field': '有偿无偿', 'op': 'eq', 'value': '有偿'}},
        'facts': [{'id': 'amount__a', 'field': '金额(K)', 'unit': 'K'},
                  {'id': 'hours__a', 'field': '工数(小时)', 'unit': '小时'}],
        'rows': [{'部门名称': '甲', 'amount': '15', 'hours': '60'},
                 {'部门名称': '乙', 'amount': '-3', 'hours': '20'},
                 {'部门名称': '丙', 'amount': '0', 'hours': '10'}],
    }, provenance={'file_path': str(source),
                   'workbook_id': hashlib.sha256(source.read_bytes()).hexdigest()})


class ChartMetricSelectionTests(unittest.TestCase):
    def test_attachment_metadata_and_explicit_source_name_do_not_select_hours(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / '工数实绩明细_20261020134124.xlsx'
            source.write_bytes(b'unchanged source')
            evidence = receipt(source)
            command = '统计各个部门的 有偿 金额的合计，生成一页的柱状图的html'
            prompts = [
                f'【当前会话有效附件清单】: {source.name}\n用户指令：{command}',
                f'【当前轮次用户上传附件】: {source.name}\n用户指令：{command}',
                f'【当前上下文聚焦文档】: {source.name}\n用户指令：{command}',
                f'根据 {source.name}，{command}',
                f'根据 {source}，{command}',
            ]
            for prompt in prompts:
                with self.subTest(prompt=prompt):
                    delivery = SpreadsheetChartDelivery(folder, 'selection')
                    self.assertTrue(delivery.publish(evidence, prompt, TelemetryStats()), delivery.error)
                    self.assertEqual(delivery.dataset['value_field'], 'amount')
                    self.assertEqual([p['value'] for p in delivery.dataset['points']], ['15', '-3', '0'])
                    self.assertEqual(delivery.dataset['where'], evidence.data['plan']['where'])
                    self.assertEqual(json.loads((delivery.run_dir/'manifest.json').read_text())['status'], 'published')

    def test_explicit_hours_and_real_ambiguity_still_respect_user_choice(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / '金额明细.xlsx'
            source.write_bytes(b'source')
            evidence = receipt(source)
            dataset = chart_dataset(evidence, f'【当前会话有效附件清单】: {source.name}\n用户指令：按部门统计工数合计并生成柱状图')
            self.assertEqual(dataset['value_field'], 'hours')
            for command in ['按部门统计金额和工数合计并生成柱状图', '按部门统计合计并生成柱状图']:
                with self.subTest(command=command), self.assertRaisesRegex(ValueError, 'chart_metric_ambiguous'):
                    chart_dataset(evidence, f'【当前会话有效附件清单】: {source.name}\n用户指令：{command}')
