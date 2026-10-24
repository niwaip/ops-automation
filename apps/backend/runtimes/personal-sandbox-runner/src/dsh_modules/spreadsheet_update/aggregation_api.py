"""Flat keyed-aggregation input for update workflows; Query IR remains server-side."""
import hashlib
import json
from ..tool_result import ToolResult,TextToolOutput

PROPERTIES={
    'file_path':{'type':'string','description':'实际来源附件文件名'},
    'sheet':{'type':'string','description':'来源明细工作表名称，来自读取结果'},
    'header_row':{'type':'integer','minimum':1,'description':'实际单层字段表头行号'},
    'filters':{'type':'array','minItems':1,'description':'同时满足的筛选条件；包含实际期间字段及本次业务条件',
               'items':{'type':'object','additionalProperties':False,
                        'properties':{'field':{'type':'string'},
                                      'op':{'type':'string','enum':['eq','ne','gt','gte','lt','lte']},
                                      'value':{'type':['string','number','boolean','null']}},
                        'required':['field','op','value']}},
    'group_by':{'type':'array','minItems':1,'maxItems':1,'items':{'type':'string'},'description':'唯一实际回填业务键字段'},
    'value_field':{'type':'string','description':'实际需要汇总的数值字段名，来自表头'},
    'operation':{'type':'string','enum':['sum','min','max','avg','count'],'description':'用户要求的汇总方式'},
    'data_range':{'type':'string','description':'可选的实际明细范围；通常省略并由来源表识别，不能传目标工作簿区块'},
}
AGGREGATION_TOOL={'type':'function','function':{'name':'aggregate_spreadsheet',
    'description':'为工作簿更新执行按键汇总。填写实际字段和 filters 条件列表；服务端编译查询并返回带真实单位的结果。无需 query/where/metrics 条件树。',
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
    if not isinstance(params['group_by'],list) or len(params['group_by'])!=1 or not isinstance(params['group_by'][0],str):
        raise ValueError('更新聚合必须指定一个实际业务键')
    if not isinstance(params['filters'],list):
        raise ValueError('filters 必须为条件数组')
    for predicate in params['filters']:
        if (not isinstance(predicate,dict) or set(predicate)!={'field','op','value'}
                or not isinstance(predicate['field'],str) or predicate['op'] not in PROPERTIES['filters']['items']['properties']['op']['enum']
                or isinstance(predicate['value'],(dict,list))):
            raise ValueError('每个筛选条件必须只有实际 field、比较 op、value')
    metric='metric_'+hashlib.sha256(json.dumps(params,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    source={'sheet':params['sheet'],'header_row':params['header_row']}
    if params.get('data_range'):
        source['data_range']=params['data_range']
    return {'file_path':params['file_path'],'query':{'source':source,
            'where':{'and':params['filters']},'group_by':params['group_by'],
            'metrics':[{'id':metric,'field':params['value_field'],'op':params['operation'],'unit':'source'}]}}


def execute_aggregation(params,deadline=None):
    from ..spreadsheet_analysis import execute_spreadsheet_analysis
    try:
        compiled=compile_aggregation(params)
    except ValueError as exc:
        result=ToolResult.error('invalid_update_aggregation',str(exc),text=str(exc))
        return TextToolOutput(str(exc),result)
    return execute_spreadsheet_analysis(compiled,deadline=deadline)
