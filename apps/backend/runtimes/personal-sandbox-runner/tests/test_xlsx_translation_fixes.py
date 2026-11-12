"""OOXML prefix preservation, font localization, balanced batching and frequency checks."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / 'skills/xlsx/scripts/ooxml_xlsx_translate.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('xlsx_translation_fixes_mod', SCRIPT)
ooxml = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ooxml)

from xlsx_translation_batches import translate_texts as batch_translate
from xlsx_translation_client import TranslationFailure, has_frequency_mismatch, make_balanced_batches
from xlsx_translation_quality import validate_delivery


STYLES_WITH_JP_FONT = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="10"/><name val="BIZ UDPゴシック"/><charset val="128"/></font>
    <font><sz val="11"/><name val="MS PMincho"/><charset val="128"/></font>
    <font><sz val="11"/><name val="Calibri"/><charset val="0"/></font>
  </fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>
</styleSheet>'''

WORKBOOK_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="チェックリスト" sheetId="1" r:id="rId1"/></sheets>
</workbook>'''

SHARED_STRINGS_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5">
  <si><t>クラウド設定確認</t></si>
  <si><t>N（その他）</t></si>
  <si><t>Y（対応済）</t></si>
  <si><t>1年に1回以上見直しを実施する</t></si>
  <si><r><rPr><rFont val="BIZ UDPゴシック"/><charset val="128"/><b/></rPr><t>重要項目</t></r></si>
</sst>'''

SHEET1_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c></row>
    <row r="2"><c r="B2" t="str"><f>COUNTIF(C3:C10,"N*")</f><v>0</v></c></row>
    <row r="3"><c r="C3" t="s"><v>1</v></c></row>
    <row r="4"><c r="C4" t="s"><v>2</v></c></row>
    <row r="5"><c r="D5" t="s"><v>3</v></c></row>
    <row r="6"><c r="E6" t="s"><v>4</v></c></row>
  </sheetData>
  <conditionalFormatting sqref="C3:C10">
    <cfRule type="expression" dxfId="0" priority="1">
      <formula>LEFT(C3,LEN("N"))="N"</formula>
    </cfRule>
  </conditionalFormatting>
  <dataValidations count="1">
    <dataValidation type="list" allowBlank="1" sqref="C3:C10">
      <formula1>"選択,Y（対応済）,N（未対応）,N（その他）"</formula1>
    </dataValidation>
  </dataValidations>
</worksheet>'''

DRAWING1_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:sp>
      <xdr:txBody>
        <a:bodyPr/>
        <a:p>
          <a:r>
            <a:rPr lang="ja-JP"><a:latin typeface="BIZ UDPゴシック"/><a:ea typeface="BIZ UDPゴシック" charset="128"/></a:rPr>
            <a:t>運用手順</a:t>
          </a:r>
        </a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>'''

APP_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>チェックリスト</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>'''


def _build_fixture_xlsx(path: Path) -> None:
    with zipfile.ZipFile(path, 'w') as zf:
        zf.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zf.writestr('docProps/app.xml', APP_XML)
        zf.writestr('xl/workbook.xml', WORKBOOK_XML)
        zf.writestr('xl/styles.xml', STYLES_WITH_JP_FONT)
        zf.writestr('xl/sharedStrings.xml', SHARED_STRINGS_XML)
        zf.writestr('xl/worksheets/sheet1.xml', SHEET1_XML)
        zf.writestr('xl/drawings/drawing1.xml', DRAWING1_XML)


class XlsxTranslationFixTests(unittest.TestCase):
    def setUp(self):
        review = patch('xlsx_translation_client.review_batch', side_effect=lambda source, candidate, *a, **kw: candidate)
        review.start()
        self.addCleanup(review.stop)
        self._env = patch.dict(os.environ, {'DSH_SESSION_ID': 'fix-suite'})
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_end_to_end_prefix_protection_font_localization_and_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / 'source.xlsx'
            out = root / 'translated_zh_CN.xlsx'
            temp_dir = root / 'work'
            in_json = temp_dir / 'translation_input.json'
            out_json = temp_dir / 'translation_output.json'
            _build_fixture_xlsx(src)

            with contextlib.redirect_stdout(io.StringIO()):
                ooxml.unpack_xlsx(str(src), str(temp_dir), str(in_json))

            mapping = json.loads((temp_dir / 'ooxml_mapping.json').read_text(encoding='utf-8'))
            self.assertEqual(mapping['sst_1']['protected_prefix'], 'N')
            self.assertEqual(mapping['sst_2']['protected_prefix'], 'Y')
            self.assertEqual(mapping['dv_sheet1.xml_0_3']['protected_prefix'], 'N')

            sent_batches = []
            dict_map = {
                'クラウド設定確認': '云配置确认',
                'チェックリスト': '检查清单',
                '選択': '选择',
                '（その他）': '（其他）',
                '（未対応）': '（未应对）',
                '（対応済）': '（已应对）',
                '1年に1回以上見直しを実施する': '至少每年开展一次审查',
                '重要項目': '重要项目',
                '運用手順': '运维流程',
            }

            def fake_batch(batch, target_lang, api_base, api_key, model='default', repair=False):
                sent_batches.append(dict(batch))
                return {k: dict_map[v] for k, v in batch.items()}

            with contextlib.redirect_stdout(io.StringIO()), \
                 patch.object(ooxml, '_translate_single_batch_streaming', side_effect=fake_batch):
                translations = ooxml.translate_texts(str(in_json), str(out_json), target_lang='zh-CN', concurrency=1)

            # LLM never saw bare N/Y prefix strings attached to dropdown/cell options
            all_sent_values = [val for batch in sent_batches for val in batch.values()]
            self.assertIn('（その他）', all_sent_values)
            self.assertNotIn('N（その他）', all_sent_values)

            self.assertEqual(translations['sst_1'], 'N（其他）')
            self.assertEqual(translations['sst_2'], 'Y（已应对）')
            self.assertEqual(translations['dv_sheet1.xml_0_2'], 'N（未应对）')
            self.assertEqual(translations['dv_sheet1.xml_0_3'], 'N（其他）')

            with contextlib.redirect_stdout(io.StringIO()):
                ooxml.pack_xlsx(str(temp_dir), str(out_json), str(out), lang='zh-CN', run_recalc=False)

            quality = validate_delivery(src, out, mapping, translations, 'zh-CN')
            self.assertTrue(quality['passed'])

            with zipfile.ZipFile(out) as zf:
                styles_text = zf.read('xl/styles.xml').decode('utf-8')
                self.assertIn('val="微软雅黑"', styles_text)
                self.assertIn('val="宋体"', styles_text)
                self.assertIn('val="Calibri"', styles_text)
                self.assertIn('val="134"', styles_text)
                self.assertNotIn('BIZ UDP', styles_text)
                self.assertNotIn('MS PMincho', styles_text)
                self.assertNotIn('val="128"', styles_text)

                sst_text = zf.read('xl/sharedStrings.xml').decode('utf-8')
                self.assertIn('val="微软雅黑"', sst_text)
                self.assertIn('N（其他）', sst_text)

                sheet_text = zf.read('xl/worksheets/sheet1.xml').decode('utf-8')
                self.assertIn('"选择,Y（已应对）,N（未应对）,N（其他）"', sheet_text)
                self.assertIn('COUNTIF(C3:C10,"N*")', sheet_text)
                self.assertIn('LEFT(C3,LEN("N"))="N"', sheet_text)

                drawing_text = zf.read('xl/drawings/drawing1.xml').decode('utf-8')
                self.assertIn('typeface="微软雅黑"', drawing_text)
                self.assertIn('charset="134"', drawing_text)

                app_text = zf.read('docProps/app.xml').decode('utf-8')
                self.assertIn('检查清单', app_text)

    def test_validate_delivery_still_rejects_bad_style_prefix_and_frequency(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / 'source.xlsx'
            out = root / 'bad.xlsx'
            temp_dir = root / 'work'
            in_json = root / 'in.json'
            out_json = root / 'out.json'
            _build_fixture_xlsx(src)

            with contextlib.redirect_stdout(io.StringIO()):
                ooxml.unpack_xlsx(str(src), str(temp_dir), str(in_json))
            mapping = json.loads((temp_dir / 'ooxml_mapping.json').read_text(encoding='utf-8'))

            good = {
                'sst_0': '云配置确认',
                'sst_1': 'N（其他）',
                'sst_2': 'Y（已应对）',
                'sst_3': '至少每年开展一次审查',
                'sst_4_run_0': '重要项目',
                'sheet_name_0': '检查清单',
                'dv_sheet1.xml_0_0': '选择',
                'dv_sheet1.xml_0_1': 'Y（已应对）',
                'dv_sheet1.xml_0_2': 'N（未应对）',
                'dv_sheet1.xml_0_3': 'N（其他）',
            }
            for k in json.loads(in_json.read_text(encoding='utf-8')):
                good.setdefault(k, '运维流程')
            out_json.write_text(json.dumps(good, ensure_ascii=False), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                ooxml.pack_xlsx(str(temp_dir), str(out_json), str(out), lang='zh-CN', run_recalc=False)

            bad_prefix = dict(good, sst_1='否（其他）')
            with self.assertRaisesRegex(TranslationFailure, 'code prefix'):
                validate_delivery(src, out, mapping, bad_prefix, 'zh-CN')

            bad_freq = dict(good, sst_3='至少每半年开展一次审查')
            with self.assertRaisesRegex(TranslationFailure, 'frequency'):
                validate_delivery(src, out, mapping, bad_freq, 'zh-CN')

            tampered_style = root / 'tampered_style.xlsx'
            with zipfile.ZipFile(out, 'r') as zin, zipfile.ZipFile(tampered_style, 'w') as zout:
                for info in zin.infolist():
                    data = zin.read(info.filename)
                    if info.filename == 'xl/styles.xml':
                        data = data.replace(b'sz val="10"', b'sz val="18"')
                    zout.writestr(info, data)
            with self.assertRaisesRegex(TranslationFailure, 'Workbook styles changed'):
                validate_delivery(src, tampered_style, mapping, good, 'zh-CN')

    def test_balanced_batching_distributes_large_work_across_workers(self):
        long_items = [
            (f't_{i}', f'クラウド設定の監視手順番号{i}と運用監査項目を確認し証跡を記録する')
            for i in range(106)
        ]
        batches = list(make_balanced_batches(long_items, concurrency=4, max_items=50, max_chars=4500))
        self.assertEqual(len(batches), 4)
        sizes = [len(b) for b in batches]
        self.assertEqual(sum(sizes), 106)
        self.assertGreaterEqual(min(sizes), 22)
        self.assertLessEqual(max(sizes), 32)

        # Tiny payloads continue to match standard make_batches
        tiny_items = [(f't_{i}', f'項目{i}') for i in range(52)]
        tiny_batches = list(make_balanced_batches(tiny_items, concurrency=4, max_items=50, max_chars=4500))
        self.assertEqual([len(b) for b in tiny_batches], [50, 2])

    def test_frequency_mismatch_triggers_repair_and_recovers(self):
        self.assertTrue(has_frequency_mismatch('1年に1回以上見直しする', '至少每半年审查一次'))
        self.assertFalse(has_frequency_mismatch('1年に1回以上見直しする', '至少每年审查一次'))
        self.assertFalse(has_frequency_mismatch('年1回または半期ごとに点検', '每年或每半年检查一次'))

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            in_json = root / 'in.json'
            out_json = root / 'out.json'
            in_json.write_text(json.dumps({'k0': '1年に1回見直す'}, ensure_ascii=False), encoding='utf-8')
            calls = []

            def responder(batch, target_lang, api_base, api_key, model='default', repair=False):
                calls.append(repair)
                if not repair:
                    return {k: '每半年审查一次' for k in batch}
                return {k: '每年审查一次' for k in batch}

            with contextlib.redirect_stdout(io.StringIO()):
                res = batch_translate(
                    str(in_json), str(out_json), target_lang='zh-CN', concurrency=1,
                    is_passthrough=lambda t: False, translate_batch_fn=responder,
                )
            self.assertEqual(calls, [False, True])
            self.assertEqual(res['k0'], '每年审查一次')


if __name__ == '__main__':
    unittest.main()
