"""Differential checks of current native runtime, not an LLM/API E2E run.

Uses independent SQL expected results. Refusal probes intentionally expose
existing contract gaps and return a failing exit status; never hide as xfail.
"""
import argparse
from collections import Counter
import copy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys

from catalog import CASES, FIELDS, NEGATIVE_PROBES

ROOT=Path(__file__).resolve().parents[3]
RUNTIME=ROOT/'apps/backend/runtimes/personal-sandbox-runner'
sys.path.insert(0,str(RUNTIME/'src'))
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_analysis_schema import ANALYSIS_TOOL


def dump(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2,default=str)+'\n')


def plan_for(profile, native):
    table = {
        'id': 'detail',
        'sheet': profile['sheet'],
        'header_row': profile['header_row'],
        'data_range': profile['data_range'],
        'filters': copy.deepcopy(native.get('filters', [])),
    }
    if 'where' in native:
        table['where'] = copy.deepcopy(native['where'])
    if 'group_by' in native:
        table['group_by'] = copy.deepcopy(native['group_by'])
    if 'having' in native:
        table['having'] = copy.deepcopy(native['having'])

    plan = {'tables': [table]}
    if 'where' in native:
        plan['where'] = copy.deepcopy(native['where'])
    if 'group_by' in native:
        plan['group_by'] = copy.deepcopy(native['group_by'])
    if 'having' in native:
        plan['having'] = copy.deepcopy(native['having'])
    if 'order_by' in native:
        plan['order_by'] = copy.deepcopy(native['order_by'])
    if 'limit' in native:
        plan['limit'] = native['limit']
    if 'distinct' in native:
        plan['distinct'] = native['distinct']
    if 'fields' in native:
        plan['fields'] = copy.deepcopy(native['fields'])

    calculations = []
    if not native.get('distinct'):
        metrics = native.get('metrics', [('records', 'wbs', 'count', 'count'),
                                          ('amount_k', 'amount', 'sum', 'amount'),
                                          ('hours', 'hours', 'sum', 'duration')])
        for cid, column, op, unit in metrics:
            expression = {'aggregate': op, 'table': 'detail', 'column': FIELDS[column], 'unit': unit}
            if native.get('group_by'):
                expression['group_by'] = native['group_by']
            calculations.append({'id': cid, 'label': cid, 'expression': expression, 'output_unit': 'source'})
    plan['calculations'] = calculations
    return plan


def canonical(rows):
    numeric_keys = {'records', 'amount_k', 'hours', 'min_hours', 'max_hours', 'avg_hours', 'distinct_wbs'}
    return Counter(tuple(sorted((k, Decimal(str(v)) if k in numeric_keys and v is not None else v)
                                for k, v in row.items())) for row in rows)


def verify(result, expected, profile, c=None):
    issues = []
    if not result.is_success:
        return [str(result.error)]
    if result.provenance.get('workbook_id') != profile['sha256']:
        issues.append('source_hash_mismatch')
    data = result.data
    if not data.get('evidence_id'):
        issues.append('missing_evidence_id')
    coverage = data['coverage'][0]
    if coverage['selected_rows'] != expected['selected_row_ids']:
        issues.append('selected_rows_mismatch')
    if not coverage.get('coverage_complete') or coverage['data_range'] != profile['data_range']:
        issues.append('incomplete_range')
    grouped = {}
    source_cells = {}
    expected_units = {
        'records': 'number', 'amount_k': 'K', 'hours': '小时',
        'min_hours': '小时', 'max_hours': '小时', 'avg_hours': '小时',
        'distinct_wbs': 'number',
    }
    for fact in data.get('facts', []):
        metric = fact['id'].split('__', 1)[0]
        if c and c.get('native', {}).get('distinct') and metric == 'matched_rows_count':
            if Decimal(str(fact['value'])) != len(expected['rows']):
                issues.append('distinct_count_mismatch')
            if fact.get('unit') != '条' or not fact.get('source_cells'):
                issues.append('unbound_distinct_count')
            continue
        if metric not in expected_units:
            issues.append('unexpected_metric:' + metric)
            continue
        key = fact.get('group_key')
        row = grouped.setdefault(key, {} if key is None else {'group_key': key})
        if fact.get('group_fields'):
            row.update(fact['group_fields'])
        if metric in row:
            issues.append('duplicate_metric:' + metric)
        row[metric] = fact['value']
        if fact.get('unit') != expected_units[metric]:
            issues.append('unit_mismatch:' + metric + ':' + str(fact.get('unit')))
        if not fact.get('source_cells'):
            issues.append('unbound_fact:' + metric)
        source_cells.setdefault(metric, set()).update(fact.get('source_cells', []))
    source_fields = {
        'records': 'wbs', 'amount_k': 'amount', 'hours': 'hours',
        'min_hours': 'hours', 'max_hours': 'hours', 'avg_hours': 'hours',
        'distinct_wbs': 'wbs',
    }
    for metric, cells in source_cells.items():
        column = profile['headers'][source_fields[metric]]['column']
        rows = expected['selected_row_ids'] or [profile['header_row']]
        wanted = {f"{profile['sheet']}!{column}{r}" for r in rows}
        if c and (c.get('has_having') or c.get('has_limit')):
            if not cells.issubset(wanted) or (expected['selected_row_ids'] and not cells):
                issues.append('source_cells_mismatch:' + metric)
        else:
            if cells != wanted:
                issues.append('source_cells_mismatch:' + metric)

    # Legacy aggregate receipts may now include a detail preview. Compare their
    # aggregate facts; QueryIR rows represent the actual ordered query result.
    actual_rows = (data.get('rows', []) if data.get('query_ir_version')
                   or (c and c.get('native', {}).get('distinct')) else list(grouped.values()))
    numeric_keys = {'records', 'amount_k', 'hours', 'min_hours', 'max_hours', 'avg_hours', 'distinct_wbs'}
    if expected.get('ordered'):
        def row_tuple(r):
            return tuple(sorted((k, Decimal(str(v)) if k in numeric_keys and v is not None else v) for k, v in r.items()))
        if [row_tuple(r) for r in actual_rows] != [row_tuple(r) for r in expected['rows']]:
            issues.append('result_order_mismatch')
    else:
        if canonical(actual_rows) != canonical(expected['rows']):
            issues.append('result_bag_mismatch')
    return issues


def main(source,evidence):
    profile=json.loads((evidence/'profile.json').read_text())
    expected=json.loads((evidence/'expected.json').read_text())
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    if digest!=profile['sha256']:
        raise ValueError('原件与oracle版本不一致')
    out=evidence/'native'
    out.mkdir(exist_ok=False)
    rows=[]
    for c in CASES:
        if c['native'] is None:
            rows.append({'id':c['id'],'family':c['family'],'status':'unsupported_adapter',
                         'reason':'本套尚无完整原生适配；需区分协议缺口与可组合操作，不能判为模型失败或通过'})
            continue
        plan=plan_for(profile,c['native'])
        result=calculate_spreadsheet_analysis(source,plan)
        issues=verify(result,expected[c['id']],profile,c)
        dump(out/(c['id']+'.json'),result.to_dict())
        rows.append({'id':c['id'],'family':c['family'],'status':'fail' if issues else 'pass','issues':issues})
    enum=ANALYSIS_TOOL['function']['parameters']['properties']['tables']['items']['properties']['filters']['items']['properties']['op']['enum']
    for probe in NEGATIVE_PROBES:
        plan=plan_for(profile,{'filters':[probe['filter']]})
        result=calculate_spreadsheet_analysis(source,plan)
        dump(out/(probe['id']+'.json'),result.to_dict())
        rows.append({'id':probe['id'],'status':'pass' if result.is_error else 'contract_violation',
                     'reason':probe['reason'],'runtime_status':result.status,
                     'public_op_enum':enum,'error':result.error})
    unchanged=hashlib.sha256(source.read_bytes()).hexdigest()==digest
    report={'layer':'native_differential_not_live_e2e','source_unchanged':unchanged,
            'summary':dict(Counter(r['status'] for r in rows)),'cases':rows,
            'fingerprints':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [
                RUNTIME/'src/dsh_modules/spreadsheet_analysis.py',
                RUNTIME/'src/dsh_modules/spreadsheet_analysis_schema.py',
                RUNTIME/'src/dsh_modules/spreadsheet_expression.py',
                RUNTIME/'skills/xlsx/SKILL.md']}}
    dump(evidence/'native-report.json',report)
    print(json.dumps({'summary':report['summary'],'source_unchanged':unchanged},ensure_ascii=False))
    return int(not unchanged or any(r['status'] in ('fail','contract_violation') for r in rows))


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path)
    p.add_argument('evidence',type=Path)
    a=p.parse_args()
    sys.exit(main(a.source,a.evidence))
