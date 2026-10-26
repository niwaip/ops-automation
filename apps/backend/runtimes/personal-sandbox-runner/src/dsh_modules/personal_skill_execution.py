"""Read-only execution adapters for admitted saved flows and transient queries."""

import hashlib
import json
from pathlib import Path
from urllib.parse import quote

from .personal_skill_workflow_engine import bind_field, digest, execute_workflow, verify_receipt
from .spreadsheet_analysis import calculate_spreadsheet_analysis
from .spreadsheet_preflight import profile_spreadsheet_for_planning
from .tool_result import ToolResult


def load_package(package):
    manifest = json.loads((package / 'execution.json').read_text(encoding='utf-8'))
    if (manifest.get('schema_version') != 1 or manifest.get('kind') != 'personal_skill_workflow'
            or manifest.get('entrypoint') != 'scripts/run.py' or manifest.get('plan') != 'references/workflow.json'):
        raise ValueError('非法执行入口或流程版本')
    plan_bytes = (package / manifest['plan']).read_bytes()
    engine_bytes = (package / manifest['entrypoint']).read_bytes()
    trusted = Path(__file__).with_name('personal_skill_workflow_engine.py').read_bytes()
    if (hashlib.sha256(engine_bytes).hexdigest() != manifest.get('engine_sha256') or engine_bytes != trusted
            or hashlib.sha256(plan_bytes).hexdigest() != manifest.get('plan_sha256')):
        raise ValueError('核算程序或规则已变化，必须重新验证后再调用')
    validation = json.loads((package / 'references/validation.json').read_text(encoding='utf-8'))
    if validation.get('status') != 'replayed' or validation.get('plan_sha256') != manifest['plan_sha256']:
        raise ValueError('保存时的核算验证与当前流程不一致')
    return manifest, json.loads(plan_bytes), validation


def candidate_context(slug, skill_md, saved, prompt, history, source, admission):
    request = prompt.split('用户指令：')[-1]
    users = list(dict.fromkeys(h['content'].split('用户指令：')[-1]
                              for h in history if h.get('role') == 'user'))[-6:]
    users = [text for text in users if text != request]
    if len(request) > 6000 or sum(map(len, users)) > 20000:
        raise ValueError('请求上下文超过语义门禁预算，不能静默截断后执行')
    if admission.get('action') != 'use' or admission.get('skill_id') != slug:
        raise ValueError('未通过共享技能准入，不能直接执行个人核算技能')
    use_saved_rules = admission.get('use_default_rules')
    if not isinstance(use_saved_rules, bool):
        raise ValueError('共享准入口径缺失')
    profile = profile_spreadsheet_for_planning(source, prompt=request)
    if not profile.get('headers'):
        raise ValueError('无法检查本轮附件结构')
    # The profile is structural evidence; do not send sampled amounts as computed facts.
    structure = {k: profile[k] for k in ('sheet', 'header_row', 'data_range', 'records', 'headers')}
    candidate = {'slug': slug, 'skill': skill_md[:12000], 'saved_workflow': saved}
    if not use_saved_rules:
        # Discovery metadata is not an instruction to inherit an unselected business policy.
        candidate = {'slug': slug, 'role': 'capability_reference_only',
                     'capability': {'group_by': saved['group_by'], 'measure': saved['measure']},
                     'default_business_rules_applicable': False}
    context = {'request': request, 'user_history': users, 'candidate': candidate,
               'use_saved_rules': use_saved_rules, 'shared_admission': admission, 'source_structure': structure}
    if use_saved_rules:
        headers = list(structure['headers'].values())
        field = lambda name: headers[bind_field(headers, name)]
        filters = [{'field': field(f['field']), 'op': 'not_starts_with' if f['op'] == 'exclude_prefix' else f['op'],
                    'values': f['values']} for f in saved['filters']]
        context['saved_query_template'] = {
            'source': {k: structure[k] for k in ('sheet', 'header_row', 'data_range')},
            'group_by': [field(saved['group_by'])],
            'metrics': [{'id': 'amount', 'label': saved['measure'], 'op': 'sum', 'field': field(saved['measure']), 'unit': 'source'},
                        {'id': 'records', 'label': '条数', 'op': 'count_rows'}],
            'where': ({'and': filters} if len(filters) > 1 else filters[0]) if filters else None, 'having': None}
    return context


def execute_proposal(proposal, source, saved, validation, identity, context, deadline):
    if proposal['query'] == context.get('saved_query_template'):
        data = execute_workflow(source, saved, deadline)
        verify_receipt(data, saved, source)
        if validation.get('source_sha256') == data['workbook_id']:
            from decimal import Decimal
            if (int(Decimal(data['total']) * Decimal('1e20')) != int(validation['total_scaled_1e20'])
                    or data['included_rows'] != validation['included_rows']
                    or data['excluded_rows'] != validation['excluded_rows']):
                raise ValueError('重放结果与保存验收不一致')
        receipt = ToolResult.success(data=data, provenance={'file_path': str(source), 'workbook_id': data['workbook_id']})
    else:
        query = proposal['query']
        # LLMs select semantics; the runtime owns the current file and table bounds.
        physical = context['source_structure']
        expected_source = {k: physical[k] for k in ('sheet', 'header_row', 'data_range')}
        if query.get('source') != expected_source:
            raise ValueError('查询必须绑定当前附件的预检业务范围')
        receipt = calculate_spreadsheet_analysis(source, {'query': query}, deadline=deadline)
        if not receipt.is_success:
            raise ValueError(receipt.error_message or '临时查询执行失败')
    receipt.data['field_labels'] = context['source_structure'].get('headers', {})
    receipt.data['skill'] = identity
    receipt.data['request_contract'] = proposal
    receipt.data['evidence_id'] = digest({k: v for k, v in receipt.data.items() if k != 'evidence_id'})[:24]
    receipt.provenance['evidence_id'] = receipt.data['evidence_id']
    receipt.text_representation = json.dumps(receipt.data, ensure_ascii=False, default=str)
    return receipt


def verify_current_source(receipt, source, expected_hash):
    if (hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash
            or receipt.provenance.get('workbook_id') != expected_hash):
        raise ValueError('附件在语义规划或校验期间发生变化，请重新执行')
    if receipt.data['evidence_id'] != digest({k: v for k, v in receipt.data.items() if k != 'evidence_id'})[:24]:
        raise ValueError('核算回执摘要不一致')


def render_query_receipt(receipt):
    data = receipt.data
    query = data['plan']
    rows = data['rows']
    def cell(value):
        return str(value if value is not None else '').replace('|', '\\|').replace('\n', ' ').replace('\r', ' ')
    if rows:
        columns = list(rows[0])
        labels = dict(data.get('field_labels', {}))
        labels.update({m['id']: m.get('label', m['id']) for m in query.get('metrics', [])})
        if len(query.get('group_by', [])) == 1:
            group = query['group_by'][0]
            labels['group_key'] = labels.get(group, group) if isinstance(group, str) else group.get('alias', group.get('field', '分组'))
        units = {f['id'].split('__')[0]: f.get('unit') for f in data.get('facts', [])}
        def heading(column):
            name = labels.get(column, column)
            unit = units.get(column)
            return cell(f'{name} ({unit})' if unit and unit not in name else name)
        group_fields = [g if isinstance(g, str) else g.get('alias', g.get('field')) for g in (query.get('group_by') or [])]
        if 'group_key' in columns and (any(gf in columns for gf in group_fields) or any(c != 'group_key' and heading(c) == heading('group_key') for c in columns)):
            columns = [c for c in columns if c != 'group_key']
        lines = ['已按本轮条件完成核算并通过校验。', '',
                 '| ' + ' | '.join(heading(c) for c in columns) + ' |',
                 '|' + '|'.join('---' for _ in columns) + '|']
        lines += ['| ' + ' | '.join(cell(row.get(c)) for c in columns) + ' |' for row in rows[:100]]
        if len(rows) > 100:
            lines.append(f'仅展示前100行，共{len(rows)}行；完整结果保存在执行回执。')
    else:
        lines = ['已按本轮条件完成核算并通过校验：没有符合条件的结果。']
    metric_labels = {m['id']: m.get('label', m['id']) for m in query.get('metrics', [])}
    metric_units = {m['id']: m.get('unit') or data.get('amount_unit', '') for m in query.get('metrics', [])}
    def condition(node):
        for key, join in [('and', '，且'), ('or', '，或')]:
            if key in node:
                return '（' + join.join(condition(c) for c in node[key]) + '）'
        if 'not' in node:
            return '不满足' + condition(node['not'])
        ref = node.get('metric') or node.get('field') or node.get('column') or node.get('ref', '')
        op = {'gt': '大于', 'gte': '不小于', 'lt': '小于', 'lte': '不大于', 'eq': '等于', 'ne': '不等于',
              'in': '属于', 'not_in': '不属于', 'starts_with': '以以下前缀开头',
              'not_starts_with': '排除以下前缀', 'contains': '包含', 'not_contains': '不包含',
              'ends_with': '以以下内容结尾', 'between': '介于', 'is_null': '为空值',
              'is_not_null': '非空值', 'is_blank': '为空白'}.get(node.get('op'), node.get('op', ''))
        value = node.get('values', node.get('value', ''))
        if isinstance(value, list):
            value = '、'.join(map(str, value))
        unit = metric_units.get(ref, '')
        return f"{metric_labels.get(ref, ref)}{op} {value}{(' ' + unit) if unit and unit != 'source' else ''}"
    conditions = []
    if query.get('where'):
        conditions.append('明细条件：' + condition(query['where']))
    if query.get('having'):
        conditions.append('汇总后条件：' + condition(query['having']))
    if query.get('order_by'):
        conditions.append('排序：' + '、'.join(metric_labels.get(o['ref'], o['ref'])
                          + ('降序' if o.get('direction') == 'desc' else '升序') for o in query['order_by']))
    if query.get('limit'):
        conditions.append(f"取前 {query['limit']} 项")
    if query.get('offset'):
        conditions.append(f"跳过前 {query['offset']} 项")
    scope = data['coverage'][0]
    stages = data['stages']
    file_path = (receipt.provenance or {}).get('file_path') or ''
    file_name = Path(file_path).name if file_path else ''
    evidence_id = (receipt.provenance or {}).get('evidence_id') or data.get('evidence_id') or ''

    audit_parts = []
    if file_name:
        file_link = f'[{cell(file_name)}](/api/ai/chat/workspace-files/me/{quote(file_name, safe="")})'
        audit_parts.append(f'原始文件：{file_link}。')

    evidence_str = f'；证据 `{evidence_id}`' if evidence_id else ''
    audit_parts.append(
        f"来源：{cell(file_name or '附件')}，{cell(scope['sheet'])}，{scope['data_range']}{evidence_str}；"
        f"扫描 {stages['source_rows']} 条，明细筛选后 {stages['where_rows']} 条，聚合后符合条件 {stages['having_groups_count']} 组。"
    )
    if conditions:
        audit_parts.append('；'.join(conditions) + '。')

    details_content = '\n\n'.join(audit_parts)
    lines += ['', '<details>', '<summary>查看来源与核算明细</summary>', '', details_content, '', '</details>']
    return '\n'.join(lines)
