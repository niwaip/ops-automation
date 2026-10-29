"""Regression coverage for tofu glyphs and shell-generated PDF acceptance."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery
from dsh_modules.pdf_preview_tool import reset_pdf_renders
from dsh_modules.telemetry import TelemetryStats


class ExternalPDFAcceptanceTests(unittest.TestCase):
    def test_live_retrieval_keeps_owned_renderer_without_shell_typesetting(self):
        from dsh_modules.runner import select_active_tools
        skill = SimpleNamespace(skill_id='pdf', is_generate_intent=True, is_search_intent=True,
                                deliverables=['.pdf'], source_formats=[])
        names = {tool['function']['name'] for tool in select_active_tools(
            '查询实时资讯并生成一页PDF', skill, True, True)}
        self.assertTrue({'web_search', 'render_pdf', 'inspect_pdf_page'}.issubset(names))
        self.assertNotIn('bash', names)

    def setUp(self):
        reset_pdf_renders()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / 'script.pdf'
        self.start = time.time() - 1
        self.target.write_bytes(b'new shell PDF')
        self.result = SimpleNamespace(telemetry=TelemetryStats(), execution_evidence=[],
                                      final_text='已生成！', outbound_files=['script.pdf'])

    def fake_check(self, command, **kwargs):
        self.assertEqual(command[command.index('--max-pages') + 1], '1')
        folder = Path(command[command.index('--preview-dir') + 1])
        staged = Path(command[2])
        image = folder / 'page-1.png'; image.write_bytes(b'image')
        qa = {'valid': True, 'page_count': 1, 'errors': [],
              'sha256': hashlib.sha256(staged.read_bytes()).hexdigest(), 'previews': [str(image)]}
        (folder / 'qa.json').write_text(json.dumps(qa))
        return SimpleNamespace(returncode=0, stderr='')

    def enforce(self):
        return enforce_external_pdf_delivery(self.result, self.root, self.root,
                                             self.start, '生成一页PDF')

    def test_shell_success_cannot_override_checker_nonzero(self):
        def fail(command, **kwargs):
            self.fake_check(command, **kwargs)
            return SimpleNamespace(returncode=1, stderr='missing glyph')
        with patch('dsh_modules.pdf_external_delivery.subprocess.run', side_effect=fail), \
             patch('dsh_modules.pdf_preview_tool.inspect_pdf_image') as vision:
            self.assertTrue(self.enforce())
        vision.assert_not_called()
        self.assertFalse(self.target.exists())
        self.assertEqual(self.result.outbound_files, [])
        self.assertIn('missing glyph', self.result.final_text)
        self.assertEqual(self.result.telemetry.guard_decisions[-1]['action'], 'reject')
        self.assertEqual(len(list(self.root.rglob('candidate.pdf'))), 1)

    def test_zero_exit_does_not_override_invalid_qa(self):
        def fail(command, **kwargs):
            result = self.fake_check(command, **kwargs)
            folder = Path(command[command.index('--preview-dir') + 1])
            qa = json.loads((folder / 'qa.json').read_text())
            qa.update(valid=False, errors=['replacement characters'])
            (folder / 'qa.json').write_text(json.dumps(qa))
            return result
        with patch('dsh_modules.pdf_external_delivery.subprocess.run', side_effect=fail):
            self.enforce()
        self.assertIn('replacement characters', self.result.final_text)
        self.assertFalse(self.target.exists())

    def test_structure_and_every_page_must_pass_before_publication(self):
        from dsh_modules.evidence_store import persist_turn_evidence
        with patch('dsh_modules.pdf_external_delivery.subprocess.run', side_effect=self.fake_check), \
             patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】\nPASS\n无缺字。'):
            self.assertTrue(self.enforce())
        self.assertTrue(self.target.exists())
        self.assertEqual(len(self.result.outbound_files), 1)
        evidence = persist_turn_evidence(self.root / 'session.json', {}, '生成PDF',
                        self.result.execution_evidence, self.result.telemetry.guard_decisions)
        self.assertTrue(evidence['verified'])

    def test_descriptive_vision_prose_is_not_acceptance_and_failure_is_cached(self):
        from dsh_modules.pdf_preview_tool import review_current_pdf_pages
        with patch('dsh_modules.pdf_external_delivery.subprocess.run', side_effect=self.fake_check), \
             patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】\n这是一张漂亮的日报。') as vision:
            self.enforce()
            self.assertEqual(review_current_pdf_pages(self.root, None, self.result.telemetry, 9), [])
        self.assertEqual(vision.call_count, 1)
        self.assertFalse(self.target.exists())
        self.assertEqual(self.result.outbound_files, [])

    def test_old_or_uploaded_pdfs_are_never_claimed_or_moved(self):
        os.utime(self.target, (self.start - 10, self.start - 10))
        with patch('dsh_modules.pdf_external_delivery.subprocess.run') as check:
            self.assertFalse(self.enforce())
            self.assertFalse(enforce_external_pdf_delivery(self.result, self.root, self.root,
                self.start - 20, '查看PDF', session_files=[str(self.target)]))
        check.assert_not_called()
        self.assertTrue(self.target.exists())


@unittest.skipUnless(os.environ.get('PDF_DESIGN_SCRIPTS'), 'Requires PDF production runtime')
class PDFSymbolRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.environ['PDF_DESIGN_SCRIPTS'])

    def test_vectors_cover_metadata_body_and_rankings_without_emoji_fonts(self):
        from pdf_design import render_report
        from pdf_design.quality import inspect_pdf
        with tempfile.TemporaryDirectory() as folder:
            pdf = Path(folder) / 'symbols.pdf'
            render_report(['# 🔥 中文日报', '', '## 🏆 榜单', '',
                '| 排名 | 热度 | 趋势 |', '|---|---|---|',
                '| 🥇 NO.1 | 🔥🔥🔥 | 📈 上升 |', '| 🥈 | ⚡ | ➖ 持平 |',
                '| 🥉 | ⭐ | 稳定 |', '', '🎮 游戏区 · 🎬 视频 · 📊 趋势 · 📌 来源 · 📝 记录'], str(pdf), max_pages=1)
            qa = inspect_pdf(pdf)
            self.assertTrue(qa['valid'], qa['errors'])
            text = qa['pages'][0]['text']
            self.assertIn('中文日报', text)
            for rank in ['1', '2', '3']:
                self.assertIn(rank, text)
            html = (Path(folder) / '.pdf-preview/symbols/document.html').read_text()
            self.assertIn('data:image/svg+xml;base64,', html)
            self.assertNotIn('<h1>🔥', html)

    def test_nested_markdown_tables_and_unknown_symbols_remain_visible(self):
        from pdf_design.content import markdown_html
        html = markdown_html('<div class="grid-2">\n\n## 榜单\n\n|A|B|\n|---|---|\n|1|2|\n\n</div>')
        self.assertIn('<table>', html)
        self.assertNotIn('|---|', html)
        html = markdown_html('## 🦄 标题')
        self.assertIn('UNICORN FACE', html)
        self.assertIn('标题', html)


if __name__ == '__main__':
    unittest.main()
