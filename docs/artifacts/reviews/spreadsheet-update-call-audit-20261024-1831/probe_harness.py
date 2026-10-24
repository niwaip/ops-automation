"""Isolated harness boundary probes. No model, original files, or production memory writes."""
import json
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
sys.path.insert(0, str(REPO / 'apps/backend/runtimes/personal-sandbox-runner/src'))

from openpyxl import Workbook
from dsh_modules.user_declarations import validate_section_confirmation, direct_section_reply
from dsh_modules.domain_memory import save_section_mapping, resolve_section_mapping
from dsh_modules.spreadsheet_update.layout_binding import locate
from dsh_modules.spreadsheet_update.reconciliation import compute_reconciliation


def main():
    results = {}
    forged = validate_section_confirmation(
        {'section': '费用', 'target_title': '内部成本', 'quote': '用户从未说过的确认'},
        ['请更新本月预测'],
    )
    results['ungrounded_quote_accepted'] = forged is not None
    results['ungrounded_quote_result'] = forged
    fallback = direct_section_reply(
        '不要确认 ABCXYZ',
        '未找到名为【费用】的区块。候选：【ABCDEF】、【ABCXYZ】',
    )
    results['negative_reply_accepted_as_confirmation'] = fallback is not None
    results['negative_reply_result'] = fallback
    with tempfile.TemporaryDirectory(prefix='harness-audit-') as tmp:
        save_section_mapping('费用', '内部成本', quote='模板 A 的确认', workspace=tmp)
        results['general_mapping_applied_to_unrelated_hash'] = resolve_section_mapping(
            '费用', file_hash='unrelated-template-B', workspace=tmp
        ) == '内部成本'
    wb = Workbook()
    ws = wb.active
    for coordinate, value in {
        'A1': '销售', 'C2': '202610', 'C3': '预测', 'B4': 'SALES_ONLY', 'C4': 100,
        'A6': '服务', 'C7': '202610', 'C8': '预测', 'B9': 'SERVICE_ONLY', 'C9': 900,
    }.items():
        ws[coordinate] = value
    spec, column = locate(ws, '销售', '202610', '预测', {'SERVICE_ONLY'})
    results['cross_section_key_accepted'] = spec['department_rows'].get('SERVICE_ONLY') == 9
    results['cross_section_binding'] = {'region': spec['region_id'], 'rows': spec['department_rows'], 'column': column}
    wb.close()
    recon = compute_reconciliation(Decimal('100'), [{'key': 'CREDIT', 'row': 1, 'value': '-5'}], 'K', '费用')
    results['negative_preserved_amount_not_flagged_as_impact'] = not recon['unmatched_details'][0]['has_impact']
    results['reconciliation_result'] = recon
    (ROOT / 'harness-probes.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(json.dumps(results, ensure_ascii=False, indent=2))
    assert all(results[name] for name in (
        'ungrounded_quote_accepted', 'negative_reply_accepted_as_confirmation',
        'general_mapping_applied_to_unrelated_hash', 'cross_section_key_accepted',
        'negative_preserved_amount_not_flagged_as_impact',
    )), 'A probe no longer reproduces; review its finding before reporting.'


if __name__ == '__main__':
    main()
