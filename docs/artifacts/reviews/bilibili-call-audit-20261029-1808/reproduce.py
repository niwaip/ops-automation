"""Read-only audit controls. Run inside the original sandbox; no model/network calls."""
import json
import re
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, '/opt/dsh/skills/pdf/scripts')
sys.path.insert(0, '/usr/local/bin')
import markdown
from pdf_design.content import markdown_html
from dsh_modules import pdf_preview_tool as preview
from dsh_modules.pdf_task_contract import remove_unrequested_emoji
from dsh_modules.tool_failure_recovery import repeated_execution_failure
from dsh_modules.tool_result import ToolResult

workspace = Path('/workspace')
session = workspace / '.dsh/sessions/chat-session-1793268116614-iy01yu8z.evidence.json'
evidence = json.loads(session.read_text())
receipts = [ToolResult(**item) for item in evidence['receipts']]
render = next(r.data for r in receipts if r.provenance['tool'] == 'render_pdf')
source = Path(render['source']).read_text()
without_wrappers = re.sub(r'</?div[^>]*>', '', source)
annotated = source.replace('<div class="grid-2">', '<div class="grid-2" markdown="1">')
html_cases = {
    'original': markdown_html(source),
    'without_wrappers': markdown_html(without_wrappers),
    'md_in_html_control': markdown.markdown(annotated, extensions=[
        'tables', 'fenced_code', 'sane_lists', 'md_in_html']),
}
report = {'markdown_version': markdown.__version__, 'html_controls': {
    name: {'tables': html.count('<table>'), 'headings': html.count('<h2>'),
           'raw_separator': bool(re.search(r'\|[-|]+\|', html))}
    for name, html in html_cases.items()
}}
assert report['html_controls']['original']['tables'] == 0
assert report['html_controls']['without_wrappers']['tables'] == 2
assert report['html_controls']['md_in_html_control']['tables'] == 2

rank_source = '| 🥇 | 第一名 |\n| 🥈 | 第二名 |\n| 🥉 | 第三名 |'
rank_output = remove_unrequested_emoji(rank_source, evidence['query'])
report['rank_cleanup'] = {'input': rank_source, 'output': rank_output,
                          'empty_rank_cells': len(re.findall(r'(?m)^\|\s*\|', rank_output))}
assert report['rank_cleanup']['empty_rank_cells'] == 3

preview.reset_pdf_renders()
staged = Path(render['qa_path']).parent / 'candidate.pdf'
preview.register_pdf_render(render, staged)
with patch.object(preview, 'inspect_pdf_image', return_value='【文档/图片 (page-1.png)】\nFAIL\n表格未渲染') as inspect:
    telemetry = MagicMock()
    first = preview.review_current_pdf_pages(str(workspace), None, telemetry, 3)
    second = preview.review_current_pdf_pages(str(workspace), None, telemetry, 4)
    report['unchanged_failed_page'] = {
        'mock_vision_invocations': inspect.call_count,
        'results': [r.status for r in first + second],
        'render_sha256': render['sha256'],
    }
assert report['unchanged_failed_page']['mock_vision_invocations'] == 2
assert report['unchanged_failed_page']['results'] == ['error', 'error']

report['repeated_failure_guard'] = {
    'actual_visual_failures': sum(r.is_error and r.provenance['tool'] == 'inspect_pdf_page' for r in receipts),
    'stop_decision': repeated_execution_failure(receipts),
}
assert report['repeated_failure_guard']['actual_visual_failures'] == 8
assert report['repeated_failure_guard']['stop_decision'] is None
preview.reset_pdf_renders()
print(json.dumps(report, ensure_ascii=False, indent=2))
