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
