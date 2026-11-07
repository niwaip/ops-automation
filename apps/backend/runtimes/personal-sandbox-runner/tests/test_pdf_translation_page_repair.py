"""Tests for page-aware focused repair, structured issues, and table recovery."""
import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from dsh_modules.pdf_review_contract import extract_review_issues
from dsh_modules.pdf_issue_triage import triage_review_issues
from pdf_translation.table_rebuild import rebuild_tables
from pdf_translation.node_repair import repair_nodes, load_translation_cache, save_translation_cache
from pdf_translation.page_map import normalize_fragment
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult
from dsh_modules.pdf_repair_loop import execute_pdf_repair_loop


class PdfPageRepairLogicTests(unittest.TestCase):
    def test_extract_review_issues_structured(self):
        analysis = (
            "REPAIR\n"
            "ISSUES: [{\"page\": 2, \"kind\": \"translation\", \"anchor\": \"p2_b1\", "
            "\"quote\": \"未翻译文本\", \"evidence\": \"第二页第一段依然保留英文，未做翻译。\"}]"
        )
        issues = extract_review_issues(analysis, page_number=2)
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]['kind'], 'translation')
        self.assertEqual(issues[0]['page'], 2)
        self.assertEqual(issues[0]['anchor'], 'p2_b1')

    def test_extract_review_issues_text_fallback(self):
        analysis = "REPAIR\n1. 表 1 中产品和指标列错位，严重粘连。\n2. 第二页正文数字 194 丢失。"
        issues = extract_review_issues(analysis, page_number=5)
        self.assertEqual(len(issues), 2)
        self.assertEqual(issues[0]['kind'], 'table')
        self.assertEqual(issues[1]['kind'], 'translation')

    def test_validate_confirmation_robust_parsing(self):
        from dsh_modules.pdf_review_resolution import validate_confirmation
        initial = "REPAIR\n1. 页面上半部分有上一页排版错误乱入。"
        # 实测中模型输出的各种格式均能健壮解析
        case1 = (
            "PASS, 下一行输出RESOLUTIONS:\n"
            "{\n"
            "  \"1\": {\n"
            "    \"status\": \"refuted\",\n"
            "    \"quote\": \"ws051682, wx-11, xxnuo\",\n"
            "    \"evidence\": \"该文本实际为开源贡献者列表，属于正常版权声明，并非上一页排版错误。\"\n"
            "  }\n"
            "}"
        )
        validate_confirmation(initial, case1)

        case2 = (
            "PASS\n\n```json\n"
            "{\n"
            "  \"1\": {\n"
            "    \"status\": \"refuted\",\n"
            "    \"quote\": \"ws051682\",\n"
            "    \"evidence\": \"属于正常的跨页流式段落，页面排版符合规范。\"\n"
            "  }\n"
            "}\n```"
        )
        validate_confirmation(initial, case2)

        # 缺少证据、字数不足、状态非refuted或伪装成ISSUES时依然严格拦截
        with self.assertRaises(ValueError):
            validate_confirmation(initial, "PASS")
        with self.assertRaises(ValueError):
            validate_confirmation(initial, "PASS\nRESOLUTIONS: {\"1\": {\"evidence\": \"无\"}}")
        with self.assertRaises(ValueError):
            validate_confirmation(initial, "PASS\nISSUES: [{\"quote\": \"上一页排版\", \"evidence\": \"该页面确实存在排版错误需要修复。\"}]")
        with self.assertRaises(ValueError):
            validate_confirmation(initial, "PASS\nRESOLUTIONS: {\"1\": {\"status\": \"open\", \"quote\": \"上一页排版\", \"evidence\": \"该文本实际为开源贡献者列表，属于正常版权声明。\"}}")

    def test_table_issue_ignores_cross_page_reference_remark(self):
        from dsh_modules.pdf_review_resolution import table_issue
        # 正文中提到“见表 1”且表格在下一页，不属于表格自身结构损坏
        non_table_layout = (
            'REPAIR\n'
            'ISSUES: [{"kind": "layout", "anchor": "4 评估", "quote": "见表 1。", '
            '"evidence": "左栏底部见表 1 后存在空白，而表格排在了下一页"}]'
        )
        self.assertFalse(table_issue(non_table_layout))
        # 真正的表格错列/单元格损坏依然识别为 True
        real_table_defect = (
            'REPAIR\n'
            'ISSUES: [{"kind": "table", "anchor": "表 1", "quote": "1.47", '
            '"evidence": "表 1 单元格错列，数值归属混乱"}]'
        )
        self.assertTrue(table_issue(real_table_defect))

    def test_triage_matches_ellipsis_prefixed_quotes_and_v1_page_map(self):
        ir = {
            'nodes': [
                {'id': 'p2_b7', 'page_id': 'p2', 'type': 'paragraph', 'text': 'Besides listed services, users can integrate OpenAI 3.'}
            ],
            'translations': {
                'p2_b7': '除了明确列出的服务外，用户还可以集成任何符合 OpenAI 协议 3 的新服务。'
            }
        }
        issues = [{
            'page': 2,
            'kind': 'translation',
            'anchor': '正文 2.2 灵活的翻译中间件',
            'quote': '...除了明确列出的服务外，用户还可以集成任何符合 OpenAI 协议 3 的新服务。',
            'evidence': '数字 3 与正文粘连'
        }]
        triage = triage_review_issues(issues, ir, None)
        self.assertEqual(triage['nodes_to_retranslate'], ['p2_b7'])

    def test_repair_loop_stops_on_noop_without_rerolling_vision_gate(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN', 'layout': 'balanced'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            ir = {
                'nodes': [{'id': 'p1_b1', 'page_id': 'p1', 'type': 'paragraph', 'text': 'Text'}],
                'translations': {'p1_b1': '正文'}
            }
            (folder / 'translated.ir.json').write_text(json.dumps(ir), encoding='utf-8')
            telemetry = TelemetryStats()
            # 模拟纯版面空白抱怨（无任何可重译节点或可重建表格）
            noop_issue = 'REPAIR\nISSUES: [{"page": 1, "kind": "layout", "anchor": "留白", "quote": "不存在的引用", "evidence": "页面下半部分留白较多"}]'
            failing_review = ToolResult.error('pdf_preview_failed', noop_issue, data={'kind': 'pdf_page_review', 'page': 1})
            render_mock = MagicMock()
            success, reviews, failures = execute_pdf_repair_loop(
                tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                [failing_review], None, telemetry, '/opt/dsh/skills', _render_func=render_mock
            )
            self.assertFalse(success)
            self.assertEqual(render_mock.call_count, 0)
            self.assertTrue(any(
                g['guard'] == 'pdf_repair_loop' and isinstance(g.get('reason'), dict)
                and g['reason'].get('reason') == 'no_actionable_repair_targets'
                for g in telemetry.guard_decisions
            ))

    def test_layout_rescues_body_furniture_and_merges_superscript_markers(self):
        from pdf_translation.layout_analyzer import materialize_page
        page = {
            'id': 'p1',
            'width_pt': 595.28,
            'height_pt': 841.89,
            'table_candidates': [],
            'visual_bounds': [],
            'lines': [
                {'id': 'p1_l6', 'text': '†', 'bbox': [184.4, 165.0, 188.2, 173.0], 'rotated': False},
                {'id': 'p1_l7', 'text': 'These authors contribute equally to this work.', 'bbox': [191.7, 166.4, 410.8, 178.4], 'rotated': False},
                {'id': 'p1_l86', 'text': 'Technically, we design the architecture for pre-', 'bbox': [317.1, 709.8, 526.2, 721.0], 'rotated': False},
                {'id': 'p1_l94', 'text': 'detailed in following subsections.', 'bbox': [306.1, 764.3, 452.5, 775.2], 'rotated': False},
                {'id': 'p1_l93', 'text': '1See https://www.unesco.org/en/open-science', 'bbox': [83.5, 764.3, 273.1, 774.8], 'rotated': False},
            ]
        }
        data = {
            'columns': 2,
            'blocks': [
                {'type': 'paragraph', 'column': 0, 'line_ids': ['p1_l7'], 'bbox': [191.7, 166.4, 410.8, 178.4]},
                {'type': 'heading', 'column': 1, 'line_ids': ['p1_l6'], 'bbox': [184.4, 165.0, 188.2, 173.0]},
                {'type': 'furniture', 'column': 2, 'line_ids': ['p1_l86', 'p1_l94'], 'bbox': [306.1, 709.8, 526.2, 775.2]},
                {'type': 'furniture', 'column': 1, 'line_ids': ['p1_l93'], 'bbox': [83.5, 764.3, 273.1, 774.8]},
            ]
        }
        nodes = materialize_page(data, page)
        # 1. '†' 被合并进 p1_l7，不再生成独立的 heading 节点
        self.assertFalse(any(n['type'] == 'heading' and n['text'] == '†' for n in nodes))
        self.assertTrue(any(n['text'].startswith('† These authors') for n in nodes))
        # 2. 正文底部段落 p1_l86+p1_l94 从 furniture 恢复为 paragraph，绝不丢弃
        body_node = next(n for n in nodes if 'Technically' in n['text'])
        self.assertEqual(body_node['type'], 'paragraph')
        # 3. 底部脚注链接 p1_l93 从 furniture 恢复为 footnote
        fn_node = next(n for n in nodes if 'unesco.org' in n['text'])
        self.assertEqual(fn_node['type'], 'footnote')

    def test_triage_review_issues_mapping(self):
        ir = {
            'nodes': [
                {'id': 'p1_b1', 'page_id': 'p1', 'type': 'title', 'text': 'Title Text'},
                {'id': 'p1_b2', 'page_id': 'p1', 'type': 'paragraph', 'text': 'Introduction'},
                {'id': 'p2_t1', 'page_id': 'p2', 'type': 'table', 'native_table_id': '2_t1', 'cells': []}
            ],
            'translations': {'p1_b1': '标题文本', 'p1_b2': '引言正文'}
        }
        page_map = {
            'pages': [
                {'page': 1, 'sha256': 'hash1', 'nodes': ['p1_b1', 'p1_b2'], 'tables': []},
                {'page': 2, 'sha256': 'hash2', 'nodes': ['p2_t1'], 'tables': ['2_t1']}
            ]
        }
        issues = [
            {'page': 1, 'kind': 'translation', 'anchor': 'p1_b2', 'quote': '引言', 'evidence': '引言翻译不完整'},
            {'page': 2, 'kind': 'table', 'anchor': '表1', 'quote': '', 'evidence': '表格列错位'}
        ]
        triage = triage_review_issues(issues, ir, page_map)
        self.assertFalse(triage['unrecoverable'])
        self.assertIn('p1_b2', triage['nodes_to_retranslate'])
        self.assertIn('2_t1', triage['tables_to_rebuild'])

    def test_triage_unrecoverable_aborts(self):
        issues = [{'page': 1, 'kind': 'unrecoverable', 'anchor': '', 'quote': '', 'evidence': '源文件为模糊扫描件，无法识别'}]
        triage = triage_review_issues(issues, {})
        self.assertTrue(triage['unrecoverable'])
        self.assertIn('扫描件', triage['unrecoverable_reason'])

    def test_table_rebuild_restores_native_cells(self):
        native_table = {
            'id': '5_t1',
            'bbox': [10, 20, 300, 400],
            'column_edges': [10, 100, 200, 300],
            'row_count': 2,
            'line_ids': ['l1', 'l2'],
            'cells': [
                {'row': 0, 'col': 0, 'rowspan': 1, 'colspan': 1, 'header': True, 'line_ids': ['l1']},
                {'row': 0, 'col': 1, 'rowspan': 1, 'colspan': 1, 'header': True, 'line_ids': []},
                {'row': 1, 'col': 0, 'rowspan': 1, 'colspan': 1, 'header': False, 'line_ids': ['l2']},
                {'row': 1, 'col': 1, 'rowspan': 1, 'colspan': 1, 'header': False, 'line_ids': []}
            ]
        }
        page = {
            'id': 'p5',
            'native_tables': [native_table],
            'lines': [
                {'id': 'l1', 'text': 'Header1', 'bbox': [15, 25, 80, 35]},
                {'id': 'l2', 'text': 'Data1', 'bbox': [15, 45, 80, 55]}
            ]
        }
        broken_table_node = {
            'id': 'p5_b1',
            'page_id': 'p5',
            'type': 'table',
            'native_table_id': '5_t1',
            'cells': [{'row': 0, 'col': 0, 'rowspan': 1, 'colspan': 1, 'header': True, 'line_ids': ['l1', 'l2']}]
        }
        ir = {'pages': [page], 'nodes': [broken_table_node]}
        rebuilt = rebuild_tables(ir, ['5_t1'])
        rebuilt_node = rebuilt['nodes'][0]
        self.assertEqual(len(rebuilt_node['cells']), 4)
        self.assertEqual(rebuilt_node['cells'][0]['text'], 'Header1')
        self.assertEqual(rebuilt_node['cells'][2]['text'], 'Data1')

    def test_node_repair_uses_cache_and_only_translates_target(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            save_translation_cache(folder, {'p1_b1': '已缓存标题'})
            ir = {
                'nodes': [
                    {'id': 'p1_b1', 'type': 'title', 'text': 'Original Title'},
                    {'id': 'p1_b2', 'type': 'paragraph', 'text': 'Original Text 123'}
                ],
                'translations': {'p1_b1': '已缓存标题'}
            }
            gateway = MagicMock()
            gateway.translate.return_value = {'p1_b2': '翻译正文 123'}
            repaired = repair_nodes(ir, ['p1_b2'], gateway, folder, None, lang='zh-CN')
            self.assertEqual(repaired['translations']['p1_b1'], '已缓存标题')
            self.assertEqual(repaired['translations']['p1_b2'], '翻译正文 123')
            self.assertEqual(gateway.translate.call_count, 1)
            # 再次调用且无未翻译节点，不调用 gateway
            gateway.reset_mock()
            repair_nodes(repaired, [], gateway, folder, None, lang='zh-CN')
            self.assertEqual(gateway.translate.call_count, 0)

    def test_repair_loop_unrecoverable_stops_without_retry(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            (folder / 'translated.ir.json').write_text(json.dumps({'nodes': [], 'translations': {}}), encoding='utf-8')

            telemetry = TelemetryStats()
            failing_review = ToolResult.error('pdf_preview_failed', '扫描件无法识别',
                                              data={'kind': 'pdf_page_review', 'page': 1})
            success, reviews, failures = execute_pdf_repair_loop(
                tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                [failing_review], None, telemetry, '/opt/dsh/skills'
            )
            self.assertFalse(success)
            self.assertIn('扫描件', failures[0])
            self.assertTrue(any(g['guard'] == 'pdf_repair_loop' and g['action'] == 'terminate'
                                for g in telemetry.guard_decisions))

    def test_repair_loop_non_convergent_stops(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN', 'layout': 'balanced'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            ir = {
                'nodes': [{'id': 'p1_b1', 'page_id': 'p1', 'type': 'paragraph', 'text': 'Bad text'}],
                'translations': {'p1_b1': 'Bad text'}
            }
            (folder / 'translated.ir.json').write_text(json.dumps(ir), encoding='utf-8')
            (folder / 'page-map.json').write_text(json.dumps({
                'pages': [{'page': 1, 'sha256': 'h1', 'nodes': ['p1_b1'], 'tables': []}]
            }), encoding='utf-8')

            telemetry = TelemetryStats()
            # 模拟连续两轮相同节点的翻译错误
            issue_json = 'REPAIR\nISSUES: [{"page": 1, "kind": "translation", "anchor": "p1_b1", "quote": "Bad", "evidence": "错译"}]'
            failing_review = ToolResult.error('pdf_preview_failed', issue_json, data={'kind': 'pdf_page_review', 'page': 1})

            def do_mock_render(ir, ver_dir, layout):
                p = folder / 'cand.pdf'
                p.write_bytes(b'dummy-pdf')
                return p, {'page_count': 1}

            with patch('pdf_translation.model_gateway.ModelGateway.translate', return_value={'p1_b1': '仍然存在语义偏差的译文'}), \
                 patch('dsh_modules.pdf_external_delivery._stage_and_check', return_value=({'page_count': 1, 'file_path': str(folder / 'out.pdf')}, folder / 'staged.pdf')), \
                 patch('dsh_modules.pdf_preview_tool.inspect_pdf_page', return_value=SimpleNamespace(tool_result=failing_review)):
                success, reviews, failures = execute_pdf_repair_loop(
                    tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                    [failing_review], None, telemetry, '/opt/dsh/skills', _render_func=do_mock_render
                )
                self.assertFalse(success)
                self.assertTrue(any('未收敛' in f for f in failures))

    def test_repair_loop_success_with_page_reuse(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN', 'layout': 'balanced'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            ir = {
                'nodes': [
                    {'id': 'p1_b1', 'page_id': 'p1', 'type': 'paragraph', 'text': 'Good Page 1'},
                    {'id': 'p2_b1', 'page_id': 'p2', 'type': 'paragraph', 'text': 'Bad Page 2'}
                ],
                'translations': {'p1_b1': '合格的第一页', 'p2_b1': '待修复第二页'}
            }
            (folder / 'translated.ir.json').write_text(json.dumps(ir), encoding='utf-8')
            (folder / 'page-map.json').write_text(json.dumps({
                'pages': [
                    {'page': 1, 'sha256': 'h1_stable', 'nodes': ['p1_b1'], 'tables': []},
                    {'page': 2, 'sha256': 'h2_old', 'nodes': ['p2_b1'], 'tables': []}
                ]
            }), encoding='utf-8')

            telemetry = TelemetryStats()
            review_p1 = ToolResult.success(data={'kind': 'pdf_page_review', 'page': 1}, text='PASS')
            setattr(review_p1, 'page', 1)

            issue_json = 'REPAIR\nISSUES: [{"page": 2, "kind": "translation", "anchor": "第二页正文", "quote": "待修复", "evidence": "第二页有漏译"}]'
            review_p2_fail = ToolResult.error('pdf_preview_failed', issue_json, data={'kind': 'pdf_page_review', 'page': 2})
            setattr(review_p2_fail, 'page', 2)

            def do_mock_render(ir, ver_dir, layout):
                ver_dir.mkdir(parents=True, exist_ok=True)
                p = folder / 'cand.pdf'
                p.write_bytes(b'dummy-pdf-v2')
                # 写入新的 page-map: 第1页hash不变，第2页hash更新
                (ver_dir / 'page-map.json').write_text(json.dumps({
                    'pages': [
                        {'page': 1, 'sha256': 'h1_stable', 'nodes': ['p1_b1'], 'tables': []},
                        {'page': 2, 'sha256': 'h2_new', 'nodes': ['p2_b1'], 'tables': []}
                    ]
                }), encoding='utf-8')
                return p, {'page_count': 2}

            review_p2_pass = ToolResult.success(data={'kind': 'pdf_page_review', 'page': 2}, text='PASS\n全部正常')
            setattr(review_p2_pass, 'page', 2)

            with patch('pdf_translation.model_gateway.ModelGateway.translate', return_value={'p2_b1': '已修复第二页'}) as mock_translate, \
                 patch('dsh_modules.pdf_external_delivery._stage_and_check', return_value=({'page_count': 2, 'file_path': str(folder / 'out.pdf')}, folder / 'staged.pdf')), \
                 patch('dsh_modules.pdf_preview_tool.inspect_pdf_page', return_value=SimpleNamespace(tool_result=review_p2_pass)) as mock_inspect:
                success, reviews, failures = execute_pdf_repair_loop(
                    tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                    [review_p1, review_p2_fail], None, telemetry, '/opt/dsh/skills', _render_func=do_mock_render
                )
                self.assertTrue(success)
                self.assertEqual(len(failures), 0)
                repair_prompt = mock_translate.call_args.args[0]
                self.assertIn('Fix these errors:', repair_prompt)
                self.assertIn('第二页有漏译', repair_prompt)
                # 验证第 1 页被复用，inspect_pdf_page 仅针对第 2 页调用了 1 次！
                self.assertEqual(mock_inspect.call_count, 1)
                self.assertTrue(any(g['guard'] == 'pdf_review_reused' and g['action'] == 'reuse'
                                    for g in telemetry.guard_decisions))

    def test_topological_band_sorting_preserves_reading_order(self):
        from pdf_translation.paragraph_candidates import compute_page_bands, band_index, expand_candidates
        page = {
            'id': 'p5',
            'width_pt': 600.0,
            'height_pt': 800.0,
            'table_candidates': [],
            'visual_bounds': [[93.5, 362.0, 501.7, 738.0]], # spanning figure
            'native_tables': [{'id': '5_t1', 'bbox': [92.5, 83.5, 505.5, 232.7], 'line_ids': ['l_tbl1', 'l_tbl2']}],
            'lines': [
                {'id': 'l_tbl1', 'text': 'Table Cell 1', 'bbox': [100, 90, 200, 110], 'rotated': False},
                {'id': 'l_tbl2', 'text': 'Table Cell 2', 'bbox': [350, 90, 450, 110], 'rotated': False},
                {'id': 'l_fn1', 'text': '5 IMT: Immersive Translate', 'bbox': [95.0, 276.0, 232.0, 286.0], 'rotated': False},
                {'id': 'l_fn2', 'text': '6 The original LaTeX file is required', 'bbox': [95.0, 286.0, 282.0, 296.0], 'rotated': False},
                {'id': 'l_cap1', 'text': 'Table 1: Comparison with other projects', 'bbox': [180.0, 317.0, 410.0, 327.0], 'rotated': False},
                {'id': 'l_cap2', 'text': 'Figure 4: Use cases.', 'bbox': [250.0, 748.0, 340.0, 758.0], 'rotated': False},
            ]
        }
        cuts = compute_page_bands(page)
        # Bbox of footnote 5 (under Table 1) must be in an earlier band than Figure 4
        fn_band = band_index(cuts, [95.0, 276.0, 232.0, 286.0])
        fig_band = band_index(cuts, [93.5, 362.0, 501.7, 738.0])
        self.assertLess(fn_band, fig_band)

    def test_repair_loop_executes_layout_repair_for_structural_defect(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN', 'layout': 'balanced'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            ir = {
                'schema_version': 'pdf-document-ir/1',
                'pages': [{'id': 'p1', 'number': 1, 'width_pt': 600, 'height_pt': 800, 'lines': [{'id': 'l1', 'text': '排版段落', 'bbox': [10, 10, 50, 20]}], 'table_candidates': []}],
                'nodes': [{'id': 'p1_b1', 'page_id': 'p1', 'type': 'paragraph', 'text': '排版段落', 'line_ids': ['l1']}],
                'translations': {'p1_b1': '排版段落译文'},
                'reading_order': ['p1_b1']
            }
            (folder / 'translated.ir.json').write_text(json.dumps(ir), encoding='utf-8')
            (folder / 'page-map.json').write_text(json.dumps({
                'pages': [{'page': 1, 'sha256': 'h1_old', 'nodes': ['p1_b1'], 'tables': []}]
            }), encoding='utf-8')

            telemetry = TelemetryStats()
            layout_issue = 'REPAIR\nISSUES: [{"page": 1, "kind": "layout", "anchor": "页面下半部分", "quote": "排版段落", "evidence": "严重排版错乱：双栏混排顺序混乱，左右栏重叠"}]'
            failing_review = ToolResult.error('pdf_preview_failed', layout_issue, data={'kind': 'pdf_page_review', 'page': 1})
            setattr(failing_review, 'page', 1)

            rebuilt_nodes = [{'id': 'p1_b1_fixed', 'page_id': 'p1', 'type': 'paragraph', 'text': '排版段落', 'line_ids': ['l1']}]
            render_called = []
            def do_mock_render(ir_obj, ver_dir, layout):
                render_called.append(True)
                ver_dir.mkdir(parents=True, exist_ok=True)
                p = folder / 'cand.pdf'
                p.write_bytes(b'dummy-pdf-v2')
                (ver_dir / 'page-map.json').write_text(json.dumps({
                    'pages': [{'page': 1, 'sha256': 'h1_new', 'nodes': ['p1_b1_fixed'], 'tables': []}]
                }), encoding='utf-8')
                return p, {'page_count': 1}

            pass_review = ToolResult.success(data={'kind': 'pdf_page_review', 'page': 1}, text='PASS\n版面已恢复正常')
            setattr(pass_review, 'page', 1)

            with patch('pdf_translation.layout_analyzer._analyze_page_worker', return_value=(1, rebuilt_nodes)), \
                 patch('dsh_modules.pdf_external_delivery._stage_and_check', return_value=({'page_count': 1, 'file_path': str(folder / 'out.pdf')}, folder / 'staged.pdf')), \
                 patch('dsh_modules.pdf_preview_tool.inspect_pdf_page', return_value=SimpleNamespace(tool_result=pass_review)):
                success, reviews, failures = execute_pdf_repair_loop(
                    tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                    [failing_review], None, telemetry, '/opt/dsh/skills', _render_func=do_mock_render
                )
                self.assertTrue(success)
                self.assertEqual(len(render_called), 1)
                self.assertTrue(any(g['guard'] == 'pdf_repair_round' and 'p1' in g.get('reason', {}).get('pages', [])
                                    for g in telemetry.guard_decisions))

    def test_join_lines_recovers_dehyphenated_word_with_stray_footnote(self):
        from pdf_translation.source_text import join_lines
        lines = {
            'l1': {'text': 'attempts from academia in improv-'},
            'l2': {'text': '1'},  # superscript footnote mark misplaced between word break
            'l3': {'text': 'ing Machine Translation (MT)'}
        }
        joined = join_lines(['l1', 'l2', 'l3'], lines)
        self.assertEqual(joined, 'attempts from academia in improving 1 Machine Translation (MT)')

    def test_sanitize_delivery_reason_removes_internal_tokens_and_instructions(self):
        from dsh_modules.pdf_translation_delivery import _sanitize_delivery_reason
        raw_reason = ('translation_incomplete: 补译后仍未通过：p1_b9: protected numeric tokens invalid: '
                      '{"missing": ["__PDF_NUM_aa07881843f7_10__"], "duplicated": [], "unknown": [], "malformed": false}。'
                      '已保留布局和通过块；使用auto --resume恢复，不要重新unpack或跳过翻译执行pack。')
        sanitized = _sanitize_delivery_reason(raw_reason)
        self.assertNotIn('auto --resume', sanitized)
        self.assertNotIn('unpack', sanitized)
        self.assertNotIn('pack', sanitized)
        self.assertNotIn('__PDF_NUM_', sanitized)
        self.assertNotIn('p1_b9', sanitized)
        self.assertIn('第1页段落', sanitized)

    def test_repair_loop_layout_repair_with_figure_extracts_assets_and_renders(self):
        from types import SimpleNamespace
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            preview_img = folder / 'source-1.png'
            Image.new('RGB', (200, 200), color='white').save(preview_img)
            manifest = {'schema_version': 1, 'job_id': 'job1', 'parent_run_id': 'run1', 'lang': 'zh-CN', 'layout': 'balanced'}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            ir = {
                'schema_version': 'pdf-document-ir/1',
                'pages': [{'id': 'p1', 'number': 1, 'width_pt': 600, 'height_pt': 800,
                           'preview': str(preview_img), 'lines': [{'id': 'l1', 'text': '图 1', 'bbox': [10, 10, 50, 20]}],
                           'table_candidates': []}],
                'nodes': [{'id': 'p1_b1', 'page_id': 'p1', 'type': 'figure', 'bbox': [10, 10, 50, 50], 'text': '', 'line_ids': ['l1']}],
                'translations': {},
                'reading_order': ['p1_b1']
            }
            (folder / 'translated.ir.json').write_text(json.dumps(ir), encoding='utf-8')
            (folder / 'page-map.json').write_text(json.dumps({
                'pages': [{'page': 1, 'sha256': 'h1_old', 'nodes': ['p1_b1'], 'tables': []}]
            }), encoding='utf-8')

            telemetry = TelemetryStats()
            layout_issue = 'REPAIR\nISSUES: [{"page": 1, "kind": "layout", "anchor": "图 1", "quote": "图 1", "evidence": "严重排版错乱"}]'
            failing_review = ToolResult.error('pdf_preview_failed', layout_issue, data={'kind': 'pdf_page_review', 'page': 1})
            setattr(failing_review, 'page', 1)

            rebuilt_nodes = [{'id': 'p1_b1_new', 'page_id': 'p1', 'type': 'figure', 'bbox': [10, 10, 100, 100], 'text': '', 'line_ids': ['l1']}]
            pass_review = ToolResult.success(data={'kind': 'pdf_page_review', 'page': 1}, text='PASS\n版面已恢复正常')
            setattr(pass_review, 'page', 1)

            with patch('pdf_translation.layout_analyzer._analyze_page_worker', return_value=(1, rebuilt_nodes)), \
                 patch('dsh_modules.pdf_external_delivery._stage_and_check', return_value=({'page_count': 1, 'file_path': str(folder / 'out.pdf')}, folder / 'staged.pdf')), \
                 patch('dsh_modules.pdf_preview_tool.inspect_pdf_page', return_value=SimpleNamespace(tool_result=pass_review)):
                success, reviews, failures = execute_pdf_repair_loop(
                    tmpdir, folder / 'out.pdf', folder / 'staged.pdf', str(folder / 'manifest.json'),
                    [failing_review], None, telemetry, '/opt/dsh/skills'
                )
                self.assertTrue(success, f"Repair loop failed with failures: {failures}")
                saved_ir = json.loads((folder / 'translated.ir.json').read_text(encoding='utf-8'))
                rebuilt = next(n for n in saved_ir['nodes'] if n['id'] == 'p1_b1_new')
                self.assertIn('asset', rebuilt)
                self.assertTrue(Path(rebuilt['asset']).is_file())


if __name__ == '__main__':
    unittest.main()
