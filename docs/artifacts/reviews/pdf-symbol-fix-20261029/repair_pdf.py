"""Re-layout the user's saved 19:17 snapshot with local vector symbols."""
from pathlib import Path
import json
import sys
sys.path.insert(0, '/audit/apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts')
from pdf_design.content import markdown_html, plain_text
from pdf_design.quality import inspect_pdf, render_previews
from weasyprint import HTML

root = Path('/out')
source = Path('/audit/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/bilibili_hotspots.md').read_text()
body = markdown_html(source)
css = '''
@page {size:A4; margin:13mm 14mm; @bottom-right {content:counter(page) " / " counter(pages);font:8pt "Noto Sans CJK SC";color:#64748b}}
* {box-sizing:border-box} body{font:9.5pt/1.45 "Noto Sans CJK SC";color:#243544;margin:0}
h1,h2,h3{font-weight:700;break-after:avoid} h1{font-size:23pt;background:#e9f6fc;border-top:4pt solid #009fd1;padding:4mm;margin:0 0 3mm}
h2{font-size:12pt;color:#007ca7;border-bottom:1pt solid #009fd1;padding-bottom:1mm;margin:4mm 0 2mm}
h3{font-size:10.5pt;color:#007ca7;margin:2mm 0 1mm} p{margin:1.5mm 0} hr{display:none}
table{width:100%;border-collapse:collapse;margin:1mm 0 2mm;table-layout:auto;font-size:9pt}
th{background:#007ca7;color:white} th,td{padding:1.1mm 2mm;border-bottom:.5pt solid #dbe5eb;text-align:left;vertical-align:middle}
tr:nth-child(even){background:#f3f8fb} tr{break-inside:avoid} thead{display:table-header-group}
ul{padding-left:4mm;margin:1mm 0} li{margin-bottom:1mm} blockquote{margin:3mm 0 0;padding:2mm 3mm;background:#f0f6fa;color:#526576;font-size:8pt}
'''
document = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>' + css + '</style><body>' + body + '</body></html>'
(root / 'document.html').write_text(document)
(root / 'source.md').write_text(source)
pdf = root / 'bilibili_hotspots_fixed.pdf'
HTML(string=document).write_pdf(pdf)
qa = inspect_pdf(pdf, plain_text(body), min_pages=1, max_pages=1)
if not qa['valid']:
    raise RuntimeError(qa['errors'])
qa['previews'] = [str(path) for path in render_previews(pdf, root)]
(root / 'qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2))
print(json.dumps({'valid':qa['valid'],'pages':qa['page_count'],'sha256':qa['sha256'],'bytes':qa['bytes']},ensure_ascii=False))
