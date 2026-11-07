"""Supply source/translation pairs for the nodes visible on the reviewed output page."""
import json
from pathlib import Path
import re


def translation_review_evidence(manifest_path, pdf_path, page_number):
    if not manifest_path:
        return ''
    import pdfplumber
    folder = Path(manifest_path).parent
    ir = json.loads((folder / 'translated.ir.json').read_text())
    with pdfplumber.open(pdf_path) as pdf:
        visible = re.sub(r'\s+', '', pdf.pages[page_number - 1].extract_text() or '')
    pairs = []
    for node in ir['nodes']:
        if node['type'] in ('furniture', 'table', 'formula', 'author', 'reference'):
            continue
        translation = ir.get('translations', {}).get(node['id'], node.get('text', ''))
        fragment = re.sub(r'\s+', '', translation)
        if len(fragment) < 4 or not any(f in visible for f in (fragment[:20], fragment[-20:])):
            continue
        pairs.append(dict(id=node['id'], type=node['type'], source_page=node['page_id'],
                          source=node.get('text', '')[:900], translation=translation[:900]))
    return ('\n本页可定位的原文和译文片段（长段可能跨页，未显示的后续片段不算漏译）：'
            + json.dumps(pairs[:10], ensure_ascii=False)
            + '\n对照检查语义、数字、普通标签和命令；自然分页与目标语言字号调整允许，图表和题注仍须清楚关联。')
