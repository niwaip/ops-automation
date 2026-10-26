"""Bounded completion of trusted semantic recipes from verified source expressions.

No stored values, question literals, sheet guesses or cross-scope arithmetic are
inputs. Every compiled recipe is executed again by the normal source-bound engine.
"""

import copy
import hashlib
import json
import re
from .analysis_contract import build_analysis_contract
from .analysis_semantics import derivation_recipes, domain_pack
from .analysis_task_state import analysis_task_state
from .spreadsheet_analysis import calculate_spreadsheet_analysis
from .query_fact_binding import bind_query_fact


def _leaf(expression, receipt):
    if expression.get('aggregate')!='sum' or expression.get('unit') not in ('amount','number'):
        return None
    data=receipt.data
    coverage=next((c for c in data['coverage'] if c['id']==expression.get('table')),None)
    table=next((t for t in data['plan']['tables'] if t['id']==expression.get('table')),None)
    if not coverage or not table or not coverage.get('coverage_complete'):
        return None
    column=expression.get('column')
    column=next((key for key,value in coverage['headers'].items() if key==column or value==column),None)
    if not column:
        return None
    provenance=receipt.provenance
    scope=(provenance['file_path'],provenance['workbook_id'],coverage['sheet'],
           coverage['header_row'],tuple(coverage['selected_rows']))
    field=(column,expression['aggregate'],expression['unit'])
    return {'scope':scope,'field':field,'expression':{**expression,'column':column},
            'table':table,'evidence_id':data['evidence_id']}


def _resolve_fact_metric_id(fact, pack):
    if fact.get('metric_id'):
        return fact['metric_id']
    if not pack or not hasattr(pack, 'METRICS'):
        return None
    gk = fact.get('group_key')
    if gk is not None:
        gk_str = str(gk).strip()
        for m in pack.METRICS:
            if m.get('expected_type') != 'percentage' and any(re.search(p, gk_str, re.I) for p in m.get('patterns', [])):
                return m['id']
    for v in (fact.get('group_fields') or {}).values():
        v_str = str(v).strip()
        for m in pack.METRICS:
            if m.get('expected_type') != 'percentage' and any(re.search(p, v_str, re.I) for p in m.get('patterns', [])):
                return m['id']
    label = fact.get('label') or ''
    for m in pack.METRICS:
        if m.get('expected_type') != 'percentage' and any(re.search(p, label, re.I) for p in m.get('patterns', [])):
            return m['id']
    return None


class RegisteredMetricCompletion:
    """At most four source-plan executions per turn; failed recipes are not retried."""
    def __init__(self):
        self.attempted=set()

    def complete(self,evidence,prompt,telemetry,allowed_names,deadline=None):
        if not {'aggregate_spreadsheet','analyze_spreadsheet'}&set(allowed_names):
            return []
        contract=build_analysis_contract(prompt)
        recipes=[r for r in derivation_recipes(contract.domain)
                 if any(m.semantic_id==r['metric_id'] for m in contract.metrics)]
        if not recipes:
            return []
        state=analysis_task_state(evidence,prompt,deadline=deadline)
        if any(issue['code'] not in ('required_metrics_missing','comparison_windows_missing') for issue in state['issues']):
            return []
        pack=domain_pack(contract.domain)
        bank={}; existing=set()
        for receipt in evidence:
            if not receipt.is_success or not isinstance(receipt.data,dict) or receipt.data.get('kind')!='spreadsheet_analysis':
                continue
            data=receipt.data
            if data.get('semantic_domain')!={'id':contract.domain,'version':pack.VERSION}:
                continue
            plan_obj = data.get('plan') or {}
            raw_calcs = plan_obj.get('calculations') or []
            if not raw_calcs and plan_obj.get('metrics'):
                raw_calcs = [{'id': m['id'], 'expression': {'aggregate': m.get('op', 'sum'), 'column': m.get('field', '')}} for m in plan_obj.get('metrics', []) if isinstance(m, dict)]
            calculations = {c['id']: c for c in raw_calcs if isinstance(c, dict)}
            cov_list = data.get('coverage', [])
            cov = cov_list[0] if cov_list else {}
            sheet = cov.get('sheet')
            prov = receipt.provenance or {}
            for fact in data.get('facts',[]):
                metric_id = _resolve_fact_metric_id(fact, pack)
                query_binding = (bind_query_fact(fact, plan_obj, cov_list)
                                 if data.get('query_ir_version') else None)
                if query_binding and metric_id:
                    expression = query_binding['expression']
                    if expression.get('aggregate', 'sum') == 'sum':
                        scope = (prov.get('file_path'), prov.get('workbook_id'), *query_binding['selection'])
                        binding = {**query_binding, 'scope': scope, 'evidence_id': data['evidence_id']}
                        key = (metric_id, scope)
                        bank.setdefault(key, {})[binding['field']] = binding
                    continue
                calculation = calculations.get(fact['id'])
                if calculation:
                    expression = calculation['expression']
                    binding = _leaf(expression, receipt)
                    if binding and metric_id:
                        key = (metric_id, binding['scope'])
                        bank.setdefault(key, {})[binding['field']] = binding
                    elif expression.get('op') == 'divide' and len(expression.get('args', [])) == 2:
                        left, right = (_leaf(arg, receipt) for arg in expression['args'])
                        if left and right and left['scope'] == right['scope'] and fact.get('unit') == '%':
                            existing.add((metric_id or fact.get('metric_id'), left['scope']))
                elif metric_id and sheet and fact.get('source_cells'):
                    source_cells = fact.get('source_cells') or []
                    col_key = ''
                    if source_cells:
                        first_cell = source_cells[0].split('!')[-1]
                        col_letter = re.sub(r'\d+', '', first_cell)
                        col_key = cov.get('headers', {}).get(col_letter, col_letter)
                    scope = (prov.get('file_path'), prov.get('workbook_id'), sheet, col_key)
                    field = (col_key, 'cell', fact.get('unit', 'amount'))
                    if fact.get('unit') == '%':
                        existing.add((metric_id, scope))
                    elif len(source_cells) == 1:
                        cell_addr = source_cells[0].split('!')[-1]
                        binding = {
                            'scope': scope,
                            'field': field,
                            'expression': {'cell': cell_addr, 'sheet': sheet, 'unit': 'amount'},
                            'table': {
                                'sheet': sheet,
                                'header_row': cov.get('header_row', 1),
                                'data_range': cov.get('data_range', 'A1:Z100'),
                            },
                            'evidence_id': data.get('evidence_id'),
                        }
                        key = (metric_id, scope)
                        bank.setdefault(key, {})[field] = binding
        groups={}
        for recipe in recipes:
            numerator,denominator=recipe['operands']
            scopes={scope for metric,scope in bank if metric==numerator}
            for scope in sorted(scopes):
                if (recipe['metric_id'],scope) in existing:
                    continue
                left=bank.get((numerator,scope),{});right=bank.get((denominator,scope),{})
                # Multiple plausible source fields remain a semantic ambiguity.
                if len(left)!=1 or len(right)!=1:
                    continue
                bindings=[next(iter(left.values())),next(iter(right.values()))]
                groups.setdefault(scope[:2],[]).append((recipe,bindings))
        executed=[]
        for (source,source_hash),candidates in sorted(groups.items()):
            if len(self.attempted)>=4:
                break
            tables={};calculations=[];parents=set()
            for recipe,bindings in candidates[:8]:
                args=[]
                for binding in bindings:
                    table=copy.deepcopy(binding['table']);table.pop('id', None)
                    key=json.dumps(table,sort_keys=True,ensure_ascii=False)
                    if key not in tables:
                        tables[key]={**table,'id':f'derive_t{len(tables)}'}
                    arg_expr = {**binding['expression']}
                    if 'table' in arg_expr:
                        arg_expr['table'] = tables[key]['id']
                    args.append(arg_expr)
                    parents.add(binding['evidence_id'])
                calculations.append({'id':f'derive_m{len(calculations)}',
                    'label':recipe['name']+'（注册关系补算）','metric_id':recipe['metric_id'],
                    'output_unit':recipe['output_unit'],'expression':{'op':recipe['op'],'args':args}})
            plan={'tables':list(tables.values()),'calculations':calculations}
            key=hashlib.sha256((source_hash+json.dumps(plan,sort_keys=True,ensure_ascii=False)).encode()).hexdigest()
            if key in self.attempted:
                continue
            self.attempted.add(key)
            result=calculate_spreadsheet_analysis(source,plan,deadline,domain=contract.domain)
            if result.provenance is not None:
                result.provenance.update({'execution_origin':'registered_derivation',
                    'parent_evidence_ids':sorted(parents),'recipe_domain':contract.domain,'recipe_version':pack.VERSION})
            evidence.append(result);executed.append(result)
            telemetry.record_tool_call('aggregate_spreadsheet',{'file_path':source,**plan,
                'execution_origin':'registered_derivation'},'success' if result.is_success else 'error')
            telemetry.record_execution_result(result)
        return executed
