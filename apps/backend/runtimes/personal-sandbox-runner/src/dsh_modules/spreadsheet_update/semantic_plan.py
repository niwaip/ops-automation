"""Compile request-bound workbook observations into exact verified writes."""
import datetime
import hashlib
import json
from dataclasses import replace
from pathlib import Path
import openpyxl
from openpyxl.utils import get_column_letter
from .bindings import LogicalKey
from .compiler import compile_update_plan
from .discovery import extract_workbook_ir
from .layout_binding import locate, verify_unit, SECTION_ALIASES
from .result_catalog import (
    bind_result, convert_value, fingerprint, normalize_unit,
    select_result, serialize_facts, RESULTS,
)
from .sources import FactTable
from ..user_declarations import unit_confirmation

REQUEST_FIELDS = {'target_file', 'result_id', 'base_sheet', 'new_sheet', 'period', 'period_field', 'section',
                  'target_label', 'target_kind', 'target_unit', 'key_field', 'metric_id', 'output_name',
                  'target_range', 'protected_labels', 'unit_cell', 'sections'}
REQUIRED_FIELDS = {'target_file', 'base_sheet', 'new_sheet', 'period', 'period_field',
                   'target_kind'}


def _extract_where_values(predicate):
    values = set()
    if not isinstance(predicate, dict):
        return values
    if 'value' in predicate:
        values.add(str(predicate['value']).strip())
    for k in ('and', 'or'):
        if k in predicate and isinstance(predicate[k], list):
            for sub in predicate[k]:
                values.update(_extract_where_values(sub))
    return values


def build_semantic_plan(request, workspace):
    if request.keys() - REQUEST_FIELDS:
        raise ValueError('不支持的更新参数：' + ', '.join(sorted(request.keys() - REQUEST_FIELDS)))
    for key in REQUIRED_FIELDS:
        if not request.get(key):
            raise ValueError('缺少业务参数：' + key)
    if not request.get('sections') and not request.get('section'):
        raise ValueError('缺少业务参数：section')
    if not request.get('target_label') and not (
        request.get('sections') and isinstance(request.get('sections'), (list, tuple))
        and all(isinstance(s, dict) and s.get('target_label') for s in request.get('sections'))
    ):
        raise ValueError('缺少业务参数：target_label')
    if request['target_kind'] not in ('forecast', 'actual'):
        raise ValueError('仅允许更新预测或实绩输入列')
    period = str(request['period'])
    target = Path(request['target_file'])
    target = (Path(workspace) / target).resolve() if not target.is_absolute() else target.resolve()
    if not target.is_relative_to(Path(workspace).resolve()):
        from ..spreadsheet_context import resolve_session_attachment
        resolved, error = resolve_session_attachment(request['target_file'], '更新目标')
        if error or resolved is None or not resolved.is_relative_to(Path(workspace).resolve()):
            raise ValueError('目标必须是当前会话授权的工作区附件')
        target = resolved
    source_sheet = request['base_sheet']
    new_sheet = request['new_sheet']
    if not isinstance(new_sheet, str) or not new_sheet or len(new_sheet) > 31 or any(c in new_sheet for c in r'\/*?:[]'):
        raise ValueError('新工作表名不符合 Excel 名称约束')
    unit = normalize_unit(request.get('target_unit'))

    # Normalize section configurations
    sections_input = request.get('sections')
    if sections_input:
        if not isinstance(sections_input, (list, tuple)):
            raise ValueError('sections 必须是列表')
        section_configs = []
        for s in sections_input:
            if isinstance(s, str):
                section_configs.append({'section': s.strip()})
            elif isinstance(s, dict):
                section_configs.append(s)
            else:
                raise ValueError('sections 元素必须为字符串或字典')
    else:
        raw_sec = request.get('section')
        if isinstance(raw_sec, (list, tuple)):
            section_configs = [{'section': str(s).strip()} for s in raw_sec]
        elif isinstance(raw_sec, str) and any(sep in raw_sec for sep in (',', '、', '，')):
            sep = ',' if ',' in raw_sec else ('、' if '、' in raw_sec else '，')
            section_configs = [{'section': s.strip()} for s in raw_sec.split(sep) if s.strip()]
        else:
            section_configs = [{'section': str(raw_sec).strip()}]

    wb = openpyxl.load_workbook(target)
    try:
        if source_sheet not in wb.sheetnames or new_sheet in wb.sheetnames:
            raise ValueError(f'base_sheet 必须是目标工作簿中被复制的快照，候选：{wb.sheetnames}；new_sheet 必须尚不存在')
        ws = wb[source_sheet]
        confirmation = unit_confirmation()
        unit = verify_unit(ws, unit, request.get('unit_cell'), confirmation)

        region_specs = []
        mapped = FactTable()
        preview = []
        ops = [{'op': 'copy_sheet', 'op_id': 'copy', 'source_sheet': source_sheet, 'target_sheet': new_sheet}]
        input_hashes = {str(target): fingerprint(target)}
        warnings = []

        for sec_cfg in section_configs:
            sec_name = sec_cfg.get('section')
            if not sec_name:
                raise ValueError('每个区块配置必须指定 section')
            sec_result_id = sec_cfg.get('result_id', request.get('result_id'))
            sec_key_field = sec_cfg.get('key_field', request.get('key_field'))
            sec_metric_id = sec_cfg.get('metric_id', request.get('metric_id'))
            sec_target_label = sec_cfg.get('target_label', request.get('target_label'))
            sec_target_kind = sec_cfg.get('target_kind', request.get('target_kind'))
            sec_target_range = sec_cfg.get('target_range', request.get('target_range'))
            sec_protected = sec_cfg.get('protected_labels', request.get('protected_labels', []))

            # Select result for this section
            if sec_result_id:
                result = select_result(sec_result_id)
            elif len(RESULTS) == 1:
                result = next(iter(RESULTS.values()))
            else:
                alias_list = [sec_name] + SECTION_ALIASES.get(sec_name, [])
                matched_res = None
                for r_id, r in RESULTS.items():
                    plan_where = r.get('data', {}).get('plan', {}).get('where', {})
                    where_vals = _extract_where_values(plan_where)
                    if any(v in alias_list or any(a in v for a in alias_list) for v in where_vals):
                        matched_res = r
                        break
                if matched_res:
                    result = matched_res
                else:
                    raise ValueError(f'请用 result_id 指定区块 {sec_name} 的统计结果；当前没有唯一结果')

            provenance = result['provenance']
            source = provenance.get('file_path')
            source_hash = provenance.get('workbook_id') or result['data'].get('workbook_id')
            if not source or not source_hash or fingerprint(source) != source_hash:
                raise ValueError('来源指纹缺失或已变化，请重新统计')
            input_hashes[source] = source_hash

            source_facts, metric = bind_result(result, sec_key_field, request['period_field'], period, sec_metric_id)
            facts = source_facts.all_facts()
            spec, col = locate(ws, sec_name, period, sec_target_label,
                               {f.logical_key.department_code for f in facts}, sec_target_range,
                               sec_protected)
            spec.update(metric_id=metric, unit=unit, value_kind=sec_target_kind)
            region_specs.append(spec)

            for fact in facts:
                code = fact.logical_key.department_code
                key = LogicalKey(spec['region_id'], code, metric, period, sec_target_kind, unit)
                value = convert_value(fact.numeric_value, fact.unit, unit)
                mapped.add_fact(replace(fact, logical_key=key, numeric_value=value, unit=unit))
                coord = f"{get_column_letter(col)}{spec['department_rows'][code]}"
                ops.append({
                    'op': 'fill_from_result', 'op_id': f'fill_{len(preview)}', 'target_sheet': new_sheet,
                    'coordinate': coord, 'fact_ref': fact.evidence_id, 'region_id': key.region_id,
                    'department_code': code, 'metric_id': metric, 'period': period,
                    'value_kind': key.value_kind, 'unit': unit
                })
                preview.append({'key': code, 'coordinate': coord, 'value': str(value), 'unit': unit})

            unmatched = spec['department_rows'].keys() - {f.logical_key.department_code for f in facts}
            if unmatched:
                prefix = f'{sec_name}区块' if len(section_configs) > 1 else ''
                warnings.append(f'{prefix}来源无匹配记录，保留原值：' + ', '.join(sorted(unmatched)))
    finally:
        wb.close()

    output = request.get('output_name') or f'{target.stem}_{new_sheet}.xlsx'
    if not request.get('output_name'):
        base = Path(output).stem
        version = 1
        while (Path(workspace) / output).exists():
            version += 1
            output = f'{base}_{version}.xlsx'
    if Path(output).name != output or not output.endswith('.xlsx') or (Path(workspace) / output).exists():
        raise ValueError('输出必须为工作区内尚不存在的 .xlsx 文件，不能覆盖输入或历史文件')
    payload = serialize_facts(mapped)

    plan = {
        'schema_version': 'SpreadsheetUpdatePlan/v1', 'task_contract_ref': 'current_turn',
        'target_ref': str(target), 'sources': [], 'as_of': datetime.date.today().isoformat(),
        'snapshot': {'selected_sheet_id': source_sheet, 'new_sheet_name': new_sheet},
        'semantic_bindings': {
            'region_specs': region_specs, 'facts_hash': hashlib.sha256(payload).hexdigest(),
            'unit_basis': {'source': 'user', **confirmation} if confirmation else {'source': 'workbook', 'unit': unit},
            'input_hashes': input_hashes, 'warnings': warnings
        },
        'operations': ops, 'preserve': {}, 'requirements': {},
        'output': {'mode': 'deliverable_file', 'display_name': output}
    }
    compile_update_plan(plan, extract_workbook_ir(target, source_sheet, region_specs=region_specs), mapped)
    return plan, mapped, payload, preview, warnings
