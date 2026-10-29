import json
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from dsh_modules.pdf_content_workflow import CONTENT_INSTRUCTION, content_parameters, content_budget
from dsh_modules.pdf_review_contract import validate_review, REVIEW_INSTRUCTION
from dsh_modules.pdf_workflow import PDF_EDITORIAL_INSTRUCTION
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats


class GenericPDFTests(unittest.TestCase):
    def skill(self):
        return SimpleNamespace(skill_id='pdf', is_generate_intent=True, deliverables=['.pdf'],
            is_guide_intent=False, is_research_intent=False, source_formats=[])

    def test_different_topics_keep_their_own_page_content(self):
        for title in ['旅行准备清单', '实验室安全手册', '阅读交流指南']:
            source=json.dumps({'pages':[f'## {title}\n本主题内容']},ensure_ascii=False)
            params=content_parameters(source,{'title':title,'max_pages':1})
            self.assertIn(title,params['pages'][0])
            self.assertNotIn('自然观察',params['pages'][0])

    def test_instruction_has_no_prior_case_editorial_content(self):
        for word in ['石头','昨天','动物','叶片','leaf.svg','250个','小学生']:
            self.assertNotIn(word,CONTENT_INSTRUCTION + PDF_EDITORIAL_INSTRUCTION + REVIEW_INSTRUCTION)

    def test_pages_are_structured_and_budget_scales(self):
        bound={'max_pages':2,'min_pages':2}
        params=content_parameters(json.dumps({'pages':['## 第一页\n正文','## 第二页\n正文']}),bound)
        self.assertEqual(len(params['pages']),2)
        self.assertNotIn('markdown',params)
        self.assertGreater(content_budget({'max_pages':8},RuntimePolicy())[0],content_budget(bound,RuntimePolicy())[0])
        with self.assertRaises(ValueError):content_parameters('{"pages":[],"title":"wrong"}',bound)

    def test_required_content_repairs_cannot_hide_behind_pass(self):
        for text in ['【文档/图片】:\nREPAIR\n重复段落，请删除。',
                     '【文档/图片】:\nPASS\n1. 内容重复，建议精简。']:
            with self.assertRaises(ValueError):validate_review(text)
        validate_review('【文档/图片】:\nPASS\nOPTIONAL: 标题颜色可调整。')
        validate_review('【文档/图片】:\nPASS\n无裁切、无缺字。')

    def test_task_lists_render_real_print_boxes(self):
        import os, sys
        scripts=os.environ.get('PDF_DESIGN_SCRIPTS')
        if not scripts:self.skipTest('PDF engine runtime required')
        sys.path.insert(0,scripts)
        from pdf_design.content import markdown_html
        html=markdown_html('- [ ] 水杯\n- [x] 纸巾')
        self.assertEqual(html.count('class="print-checkbox"'),2)
        self.assertNotIn('[ ]',html)
        self.assertIn('checklist-item',html)

    def test_empty_fields_expand_but_filled_values_remain(self):
        from dsh_modules.pdf_handout_quality import expand_record_tables
        prompt='包含日期、地点、发现三项记录卡'
        empty='**日期：**\n\n**地点：**\n\n**发现：**'
        self.assertIn('class="record-card"',expand_record_tables(empty,prompt))
        filled=empty+'\n发现了一只小鸟'
        self.assertEqual(expand_record_tables(filled,prompt),filled)

    def test_combined_metadata_echo_is_removed_without_deleting_prose(self):
        from dsh_modules.pdf_task_contract import remove_metadata_echoes
        source='**副标题** · 作者\n正文谈论副标题和作者的故事'
        result=remove_metadata_echoes(source,{'subtitle':'副标题','author':'作者'})
        self.assertNotIn('**副标题**',result)
        self.assertIn('正文谈论副标题和作者的故事',result)

    def test_other_topics_render_without_case_content_or_illustration(self):
        import os, tempfile
        if not os.environ.get('PDF_DESIGN_SCRIPTS'):self.skipTest('PDF engine runtime required')
        from dsh_modules.pdf_render_tool import render_pdf
        for title, items in [('旅行清单', ['车票','水杯']), ('会议指南', ['议题','材料'])]:
            with tempfile.TemporaryDirectory() as directory:
                text='## '+title+'\n\n'+'\n'.join('- [ ] '+item for item in items)
                result=render_pdf({'pages':[text],'output_path':'example.pdf','template':'handout',
                                  'title':title,'min_pages':1,'max_pages':1},directory,
                                  str(Path(os.environ['PDF_DESIGN_SCRIPTS']).parents[1])).tool_result
                self.assertFalse(result.is_error,result.error_message)
                content=result.data['pages'][0]['text']
                self.assertIn(title,content)
                self.assertNotIn('石头',content)
                self.assertNotIn('叶片',content)
                self.assertNotIn('[ ]',content)

    def test_admission_echo_compatibility_preserves_contract(self):
        from dsh_modules.skill_admission import normalize_admission_echo
        intent={'task_mode':'execute','output_mode':'artifact'}
        verdict={'action':'use','skill_id':'pdf','use_default_rules':False,'rule_basis':'','reason':'applicable','question':''}
        self.assertEqual(normalize_admission_echo({**verdict,**intent},intent),verdict)
        self.assertEqual(normalize_admission_echo({**verdict,'task_contract':intent},intent),verdict)
        with self.assertRaises(ValueError):normalize_admission_echo({**verdict,'output_mode':'conversation'},intent)
        with self.assertRaises(ValueError):normalize_admission_echo({**verdict,'unknown':'value'},intent)

    def test_form_scaffolding_and_spaced_bold_are_normalized(self):
        from dsh_modules.pdf_handout_quality import expand_record_tables
        from dsh_modules.pdf_task_contract import prepare_handout_content
        source='| 项目 | 内容 |\n| --- | --- |\n| ** 日期 ** | ____年__月__日 |\n| ** 地点** | （填写） |'
        normalized=prepare_handout_content(source)
        self.assertIn('**日期**',normalized)
        rendered=expand_record_tables(normalized,'包含日期、地点两项记录卡')
        self.assertIn('class="record-card"',rendered)
        self.assertNotIn('____',rendered)
        self.assertNotIn('**',rendered)

    def test_user_page_headings_work_with_markdown_or_bold(self):
        from dsh_modules.pdf_task_contract import align_requested_page_headings
        text='## 起点\n第一部分\n\n**执行方法**\n第二部分'
        aligned=align_requested_page_headings(text,'第1页：起点。第2页：执行方法、检查。')
        self.assertIn('<!-- pagebreak -->',aligned)
        self.assertEqual(aligned.split('<!-- pagebreak -->')[1].strip(),'**执行方法**\n第二部分')
        validate_review('【文档/图片】:\nPASS\n1. 无重复，无需修复。')
