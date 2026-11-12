"""Whole-workbook workflow preserves native features and blocks incomplete delivery."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error
import zipfile
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'src'))
sys.path.insert(0, str(BASE / 'skills/xlsx/scripts'))
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.xlsx_translation_turn import fixed_xlsx_translation, execute_translation, try_run_xlsx_translation, _engine
import xlsx_translation_client as client


class XlsxTranslationTurnTests(unittest.TestCase):
    def setUp(self):
        review = patch.object(client, 'review_batch', side_effect=lambda source, candidate, *a, **kw: candidate)
        review.start()
        self.addCleanup(review.stop)

    def skill(self):
        return SimpleNamespace(skill_id='xlsx', deliverables=['.xlsx'],
                               admission={'task_mode': 'execute', 'output_mode': 'artifact'})

    def test_routing_only_owns_complete_translation_requests(self):
        self.assertTrue(fixed_xlsx_translation(self.skill(), ['source.xlsx'], '保持格式不变，翻译成中文的excel'))
        for request in ('只翻译第一张工作表为中文', '翻译成中文并发送邮件', '翻译成中文但表名不要修改', '保持格式不变'):
            self.assertFalse(fixed_xlsx_translation(self.skill(), ['source.xlsx'], request))
        self.assertFalse(fixed_xlsx_translation(self.skill(), ['source.xlsx', 'other.xlsx'], '翻译成中文'))

    def followup(self):
        skill = self.skill()
        skill.skill_id = None  # Actual 22:16 admission downgraded this to general.
        skill.admission.update(instruction_relation='followup', requirements=[
            {'quote': '保持格式不变'}, {'quote': '翻译成中文'}, {'quote': 'excel'}])
        return skill

    def test_reviewed_regeneration_inherits_latest_translation(self):
        history = [{'role': 'user', 'content': '保持格式不变，翻译成中文的excel'}]
        for prompt in ('重新生成', '重试生成', '继续'):
            self.assertTrue(fixed_xlsx_translation(self.followup(), ['source.xlsx'], prompt, history))
        skill = self.followup()
        skill.admission['requirements'] = [{'quote': '重新生成'}, {'quote': history[0]['content']}]
        self.assertTrue(fixed_xlsx_translation(skill, ['source.xlsx'], '重新生成', history))
        skill.admission['requirements'] = [{'quote': '重新生成'}]
        self.assertTrue(fixed_xlsx_translation(skill, ['source.xlsx'], '重新生成', history))
        skill.admission['requirements'] = []
        self.assertFalse(fixed_xlsx_translation(skill, ['source.xlsx'], '重新生成', history))
        self.assertFalse(fixed_xlsx_translation(self.followup(), ['source.xlsx'], '重新生成并发送邮件', history))
        self.assertFalse(fixed_xlsx_translation(self.followup(), ['source.xlsx'], '重新生成', []))
        history.append({'role': 'user', 'content': '现在计算合计并增加图表'})
        self.assertFalse(fixed_xlsx_translation(self.followup(), ['source.xlsx'], '重新生成', history))

    def test_regeneration_preserves_prior_scope_and_explicit_skill_choice(self):
        for request in ('只翻译第一张工作表成中文的excel，保持格式不变',
                        '保持格式不变，翻译成中文的excel，表名不要修改'):
            self.assertFalse(fixed_xlsx_translation(self.followup(), ['source.xlsx'], '重新生成',
                                                   [{'role': 'user', 'content': request}]))
        skill = self.followup()
        skill.admission['skill_invocation'] = {'mode': 'execute', 'name': 'custom'}
        self.assertFalse(fixed_xlsx_translation(skill, ['source.xlsx'], '重新生成',
                          [{'role': 'user', 'content': '保持格式不变，翻译成中文的excel'}]))

    def test_regeneration_rebuilds_and_validates_with_source_bound_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            history_file = root / 'session.json'
            history = [{'role': 'user', 'content': '保持格式不变，翻译成中文的excel'}]
            values = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
                      'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
                      'セキュリティ計画': '安全计划'}
            with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: values[v] for k, v in batch.items()}):
                with contextlib.redirect_stdout(io.StringIO()):
                    execute_translation(root / 'source.xlsx', root / 'source_zh_CN.xlsx', 'zh-CN',
                                        root, BASE / 'skills', TelemetryStats(), session_id=history_file.stem)
            (root / 'source_zh_CN.xlsx').write_bytes(b'invalid previous artifact')
            with patch.object(client, '_request', side_effect=AssertionError('regeneration should reuse valid translations')):
                with contextlib.redirect_stdout(io.StringIO()):
                    handled = try_run_xlsx_translation(self.followup(), ['source.xlsx'], '重新生成',
                        history_file, history, time.time(), None, TelemetryStats(), root, BASE / 'skills')
            self.assertTrue(handled)
            with zipfile.ZipFile(root / 'source_zh_CN.xlsx') as archive:
                self.assertIsNone(archive.testzip())
            self.assertEqual(json.loads(history_file.read_text())[-2]['content'], '重新生成')
            evidence = json.loads(history_file.with_suffix('.evidence.json').read_text())
            self.assertTrue(evidence['receipts'][0]['data']['quality']['passed'])

    def test_identical_source_in_different_sessions_requires_new_translation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            target = root / 'translated.xlsx'
            values = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
                      'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
                      'セキュリティ計画': '安全计划'}
            with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: values[v] for k, v in batch.items()}) as model:
                with contextlib.redirect_stdout(io.StringIO()):
                    first = execute_translation(source, target, 'zh-CN', root, BASE / 'skills',
                                                TelemetryStats(), session_id='session-a')
                    self.assertGreater(model.call_count, 0)
                    model.reset_mock()
                    execute_translation(source, target, 'zh-CN', root, BASE / 'skills',
                                        TelemetryStats(), session_id='session-a')
                    model.assert_not_called()
                    values['選択'] = '选取'
                    second = execute_translation(source, target, 'zh-CN', root, BASE / 'skills',
                                                 TelemetryStats(), session_id='session-b')
                    self.assertGreater(model.call_count, 0)
            for result, session in ((first, 'session-a'), (second, 'session-b')):
                manifest = json.loads(Path(result['manifest_path']).read_text())
                self.assertEqual(manifest['session_id'], session)
            with zipfile.ZipFile(target) as archive:
                self.assertIn('选取', archive.read('xl/worksheets/sheet1.xml').decode())

    def test_missing_session_identity_never_reuses_global_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            values = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
                      'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
                      'セキュリティ計画': '安全计划'}
            with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: values[v] for k, v in batch.items()}) as model:
                with contextlib.redirect_stdout(io.StringIO()):
                    execute_translation(source, root / 'out.xlsx', 'zh-CN', root, BASE / 'skills', TelemetryStats())
                    model.reset_mock()
                    execute_translation(source, root / 'out.xlsx', 'zh-CN', root, BASE / 'skills', TelemetryStats())
                    self.assertGreater(model.call_count, 0)

    def test_partial_translation_failure_reports_progress_and_keeps_output(self):
        from openpyxl import Workbook
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            workbook = Workbook()
            workbook.active.title = '元表'
            for i in range(51):
                workbook.active.cell(i + 1, 1, f'項目{i}')
            workbook.save(root / 'source.xlsx')
            (root / 'source_zh_CN.xlsx').write_bytes(b'previous verified artifact')
            def model(batch, *args, **kwargs):
                if len(batch) < 50:
                    raise urllib.error.HTTPError('http://model', 500, 'Internal Server Error', {}, None)
                return {key: '译文' + str(index) for index, key in enumerate(batch)}
            history_file = root / 'session.json'
            with patch.object(client, '_request', side_effect=model), patch.object(client.time, 'sleep'):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertTrue(try_run_xlsx_translation(self.skill(), ['source.xlsx'], '翻译成中文',
                        history_file, [], time.time(), None, TelemetryStats(), root, BASE / 'skills'))
            answer = json.loads(history_file.read_text())[-1]['content']
            self.assertIn('HTTP 500', answer)
            self.assertIn('50/52', answer)
            self.assertIn('剩余 2', answer)
            self.assertIn('本会话回复“继续”', answer)
            manifest = json.loads(next((root / '.dsh/xlsx-jobs').glob('*/manifest.json')).read_text())
            self.assertEqual(manifest['active_stage'], 'translate')
            self.assertEqual(manifest['progress'], dict(total=52, completed=50, remaining=2))
            self.assertEqual((root / 'source_zh_CN.xlsx').read_bytes(), b'previous verified artifact')

    def fixture(self, root):
        from openpyxl import Workbook
        from openpyxl.styles import PatternFill
        from openpyxl.formatting.rule import CellIsRule
        from openpyxl.worksheet.datavalidation import DataValidation
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = '元表'
        sheet['A1'] = '選択'
        sheet['A2'] = 'あり'
        sheet['B1'] = '=IF(A2="あり","合格","不合格")'
        sheet.freeze_panes = 'A2'
        sheet.column_dimensions['A'].width = 24
        rule = DataValidation(type='list', formula1='"あり,なし"')
        sheet.add_data_validation(rule)
        rule.add('A2:A5')
        sheet.conditional_formatting.add('A2:A5', CellIsRule(operator='equal', formula=['"あり"'],
            fill=PatternFill('solid', fgColor='FFFF0000')))
        other = workbook.create_sheet('結果')
        other['A1'] = "='元表'!A1"
        path = root / 'source.xlsx'
        workbook.save(path)
        # Supply a real rich shared string and a drawing text object as raw OOXML.
        with zipfile.ZipFile(path) as archive:
            parts = {name: archive.read(name) for name in archive.namelist()}
        main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        xml = ET.fromstring(parts['xl/worksheets/sheet1.xml'])
        cell = xml.find(f'.//{{{main}}}c[@r="B1"]')
        cell.set('t', 'str')
        cell.find(f'{{{main}}}v').text = 'あり'
        parts['xl/worksheets/sheet1.xml'] = ET.tostring(xml)
        parts['xl/sharedStrings.xml'] = (b'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + '<si><r><rPr><b/></rPr><t>システム</t></r><r><rPr><color rgb="FFFF0000"/></rPr><t>管理</t></r></si></sst>'.encode())
        parts['xl/drawings/drawing1.xml'] = ('<a:root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            '<a:r><a:rPr b="1"/><a:t>セキュリティ計画</a:t></a:r></a:root>').encode()
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in parts.items():
                archive.writestr(name, data)
        return path

    def test_real_archive_preserves_rich_runs_drawings_and_formula_comparisons(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            target = root / 'translated.xlsx'
            values = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
                      'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
                      'セキュリティ計画': '安全计划'}
            def model(batch, *args, **kwargs):
                return {key: values[value] for key, value in batch.items()}
            with patch.object(client, '_request', side_effect=model):
                with contextlib.redirect_stdout(io.StringIO()):
                    result = execute_translation(source, target, 'zh-CN', root, BASE / 'skills', TelemetryStats())
            self.assertEqual(result['state'], 'published')
            self.assertTrue(result['quality']['passed'])
            with zipfile.ZipFile(target) as archive:
                sst = ET.fromstring(archive.read('xl/sharedStrings.xml'))
                ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                self.assertEqual([item.text for item in sst.findall('.//m:r/m:t', ns)], ['系统', '管理'])
                with zipfile.ZipFile(source) as original:
                    self.assertEqual(archive.read('xl/drawings/drawing1.xml'),
                        original.read('xl/drawings/drawing1.xml').replace('セキュリティ計画'.encode(), '安全计划'.encode()))
                self.assertIn('&quot;有&quot;', archive.read('xl/worksheets/sheet1.xml').decode().replace('"有"', '&quot;有&quot;'))
                self.assertNotIn('.translation_cache.json', archive.namelist())
                worksheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
                self.assertEqual(worksheet.find('.//m:c[@r="B1"]/m:v', ns).text, '有')

    def test_failed_translation_never_overwrites_existing_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            target = root / 'existing.xlsx'
            target.write_bytes(b'previous approved output')
            with patch.object(client, '_request', side_effect=client.TranslationFailure('bad response')):
                with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(client.TranslationFailure):
                    execute_translation(source, target, 'zh-CN', root, BASE / 'skills', TelemetryStats())
            self.assertEqual(target.read_bytes(), b'previous approved output')

    def test_cli_auto_validates_candidate_before_replacing_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            target = root / 'translated.xlsx'
            values = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
                      'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
                      'セキュリティ計画': '安全计划'}
            with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: values[v] for k, v in batch.items()}):
                with contextlib.redirect_stdout(io.StringIO()):
                    _engine(BASE / 'skills').auto_translate_xlsx(str(source), str(target))
            with zipfile.ZipFile(source) as before, zipfile.ZipFile(target) as after:
                self.assertEqual(set(before.namelist()), set(after.namelist()))


if __name__ == '__main__':
    unittest.main()
