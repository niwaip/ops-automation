"""Turn-local verified analysis results. No unit aliases or invented zero facts."""
import copy
import hashlib
import json
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path

from .bindings import LogicalKey
from .sources import FactRecord, FactTable
from ..spreadsheet_units import AMOUNT_UNIT_FACTORS, normalize_unit

RESULTS = {}


def reset_results():
    RESULTS.clear()


def convert_value(value, source_unit, target_unit):
    source_unit, target_unit = normalize_unit(source_unit), normalize_unit(target_unit)
    value = Decimal(str(value))
    if not value.is_finite():
        raise ValueError('统计结果包含非有限数值')
    if source_unit == target_unit and source_unit not in ('source', '', None):
        return value
    money = {normalize_unit(name):Decimal(factor) for name,factor in AMOUNT_UNIT_FACTORS.items()}
    if source_unit in money and target_unit in money:
        return value * money[source_unit] / money[target_unit]
    raise ValueError(f'单位不兼容：{source_unit} → {target_unit}')


def harvest_analytical_facts(data, fact_table=None, provenance=None):
    """Store verified raw results. Domain keys/periods are bound by the request later."""
    table = fact_table if fact_table is not None else FactTable()
    if not isinstance(data, dict) or data.get('kind') != 'spreadsheet_analysis':
        return table
    result_id = data.get('evidence_id')
    if not result_id or not data.get('facts'):
        raise ValueError('统计结果缺少执行证据或数值事实')
    if any(not coverage.get('coverage_complete') for coverage in data.get('coverage', [])):
        raise ValueError('统计数据覆盖不完整，不能用于更新')
    ids = set()
    for fact in data['facts']:
        if fact.get('id') in ids:
            raise ValueError('统计事实 ID 重复')
        ids.add(fact.get('id'))
        convert_value(fact['value'], fact.get('unit'), fact.get('unit'))
    RESULTS[result_id] = {'data': copy.deepcopy(data), 'provenance': dict(provenance or {})}
    return table


def _requires_equality(predicate, field, value):
    """Only constraints true on every branch establish a verified period."""
    if not isinstance(predicate, dict):
        return False
    if 'and' in predicate:
        return any(_requires_equality(p, field, value) for p in predicate['and'])
    if 'or' in predicate:
        return bool(predicate['or']) and all(_requires_equality(p, field, value) for p in predicate['or'])
    return predicate.get('field') == field and predicate.get('op') == 'eq' and str(predicate.get('value')) == value


def bind_result(result, key_field, period_field, period, metric_id=None):
    data = result['data']
    group_fields = data.get('plan', {}).get('group_by', [])
    if not key_field:
        if len(group_fields) != 1 or not isinstance(group_fields[0], str):
            raise ValueError('来源分组键不唯一，请指定 key_field')
        key_field = group_fields[0]
    if key_field not in group_fields:
        raise ValueError('key_field 必须是统计查询实际使用的分组字段')
    if period_field and period is not None:
        if not _requires_equality(data.get('plan', {}).get('where'), period_field, period):
            raise ValueError('缺少单一期间依据：请在统计查询中按 period_field 等于 period 筛选')
    metrics = [m['id'] for m in data.get('plan', {}).get('metrics', [])]
    metric_id = metric_id or (metrics[0] if len(metrics) == 1 else None)
    if metric_id not in metrics:
        raise ValueError('请指定唯一统计指标 metric_id')
    table = FactTable()
    seen = set()
    for fact in data['facts']:
        if fact['id'] != metric_id and not fact['id'].startswith(metric_id + '__'):
            continue
        raw_key = fact.get('group_fields', {}).get(key_field)
        if raw_key is None or str(raw_key).strip() == '':
            raise ValueError('统计事实缺少已声明的分组键')
        key_text = str(raw_key).strip()
        if key_text in seen:
            raise ValueError('同一业务键重复；请仅按回填业务键汇总')
        seen.add(key_text)
        unit = normalize_unit(fact['unit'])
        key = LogicalKey('source', key_text, metric_id, period, 'actual', unit)
        table.add_fact(FactRecord(key, convert_value(fact['value'], unit, unit), unit, period,
                                 data.get('as_of', ''), data['evidence_id'], 0, 'aggregate',
                                 data['evidence_id'] + ':' + fact['id']))
    if not table.all_facts():
        raise ValueError('统计指标没有可绑定事实')
    return table, metric_id


def select_result(result_id=None):
    if result_id:
        if result_id in RESULTS:
            return RESULTS[result_id]
        # 容错 1：模型可能混淆了 evidence_id 与指标 ID / 标签 (如传入 amount_sum, 金额合计(K) 等)
        for r in RESULTS.values():
            plan_obj = r.get('data', {}).get('plan', {})
            metric_ids = {m.get('id') for m in plan_obj.get('metrics', [])}
            metric_labels = {m.get('label') for m in plan_obj.get('metrics', [])}
            if result_id in metric_ids or result_id in metric_labels:
                return r
        # 容错 2：当前上下文有且仅有一个已验证聚合结果时，宽容直接关联该唯一结果
        if len(RESULTS) == 1:
            return next(iter(RESULTS.values()))
        raise ValueError('该统计结果不属于本轮已验证结果，请先调用 aggregate_spreadsheet')
    if len(RESULTS) == 1:
        return next(iter(RESULTS.values()))
    if not RESULTS:
        raise ValueError('本轮尚未调用 aggregate_spreadsheet 完成数据验证')
    raise ValueError('请用 result_id 指定本轮统计结果；当前没有唯一结果')


def serialize_facts(table):
    return json.dumps([{**asdict(f), 'numeric_value': str(f.numeric_value)} for f in table.all_facts()],
                      ensure_ascii=False, sort_keys=True).encode()


def load_facts(payload):
    table = FactTable()
    for raw in json.loads(payload):
        raw['logical_key'] = LogicalKey(**raw['logical_key'])
        raw['numeric_value'] = Decimal(raw['numeric_value'])
        table.add_fact(FactRecord(**raw))
    return table


def fingerprint(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
