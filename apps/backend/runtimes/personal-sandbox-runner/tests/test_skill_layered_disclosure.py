"""Layered progressive disclosure and bounded skill admission tests."""

import io
import json
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.skill_admission import AdmissionUnavailable, admit_skill
from dsh_modules.skill_disclosure import (
    DEFAULT_ADMISSION_BODY_BUDGET,
    build_admission_catalog,
    build_layered_skill_body,
)
from dsh_modules.skill_router import SkillRoutingResult
from dsh_modules.skills import read_skill
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_routing import select_active_tools
from dsh_modules.tools import execute_tool


class LayeredSkillDisclosureTests(unittest.TestCase):
    def test_xlsx_skill_level1_overview_and_on_demand_sections(self):
        overview = read_skill('xlsx')
        self.assertIn('recalc.py', overview)
        self.assertIn('openpyxl', overview)
        self.assertIn('【可用未展开章节', overview)
        self.assertLess(len(overview), 5000)

        trans_view = read_skill('xlsx', prompt='请帮我把这份日文 Excel 文件翻译成中文')
        self.assertIn('translation.md', trans_view)
        self.assertIn('【可用未展开章节', trans_view)
        self.assertIn('audit', trans_view)

        audit_section = read_skill('xlsx', section='audit')
        self.assertIn('compare_spreadsheet_columns', audit_section)

    def test_execute_tool_read_skill_forwards_section(self):
        out = execute_tool('read_skill', {'skill_name': 'xlsx', 'section': 'generation'})
        self.assertIn('recalc.py', out)
        self.assertIn('_xlfn.TEXTJOIN', out)

    def test_tool_routing_retains_read_skill_only_when_unloaded_sections_remain(self):
        partial_route = SkillRoutingResult(
            skill_id='xlsx',
            skill_context='overview',
            is_generate_intent=True,
            requires_execution=True,
            has_unloaded_sections=True,
        )
        tools_partial = select_active_tools('生成一页的Excel财务报表', partial_route, False, False)
        self.assertIn('read_skill', {t['function']['name'] for t in tools_partial})

        complete_route = SkillRoutingResult(
            skill_id='xlsx',
            skill_context='full',
            is_generate_intent=True,
            requires_execution=True,
            has_unloaded_sections=False,
        )
        tools_complete = select_active_tools('生成一页的Excel财务报表', complete_route, False, False)
        self.assertNotIn('read_skill', {t['function']['name'] for t in tools_complete})

    def test_catalog_truncates_descriptions_and_preserves_priority_candidates(self):
        skills = [
            {'id': f'cert-{i}', 'name': f'技能{i}', 'description': '长描述' * 120, 'type': 'certified'}
            for i in range(20)
        ]
        skills.append({
            'id': 'custom-user-flow',
            'name': '自定义归档',
            'description': '按部门汇总并返回表格',
            'type': 'custom',
        })
        rank = {'cert-0': 10, 'cert-5': 5, 'custom-user-flow': 0}
        catalog = build_admission_catalog(skills, rank, provisional_id='cert-18', max_detailed=5, desc_chars=120)

        by_id = {entry['id']: entry for entry in catalog}
        self.assertEqual(len(catalog), 21)
        self.assertLessEqual(len(by_id['cert-0']['description']), 120)
        self.assertIn('description', by_id['cert-18'])
        self.assertIn('description', by_id['custom-user-flow'])
        self.assertNotIn('description', by_id['cert-19'])

    def test_oversize_single_file_skill_is_sliced_without_admission_crash(self):
        giant_sections = '\n\n'.join([
            '# Design Craft Skill\n核心设计规范概览，涵盖字体、色彩、交互与数据展示。',
            '## Typography & Scale\n使用清晰字体层级，标题与正文字号拉开对比。\n' + ('A' * 22000),
            '## Color System\n主色与辅助色严格保持 WCAG 对比度要求。\n' + ('B' * 22000),
            '## Data Tables\n表格对齐数字与百分比，保持固定表头与清晰留白。\n' + ('C' * 25000),
            '## Motion & Micro-interactions\n微交互过渡时长保持在 150ms 至 250ms。\n' + ('D' * 22000),
        ])
        self.assertGreater(len(giant_sections), 85000)

        skills = [{'id': 'taste-skill', 'name': '设计品味规范', 'description': 'UI 设计与排版规范', 'type': 'certified'}]
        request = '设计一个包含清晰字体层级的网页卡片'
        intent = {
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['.html'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'goal', 'quote': request}],
            'question': '',
        }
        seen_payloads = []

        def fake_model(messages, **kwargs):
            payload = json.loads(messages[-1]['content'])
            seen_payloads.append(payload)
            return {
                'finish_reason': 'tool_calls',
                'content': '',
                'tool_calls': [{
                    'type': 'function',
                    'function': {
                        'name': kwargs['tools'][0]['function']['name'],
                        'arguments': json.dumps({
                            'action': 'use',
                            'skill_id': 'taste-skill',
                            'use_default_rules': False,
                            'rule_basis': '',
                            'reason': 'applicable',
                            'question': '',
                        }),
                    },
                }],
            }

        provisional = SkillRoutingResult(skill_id='taste-skill', is_generate_intent=True, deliverables=['.html'])
        telemetry = TelemetryStats()
        with patch('dsh_modules.skill_admission.extract_task_intent', return_value=intent), \
             patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=fake_model), \
             redirect_stdout(io.StringIO()):
            routed = admit_skill(
                request, [], [], provisional, 'mock-model', None, telemetry,
                time.monotonic() + 30, available_skills=skills,
                read_body=lambda _sid: giant_sections,
            )

        self.assertEqual(len(seen_payloads), 1)
        injected = seen_payloads[0]['inspected_skills']['taste-skill']
        self.assertLessEqual(len(injected), DEFAULT_ADMISSION_BODY_BUDGET)
        self.assertIn('【可用未展开章节', injected)
        self.assertTrue(routed.has_unloaded_sections)

    def test_explicit_inspect_expands_requested_section_before_use(self):
        big_body = '\n\n'.join([
            '# Workbook Craft\n工作簿处理总览。',
            '## Alpha Section\n' + ('X' * 10000),
            '## Translation & Fonts\n日文转中文时需映射微软雅黑并保护前缀。\n' + ('Y' * 8000),
        ])
        skills = [{'id': 'custom-craft', 'name': '文档规范', 'description': '处理复杂文档排版', 'type': 'certified'}]
        request = '请按文档规范把表格本地化为中文'
        intent = {
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['.xlsx'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'goal', 'quote': request}],
            'question': '',
        }
        seen_payloads = []

        def fake_model(messages, **kwargs):
            payload = json.loads(messages[-1]['content'])
            seen_payloads.append(payload)
            if len(seen_payloads) == 1:
                args = {
                    'action': 'inspect',
                    'skill_id': 'custom-craft',
                    'section': 'Translation & Fonts',
                    'use_default_rules': False,
                    'rule_basis': '',
                    'reason': 'applicable',
                    'question': '',
                }
            else:
                args = {
                    'action': 'use',
                    'skill_id': 'custom-craft',
                    'use_default_rules': False,
                    'rule_basis': '',
                    'reason': 'applicable',
                    'question': '',
                }
            return {
                'finish_reason': 'tool_calls',
                'content': '',
                'tool_calls': [{'type': 'function', 'function': {'name': kwargs['tools'][0]['function']['name'], 'arguments': json.dumps(args)}}],
            }

        provisional = SkillRoutingResult(skill_id='custom-craft', is_generate_intent=True, deliverables=['.xlsx'])
        telemetry = TelemetryStats()
        with patch('dsh_modules.skill_admission.extract_task_intent', return_value=intent), \
             patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=fake_model), \
             redirect_stdout(io.StringIO()):
            routed = admit_skill(
                request, [], [], provisional, 'mock-model', None, telemetry,
                time.monotonic() + 30, available_skills=skills,
                read_body=lambda _sid: big_body,
            )

        self.assertEqual(len(seen_payloads), 2)
        self.assertIn('日文转中文时需映射微软雅黑', seen_payloads[1]['inspected_skills']['custom-craft'])
        self.assertEqual(routed.skill_id, 'custom-craft')
        actions = [d.get('action') for d in telemetry.guard_decisions]
        self.assertIn('inspect_section', actions)

    def test_layered_slice_direct_section_match_respects_budget(self):
        long_doc = '# Root\nIntro\n\n## Sec1\nFirst details.\n\n## Sec2\n' + ('Z' * 20000)
        layered = build_layered_skill_body('demo', long_doc, section='Sec2', max_chars=2500)
        self.assertLessEqual(len(layered['text']), 2500)
        self.assertIn('Sec2', layered['loaded_sections'])
        self.assertTrue(layered['has_unloaded'])


if __name__ == '__main__':
    unittest.main()
