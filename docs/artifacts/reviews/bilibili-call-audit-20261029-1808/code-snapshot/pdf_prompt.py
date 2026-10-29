"""PDF execution guidance follows the actual tool surface; fonts belong to renderers."""
import re


def pdf_execution_guidance(prompt, tool_names=None):
    names = set(tool_names or [])
    common = ('【PDF 执行与验收】\n生成文件须保存到 /workspace/，完成内容、字体、分页和逐页预览检查后再交付。'
              '失败时根据具体错误有限修复，连续失败应停止并说明原因，不得无限重试或宣称已完成。\n')
    if 'render_pdf' in names:
        return common + ('使用 render_pdf 提交完整正文与用户指定的版式；字体、字重和分页由固定模板负责。'
                         '不编写 FPDF 脚本，不自行安装或下载字体。使用本轮提供的预览工具逐页验收。')
    if 'bash' not in names:
        return '【PDF 能力边界】仅使用本轮实际提供的工具；缺少生成能力时如实说明，不调用未提供的 bash 或承诺已生成文件。'
    if not re.search(r'\bfpdf2?\b|精确坐标|自定义绘制', prompt, re.I):
        return common + ('新建普通文档：先写 Markdown，再通过 bash 调用固定生成器 '
            '`python3 /opt/dsh/skills/pdf/scripts/generate_report_pdf.py --input /workspace/report.md '
            '--output /workspace/report.pdf --template report --theme warm`；文件名、版式与主题按用户要求调整。'
            '转换、合并、填写或编辑已有 PDF 时使用对应处理工具，不重新编写整份文档。'
            '模板预置中文 Regular/Bold，无需手写 FPDF 字体逻辑。')
    return common + '''仅因用户明确要求才使用 FPDF。先用最小中文页确认字体可用，再扩展布局。
字体文件路径与字体族名不同，必须先注册再引用：
from fpdf import FPDF
pdf = FPDF()
pdf.add_font('NotoSC', '', '/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf')
pdf.add_page()
pdf.set_font('NotoSC', size=12)
pdf.cell(text='中文字体检查')
pdf.output('/workspace/font-check.pdf')
此文件只注册常规样式；未另行注册真实 B/I 字体前，不使用 style='B' 或 'I'，可用字号和颜色强调。
不使用已弃用的 uni 参数，不把字体路径传给 set_font。不要定义 title/pages 等与 FPDF 实例属性同名的方法。
实例方法内使用 self.h/self.w 读取页面尺寸，不猜测 PH/PW 属性，不引用未定义的 pdf 局部变量。'''
