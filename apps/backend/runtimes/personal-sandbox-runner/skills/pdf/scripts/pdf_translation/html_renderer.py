"""Render typed document nodes using owned templates, never model-generated HTML."""
from collections import defaultdict
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from weasyprint import CSS, HTML
from weasyprint.text.fonts import FontConfiguration

from pdf_design.renderer import LocalResources
from pdf_design.quality import inspect_pdf
from pdf_design.themes import font_match
from .contracts import TranslationError, digest, is_formula, write_json
from .render_structure import grouped_nodes, typography
from .source_links import node_links, linked_text, validate_link_targets

TEMPLATES = Path(__file__).resolve().parents[2] / 'templates' / 'translation'


def render_document(ir, folder, layout):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    translations = ir['translations']
    nodes = []
    expected = []
    for original in ir['nodes']:
        node = dict(original)
        node['display'] = translations.get(node['id'], node['text'])
        if node.get('legend_units'):
            node['display'] = '\n'.join(translations.get(unit['id'], unit['text']) for unit in node['legend_units'])
        if node['type'] == 'furniture':
            continue
        if node['type'] == 'table':
            rows = defaultdict(list)
            for cell in node['cells']:
                value = dict(cell, display=translations.get(cell['id'], cell['text']))
                rows[cell['row']].append(value)
                expected.append(value['display'])
            node['rows'] = [sorted(cells, key=lambda c: c['col']) for _, cells in sorted(rows.items())]
            header_count = 0
            for row in node['rows']:
                if not all(c['header'] for c in row):
                    break
                header_count += 1
            node['head_rows'], node['body_rows'] = node['rows'][:header_count], node['rows'][header_count:]
            edges = node.get('column_edges')
            node['column_widths'] = ([100 * (b - a) / (edges[-1] - edges[0])
                                      for a, b in zip(edges, edges[1:])] if edges else [])
        elif node['type'] == 'formula':
            node['display'] = ''
        elif node['type'] == 'figure' and not node.get('legend_units') and is_formula(node.get('text', '')):
            node['display'] = ''
        else:
            expected.append(node['display'])
        if node['type'] in ('figure', 'formula'):
            if not node.get('asset'):
                for asset_dir in [folder / 'assets', folder.parent / 'assets', folder.parent.parent / 'assets']:
                    candidate = asset_dir / f"{node['id']}.png"
                    if candidate.is_file():
                        node['asset'] = str(candidate)
                        break
            if 'asset' not in node:
                node['asset'] = ''
        nodes.append(node)
    links = node_links(ir)
    for node in nodes:
        node['html_display'] = linked_text(node['display'], links.get(node['id'], []))
        if node['type'] == 'table':
            for row in node['rows']:
                for cell in row:
                    cell['html_display'] = linked_text(cell['display'], [link for link in links.get(node['id'], [])
                        if link.get('label') and link['label'] in cell['text']])
    # Preserve logical sequence; column segments end at a spanning figure/table/title.
    pages = {p['id']: p for p in ir['pages']}
    segments = []
    first_page_id = ir['pages'][0]['id'] if ir['pages'] else None
    saw_multi_column = False
    for group in grouped_nodes(nodes, pages):
        node = group['nodes'][0]
        page_cols = pages[node['page_id']].get('columns', 1)
        if layout == 'reading' or page_cols <= 1:
            columns = 1
        elif group.get('column') == 0 or (group.get('column') is None and node['type'] in (
            'title', 'author', 'figure', 'table', 'formula', 'caption'
        )):
            columns = 1
        else:
            columns = page_cols
            saw_multi_column = True
        is_paper_header = bool(first_page_id and node['page_id'] == first_page_id and not saw_multi_column and columns == 1)
        need_new_segment = (
            not segments
            or segments[-1]['columns'] != columns
            or segments[-1].get('is_header') != is_paper_header
            or (layout == 'preserve' and segments[-1]['page_id'] != node['page_id'])
        )
        if need_new_segment:
            segments.append({
                'columns': columns,
                'page_id': node['page_id'],
                'is_header': is_paper_header,
                'groups': []
            })
        segments[-1]['groups'].append(group)
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(['html']),
                      undefined=StrictUndefined)
    target_lang = str(ir.get('target_language', 'zh-CN')).lower()
    cjk_family = 'Noto Sans CJK JP' if target_lang.startswith('ja') else ('Noto Sans CJK KR' if target_lang.startswith('ko') else ('Noto Sans CJK TC' if target_lang.startswith(('zh-tw', 'zh-hk')) else 'Noto Sans CJK SC'))
    try:
        fonts = {style: font_match(cjk_family, style)['path'] for style in ('Regular', 'Bold')}
    except Exception:
        fonts = {style: font_match('Noto Sans CJK SC', style)['path'] for style in ('Regular', 'Bold')}
    type_sizes = typography(ir.get('target_language', 'zh-CN'))
    html = env.get_template('document.html').render(segments=segments, language=type_sizes['lang'])
    css = env.get_template('print.css').render(fonts=fonts, preserve=layout == 'preserve', type_sizes=type_sizes)
    (folder / 'document.html').write_text(html, encoding='utf-8')
    (folder / 'print.css').write_text(css, encoding='utf-8')
    resources = LocalResources([folder.resolve().parents[1], TEMPLATES, Path(fonts['Regular']).parent])
    font_config = FontConfiguration()
    target = folder / 'candidate.pdf'
    if layout == 'preserve':
        from .smart_pagination import optimize_smart_layout
        html, doc = optimize_smart_layout(html, css, folder, resources, font_config, blank_threshold=0.60)
        (folder / 'document.html').write_text(html, encoding='utf-8')
        doc.write_pdf(target)
    else:
        HTML(string=html, base_url=folder.as_uri() + '/', url_fetcher=resources).write_pdf(target,
            stylesheets=[CSS(string=css, base_url=folder.as_uri() + '/', font_config=font_config, url_fetcher=resources)], font_config=font_config)
    qa = inspect_pdf(target, ' '.join(expected))
    from pypdf import PdfReader
    validate_link_targets(ir, PdfReader(target))
    qa['errors'].extend(resources.errors)
    if layout == 'preserve' and qa['page_count'] != ir['source']['page_count']:
        warn_msg = f"排版跨页提示：译文内容与字号自然扩展为{qa['page_count']}页（原文档{ir['source']['page_count']}页）"
        qa.setdefault('warnings', []).append(warn_msg)
        for page in ir.get('pages', []):
            page.setdefault('warnings', []).append(warn_msg)
            break
        print(f"⚠️ [PDF渲染提示] {warn_msg}，允许自然跨页放行", flush=True)
    if qa['errors']:
        for err in qa['errors']:
            qa.setdefault('warnings', []).append(f"渲染排版提示: {err}")
            for page in ir.get('pages', []):
                page.setdefault('warnings', []).append(f"渲染排版提示: {err}")
                break
        print(f"⚠️ [PDF渲染提示] {'; '.join(qa['errors'])[:500]}，记录警告并继续生成PDF候选", flush=True)
    qa.update(valid=bool(qa.get('page_count', 0) > 0 and target.is_file()), layout=layout, asset_ids=[a['id'] for a in ir['assets']])
    write_json(folder / 'render-qa.json', qa)
    if not qa['valid']:
        raise TranslationError('render_failed', 'PDF渲染未生成有效页面')
    try:
        from .page_map import build_page_map
        page_map = build_page_map(target, ir)
        write_json(folder / 'page-map.json', page_map)
    except Exception:
        pass
    return target, qa
