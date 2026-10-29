"""Select the owned PDF renderer for new documents, without constraining conversion/editing."""

import re


def is_template_pdf_task(prompt, skill):
    """Determines whether a PDF task is a pure self-contained typesetting task
    that can take the owned generator fast-path without needing external tool execution.
    """
    if getattr(skill, 'skill_id', None) != 'pdf' or not getattr(skill, 'is_generate_intent', False):
        return False
    # If the task requires open-domain search, guide, research or modification, it belongs to the full agent loop
    if (getattr(skill, 'is_guide_intent', False)
            or getattr(skill, 'is_research_intent', False)
            or getattr(skill, 'is_search_intent', False)
            or getattr(skill, 'is_modify_intent', False)):
        return False
    from .skill_router import is_text_only_request
    if is_text_only_request(prompt):
        return False
    # Preserve source-document workflows and external formats
    if getattr(skill, 'source_formats', None):
        return False

    # Check semantic task requirements from LLM as a Judge (task_intent / admission)
    admission = getattr(skill, 'admission', None) or {}
    contract = getattr(skill, 'task_contract', None) or admission.get('task_contract') or {}
    requirements = contract.get('requirements') or []
    for req in requirements:
        quote = req.get('quote', '')
        # Any requirement that demands external retrieval, calculation or data inspection disqualifies pure template
        if any(act in quote for act in (
            '查看', '搜索', '搜一下', '了解', '调研', '查一下', '爬取',
            '统计', '计算', '核算', '分析', '对比', '读取', '基于', '汇总',
            '热点', '热搜', '榜单', '新闻', '资讯', '行情', '价格'
        )):
            return False

    # Dynamic temporal cues in prompt (live data / temporal facts that need web search)
    dynamic_temporal_cues = (
        '今天', '今日', '本周', '本月', '实时', '热点', '热搜', '榜单',
        '新闻', '资讯', '行情', '价格', '走势', '搜一下', '查一下'
    )
    if any(cue in prompt for cue in dynamic_temporal_cues):
        return False

    # Operation cues: format conversion, form filling, custom coordinates or data charts
    operation_cues = (
        '转换', '转为', '转成', '合并', '拆分', '加密', '解密', '水印',
        '填写', '填报', '表单', '修改现有', 'fpdf', 'reportlab', '精确坐标',
        '图表', '柱状图', '折线图', '饼图', '联网', '搜索', '检索', '调研'
    )
    if any(op in prompt for op in operation_cues):
        return False

    if re.search(r'当前轮次用户上传附件|当前会话有效附件清单|\.(?:docx?|xlsx?|csv|pptx?)\b|(?:基于|读取|根据).{0,60}\.pdf', prompt, re.I):
        return False

    targets = getattr(skill, 'deliverables', None) or []
    named_pdfs = {str(t).rsplit('/', 1)[-1] for t in targets
                  if not str(t).startswith('.') and str(t).lower().endswith('.pdf')}
    if len(named_pdfs) > 1:
        return False
    return all(str(t).lower().endswith(('.pdf', '.md')) for t in targets)


PDF_EDITORIAL_INSTRUCTION = """
【内容与版面质量】使用符合目标读者的自然语言。清单逐项明确、避免重复。
问题和操作建议须可实际执行，不预设用户未提供的经历；表格的每项提示与该行对象一致。
排行榜/清单的序号格式须保持统一（如统一使用 1-5 或 NO.1-NO.5，避免前缀混杂）。
对于资讯、速报或榜单类文档，版面设计应追求饱满平衡，合理利用双栏（grid-2）、卡片（card）与标签（pill）组织信息，避免单页下半部过度留白。
不增加与用户目标无关的警告、材料、背景或事实。相邻段落不要重复表达同一内容。
保留用户全部指定内容；不要把写作、自检或系统指引作为正文输出。
"""
PDF_EXECUTION_INSTRUCTION = """
【PDF 模板执行】提交完整 pages 数组，每项是一页完整 Markdown，页数按用户要求。
标题、副标题、署名与排版交给生成器；不编写坐标脚本，不重复元信息或页码。
版式、主题、封面与文件名以用户请求为准。仅使用可用素材，不编造图片路径。
自动逐页审阅通过后才发布，错误须按反馈有限修复，环境缺失如实报告。
空白记录区的字段不是实时数据查询要求，不为占位字段查询或编造实际值。
""" + PDF_EDITORIAL_INSTRUCTION


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
                                    '不是逐行数组，不写HTML布局/CSS；图片只能使用已提供的本地素材。')
    return result
