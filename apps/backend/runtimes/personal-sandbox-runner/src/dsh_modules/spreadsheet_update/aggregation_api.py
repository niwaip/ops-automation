"""Flat keyed-aggregation input for update workflows; Query IR remains server-side."""
import hashlib
import json
import re
from ..tool_result import ToolResult,TextToolOutput

PROPERTIES={
    'file_path':{'type':'string','description':'实际来源附件文件名'},
    'sheet':{'type':'string','description':'来源明细工作表名称，来自读取结果'},
    'header_row':{'type':'integer','minimum':1,'description':'实际单层字段表头行号'},
    'filters':{'type':'array','minItems':1,'description':'同时满足的筛选条件；包含实际期间字段及本次业务条件',
               'items':{'type':'object','additionalProperties':False,
                        'properties':{'field':{'type':'string'},
                                      'op':{'type':'string','enum':['eq','ne','gt','gte','lt','lte','starts_with','not_starts_with','prefix','exclude_prefix','in','not_in','contains','not_contains'],'description':'比较操作符，支持数值/文本比较以及前缀匹配(starts_with/not_starts_with)与集合匹配(in/not_in)'},
                                      'value':{'type':['string','number','boolean','null','array'],'description':'匹配值或前缀列表，前缀与集合操作支持数组或逗号分隔字符串（如 ["ex", "sy"] 或 "ex,sy"）'}},
                        'required':['field','op','value']}},
    'group_by':{'type':'array','minItems':1,'maxItems':1,'items':{'type':'string'},'description':'唯一实际回填业务键字段（如 ["部门编号"]，请传实际表头列名而非列字母）'},
    'value_field':{'type':'string','description':'实际需要汇总的数值字段名（如 "金额(K)"，请传实际表头列名而非列字母）'},
    'operation':{'type':'string','enum':['sum','min','max','avg','count'],'description':'用户要求的汇总方式'},
    'data_range':{'type':'string','description':'可选的实际明细范围；通常省略并由来源表识别，不能传目标工作簿区块'},
}
AGGREGATION_TOOL={'type':'function','function':{'name':'aggregate_spreadsheet',
    'description':'为工作簿更新执行按键汇总。填写实际字段和 filters 条件列表；服务端编译查询并返回带真实单位的结果。无需 query/where/metrics 条件树。filters 支持等值(eq/ne)、大小比较以及前缀匹配(starts_with/not_starts_with)与集合匹配(in/not_in)，支持传值列表或逗号分隔串（例如排除以特定编码开头：{"field": "WBS编号", "op": "not_starts_with", "value": ["ex", "sy", "sp"]}）。',
    'parameters':{'type':'object','additionalProperties':False,'properties':PROPERTIES,
                  'required':['file_path','sheet','header_row','filters','group_by','value_field','operation']}}}


def compile_aggregation(params):
    if params.keys()-PROPERTIES.keys():
        raise ValueError('更新聚合不接收 query/where/metrics；请填写公开的字段和 filters 列表')
    required=AGGREGATION_TOOL['function']['parameters']['required']
    if any(not params.get(field) for field in required):
        raise ValueError('缺少聚合字段：'+', '.join(field for field in required if not params.get(field)))
    if params['operation'] not in PROPERTIES['operation']['enum']:
        raise ValueError('Unsupported aggregation operation')
    if not isinstance(params['header_row'],int) or isinstance(params['header_row'],bool) or params['header_row']<1:
        raise ValueError('header_row 必须是实际表头行号')

    # Liberal input handling for group_by (Postel's Law)
    raw_gb = params.get('group_by')
    if isinstance(raw_gb, str):
        params['group_by'] = [s.strip() for s in raw_gb.split(',') if s.strip()]
    elif isinstance(raw_gb, (tuple, set)):
        params['group_by'] = list(raw_gb)

    if not isinstance(params.get('group_by'), list) or not params['group_by']:
        raise ValueError('更新聚合必须指定业务键 group_by（例如 ["部门编号"]）')
    if len(params['group_by']) != 1 or not isinstance(params['group_by'][0], str) or not params['group_by'][0].strip():
        raise ValueError(
            f"更新聚合 group_by 仅支持单个回填业务主键（例如 ['部门编号']），收到: {params['group_by']}。"
            f"若需按不同维度（如 有偿/无偿、年份月份）分别统计与回填，请将这些维度作为筛选条件传入 filters，并分别调用聚合。"
        )
    key_name = params['group_by'][0].strip()
    if key_name.upper() in ('A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'):
        raise ValueError(f"group_by 必须使用实际表头文本（如 '部门编号'），不能传入列字母 '{key_name}'。请从表头候选列表中选取字段名。")

    if isinstance(params.get('value_field'), str):
        val_name = params['value_field'].strip()
        if val_name.upper() in ('A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'):
            raise ValueError(f"value_field 必须使用实际表头文本（如 '金额(K)'），不能传入列字母 '{val_name}'。请从表头候选列表中选取字段名。")

    if not isinstance(params['filters'],list):
        raise ValueError('filters 必须为条件数组')

    compiled_filters = []
    allowed_ops = set(PROPERTIES['filters']['items']['properties']['op']['enum'])
    for predicate in params['filters']:
        if not isinstance(predicate, dict) or not isinstance(predicate.get('field'), str):
            raise ValueError('每个筛选条件必须包含合法的 field')
        op = predicate.get('op')
        if op not in allowed_ops:
            raise ValueError(f"不支持的过滤操作符: {op}")

        raw_val = predicate.get('value')
        field_name = predicate['field']

        # 别名映射
        if op == 'prefix':
            op = 'starts_with'
        elif op == 'exclude_prefix':
            op = 'not_starts_with'

        if op in ('starts_with', 'not_starts_with', 'in', 'not_in', 'contains', 'not_contains'):
            if isinstance(raw_val, (list, tuple, set)):
                vals = [str(v).strip() for v in raw_val if v is not None]
            elif isinstance(raw_val, str) and (',' in raw_val or '，' in raw_val):
                vals = [v.strip() for v in re.split(r'[,，\s]+', raw_val.strip()) if v.strip()]
            elif raw_val is not None:
                vals = [str(raw_val).strip()]
            else:
                vals = []

            if not vals:
                raise ValueError(f"操作符 {op} 需要非空的匹配值列表")

            pred_node = {
                'field': field_name,
                'op': op,
                'value': vals if len(vals) == 1 else vals[0],
                'values': vals,
            }
            if op in ('starts_with', 'not_starts_with'):
                pred_node['prefixes'] = vals
                if op == 'not_starts_with':
                    pred_node['exclude_prefixes'] = vals
            compiled_filters.append(pred_node)
        else:
            if isinstance(raw_val, (dict, list)):
                raise ValueError(f"操作符 {op} 不支持数组类型的 value")
            compiled_filters.append({
                'field': field_name,
                'op': op,
                'value': raw_val
            })

    metric='metric_'+hashlib.sha256(json.dumps(params,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    source={'sheet':params['sheet'],'header_row':params['header_row']}
    if params.get('data_range'):
        source['data_range']=params['data_range']
    return {'file_path':params['file_path'],'query':{'source':source,
            'where':{'and':compiled_filters},'group_by':params['group_by'],
            'metrics':[{'id':metric,'field':params['value_field'],'op':params['operation'],'unit':'source'}]}}


def execute_aggregation(params,deadline=None):
    from ..spreadsheet_analysis import execute_spreadsheet_analysis
    try:
        compiled=compile_aggregation(params)
    except ValueError as exc:
        result=ToolResult.error('invalid_update_aggregation',str(exc),text=str(exc))
        return TextToolOutput(str(exc),result)
    return execute_spreadsheet_analysis(compiled,deadline=deadline)
