"""Small domain registry: concepts, measures, relations and validation hooks.

Domain selection is runtime policy, never a workbook name or a model tool field.
The Excel executor is generic by default. Auto vocabulary routing is a separate
compatibility policy and may be overridden with DSH_ANALYSIS_DOMAIN.
"""

import importlib
import json
import os
import re
from contextlib import contextmanager
from contextvars import ContextVar

DOMAIN_MODULES = {
    'finance': '.analysis_domain_finance',
    'commerce': '.analysis_domain_commerce',
}
GENERIC_CONCEPTS = [
    {'name': 'data_quality',
     'patterns': [r'数据质量', r'字段异常', r'记录异常', r'凭证异常', r'审批状态异常', r'日期异常'],
     'required_metrics': [], 'capabilities': ['validate_spreadsheet_rows']},
]
_runtime_domain = ContextVar('spreadsheet_analysis_domain', default=None)


def domain_pack(domain):
    if domain == 'generic':
        return None
    if domain not in DOMAIN_MODULES:
        raise ValueError(f'未知分析领域：{domain}；可用 generic、finance、commerce、auto')
    return importlib.import_module(DOMAIN_MODULES[domain], __package__)


def domain_definitions(domain):
    pack = domain_pack(domain)
    return (pack.METRICS if pack else [], GENERIC_CONCEPTS + (pack.CONCEPTS if pack else []))


def derivation_recipes(domain):
    """Trusted registry relations, without Excel names, ranges or stored answers."""
    metrics,_=domain_definitions(domain)
    by_name={metric['name']:metric['id'] for metric in metrics}
    return [{'metric_id':metric['id'],'name':metric['name'],'op':'divide','output_unit':'%',
             'operands':[by_name[metric['numerator_metric']],by_name[metric['denominator_metric']]]}
            for metric in metrics if metric.get('expected_type')=='percentage'
            and metric.get('numerator_metric') in by_name and metric.get('denominator_metric') in by_name]


def select_domain(prompt='', configured=None):
    requested = configured if configured is not None else os.getenv('DSH_ANALYSIS_DOMAIN', 'auto')
    if requested != 'auto':
        domain_pack(requested)  # Unknown trusted configuration must fail closed.
        return requested
    candidates = []
    for domain in DOMAIN_MODULES:
        pack = domain_pack(domain)
        if any(re.search(pattern, prompt or '', re.I)
               for definition in pack.METRICS + pack.CONCEPTS for pattern in definition['patterns']):
            candidates.append(domain)
    # Mixed/unknown vocabulary does not silently impose one domain's rules.
    return candidates[0] if len(candidates) == 1 else 'generic'


@contextmanager
def analysis_domain_scope(prompt='', configured=None):
    token = _runtime_domain.set(select_domain(prompt, configured))
    try:
        yield
    finally:
        _runtime_domain.reset(token)


def runtime_domain():
    return _runtime_domain.get() or select_domain('', None)


def validate_domain_calculation(item, bindings, domain):
    pack = domain_pack(domain)
    metric_id = item.get('metric_id')
    if metric_id is not None:
        metrics = pack.METRICS if pack else []
        if not isinstance(metric_id, str) or not any(m['id'] == metric_id for m in metrics):
            raise ValueError(f'当前领域 {domain} 未注册 metric_id={metric_id}')
        definition = next(m for m in metrics if m['id'] == metric_id)
        if 'aggregate' in bindings and bindings['aggregate'] != 'count':
            if not any(re.search(pattern, bindings['source_header'], re.I) for pattern in definition['patterns']):
                raise ValueError('已注册指标与来源字段不一致')
    validator = getattr(pack, 'validate_calculation', None)
    if validator:
        validator(item, bindings)


def validate_metric_result(metric_id, unit, domain):
    if not metric_id:
        return
    metrics,_=domain_definitions(domain)
    definition=next(metric for metric in metrics if metric['id']==metric_id)
    expected=definition['expected_type']
    if (expected=='percentage' and unit!='%') or (expected=='number' and unit=='%'):
        raise ValueError(f'已注册指标 {metric_id} 的结果类型不符：需要 {expected}，实际单位 {unit}')


def domain_plan_context(prompt='', configured=None):
    domain = select_domain(prompt, configured)
    pack = domain_pack(domain)
    if not pack:
        return '\n【分析领域】generic：使用实际来源字段和显式计划，不附加财务指标要求。\n'
    catalog = [{'id': m['id'], 'name': m['name'], 'type': m['expected_type'],
                **{k: m[k] for k in ('numerator_metric', 'denominator_metric') if k in m}}
               for m in pack.METRICS]
    return ('\n【分析领域】' + domain + '；定义版本 ' + pack.VERSION + '\n'
            + json.dumps(catalog, ensure_ascii=False)
            + '\n可用 metric_id 绑定已注册语义；实际表、列、期间仍必须从原件选择。\n'
            + pack.GUIDANCE)
