"""Separate blocking layout/content repairs from optional visual preferences."""
import re

REVIEW_INSTRUCTION = (
    '审核本页与用户要求：重点关注正文翻译是否完整准确、阅读顺序是否顺畅、排版是否方便用户阅读。'
    '保留主要章节、分栏、表格行列和图文关联即可；允许页数变化，中文字号可适当增大，英语/日语可适当减小。'
    '表格普通标签漏译、代码命令空格损坏、题注与对应图表分离、脚注标号游离是内容或关系缺陷，必须REPAIR；'
    '不要仅凭画面可读就判断翻译忠实，结合提供的源文字与结构证据核对。'
    '大面积无法阅读的文字重叠覆盖、缺页、整段漏译或严重白屏乱码必须返回REPAIR/FAIL。'
    '多页文档与翻译文档中，段落、章节、列表自然延伸至后续页属于正常跨页排版，严禁视为内容截断或判定FAIL/REPAIR。'
    '多语言翻译文档（中/英/日）因词长差异导致章节末尾、摘要或末页出现下半部留白纯属自然排版，严禁因留白率或版面重心判定FAIL/REPAIR。'
    '多语言（尤其是日文/英文）在分栏排版中的常规词内折行、片假名换行或连字符断行属于自然行内排版，只要无字符丢失或重叠，严禁判定为截断或REPAIR/FAIL。'
    '文档中出现的版权声明（如 All rights reserved、Copyright 等）或标准英文标识保留原文属于正常现象，严禁误判为残留或漏译。'
    '文档中嵌入的示意插图、运行截图内部自带的原英文文字、坐标轴、原图例或Logo属于原图不可变内容，严禁作为当前页面的排版缺陷判定FAIL/REPAIR。'
    '表格单元格中的上标/下标未转上标标签（如✓7）、表格脚注符号样式微瑕、表格下方的补充说明自然顺延到后续页等次要样式微瑕不影响阅读，严禁判定为FAIL/REPAIR，仅可作为OPTIONAL建议。'
    '只要排版符合原文件结构、内容准确、便于读者正常阅读，首行必须返回PASS。'
    '第一行仅PASS、REPAIR或FAIL。REPAIR/FAIL后最多三条具体问题和修复办法。'
    '若存在实质缺陷，请在首行REPAIR/FAIL后输出一行 ISSUES: 加JSON数组描述问题，格式为：'
    'ISSUES: [{"kind": "table|translation|layout|render", "anchor": "位置/标题", "quote": "页面文字片段", "evidence": "具体缺陷描述"}]。'
    'PASS后只允许无问题说明或以OPTIONAL:开头的纯审美建议，不能把需修复的内容问题放在PASS下。')


SUBSTANTIVE_DEFECT_PATTERN = (
    r'转置|错列|错行|串列|串行|对齐关系混乱|对齐混乱|数值归属|挤作一团|表格结构|严重|表头与数据|'
    r'列错配|截断|漏译|未翻译|错译|缺字|重叠覆盖|文字重叠|白屏|乱码|残留'
)


def extract_review_issues(analysis, page_number=None):
    """Parses structured ISSUES JSON from review output or falls back to text heuristic triage."""
    import json
    issues = []
    # 1. 尝试匹配结构化 JSON
    raw_match = None
    m = re.search(r'ISSUES:\s*(\[[\s\S]*?\])', analysis)
    if m:
        raw_match = m.group(1)
    else:
        m_alt = re.search(r'ISSUES:\s*(\[[\s\S]*)(?:\n\n|\Z)', analysis)
        if m_alt:
            cand = m_alt.group(1).strip()
            if not cand.endswith(']'):
                if cand.endswith('}'):
                    cand += ']'
            raw_match = cand

    if raw_match:
        try:
            items = json.loads(raw_match)
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict):
                        kind = it.get('kind', 'layout')
                        if kind not in ('table', 'translation', 'layout', 'render', 'unrecoverable'):
                            kind = 'layout'
                        issues.append({
                            'page': it.get('page') or page_number or 1,
                            'kind': kind,
                            'anchor': str(it.get('anchor', '')),
                            'quote': str(it.get('quote', '')),
                            'evidence': str(it.get('evidence', ''))
                        })
                if issues:
                    return issues
        except Exception:
            pass

    # 2. 自由文本回退
    from .pdf_review_resolution import issues as get_text_issues, table_issue
    text_items = get_text_issues(analysis)
    # 若首行为 PASS 但正文包含实质性 OPTIONAL 或带标记的问题，清洗掉首行 PASS 避免干扰
    refined_items = []
    for item in text_items:
        lines = [line.strip() for line in item.splitlines() if line.strip()]
        for l in lines:
            if re.match(r'^(?:\*\*)?PASS\b', l):
                continue
            if re.search(SUBSTANTIVE_DEFECT_PATTERN, l) or re.search(r'修复|建议|需要修改|表述重叠|存在重复|内容重复|缺少|残留|丢失|遗漏', l):
                refined_items.append(l)
    if not refined_items:
        refined_items = [t for t in text_items if not re.match(r'^(?:\*\*)?PASS\b', t.strip())] or text_items

    for text in refined_items:
        clean = text.strip()
        if not clean or clean == 'PASS':
            continue
        if table_issue(clean):
            kind = 'table'
        elif re.search(r'漏译|未翻译|翻译错误|错译|原文照抄|乱码|缺字|占位符|数字', clean):
            kind = 'translation'
        elif re.search(r'截断|溢出|分页|行距|字号', clean):
            kind = 'render'
        elif re.search(r'扫描件|无法识别|引擎未启用|文件损坏', clean):
            kind = 'unrecoverable'
        else:
            kind = 'layout'
        issues.append({
            'page': page_number or 1,
            'kind': kind,
            'anchor': clean[:40],
            'quote': clean[:60],
            'evidence': clean
        })
    return issues


def validate_review(analysis):
    verdict = re.search(r'(?m)^\s*(?:\*\*)?(PASS|FAIL|REPAIR)\b', analysis)
    if not verdict:
        raise ValueError('页面尚未通过视觉或内容检查：' + analysis[:2500])

    if verdict[1] != 'PASS':
        raise ValueError('页面尚未通过视觉或内容检查：' + analysis[:2500])
    details = analysis[verdict.end():].strip().strip('*').strip()
    lines = [line.strip() for line in details.splitlines() if line.strip()]
    repairs = []
    for line in lines:
        if line.startswith('RESOLUTIONS:'):
            continue
        clean_line = line.lstrip('*- 0123456789. ')
        is_optional = clean_line.startswith('OPTIONAL:') or 'OPTIONAL:' in line
        positive = re.sub(
            r'(?:无需|无须|不需|不必|未发现|未见|不存在|没有|无|不用|不建议)(?:修复|修改|调整|需修改|需要修改|建议|重写|重复内容|内容重复|表述重叠|残留|缺失|缺字|转置|错位|错列|错行|问题|异常|缺陷|遗漏|乱码)|'
            r'(?:无|没有|未发现|未见|不存在)(?:缺字|裁切|重叠|重复|问题|异常|缺陷|遗漏|残留|整段内容|错列|错行|转置)',
            '', line
        )
        has_substantive = bool(re.search(SUBSTANTIVE_DEFECT_PATTERN, positive))
        # 纯审美或次要样式建议允许放行；但若包含实质性排版/内容缺陷，严禁借 OPTIONAL 绕过门禁，必须触发自愈
        if is_optional and not has_substantive:
            continue
        if has_substantive or re.search(r'修复|建议|需要修改|表述重叠|存在重复|内容重复|缺少|残留', positive):
            repairs.append(line)
    if repairs:
        raise ValueError('审阅虽标记PASS但指出需处理的实质排版或内容问题：' + '\n'.join(repairs)[:2500])
