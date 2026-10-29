"""Read-only controls for the real failed turn; no model or network calls."""
import json
from pathlib import Path
from types import SimpleNamespace
from dsh_modules.tool_result import ToolResult
from dsh_modules.tool_failure_recovery import repeated_execution_failure
from dsh_modules.runner import select_active_tools
from pdf_design.symbols import symbol_html, SYMBOLS

root = Path('/audit/docs/artifacts/reviews/bilibili-call-audit-20261029-2011')
evidence = json.loads((root / 'evidence.json').read_text())
receipts = [ToolResult(**item) for item in evidence['receipts']]
attempts = [json.loads((root / f'attempt-{index}.json').read_text()) for index in (2, 3, 4)]
report = {'page_item_counts': [len(a['params']['pages']) for a in attempts]}
assert report['page_item_counts'] == [3, 2, 1]
report['mixed_failure_stop'] = repeated_execution_failure(receipts)
report['symbol_failure_alone_stop'] = repeated_execution_failure(receipts[-1:])
assert report['mixed_failure_stop']['attempts'] == 3
assert report['symbol_failure_alone_stop'] is None

source = attempts[-1]['normalized_markdown']
report['unsupported_codepoints'] = [f'U+{ord(c):04X}' for c in sorted(set(source))
    if 0x1F000 <= ord(c) <= 0x1FAFF and c not in SYMBOLS]
try:
    symbol_html(source)
except ValueError as error:
    report['actual_source_error'] = str(error)
assert 'U+1F4F0' in report['actual_source_error']
try:
    symbol_html(source.replace('\U0001F4F0', ''))
except ValueError as error:
    report['after_removing_only_newspaper'] = str(error)
assert 'U+1F3C0' in report['after_removing_only_newspaper']

skill = SimpleNamespace(skill_id='pdf', is_generate_intent=True, is_search_intent=True,
                        deliverables=['.pdf'], source_formats=[])
tools = select_active_tools(evidence['query'], skill, True, True)
names = {t['function']['name'] for t in tools}
schema = next(t['function']['parameters']['properties']['pages'] for t in tools
              if t['function']['name'] == 'render_pdf')
report['selected_tools'] = sorted(names)
report['selected_page_schema'] = {k: schema.get(k) for k in ('minItems', 'maxItems', 'description')}
report['managed_pdf_predicate'] = 'render_pdf' in names and 'bash' not in names and 'web_search' not in names
assert schema['maxItems'] == 100
assert not report['managed_pdf_predicate']
print(json.dumps(report, ensure_ascii=False, indent=2))
