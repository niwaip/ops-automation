"""Bounded completion of trusted semantic recipes from verified source expressions.

No stored values, question literals, sheet guesses or cross-scope arithmetic are
inputs. Every compiled recipe is executed again by the normal source-bound engine.
"""

import copy
import hashlib
import json
from .analysis_contract import build_analysis_contract
from .analysis_semantics import derivation_recipes, domain_pack
from .analysis_task_state import analysis_task_state
from .spreadsheet_analysis import calculate_spreadsheet_analysis


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
        state=analysis_task_state(evidence,prompt)
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
            calculations={c['id']:c for c in data['plan'].get('calculations',[])}
            for fact in data.get('facts',[]):
                calculation=calculations.get(fact['id'])
                if not calculation or not fact.get('metric_id'):
                    continue
                expression=calculation['expression']
                binding=_leaf(expression,receipt)
                if binding:
                    key=(fact['metric_id'],binding['scope'])
                    bank.setdefault(key,{})[binding['field']]=binding
                elif expression.get('op')=='divide' and len(expression.get('args',[]))==2:
                    left,right=(_leaf(arg,receipt) for arg in expression['args'])
                    if left and right and left['scope']==right['scope'] and fact['unit']=='%':
                        existing.add((fact['metric_id'],left['scope']))
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
                    table=copy.deepcopy(binding['table']);table.pop('id')
                    key=json.dumps(table,sort_keys=True,ensure_ascii=False)
                    if key not in tables:
                        tables[key]={**table,'id':f'derive_t{len(tables)}'}
                    args.append({**binding['expression'],'table':tables[key]['id']})
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
