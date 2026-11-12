"""Expose the verified source cell relationships to translated-page review."""
import json
from pathlib import Path
import re


def table_review_evidence(manifest_path, pdf_path, page_number):
    if not manifest_path:
        return ''
    import pdfplumber
    folder = Path(manifest_path).parent
    ir = json.loads((folder / 'translated.ir.json').read_text())
    with pdfplumber.open(pdf_path) as pdf:
        actual = re.sub(r'\s+', '', pdf.pages[page_number - 1].extract_text() or '')
    tables = []
    for node in ir['nodes']:
        if node['type'] != 'table':
            continue
        cells = [dict(row=cell['row'], col=cell['col'], rowspan=cell['rowspan'],
                      colspan=cell['colspan'], source=cell['text'][:120],
                      translation=ir['translations'].get(cell['id'], cell['text'])[:120])
                 for cell in node['cells'] if cell['text']]
        matches = [cell for cell in cells if len(cell['translation']) >= 4 and
                   re.sub(r'\s+', '', cell['translation']) in actual]
        if len(matches) < 2:
            continue
        tables.append(dict(id=node['id'], source_page=node['page_id'], cells=cells))
    if not tables:
        return ''
    return ('\n已核对原PDF的表格行列关系（行列从0开始；当前页可能是跨页续表）：'
        + json.dumps(tables, ensure_ascii=False)
        + '\n逐项核对产品/指标/总数是否位于对应行列；文字全部存在不能证明关系正确。'
          '当前页未出现的续表内容不要求补入；发现错列、合并错配或数值归属变化必须REPAIR。')
