"""Select the owned PDF renderer for new documents, without constraining conversion/editing."""

import re


def is_template_pdf_task(prompt, skill):
    if getattr(skill, 'skill_id', None) != 'pdf' or not getattr(skill, 'is_generate_intent', False):
        return False
    if getattr(skill, 'is_guide_intent', False) or getattr(skill, 'is_research_intent', False):
        return False
    from .skill_router import is_text_only_request
    if is_text_only_request(prompt):
        return False
    # Preserve source-document workflows, explicit engine choices and external research.
    if getattr(skill, 'source_formats', None):
        return False
    if re.search(r'当前轮次用户上传附件|当前会话有效附件清单|\.(?:docx?|xlsx?|csv|pptx?)\b|'
                 r'(?:基于|读取|根据).{0,60}\.pdf|图表|统计|计算|柱状图|折线图|饼图', prompt, re.I):
        return False
    if re.search(r'转换|转为|转成|合并|拆分|加密|解密|水印|填写|填报|表单|修改现有|'
                 r'fpdf|reportlab|精确坐标|联网|搜索|检索|调研|实时|最新', prompt, re.I):
        return False
    targets = getattr(skill, 'deliverables', None) or []
    named_pdfs = {str(t).rsplit('/', 1)[-1] for t in targets
                  if not str(t).startswith('.') and str(t).lower().endswith('.pdf')}
    if len(named_pdfs) > 1:
        return False
    return all(str(t).lower().endswith(('.pdf', '.md')) for t in targets)


PDF_EXECUTION_INSTRUCTION = """
【PDF 模板执行】直接调用 render_pdf，提交完整 Markdown 内容和用户指定的文件名、版式、主题、
标题、副标题、署名与页数范围，不编写 Python/FPDF 排版脚本。明确两页就传 min_pages=2、max_pages=2，
必须使用 pages 数组，每项为一页完整 Markdown，由程序插入分页。
要求两页就提交两个完整字符串，不用横线或第2页标题代替分页，不提交内容占位说明。列表、引用浅色提示块、表格均由模板排版；叶片示意图可写
![叶片示意](leaf.svg)，工具提供本地叶片素材。不得把示例文档整体当成用户任务。
render_pdf 之后运行时自动逐页调用 inspect_pdf_page，核对本轮正确 PNG；无需再花一轮选择图片。
不要猜测 PNG 路径，不调用 vision_inspect。所有页通过后运行时自动发布最终 PDF；
检查错误会回传，请修正内容并重新 render_pdf，运行时会复核全部页。
验收结束再简洁交付最终 PDF。
不要使用 emoji、额外封面、大段寄语或每节分隔线装饰；第1页的简介与其他内容保持同页。
精简措辞时保留用户指定的全部表头、对象、问题、记录卡和插图，不改成样例中的其他对象。
准备清单使用简短列表，温馨提示和记录方法使用明确小标题。记录卡留空供填写；不要编造日期、
天气、地点或个人信息。面向小学生使用简洁中文，不夹杂不必要的英文。
主标题、副标题、署名由工具统一排版，不在正文重复这些元信息。简介只用一两句。
天气、日期、地点等记录卡字段不是实时天气查询请求。渲染失败须根据错误调整内容或参数，
不得反复提交相同错误；环境缺失应如实报告。
"""

PDF_EDITORIAL_INSTRUCTION = """
【讲义内容质量】写给读者本人，使用自然简短的中文。准备清单不要重复同一种工具，每条只写一项。
引导问题应让首次参加的孩子也能当场回答，不预设昨天做过观察。观察建议应具体一致，不鼓励追赶动物。
记录可用文字、绘画或照片，不建议把小石头粘贴在记录本上。记录卡使用空白两列表格，程序会保留手写空间。
定稿前自行核对重复、表达是否实际可操作、用户指定内容是否齐全；不要把写作要求或自检过程放进正文。
"""
PDF_EXECUTION_INSTRUCTION += PDF_EDITORIAL_INSTRUCTION


def configure_pdf_tools(tools, prompt):
    """Bind explicit page count into the model schema, not only late validation."""
    from copy import deepcopy
    from .pdf_task_contract import bind_pdf_request
    result = deepcopy(tools)
    bound = bind_pdf_request({}, prompt)
    count = bound.get('max_pages')
    for tool in result:
        function = tool.get('function', {})
        if function.get('name') != 'render_pdf':
            continue
        pages = function['parameters']['properties']['pages']
        if count and count == bound.get('min_pages'):
            pages.update(minItems=count, maxItems=count)
            pages['description'] = (f'必须恰好{count}项，每项是一整页完整Markdown字符串，包含该页所有段落、列表和表格。'
                                    '不是逐行数组，不写HTML布局/CSS；仅叶片图片可用 ![叶片](leaf.svg)。')
    return result
