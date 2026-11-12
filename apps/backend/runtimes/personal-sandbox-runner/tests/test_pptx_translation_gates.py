"""End-to-end regression tests for PPTX translation routing, admission, workflow, and OOXML quality gates."""

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'src'))
sys.path.insert(0, str(BASE / 'skills/pptx/scripts'))

from dsh_modules.intent_contract import extract_source_and_target_artifacts, is_attachment_in_place_translation
from dsh_modules.task_intent import has_physical_artifact_request
from dsh_modules.skill_router import SkillRouter, check_generation_target_is_physical, resolve_file_action_intent
from dsh_modules.skill_admission import admit_skill
from dsh_modules.tool_routing import is_document_translation_task, _select_native_tools
from dsh_modules.prompt_builder import build_user_turn
from dsh_modules.planning_phase import should_run_planning_phase
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.pptx_workflow import (
    translation_language,
    fixed_pptx_translation,
    normalize_pptx_translation_route,
    managed_pptx_export,
    validate_pptx_translation_delivery,
    run_fixed_pptx_translation,
    audit_pptx_workspace_deliverables,
)
from dsh_modules.artifact_exporter import ArtifactExporter


def _make_sample_pptx(path: Path, *, grouped_text: str = 'レート制限', top_text: str = 'OneAI 架构总览', keep_rpr: bool = True):
    """Creates a minimal valid OPC PPTX package containing top-level sp, nested p:grpSp, and <a:br/>."""
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        '</Relationships>'
    )
    pres_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>'
        '<p:sldSz cx="9144000" cy="6858000"/>'
        '<p:notesSz cx="6858000" cy="9144000"/>'
        '</p:presentation>'
    )
    pres_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'
        '</Relationships>'
    )
    rpr = (
        '<a:rPr lang="ja-JP" sz="1400"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:latin typeface="Meiryo"/></a:rPr>'
        if keep_rpr else ''
    )
    slide_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree>'
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr/>'
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="50000"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>{rpr}<a:t>{top_text}</a:t></a:r></a:p></p:txBody></p:sp>'
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Badge"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="0" y="60000"/><a:ext cx="100000" cy="50000"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>{rpr}<a:t>OpenAI</a:t></a:r><a:br/><a:r>{rpr}<a:t>互換</a:t></a:r></a:p></p:txBody></p:sp>'
        '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr/>'
        '<p:sp><p:nvSpPr><p:cNvPr id="5" name="Grouped1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="0" y="120000"/><a:ext cx="100000" cy="50000"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>{rpr}<a:t>{grouped_text}</a:t></a:r></a:p></p:txBody></p:sp>'
        '<p:sp><p:nvSpPr><p:cNvPr id="6" name="Grouped2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="0" y="180000"/><a:ext cx="100000" cy="50000"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>{rpr}<a:t>認証・認可</a:t></a:r></a:p></p:txBody></p:sp>'
        '<p:sp><p:nvSpPr><p:cNvPr id="7" name="Grouped3"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="0" y="240000"/><a:ext cx="100000" cy="50000"/></a:xfrm></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>{rpr}<a:t>全アクセス監査</a:t></a:r></a:p></p:txBody></p:sp>'
        '</p:grpSp>'
        '</p:spTree></p:cSld></p:sld>'
    )
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', root_rels)
        zf.writestr('ppt/presentation.xml', pres_xml)
        zf.writestr('ppt/_rels/presentation.xml.rels', pres_rels)
        zf.writestr('ppt/slides/slide1.xml', slide_xml)


class PptxTranslationGateTests(unittest.TestCase):
    def test_in_place_translation_without_extension_passes_intent_and_routing_gates(self):
        prompt = '保持格式不变，翻译成英文'
        files = ['OneAI架构.pptx']

        self.assertTrue(is_attachment_in_place_translation(prompt, files))
        src, tgt_fmts, tgt_files = extract_source_and_target_artifacts(prompt, files)
        self.assertEqual(src, files)
        self.assertEqual(tgt_fmts, ['.pptx'])
        self.assertEqual(tgt_files, [])
        self.assertTrue(check_generation_target_is_physical(prompt.lower(), attached_files=files))
        self.assertTrue(has_physical_artifact_request(prompt, attached_files=files))

        is_gen, _ = resolve_file_action_intent(prompt, attached_files=files)
        self.assertTrue(is_gen)

        with contextlib.redirect_stdout(io.StringIO()):
            route = SkillRouter.route(prompt, files=files, load_skill_context=False)
        self.assertEqual(route.skill_id, 'pptx')
        self.assertTrue(route.is_generate_intent)
        self.assertIn('.pptx', route.deliverables)
        self.assertTrue(route.requires_execution)

    def test_pure_read_and_text_only_invariants_remain_preserved(self):
        files = ['OneAI架构.pptx']
        self.assertFalse(is_attachment_in_place_translation('文档里面是什么内容', files))
        self.assertFalse(has_physical_artifact_request('文档里面是什么内容', attached_files=files))
        self.assertFalse(has_physical_artifact_request('把这句话翻译成英文', attached_files=None))
        self.assertFalse(has_physical_artifact_request('不要生成文件，翻译成英文', attached_files=files))
        self.assertEqual(resolve_file_action_intent('文档里面是什么内容', attached_files=files), (False, True))
        self.assertFalse(resolve_file_action_intent('第1页这句话是什么意思，只在聊天里翻译解释', attached_files=files)[0])

    def test_admit_skill_does_not_bypass_attached_pptx_translation_as_pure_read(self):
        prompt = '【当前轮次用户上传附件】: OneAI架构.pptx\n用户指令：保持格式不变，翻译成英文'
        files = ['OneAI架构.pptx']
        with contextlib.redirect_stdout(io.StringIO()):
            provisional = SkillRouter.route(prompt, files=files, load_skill_context=False)
        telemetry = TelemetryStats()

        # Verify admit_skill leaves the read-mode fast path and invokes extract_task_intent
        with patch('dsh_modules.skill_admission.extract_task_intent', side_effect=RuntimeError('reached_admission')) as ext:
            with self.assertRaisesRegex(RuntimeError, 'reached_admission'):
                admit_skill(prompt, [], files, provisional, 'mock-model', None, telemetry, time.monotonic() + 10)
            self.assertEqual(ext.call_count, 1)

    def test_normalize_route_prompt_builder_planning_and_tool_pruning_alignment(self):
        prompt = '保持格式不变，翻译成英文'
        files = ['OneAI架构.pptx']
        telemetry = TelemetryStats()
        # Simulate degraded route missing generate flags
        degraded = SimpleNamespace(
            skill_id=None,
            deliverables=[],
            is_generate_intent=False,
            is_inspect_intent=True,
            is_guide_intent=False,
            is_ppt_intent=False,
            requires_execution=False,
            source_formats=[],
            admission={'task_mode': 'execute', 'output_mode': 'conversation'},
        )
        normalized = normalize_pptx_translation_route(prompt, files, degraded, telemetry)
        self.assertEqual(normalized.skill_id, 'pptx')
        self.assertEqual(normalized.deliverables, ['.pptx'])
        self.assertTrue(normalized.is_generate_intent)
        self.assertFalse(normalized.is_inspect_intent)
        self.assertFalse(normalized.is_ppt_intent)
        self.assertTrue(normalized.is_office_intent)
        self.assertTrue(normalized.requires_execution)
        self.assertTrue(fixed_pptx_translation(prompt, files, normalized.deliverables))
        self.assertEqual(translation_language(prompt), 'en-US')

        user_turn = build_user_turn(
            prompt=prompt,
            session_files=files,
            is_ppt_intent=True,
            is_generate_intent=True,
            is_inspect_intent=False,
            available_tool_names=['bash', 'read_file', 'write_json'],
            deliverables=['.pptx'],
        )
        self.assertIn('ooxml_translate.py', user_turn)
        self.assertIn('--lang en-US', user_turn)
        self.assertNotIn('只读审阅与内容归纳规范', user_turn)

        policy = RuntimePolicy(thinking=True)
        should_plan, is_deliv = should_run_planning_phase(prompt, normalized, policy, session_files=files)
        self.assertFalse(should_plan)
        self.assertTrue(is_deliv)

        # Tool pruning preserves read_skill if skill_context is missing, otherwise tightens to 3 tools
        no_ctx = SimpleNamespace(skill_id='pptx', skill_context='', deliverables=['.pptx'], source_formats=['.pptx'], disclosure_steps=0, is_generate_intent=True, requires_execution=True)
        self.assertTrue(is_document_translation_task(prompt, no_ctx))
        tools_no_ctx = {t['function']['name'] for t in _select_native_tools(prompt, no_ctx, False, False)}
        self.assertIn('read_skill', tools_no_ctx)
        self.assertIn('bash', tools_no_ctx)

    def test_ooxml_translate_preserves_grp_sp_rpr_fonts_and_breaks(self):
        import ooxml_translate as ot

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src = root / 'src.pptx'
            out = root / 'out.pptx'
            pkg = root / 'pkg'
            in_json = root / 'in.json'
            out_json = root / 'out.json'
            _make_sample_pptx(src)

            extracted = ot.unpack_pptx(str(src), str(pkg), str(in_json))
            values = set(extracted.values())
            # Must extract top-level, <a:br>-joined, and all nested p:grpSp shapes
            self.assertIn('OneAI 架构总览', values)
            self.assertIn('OpenAI\n互換', values)
            self.assertIn('レート制限', values)
            self.assertIn('認証・認可', values)
            self.assertIn('全アクセス監査', values)

            translated = {
                k: {
                    'OneAI 架构总览': 'OneAI Architecture Overview',
                    'OpenAI\n互換': 'OpenAI Compatible',
                    'レート制限': 'Rate Limiting',
                    '認証・認可': 'AuthN / AuthZ',
                    '全アクセス監査': 'Full Access Audit',
                }[v]
                for k, v in extracted.items()
            }
            out_json.write_text(json.dumps(translated, ensure_ascii=False), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                ot.pack_pptx(str(pkg), str(out_json), str(out), lang='en-US', auto_fit=True, shrink_font=True)

            verdict = validate_pptx_translation_delivery(src, out, target_lang='en-US')
            self.assertTrue(verdict['ok'], f"Expected valid PPTX delivery, got {verdict}")
            self.assertEqual(verdict['stats']['output_cjk_paragraphs'], 0)
            self.assertGreaterEqual(verdict['stats']['output_rpr_sz'], 5)
            self.assertGreaterEqual(verdict['stats']['output_rpr_fill'], 5)

            # Wide CJK latin font ('Meiryo') localizes to Calibri on en-US while keeping Meiryo in a:ea
            with zipfile.ZipFile(out) as zf:
                slide_xml = zf.read('ppt/slides/slide1.xml').decode('utf-8')
            self.assertIn('Calibri', slide_xml)
            self.assertIn('Meiryo', slide_xml)
            self.assertNotIn('<a:br', slide_xml)

    def test_validate_and_post_loop_gate_detect_grp_sp_cjk_residue_and_rpr_loss(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src = root / 'OneAI架构.pptx'
            bad = root / 'OneAI_Architecture_EN.pptx'
            _make_sample_pptx(src)
            # Simulate model script that missed p:grpSp (left 3 CJK shapes) AND stripped rPr sz/fill
            _make_sample_pptx(bad, grouped_text='レート制限', top_text='OneAI Architecture Overview', keep_rpr=False)

            verdict = validate_pptx_translation_delivery(src, bad, target_lang='en-US')
            self.assertFalse(verdict['ok'])
            joined = ','.join(verdict['issues'])
            self.assertIn('residual_cjk_paragraphs', joined)
            self.assertIn('font_size_loss', joined)
            self.assertIn('color_fill_loss', joined)

            telemetry = TelemetryStats()
            os.environ['DSH_SESSION_ATTACHMENTS'] = src.name
            try:
                warn = audit_pptx_workspace_deliverables(
                    str(root),
                    time.time() - 5,
                    '保持格式不变，翻译成英文',
                    [json.dumps({'filePath': str(bad), 'fileName': bad.name})],
                    telemetry,
                )
            finally:
                os.environ.pop('DSH_SESSION_ATTACHMENTS', None)
            self.assertIsNotNone(warn)
            self.assertIn('PPTX 交付质量门禁提示', warn)
            self.assertNotIn('OOXML', warn.upper())
            self.assertTrue(any(g['guard'] == 'pptx_delivery' and g['action'] == 'warn' for g in telemetry.guard_decisions))

    def test_run_fixed_pptx_translation_end_to_end_and_real_fixture_structure(self):
        import ooxml_translate as ot

        def fake_translate(in_json, out_json, target_lang='en-US', batch_size=70, concurrency=4):
            src_map = json.loads(Path(in_json).read_text(encoding='utf-8'))
            translated = {}
            for idx, (k, v) in enumerate(src_map.items()):
                if ot._is_passthrough_text(v):
                    translated[k] = v
                else:
                    translated[k] = f"Item {idx} translated"
            Path(out_json).write_text(json.dumps(translated, ensure_ascii=False), encoding='utf-8')
            return translated

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src = root / 'OneAI架构.pptx'
            _make_sample_pptx(src)
            telemetry = TelemetryStats()
            with patch.object(ot, 'translate_texts', side_effect=fake_translate), \
                 patch('dsh_modules.pptx_workflow._load_pptx_engine', return_value=ot):
                with contextlib.redirect_stdout(io.StringIO()):
                    res = run_fixed_pptx_translation(
                        '保持格式不变，翻译成英文',
                        [src.name],
                        ['.pptx'],
                        str(root),
                        str(BASE / 'skills'),
                        time.time(),
                        time.monotonic() + 30,
                        telemetry,
                    )
            self.assertEqual(len(res.outbound_files), 1)
            self.assertNotIn('OOXML', res.final_text.upper())
            out_name = json.loads(res.outbound_files[0])['fileName']
            self.assertEqual(out_name, 'OneAI架构_EN.pptx')
            self.assertTrue((root / out_name).is_file())
            self.assertTrue(any(g['guard'] == 'pptx_delivery' and g['action'] == 'accept' for g in telemetry.guard_decisions))

            # If real fixture exists locally, verify unpack+pack+validate across all 8 slides without mutating original
            real_fixture = Path(__file__).resolve().parents[4] / 'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/OneAI架构.pptx'
            if real_fixture.is_file():
                shutil.copy2(real_fixture, src)
                with patch.object(ot, 'translate_texts', side_effect=fake_translate), \
                     patch('dsh_modules.pptx_workflow._load_pptx_engine', return_value=ot):
                    with contextlib.redirect_stdout(io.StringIO()):
                        res_real = run_fixed_pptx_translation(
                            '保持格式不变，翻译成英文',
                            [src.name],
                            ['.pptx'],
                            str(root),
                            str(BASE / 'skills'),
                            time.time(),
                            time.monotonic() + 60,
                            TelemetryStats(),
                        )
                self.assertEqual(len(res_real.outbound_files), 1)
                verdict = validate_pptx_translation_delivery(real_fixture, root / 'OneAI架构_EN.pptx', target_lang='en-US')
                self.assertTrue(verdict['ok'], f"Real deck OOXML check failed: {verdict}")
                self.assertEqual(verdict['stats']['slides'], 8)
                self.assertEqual(verdict['stats']['output_cjk_paragraphs'], 0)

    def test_native_pptx_turn_blocks_html_fallback_export(self):
        empty_telemetry = TelemetryStats()
        self.assertFalse(managed_pptx_export(empty_telemetry))

        workflow_telemetry = TelemetryStats()
        workflow_telemetry.record_guard('pptx_translation_workflow', 'direct_execution', {'target': 'OneAI架构_EN.pptx'})
        self.assertTrue(managed_pptx_export(workflow_telemetry))

        delivery_telemetry = TelemetryStats()
        delivery_telemetry.record_guard('pptx_delivery', 'accept', {'fileName': 'OneAI架构_EN.pptx'})
        self.assertTrue(managed_pptx_export(delivery_telemetry))

        # Verify normalized PPTX translation route + ArtifactExporter.export_html does not compile reply into index.html
        routed = SimpleNamespace(
            skill_id='pptx',
            deliverables=['.pptx'],
            is_generate_intent=True,
            is_inspect_intent=False,
            is_guide_intent=False,
            is_ppt_intent=True,
            is_office_intent=False,
            requires_execution=True,
            source_formats=['.pptx'],
            admission={'task_mode': 'execute', 'output_mode': 'artifact'},
        )
        normalized = normalize_pptx_translation_route('保持格式不变，翻译成英文', ['OneAI架构.pptx'], routed, TelemetryStats())
        self.assertFalse(normalized.is_ppt_intent)
        self.assertTrue(normalized.is_office_intent)

        raw_reply = '已完成 PPTX 文档翻译，保留原版式并输出：`OneAI架构_EN.pptx`。'
        history = [
            {'role': 'user', 'content': '帮我翻译附件 OneAI架构.pptx'},
            {'role': 'assistant', 'content': '翻译概览\n\n| 幻灯片 | 原语言 | 翻译内容 |\n| --- | --- | --- |\n| Slide 1 | 中文 | OneAI Topology |'},
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            exported_text, exported_html = ArtifactExporter.export_html(
                final_text=raw_reply,
                is_ppt_intent=normalized.is_ppt_intent,
                workspace_dir=tmpdir,
                turn_start_time=time.time() - 5.0,
                is_design_intent=False,
                prompt='保持格式不变，翻译成英文',
                history=history,
            )
            self.assertEqual(exported_html, [])
            self.assertEqual(exported_text, raw_reply)
            self.assertFalse((Path(tmpdir) / 'index.html').exists())
            self.assertFalse((Path(tmpdir) / 'presentation.html').exists())

    def test_ooxml_translate_preserves_heading_hierarchy_and_shrinks_only_on_overflow(self):
        import ooxml_translate as ot

        slide_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
            # Shape 1: wide 22pt title (800x40pt) — English fits easily despite >3x char length
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="WideTitle"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="10160000" cy="508000"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="zh-CN" sz="2200"><a:latin typeface="Meiryo UI"/></a:rPr>'
            '<a:t>架构与部署参考模型</a:t></a:r></a:p></p:txBody></p:sp>'
            # Shape 2: tight 18pt heading (76x22pt) — 'Conclusion' overflows width -> capped gentle shrink
            '<p:sp><p:nvSpPr><p:cNvPr id="3" name="TightHeading"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="600000"/><a:ext cx="965200" cy="279400"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="1800"><a:latin typeface="Meiryo UI"/></a:rPr>'
            '<a:t>結論</a:t></a:r></a:p></p:txBody></p:sp>'
            # Shape 3: tight 11.5pt body label (90x14pt) — overflows width -> gentle body shrink
            '<p:sp><p:nvSpPr><p:cNvPr id="4" name="TightLabel"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="900000"/><a:ext cx="1143000" cy="177800"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="zh-CN" sz="1150"><a:latin typeface="Meiryo UI"/></a:rPr>'
            '<a:t>外部安全边界防护</a:t></a:r></a:p></p:txBody></p:sp>'
            '</p:spTree></p:cSld></p:sld>'
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '</Types>'
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src = root / 'src.pptx'
            out = root / 'out.pptx'
            pkg = root / 'pkg'
            in_json = root / 'in.json'
            out_json = root / 'out.json'
            with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', slide_xml)

            extracted = ot.unpack_pptx(str(src), str(pkg), str(in_json))
            translated = {
                k: {
                    '架构与部署参考模型': 'Enterprise AIGC Deployment Reference',
                    '結論': 'Conclusion',
                    '外部安全边界防护': 'External Security Boundary',
                }[v]
                for k, v in extracted.items()
            }
            out_json.write_text(json.dumps(translated, ensure_ascii=False), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                ot.pack_pptx(str(pkg), str(out_json), str(out), lang='en-US', auto_fit=True, shrink_font=True)

            with zipfile.ZipFile(out) as zf:
                out_root = ET.fromstring(zf.read('ppt/slides/slide1.xml'))
            ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
            rprs = out_root.findall('.//a:r/a:rPr', ns)
            sz_list = [int(r.attrib['sz']) for r in rprs]
            self.assertEqual(sz_list[0], 2200)          # wide title kept intact despite ~4x chars
            self.assertGreaterEqual(sz_list[1], 1476)   # 18pt heading keeps hierarchy (max 18% drop)
            self.assertLess(sz_list[1], 1800)
            self.assertGreaterEqual(sz_list[2], 920)    # 11.5pt tight label gently shrunk
            self.assertLess(sz_list[2], 1150)

            body_prs = out_root.findall('.//a:bodyPr', ns)
            # Fitting wide title keeps original noAutofit without forced fontScale="80000"
            self.assertIsNotNone(body_prs[0].find('a:noAutofit', ns))
            self.assertIsNone(body_prs[0].find('a:normAutofit', ns))
            # Overflowing boxes use clean <a:normAutofit/> without forced 80% fontScale
            nf1 = body_prs[1].find('a:normAutofit', ns)
            self.assertIsNotNone(nf1)
            self.assertEqual(nf1.attrib, {})

    def test_ooxml_translate_preserves_breaks_and_inherits_bilingual_ea_font(self):
        import ooxml_translate as ot

        self.assertTrue(ot._is_passthrough_text('独自\nプロトコル', target_lang='ja-JP'))
        self.assertTrue(ot._is_passthrough_text('入力をマスキング後にルーティング', target_lang='ja-JP'))
        self.assertTrue(ot._is_passthrough_text('OneAI\nAI Gateway', target_lang='ja-JP'))
        self.assertFalse(ot._is_passthrough_text('阿里云部署区', target_lang='ja-JP'))
        # Katakana middle dot U+30FB inside simplified Chinese must NOT trick ja-JP passthrough
        for leaked in ('浏览器・移动端', '接入・鉴权', '业务数据・元数据', '向量检索・知识库', '统一安全・应用・模型治理'):
            self.assertFalse(ot._is_passthrough_text(leaked, target_lang='ja-JP'))
        self.assertTrue(ot._is_passthrough_text('OneAI End-to-End Architecture', target_lang='en-US'))

        slide_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Pill"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="960120" cy="657860"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="18288" tIns="18288" rIns="18288" bIns="18288" anchor="ctr"/><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="1500" b="1"><a:latin typeface="Meiryo UI"/></a:rPr>'
            '<a:t>独自</a:t></a:r><a:br/><a:r><a:rPr lang="ja-JP" sz="1500" b="1"/><a:t>プロトコル</a:t></a:r></a:p>'
            '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '</Types>'
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src = root / 'src.pptx'
            out = root / 'out.pptx'
            pkg = root / 'pkg'
            in_json = root / 'in.json'
            out_json = root / 'out.json'
            with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', slide_xml)

            extracted = ot.unpack_pptx(str(src), str(pkg), str(in_json))
            out_json.write_text(json.dumps(extracted, ensure_ascii=False), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                ot.pack_pptx(str(pkg), str(out_json), str(out), lang='ja-JP', auto_fit=True, shrink_font=True)

            with zipfile.ZipFile(out) as zf:
                out_root = ET.fromstring(zf.read('ppt/slides/slide1.xml'))
            ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
            p = out_root.find('.//a:p', ns)
            self.assertIsNotNone(p.find('a:br', ns))
            runs = p.findall('a:r', ns)
            self.assertEqual([r.find('a:t', ns).text for r in runs], ['独自', 'プロトコル'])
            for r in runs:
                ea = r.find('a:rPr/a:ea', ns)
                self.assertIsNotNone(ea)
                self.assertEqual(ea.attrib.get('typeface'), 'Meiryo UI')

            # Delivery QA gate for ja-JP must reject residual simplified Chinese leaks
            leaked_out = root / 'leaked_jp.pptx'
            leaked_xml = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
                '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
                '<p:sp><p:nvSpPr><p:cNvPr id="2" name="B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>'
                '<p:txBody><a:bodyPr/><a:lstStyle/>'
                '<a:p><a:r><a:t>接入・鉴权</a:t></a:r></a:p>'
                '<a:p><a:r><a:t>业务数据・元数据</a:t></a:r></a:p>'
                '<a:p><a:r><a:t>向量检索・知识库</a:t></a:r></a:p>'
                '<a:p><a:r><a:t>アクセス側</a:t></a:r></a:p>'
                '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
            )
            with zipfile.ZipFile(leaked_out, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', leaked_xml)
            jp_verdict = validate_pptx_translation_delivery(None, leaked_out, target_lang='ja-JP')
            self.assertFalse(jp_verdict['ok'])
            self.assertIn('residual_simplified_chinese:3', ','.join(jp_verdict['issues']))

    def test_english_layout_optimizations_fonts_peers_dual_runs_wrap_and_indent(self):
        import ooxml_translate as ot

        ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
        # Two aligned 20pt KPI siblings, two wrap="none" pills, bold-colon split, trailing metric,
        # passthrough 82 %, non-CJK Arial preservation, and ASCII leading indent
        slide_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Kpi1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="1000000"/><a:ext cx="2540000" cy="300000"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="2000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>効率12倍</a:t></a:r></a:p>'
            '</p:txBody></p:sp>'
            '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Kpi2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="3000000" y="1000000"/><a:ext cx="2540000" cy="300000"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="2000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>秒速応答75%</a:t></a:r></a:p>'
            '</p:txBody></p:sp>'
            '<p:sp><p:nvSpPr><p:cNvPr id="4" name="Pill1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="1500000"/><a:ext cx="889000" cy="246380"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="1000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>即時利用</a:t></a:r></a:p>'
            '</p:txBody></p:sp>'
            '<p:sp><p:nvSpPr><p:cNvPr id="5" name="Pill2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="1200000" y="1500000"/><a:ext cx="889000" cy="246380"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="1000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>拡張性高</a:t></a:r></a:p>'
            '</p:txBody></p:sp>'
            '<p:sp><p:nvSpPr><p:cNvPr id="6" name="DualRuns"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="2000000"/><a:ext cx="7620000" cy="600000"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="1050" b="1"><a:latin typeface="Arial"/></a:rPr><a:t>方針：</a:t></a:r>'
            '<a:r><a:rPr lang="ja-JP" sz="900"><a:latin typeface="Arial"/></a:rPr><a:t>統一データ管理</a:t></a:r></a:p>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="2000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>検索率</a:t></a:r>'
            '<a:r><a:rPr lang="ja-JP" sz="1000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t> &gt;90%</a:t></a:r></a:p>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="4000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>82</a:t></a:r>'
            '<a:r><a:rPr lang="ja-JP" sz="2000" b="1"><a:latin typeface="Meiryo UI"/></a:rPr><a:t> %</a:t></a:r></a:p>'
            '<a:p><a:r><a:rPr lang="ja-JP" sz="900"><a:latin typeface="Meiryo UI"/></a:rPr><a:t>    24.3%</a:t></a:r></a:p>'
            '</p:txBody></p:sp>'
            '</p:spTree></p:cSld></p:sld>'
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '</Types>'
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src, out, pkg = root / 'src.pptx', root / 'out.pptx', root / 'pkg'
            in_json, out_json = root / 'in.json', root / 'out.json'
            with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', slide_xml)

            extracted = ot.unpack_pptx(str(src), str(pkg), str(in_json))
            translated = {
                k: {
                    '効率12倍': '12x Gains',
                    '秒速応答75%': '75% Inquiries Resolved Fast',
                    '即時利用': 'Ready-to-Use',
                    '拡張性高': 'High Scalability Check',
                    '方針：統一データ管理': 'Policy: Unified data governance across teams',
                    '検索率 >90%': 'RAG Recall >90%',
                    '82 %': '82 %',
                    '24.3%': '24.3%',
                }[v]
                for k, v in extracted.items()
            }
            out_json.write_text(json.dumps(translated, ensure_ascii=False), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                ot.pack_pptx(str(pkg), str(out_json), str(out), lang='en-US', auto_fit=True, shrink_font=True)

            with zipfile.ZipFile(out) as zf:
                out_root = ET.fromstring(zf.read('ppt/slides/slide1.xml'))

            sps = out_root.findall('.//p:sp', {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'})
            # Sibling KPIs & sibling pills are uniformly sized
            kpi1_sz = int(sps[0].find('.//a:rPr', ns).attrib['sz'])
            kpi2_sz = int(sps[1].find('.//a:rPr', ns).attrib['sz'])
            self.assertEqual(kpi1_sz, kpi2_sz)
            self.assertLess(kpi1_sz, 2000)

            pill1_sz = int(sps[2].find('.//a:rPr', ns).attrib['sz'])
            pill2_sz = int(sps[3].find('.//a:rPr', ns).attrib['sz'])
            self.assertEqual(pill1_sz, pill2_sz)
            self.assertEqual(sps[3].find('.//a:bodyPr', ns).attrib.get('wrap'), 'none')

            # Fonts: Meiryo UI -> Calibri; Arial stays Arial
            self.assertEqual(sps[0].find('.//a:rPr/a:latin', ns).attrib.get('typeface'), 'Calibri')
            self.assertEqual(sps[4].find('.//a:p[1]//a:rPr/a:latin', ns).attrib.get('typeface'), 'Arial')

            # Dual runs & passthrough & indent
            paras = sps[4].findall('.//a:p', ns)
            p0_runs = paras[0].findall('a:r', ns)
            self.assertEqual(len(p0_runs), 2)
            self.assertEqual(p0_runs[0].find('a:rPr', ns).attrib.get('b'), '1')
            self.assertIsNone(p0_runs[1].find('a:rPr', ns).attrib.get('b'))
            self.assertEqual(p0_runs[0].find('a:rPr', ns).attrib.get('sz'), '1050')
            self.assertEqual(p0_runs[1].find('a:rPr', ns).attrib.get('sz'), '900')

            p1_runs = paras[1].findall('a:r', ns)
            self.assertEqual(len(p1_runs), 2)
            self.assertEqual(p1_runs[0].find('a:rPr', ns).attrib.get('sz'), '2000')
            self.assertEqual(p1_runs[1].find('a:rPr', ns).attrib.get('sz'), '1000')

            p2_runs = paras[2].findall('a:r', ns)
            self.assertEqual([r.find('a:rPr', ns).attrib.get('sz') for r in p2_runs], ['4000', '2000'])
            self.assertEqual(paras[3].find('.//a:t', ns).text, '    24.3%')

    def test_ooxml_translate_preserves_mc_alternate_content_and_p14_prefixes(self):
        import ooxml_translate as ot

        slide_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2540000" cy="400000"/></a:xfrm></p:spPr>'
            '<p:txBody><a:bodyPr/><a:lstStyle/>'
            '<a:p><a:r><a:rPr lang="zh-CN" sz="1800"/><a:t>竞选班干部</a:t></a:r></a:p>'
            '</p:txBody></p:sp></p:spTree></p:cSld>'
            '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
            'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">'
            '<mc:Choice Requires="p14"><p:transition p14:dur="4000"><p14:vortex dir="r"/></p:transition></mc:Choice>'
            '<mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback>'
            '</mc:AlternateContent></p:sld>'
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '</Types>'
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            src, out, pkg = root / 'src.pptx', root / 'out.pptx', root / 'pkg'
            in_json, out_json = root / 'in.json', root / 'out.json'
            with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', slide_xml)

            extracted = ot.unpack_pptx(str(src), str(pkg), str(in_json))
            out_json.write_text(
                json.dumps({k: 'クラス役員選挙' for k in extracted}, ensure_ascii=False),
                encoding='utf-8',
            )
            with contextlib.redirect_stdout(io.StringIO()):
                ot.pack_pptx(str(pkg), str(out_json), str(out), lang='ja-JP')

            with zipfile.ZipFile(out) as zf:
                out_slide = zf.read('ppt/slides/slide1.xml').decode('utf-8')
            self.assertIn('<p:sld ', out_slide)
            self.assertIn('xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"', out_slide)
            self.assertIn('Requires="p14"', out_slide)
            self.assertNotIn('xmlns:ns', out_slide)
            verdict = validate_pptx_translation_delivery(src, out, target_lang='ja-JP')
            self.assertTrue(verdict['ok'], f'Expected clean OOXML namespaces, got {verdict}')

            # Simulate mangled ns5/Requires='p14' file -> QA gate must catch it before delivery
            broken = root / 'broken.pptx'
            with zipfile.ZipFile(broken, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('[Content_Types].xml', content_types)
                zf.writestr('ppt/slides/slide1.xml', out_slide.replace('xmlns:p14=', 'xmlns:ns5=').replace('p14:', 'ns5:'))
            bad_verdict = validate_pptx_translation_delivery(src, broken, target_lang='ja-JP')
            self.assertFalse(bad_verdict['ok'])
            self.assertIn('undeclared_xml_prefix:slide1.xml(p14)', ','.join(bad_verdict['issues']))


if __name__ == '__main__':
    unittest.main()
