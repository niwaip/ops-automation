"""Smart layout optimizer to eliminate abnormal trailing whitespace in translated PDFs."""
from lxml import html as html_parser
from weasyprint import CSS, HTML


def measure_page_whitespace(page):
    """Calculate the trailing blank fraction of a WeasyPrint page box."""
    leaves = []

    def walk(box, sec_idx=None, node_id=None):
        el = getattr(box, 'element', None)
        if el is not None:
            if el.get('data-section-idx') is not None:
                sec_idx = el.get('data-section-idx')
            if el.get('data-node-id') is not None:
                node_id = el.get('data-node-id')
        kind = type(box).__name__
        if node_id and (kind == 'TextBox' or 'ReplacedBox' in kind):
            leaves.append({
                'sec_idx': sec_idx,
                'node': node_id,
                'y': box.position_y * 0.75,
                'h': box.height * 0.75,
                'text': getattr(box, 'text', '')
            })
        for child in getattr(box, 'children', []):
            walk(child, sec_idx, node_id)

    walk(page._page_box)

    page_box = page._page_box
    top_edge = getattr(page_box, 'margin_top', 0) * 0.75
    content_h = max(1.0, getattr(page_box, 'height', 1000) * 0.75)
    content_bottom = top_edge + content_h

    bottom = max((l['y'] + l['h'] for l in leaves), default=top_edge)
    blank_ratio = max(0.0, content_bottom - bottom) / content_h
    sec_indices = sorted(list({int(l['sec_idx']) for l in leaves if l['sec_idx'] is not None}))

    return {
        'bottom': bottom,
        'blank_ratio': blank_ratio,
        'sec_indices': sec_indices,
        'nodes': list(dict.fromkeys(l['node'] for l in leaves)),
        'chars': sum(len(l['text']) for l in leaves)
    }


def optimize_smart_layout(html_content, css_content, folder, resources, font_config,
                          blank_threshold=0.60, max_iterations=3):
    """
    Iteratively detects pages where trailing blank space exceeds blank_threshold (>60%),
    and removes unnatural break-before from the subsequent section, allowing content
    to flow continuously and fill the sparse page.
    """
    current_html = html_content
    final_doc = None

    for iteration in range(max_iterations):
        tree = html_parser.fromstring(current_html)
        sections = tree.xpath('//section')
        if not sections:
            break

        doc = HTML(string=current_html, base_url=folder.as_uri() + '/', url_fetcher=resources).render(
            stylesheets=[CSS(string=css_content, base_url=folder.as_uri() + '/',
                             font_config=font_config, url_fetcher=resources)],
            font_config=font_config
        )
        final_doc = doc

        pages_info = [measure_page_whitespace(page) for page in doc.pages]

        sections_to_unbreak = set()
        for i in range(len(pages_info) - 1):
            cur_p = pages_info[i]
            next_p = pages_info[i + 1]
            if cur_p['blank_ratio'] > blank_threshold:
                if next_p['sec_indices']:
                    next_sec_idx = next_p['sec_indices'][0]
                    if next_sec_idx < len(sections):
                        sec_el = sections[next_sec_idx]
                        classes = sec_el.get('class', '').split()
                        if 'source-page-start' in classes:
                            has_h1 = bool(sec_el.xpath('.//h1'))
                            is_header = 'paper-header' in classes
                            # Do not remove page break before document header/cover or major H1 chapter headings
                            if not has_h1 and not is_header:
                                sections_to_unbreak.add(next_sec_idx)
                                print(f"✨ [智能分页优化] 第 {i + 1} 页尾部空白率 {cur_p['blank_ratio']*100:.1f}% (> {blank_threshold*100:.0f}%)，取消第 {next_sec_idx} 节强制换页，紧凑接入后续内容", flush=True)

        if not sections_to_unbreak:
            return current_html, final_doc

        for idx in sections_to_unbreak:
            classes = [c for c in sections[idx].get('class', '').split() if c != 'source-page-start']
            sections[idx].set('class', ' '.join(classes))

        current_html = html_parser.tostring(tree, encoding='unicode')

    if final_doc is None or sections_to_unbreak:
        final_doc = HTML(string=current_html, base_url=folder.as_uri() + '/', url_fetcher=resources).render(
            stylesheets=[CSS(string=css_content, base_url=folder.as_uri() + '/',
                             font_config=font_config, url_fetcher=resources)],
            font_config=font_config
        )

    return current_html, final_doc
