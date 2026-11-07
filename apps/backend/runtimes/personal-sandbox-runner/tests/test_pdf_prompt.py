import unittest
from dsh_modules.prompt_builder import build_user_turn
from dsh_modules.pdf_prompt import pdf_execution_guidance


class PDFPromptTests(unittest.TestCase):
    def test_managed_pdf_has_no_bash_or_fpdf_requirements(self):
        text = build_user_turn('生成2页PDF', is_generate_intent=True,
                               available_tool_names=['render_pdf', 'inspect_pdf_page'])
        self.assertIn('使用 render_pdf', text)
        self.assertNotIn('你必须调用 `bash`', text)
        self.assertNotIn('初始化 FPDF', text)
        self.assertNotIn('直到文件成功', text)

    def test_shell_fallback_uses_owned_generator(self):
        text = pdf_execution_guidance('生成PDF讲义', ['bash', 'vision_inspect'])
        self.assertIn('generate_report_pdf.py', text)
        self.assertNotIn('pdf.add_font', text)

    def test_explicit_fpdf_has_correct_font_contract(self):
        text = pdf_execution_guidance('使用 FPDF 创建 PDF', ['bash'])
        self.assertIn("pdf.add_font('NotoSC', '',", text)
        self.assertIn("pdf.set_font('NotoSC', size=12)", text)
        self.assertIn('未另行注册真实 B/I', text)
        self.assertIn('self.h/self.w', text)
        self.assertNotIn('uni=True', text)

    def test_read_only_pdf_question_does_not_require_generation(self):
        text = build_user_turn('解释这个 PDF', is_inspect_intent=True, available_tool_names=['read_file'])
        self.assertNotIn('【PDF 执行与验收】', text)
        self.assertNotIn('执行 Python 脚本', text)

    def test_missing_tool_does_not_invent_shell_access(self):
        self.assertIn('缺少生成能力时如实说明', pdf_execution_guidance('生成PDF', ['read_file']))

    def test_translate_pdf_uses_high_fidelity_guidance(self):
        text = pdf_execution_guidance('翻译这个问题，保持格式不变，生成中文版的pdf', ['bash'])
        self.assertIn('PDF 高保真翻译与版式保留', text)
        self.assertIn('高保真科学定义', text)
        self.assertIn('PyMuPDF/fitz', text)
        self.assertIn('flow_pdf_translate.py', text)

    def test_planning_pdf_translate_guidance(self):
        from dsh_modules.planning_phase import build_deliverable_execution_instruction
        from unittest.mock import MagicMock

        skill_res = MagicMock()
        skill_res.deliverables = ['/workspace/2507.03009v4_中文版.pdf']
        skill_res.skill_id = 'pdf'
        skill_res.is_office_intent = True
        skill_res.is_ppt_intent = False
        skill_res.is_docx_intent = False
        skill_res.is_design_intent = False

        prompt = '翻译这个问题，保持格式不变，生成中文版的pdf'
        plan = build_deliverable_execution_instruction(skill_res, prompt)
        self.assertIn('高保真 PDF 翻译落盘阶段', plan)
        self.assertIn('flow_pdf_translate.py', plan)
        self.assertIn('auto', plan)
