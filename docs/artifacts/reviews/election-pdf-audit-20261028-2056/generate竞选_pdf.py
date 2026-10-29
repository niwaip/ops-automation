from fpdf import FPDF
import os

FONT_PATH = '/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf'

class MyFPDF(FPDF):
    def header(self):
        self.set_draw_color(46, 142, 210)
        self.set_line_width(0.6)
        self.line(10, 10, 200, 10)
        if self.page_no() > 1:
            self.set_font('Noto', size=8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, text='小学生班干部竞选自荐书', align='C')
            self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_draw_color(46, 142, 210)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)
        self.set_font('Noto', size=7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, text=f'第 {self.page_no()} 页', align='C')


pdf = MyFPDF(orientation='P', unit='mm', format='A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(15, 15, 15)

pdf.add_font('Noto', '', FONT_PATH)
pdf.add_font('Noto', 'B', FONT_PATH)

# ========== 第1页：封面 + 自我介绍部分 ==========
pdf.add_page()

# 标题
pdf.set_font('Noto', 'B', 26)
pdf.set_text_color(46, 142, 210)
pdf.cell(0, 22, text='竞选班干部 自荐书', align='C', new_x="LMARGIN", new_y="NEXT")
pdf.ln(3)

pdf.set_draw_color(46, 142, 210)
pdf.set_line_width(0.6)
pdf.line(60, pdf.get_y(), 150, pdf.get_y())
pdf.ln(8)

# 基本信息
info_items = [
    ('姓名：小明    班级：三年级二班', ''),
    ('学号：20230315    日期：2026年10月', ''),
]

pdf.set_font('Noto', 'B', 14)
pdf.set_text_color(60, 60, 60)
for line, _ in info_items:
    pdf.cell(0, 12, text=line, new_x="LMARGIN", new_y="NEXT")

pdf.ln(5)
pdf.set_font('Noto', '', 10)
pdf.set_text_color(140, 140, 140)
pdf.cell(0, 6, text='用心服务同学  用爱建设班级', align='C', new_x="LMARGIN", new_y="NEXT")

pdf.ln(8)

# 自我介绍标题
pdf.set_font('Noto', 'B', 16)
pdf.set_text_color(46, 142, 210)
pdf.cell(0, 14, text='一、自我介绍', new_x="LMARGIN", new_y="NEXT")
pdf.set_draw_color(46, 142, 210)
pdf.set_line_width(0.4)
pdf.line(10, pdf.get_y(), 50, pdf.get_y())
pdf.ln(5)

pdf.set_font('Noto', size=11)
pdf.set_text_color(50, 50, 50)

intro = [
    "尊敬的老师，亲爱的同学们：大家好！",
    "",
    "我是三年级二班的小明，今天很高兴站在这里竞选班干部。我性格开朗，乐于",
    "助人，热爱学习，团结同学。在班里我总是主动帮助遇到困难的同学，是同学",
    "们信赖的好朋友。",
    "",
    "我热爱阅读，尤其喜欢科普类书籍，知识面比较广。我也喜欢运动和画画，常",
    "参加学校组织的各项活动。我相信，作为班干部不仅要把自己的学习搞好，更",
    "要为班级服务，帮助同学们一起进步。",
    "",
    "我做事认真负责，从不马虎。如果我当选班干部，我会以身作则，带头遵守",
    "纪律，成为老师的好帮手，同学们的好伙伴。",
]

for line in intro:
    if line:
        pdf.multi_cell(0, 7, text=line)
        pdf.ln(1)
    else:
        pdf.ln(3)

# ========== 第2页：个人荣誉与优势 ==========
pdf.add_page()

pdf.set_font('Noto', 'B', 16)
pdf.set_text_color(46, 142, 210)
pdf.cell(0, 14, text='二、个人荣誉与优势', new_x="LMARGIN", new_y="NEXT")
pdf.set_draw_color(46, 142, 210)
pdf.set_line_width(0.4)
pdf.line(10, pdf.get_y(), 55, pdf.get_y())
pdf.ln(5)

pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(40, 40, 40)
pdf.cell(0, 10, text='【我的优势】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

pdf.set_font('Noto', size=11)
pdf.set_text_color(50, 50, 50)

advantages = [
    "1. 学习成绩优良，各科成绩均在班级前列，乐于帮助同学。",
    "2. 责任心强，做事踏实认真，能按时完成任务。",
    "3. 有良好的沟通和组织能力，善于协调同学关系。",
    "4. 热爱集体，积极参加各项活动，有很强的荣誉感。",
    "5. 尊敬师长，团结同学，具有良好的品德和行为习惯。",
]

for adv in advantages:
    pdf.multi_cell(0, 7, text=adv)
    pdf.ln(2)

pdf.ln(2)
pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(40, 40, 40)
pdf.cell(0, 10, text='【主要荣誉】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

honor_list = [
    "  2025-2026学年 校级\"三好学生\"",
    "  2025-2026学年 校级\"优秀少先队员\"",
    "  2025年度 校\"数学竞赛\"二等奖",
    "  2024-2025学年 连续两学期\"优秀班干部\"",
    "  在校运会中荣获\"接力赛\"团体第一名",
    "  多次获得班级\"学习标兵\"和\"纪律标兵\"",
]

for honor in honor_list:
    pdf.multi_cell(0, 7, text=honor)
    pdf.ln(2)

pdf.ln(2)
pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(40, 40, 40)
pdf.cell(0, 10, text='【担任过的职务】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

duties = [
    "  二年级至三年级 担任数学课代表",
    "  二年级 担任小组组长，带领组员学习",
    "  经常担任班级活动小主持人",
]

for duty in duties:
    pdf.multi_cell(0, 7, text=duty)
    pdf.ln(2)

# ========== 第3页：竞选目标与宣言 ==========
pdf.add_page()

pdf.set_font('Noto', 'B', 16)
pdf.set_text_color(46, 142, 210)
pdf.cell(0, 14, text='三、竞选目标与宣言', new_x="LMARGIN", new_y="NEXT")
pdf.set_draw_color(46, 142, 210)
pdf.set_line_width(0.4)
pdf.line(10, pdf.get_y(), 50, pdf.get_y())
pdf.ln(5)

# 竞选岗位
pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(40, 40, 40)
pdf.cell(0, 10, text='【竞选岗位】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

pdf.set_font('Noto', size=11)
pdf.set_text_color(50, 50, 50)
pdf.multi_cell(0, 7, text='学习委员 / 班长')
pdf.ln(5)

# 工作规划
pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(40, 40, 40)
pdf.cell(0, 10, text='【工作规划】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

plan_items = [
    "1. 以身作则，带头遵守纪律，为同学们树立榜样。",
    "2. 做老师的小助手：收发作业，反映同学们的学习情况。",
    "3. 做同学的好伙伴：关心帮助学习有困难的同学，组织",
    "   学习小组，让大家一起进步。",
    "4. 积极维护班级荣誉，带头参加各项活动。",
    "5. 做好沟通桥梁：传达老师要求，反映同学们的心声。",
]

for item in plan_items:
    if item:
        pdf.multi_cell(0, 7, text=item)
        pdf.ln(1)
    else:
        pdf.ln(2)

# 竞选宣言
pdf.ln(3)
pdf.set_font('Noto', 'B', 14)
pdf.set_text_color(46, 142, 210)
pdf.cell(0, 10, text='【竞选宣言】', new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

pdf.set_font('Noto', 'B', 12)
pdf.set_text_color(50, 50, 50)

decl_lines = [
    "如果我当选班干部，我一定不辜负老师和同学们对我的信任！",
    "我会用实际行动，成为一名优秀、大家喜欢的班干部！让我们",
    "班成为最优秀、最温暖的班级！",
    "",
    "如果我没有当选，也不会灰心，我会继续努力，完善自己！",
]

for line in decl_lines:
    if line:
        pdf.multi_cell(0, 7, text=line)
        pdf.ln(1)
    else:
        pdf.ln(3)

# ========== 第4页：结尾页 ==========
pdf.add_page()

pdf.ln(30)

# 装饰元素
pdf.set_font('Noto', '', 22)
pdf.set_text_color(255, 180, 50)
pdf.cell(0, 20, text='⭐ 请投我一票！ ⭐', align='C', new_x="LMARGIN", new_y="NEXT")
pdf.ln(8)

pdf.set_font('Noto', '', 14)
pdf.set_text_color(60, 60, 60)
pdf.multi_cell(0, 8, text='请大家支持我，投我一票！谢谢大家！')
pdf.ln(15)

# 分割线
pdf.set_draw_color(46, 142, 210)
pdf.set_line_width(0.5)
pdf.line(60, pdf.get_y(), 150, pdf.get_y())
pdf.ln(10)

pdf.cell(0, 8, text='三年级二班 小明', align='C', new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 8, text='2026年10月', align='C', new_x="LMARGIN", new_y="NEXT")

pdf.ln(10)
pdf.set_font('Noto', '', 10)
pdf.set_text_color(140, 140, 140)
pdf.cell(0, 6, text='感谢老师和同学们的聆听与支持！', align='C', new_x="LMARGIN", new_y="NEXT")

# 保存输出
output_path = '/workspace/小学生竞选班干部自荐书.pdf'
pdf.output(output_path)
print(f"SUCCESS: {output_path}, pages={pdf.page_no()}, size={os.path.getsize(output_path)}")

