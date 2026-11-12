"""Reject the actual wrong-cell outputs and preserve native table relationships."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from pdf_translation.contracts import validate_ir, IR_SCHEMA, TranslationError
from pdf_translation.table_geometry import discover_tables, layout_candidates, validate_table
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.layout_analyzer import materialize_page
from dsh_modules.pdf_review_resolution import validate_confirmation, table_issue
from dsh_modules.pdf_translation_workflow import fixed_translation
import test_pdf_translation_delivery as fixture
from unittest.mock import patch
from dsh_modules.telemetry import TelemetryStats

FIXTURES = Path(__file__).parent / 'fixtures/pdf_translation_0956'


def pages_with_native_tables():
    pages = json.loads((FIXTURES / 'source-pages.json').read_text())
    rules = {5: [83.994, 97.943, 152.539, 207.134, 234.629],
             7: [385.191, 399.14, 453.735, 711.567]}
    for page in pages:
        box = page['table_candidates'][0]
        pdf_page = SimpleNamespace(page_number=page['number'], lines=[dict(
            x0=box[0], x1=box[2], top=y, bottom=y) for y in rules[page['number']]])
        page['native_tables'] = discover_tables(pdf_page, page['lines'], page['table_candidates'])
    return pages


class TableRegressionTests(unittest.TestCase):
    def test_native_grid_retains_product_metrics_and_totals(self):
        pages = pages_with_native_tables()
        table1, table2 = [page['native_tables'][0] for page in pages]
        self.assertEqual((len(table1['column_edges']) - 1, table1['row_count']), (8, 11))
        self.assertEqual((len(table2['column_edges']) - 1, table2['row_count']), (3, 3))
        native = {line['id']: line['text'] for page in pages for line in page['lines']}
        values = {(cell['row'], cell['col']): ' '.join(native[lid] for lid in cell['line_ids'])
                  for cell in table1['cells']}
        self.assertEqual([values[0, col] for col in range(2, 8)],
                         ['OURS', 'IMT5', 'Doc2X', 'TeX based6', 'Google', 'DeepL'])
        self.assertEqual([values[10, col] for col in range(2, 8)],
                         ['1.47', '1.50', '1.86', '1.67', '0.38', '1.88'])
        values = {(cell['row'], cell['col']): ' '.join(native[lid] for lid in cell['line_ids'])
                  for cell in table2['cells']}
        self.assertEqual(values[1, 2], '23')
        self.assertEqual(values[2, 2], '194')
        self.assertNotIn('p7_l55', table2['line_ids'])  # footnote 1 is outside the grid

    def test_saved_broken_cells_fail_even_without_native_metadata(self):
        tables = json.loads((FIXTURES / 'broken-tables.json').read_text())
        pages = json.loads((FIXTURES / 'source-pages.json').read_text())
        for table, page in zip(tables, pages):
            with self.subTest(table=table['id']), self.assertRaises(ValueError):
                validate_table(table, page)

    def test_wrong_model_cells_cannot_override_native_anchor(self):
        for page in pages_with_native_tables():
            page['lines'] = [line for line in page['lines'] if line['id'] in page['native_tables'][0]['line_ids']]
            page['visual_bounds'] = []
            candidates = layout_candidates(page, candidate_lines(page))
            table = page['native_tables'][0]
            self.assertEqual(sum(c['type_hint'] == 'table' for c in candidates), 1)
            raw = {'columns': 1, 'blocks': [dict(type='paragraph', column=0,
                line_ids=[c['id']], bbox=c['bbox']) for c in candidates]}
            nodes = materialize_page(expand_candidates(raw, candidates, page), page)
            ir = dict(schema_version=IR_SCHEMA, pages=[page], nodes=nodes,
                      reading_order=[node['id'] for node in nodes])
            validate_ir(ir)
            output = next(node for node in nodes if node['type'] == 'table')
            self.assertEqual(len(output['cells']), len(table['cells']))
            broken = copy.deepcopy(ir)
            target = next(node for node in broken['nodes'] if node['type'] == 'table')
            target['cells'][0]['col'] = 25
            with self.assertRaises(TranslationError):
                validate_ir(broken)

    def test_independent_pass_cannot_erase_repair_without_evidence(self):
        with self.assertRaises(ValueError):
            validate_confirmation('REPAIR\n1. 左栏与右栏文字重叠。', 'PASS')
        self.assertTrue(table_issue('REPAIR: 表 1 的产品和速度列错配'))
        confirmation = 'PASS\nRESOLUTIONS: ' + json.dumps({'1': dict(status='refuted',
            quote='左右栏重叠', evidence='原页两栏横坐标区间彼此分离，字符框没有相交，初审将相同纵坐标误作重叠。')}, ensure_ascii=False)
        validate_confirmation('FAIL\n1. 左右栏重叠。', confirmation)
        abbreviated = 'PASS\nRESOLUTIONS: ' + json.dumps({'1': dict(status='refuted',
            quote='左右栏文字重叠...', evidence='图片中左右两栏横坐标区间彼此分离，两个栏位之间存在清晰留白，没有文字框交叉。')}, ensure_ascii=False)
        validate_confirmation('FAIL\n1. 左右栏文字重叠，影响阅读。', abbreviated)
        with self.assertRaises(ValueError):
            validate_confirmation('FAIL\n1. 左右栏重叠。\n2. 缺少脚注。', confirmation)

    def test_fixed_path_is_scoped_to_single_pdf_conversion(self):
        self.assertTrue(fixed_translation('翻译文档，保持格式，生成中文版pdf', ['paper.pdf'], ['.pdf']))
        self.assertFalse(fixed_translation('翻译并总结为中文版pdf', ['paper.pdf'], ['.pdf']))
        self.assertFalse(fixed_translation('生成中文版pdf', ['a.pdf', 'b.pdf'], ['.pdf']))
        self.assertTrue(fixed_translation('翻译为英文pdf', ['paper.pdf'], ['.pdf']))
        self.assertTrue(fixed_translation('翻译为日文pdf', ['paper.pdf'], ['.pdf']))


class WorkflowRegressionTests(unittest.TestCase):
    setUp = fixture.TranslationDeliveryTests.setUp
    tearDown = fixture.TranslationDeliveryTests.tearDown
    execute = fixture.TranslationDeliveryTests.execute

    def test_repeat_auto_reuses_candidate_without_proxy_calls(self):
        first = self.execute().tool_result
        self.assertTrue(first.is_success, first.render_text())
        calls = len(self.telemetry.calls_ledger)
        second = self.execute().tool_result
        self.assertTrue(second.is_success, second.render_text())
        self.assertTrue(second.data['reused'])
        self.assertEqual(first.data['job_id'], second.data['job_id'])
        self.assertEqual(len(self.telemetry.calls_ledger), calls)
        self.assertEqual(len(list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json'))), 1)

    def test_fixed_workflow_uses_no_planner_or_main_model(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.planning_phase import should_run_planning_phase
        from types import SimpleNamespace
        skill = SimpleNamespace(deliverables=['.pdf'], requires_execution=True)
        policy = RuntimePolicy(thinking=True)
        prompt = '翻译这个文档，保持格式，生成中文版PDF'
        self.assertEqual(should_run_planning_phase(prompt, skill, policy,
            session_files=['original.pdf']), (False, True))
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(self.root)), \
                patch.dict('os.environ', {'DSH_SESSION_ATTACHMENTS': 'original.pdf'}), \
                patch('dsh_modules.agent_loop.call_model_proxy', side_effect=AssertionError('main model called')), \
                patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】:\nPASS'):
            result = run_agent_loop([{'role': 'user', 'content': prompt}], 'fixture-text', policy, 5,
                tools=[{'type': 'function', 'function': {'name': 'bash'}}],
                expected_deliverables=['.pdf'], user_prompt=prompt, telemetry=self.telemetry,
                is_generate_intent=True, deadline=__import__('time').monotonic() + 100)
        self.assertTrue(result.outbound_files)
        self.assertTrue(any(g['guard'] == 'pdf_translation_workflow' for g in self.telemetry.guard_decisions))
        from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', side_effect=AssertionError('review repeated')):
            owned = enforce_external_pdf_delivery(result, str(self.root), '/opt/dsh/skills', self.start,
                prompt, __import__('time').monotonic() + 60, ['original.pdf'])
        self.assertFalse(owned)
        self.assertEqual(sum(g['guard'] == 'pdf_delivery' for g in self.telemetry.guard_decisions), 1)

    def test_general_agent_hands_ready_candidate_to_runtime_without_another_turn(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        def dispatch(**kwargs):
            receipt = self.execute().tool_result
            self.assertTrue(receipt.is_success, receipt.render_text())
            kwargs['execution_evidence'].append(receipt)
            return False
        response = dict(content='', finish_reason='tool_calls', received_done=True, tool_calls=[dict(
            id='candidate', type='function', function=dict(name='bash', arguments='{"cmd":"translate"}'))])
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(self.root)), \
                patch('dsh_modules.agent_loop.call_model_proxy', return_value=response) as model, \
                patch('dsh_modules.agent_loop._dispatch_tool_calls', side_effect=dispatch):
            result = run_agent_loop([{'role': 'user', 'content': '翻译为英文PDF'}], 'fixture',
                RuntimePolicy(), 5, tools=[{'type': 'function', 'function': {'name': 'bash'}}],
                expected_deliverables=['.pdf'], telemetry=self.telemetry, user_prompt='翻译为英文PDF')
        self.assertEqual(model.call_count, 1)
        self.assertTrue(any(item.data.get('state') == 'candidate_ready' for item in result.execution_evidence))
        self.assertFalse(result.outbound_files)  # publication still belongs to the final runtime gate

    def test_table_rejection_cannot_be_overridden_by_another_vote(self):
        from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery
        result = self.execute().tool_result
        loop = SimpleNamespace(telemetry=self.telemetry, execution_evidence=[result],
                               final_text='', outbound_files=[])
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image',
                   return_value='【文档/图片】:\nREPAIR\n表1产品与速度列错配。') as review:
            enforce_external_pdf_delivery(loop, str(self.root), '/opt/dsh/skills',
                self.start, '翻译并生成中文版PDF', __import__('time').monotonic() + 60, ['original.pdf'])
        self.assertEqual(review.call_count, 1)
        self.assertFalse(loop.outbound_files)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')
