"""Bind explicit document parameters and literal page requirements; no domain-specific content defaults."""

import re


def _plain(text):
    return ''.join(c for c in text if c.isalnum())


def bind_pdf_request(params, prompt):
    bound = dict(params)
    filename = re.search(r'(?:文件名(?:为|是)?|命名为)[：:\s]*[“"]?([^/\s“”"。；，、]+\.pdf)', prompt, re.I)
    if filename:
        bound['output_path'] = filename[1]
    pages = re.search(r'(?:共|恰好|总共)\s*(\d+)\s*页', prompt)
    if pages:
        bound.update(min_pages=int(pages[1]), max_pages=int(pages[1]))
    for key, pattern in (
        ('title', r'《([^》]+)》'),
        ('subtitle', r'副标题(?:为|是)?[：:\s]*[“"]([^”"]+)[”"]'),
        ('author', r'署名(?:为|是)?[：:\s]*[“"]([^”"]+)[”"]'),
    ):
        match = re.search(pattern, prompt)
        if match:
            bound[key] = match[1]
    layout = re.search(r'\b(handout|report|editorial|mobile)\b', prompt, re.I)
    if layout:
        bound['template'] = layout[1].lower()
    if '暖色' in prompt:
        bound['theme'] = 'warm'
    if re.search(r'(?:不要|无需|不需要|不加|无)(?:独立|单独)?封面', prompt):
        bound['cover'] = False
    return bound


def validate_pdf_content(markdown, prompt):
    """Check only requirements the user explicitly names in recognized literal structures."""
    if not prompt:
        return
    parts = re.split(r'第\s*(\d+)\s*页\s*[：:]', prompt)
    page_requests = [(int(parts[i]), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    page_bodies = re.split(r'<!--\s*pagebreak\s*-->', markdown)
    expected = max((page for page, _ in page_requests), default=1)
    if len(page_bodies) < expected:
        raise ValueError(f'分页结构错误：要求至少{expected}页内容，仅识别{len(page_bodies)}页。'
                         '请使用 pages 数组，每项为一页完整 Markdown；或在页间插入 <!-- pagebreak -->。'
                         '此错误不代表第二页文字缺失；保留已有内容并修正分页。')
    errors = []
    for page, request in page_requests or [(1, prompt)]:
        body = page_bodies[page - 1] if page_requests and page <= len(page_bodies) else (markdown if not page_requests else '')
        plain = _plain(body)
        for quote in re.findall(r'[“"]([^”"]+)[”"]', request):
            if '/' not in quote:
                continue
            headers = [h.strip() for h in quote.split('/')]
            if not (2 <= len(headers) <= 10):
                continue
            rows = [line.strip().strip('|').split('|') for line in body.splitlines() if line.strip().startswith('|')]
            if not any([_plain(cell) for cell in row] == [_plain(h) for h in headers] for row in rows):
                errors.append(f'第{page}页缺少指定表头：' + ' / '.join(headers))
        lists = re.findall(r'表格[，,]?\s*(?:包含|包括|含)([^。；\n]+)', request)
        lists += re.findall(r'(?:以及|包括|包含)\s*([^，。；\n]+?)[一二三四五六七八九十\d]+项记录卡', request)
        for items in lists:
            for item in re.split(r'[、/]', items):
                item = item.strip()
                if item and len(item) <= 30 and _plain(item) not in plain and not any(
                    _plain(item[:i] + conjunction + item[i:]) in plain
                    for i in range(1, len(item)) for conjunction in ('和', '与', '及')):
                    errors.append(f'第{page}页缺少用户指定栏目或对象：{item}')
        if re.search(r'一[幅张].{0,15}(?:示意图|插图)', request) and not re.search(r'!\[[^\]]*\]\(|<img\b[^>]*\bsrc=', body, re.I):
            errors.append(f'第{page}页缺少用户要求的插图')
        if '简短介绍' in request:
            start = re.search(r'(?m)^(?:#{1,6}\s+|\*\*)[^\n|]{0,30}(?:温馨提示|准备清单|出发前|观察对象|叶片示意图)[^\n]*$', body)
            introduction = body[:start.start()] if start else body
            introduction = re.sub(r'(?m)^\s*(?:#{1,6}\s+|\|).*$', '', introduction)
            introduction = re.sub(r'!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>', '', introduction)
            if len(_plain(introduction)) < 4:
                errors.append(f'第{page}页缺少简短介绍；请在提示或准备清单之前保留1至2句介绍，不能只保留标题')
        if '准备清单' in request and len(re.findall(r'(?m)^\s*[-*+]\s+\S', body)) < 2:
            errors.append(f'第{page}页缺少可逐项检查的准备清单，请使用简短列表')
        if '温馨提示' in request and '温馨提示' not in plain:
            errors.append(f'第{page}页缺少明确标识的温馨提示')
        method = re.match(r'\s*(如何[^，、。；\n]{2,20})', request)
        if method and _plain(method[1]) not in plain:
            errors.append(f'第{page}页缺少用户要求的记录方法栏目：{method[1]}')
        if '记录卡' in request and re.search(r'20\d{2}\s*年', body) and not re.search(r'20\d{2}\s*年', prompt) and '示例' not in body:
            errors.append(f'第{page}页记录卡应留空供填写；未提供的具体日期必须删除或明确标为示例')
        if '交流与分享' in request or '分享建议' in request:
            sharing = re.findall(r'(?ms)^[^\S\n]*(?:#{1,6}[ \t]+|\*\*)[^\n]*分享[^\n]*\n(.*?)(?=^[^\S\n]*(?:#{1,6}[ \t]+|\*\*[^\n]+\*\*[ \t]*$)|\Z)', body)
            if not any(re.search(r'展示|交换|讨论|讲给|讲述|分享给|带给|说给|汇报|给.{0,8}看|向.{0,8}分享', section) for section in sharing):
                errors.append(f'第{page}页缺少可操作的交流与分享建议；请保留独立小节并写出展示、交换、讨论或讲给谁听等具体做法，不能仅写口号')
        questions = re.search(r'([一二三四五六七八九十\d]+)个引导问题', request)
        if questions:
            digits = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
            count = int(questions[1]) if questions[1].isdigit() else digits.get(questions[1], 0)
            actual = len(re.findall(r'(?m)^\s*(?:\d+[.)、]|[-*])\s*[^\n]*(?:[？?]|什么|怎么|为什么|如何|是否)[^\n]*', body))
            if count and actual < count:
                errors.append(f'第{page}页需要{count}个引导问题，当前可识别{actual}个')
    if errors:
        raise ValueError('用户内容要求尚未满足：' + '；'.join(errors) + '。请保留全部指定内容，精简措辞而非删除栏目。')


def remove_unrequested_emoji(markdown, prompt):
    # These symbols are optional decoration unless the user explicitly requests them.
    emoji = r'[\U0001F000-\U0001FAFF\u2600-\u27BF\ufe0f\u200d]'
    if re.search(r'emoji|表情|保留.*符号', prompt, re.I) or re.search(emoji, prompt):
        return markdown
    return re.sub(emoji, '', markdown)


def remove_metadata_echoes(markdown, params):
    """The template owns title/subtitle/byline; duplicated standalone echoes consume print space."""
    metadata = {_plain(str(params[k])) for k in ('title', 'subtitle', 'author') if params.get(k)}
    author = _plain(str(params.get('author', '')))
    result = []
    for line in markdown.splitlines():
        plain = _plain(line)
        if re.fullmatch(r'\s*(?:页码[：:]\s*\d+|第\s*\d+\s*页(?:\s*/\s*共\s*\d+\s*页)?)\s*', line):
            continue
        if re.fullmatch(r'\s*>\s*', line):
            continue
        if plain and (plain in metadata or (author and plain in {'署名' + author, '作者' + author})):
            continue
        result.append(line)
    content = '\n'.join(result)
    # A model may put only template-owned metadata before its first break.
    # Removing those echoes must not leave a blank cover that shifts every page.
    return re.sub(r'\A\s*(?:<!--\s*pagebreak\s*-->\s*)+', '', content)


def prepare_handout_content(markdown, page_count=None):
    # A separator followed by a bounded page index is a generated footer,
    # not body text. Keep ordinary numbers and unbounded documents untouched.
    if type(page_count) is int:
        pattern = r'(?m)^[ \t]*-{3,}[ \t]*\n(?:[ \t]*\n)*[ \t]*(\d{1,3})[ \t]*(?=\n\s*(?:<!--|#{1,6}\s)|\s*\Z)'
        markdown = re.sub(pattern, lambda m: '' if 1 <= int(m[1]) <= page_count else m[0], markdown)
    # The template already separates sections. Repeated decorative rules consume
    # a surprising amount of paper, especially around an explicit page break.
    # Document metadata is already removed. Body H1s are section headings,
    # not a new document title for the CLI to consume.
    markdown = re.sub(r'(?m)^#(?!#)\s+', '## ', markdown)
    markdown = re.sub(r'</?br\s*/?>', '', markdown, flags=re.I)
    markdown = re.sub(r'<block\s+type=["\']tip["\']\s*>(.*?)</block>',
                      lambda m: '\n' + '\n'.join('> ' + line for line in m[1].strip().splitlines()) + '\n',
                      markdown, flags=re.I | re.S)
    # Markdown requires a blank quote line before a list following quote prose.
    normalized = []
    for line in markdown.splitlines():
        current = re.sub(r'^>\s*', '', line)
        previous = re.sub(r'^>\s*', '', normalized[-1]) if normalized else ''
        if line.startswith('>') and re.match(r'[-*+]\s+', current) and previous and not re.match(r'[-*+]\s+', previous) and normalized[-1].startswith('>'):
            normalized.append('>')
        if re.match(r'^[-*+]\s+', line) and normalized and normalized[-1].strip() and not re.match(r'^[-*+]\s+', normalized[-1]):
            normalized.append('')
        normalized.append(line)
    return '\n'.join(line for line in normalized
                     if not re.fullmatch(r'\s*(?:-{3,}|\*{3,}|#{1,6})\s*', line))


def align_requested_page_headings(markdown, prompt):
    """Honor explicit page-start headings when every anchor is unique and ordered.

    Only the caller's explicit no-cover contract enables this normalization.
    Text order/content stays intact; ambiguous anchors leave source unchanged.
    """
    parts = re.split(r'第\s*(\d+)\s*页\s*[：:]', prompt)
    requests = [(int(parts[i]), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    if len(requests) < 2 or [n for n, _ in requests] != list(range(1, len(requests) + 1)):
        return markdown
    body = re.sub(r'<!--\s*pagebreak\s*-->', '', markdown)
    headings = list(re.finditer(r'(?m)^#{1,6}\s+([^\n]+)', body))
    anchors = []
    for page, request in requests[1:]:
        first = re.split(r'[、，,。；\n]', request.strip(), maxsplit=1)[0]
        matches = [m.start() for m in headings if _plain(m[1]) == _plain(first)]
        if not first or len(matches) != 1:
            return markdown
        position = matches[0]
        anchor = next(m for m in headings if m.start() == position)
        preceding = [m for m in headings if m.start() < position]
        if preceding and not body[preceding[-1].end():position].strip():
            previous = preceding[-1]
            if len(previous[0]) - len(previous[0].lstrip('#')) < len(anchor[0]) - len(anchor[0].lstrip('#')):
                position = previous.start()
        anchors.append(position)
    if anchors != sorted(set(anchors)):
        return markdown
    for position in reversed(anchors):
        body = body[:position] + '\n<!-- pagebreak -->\n\n' + body[position:]
    return body
