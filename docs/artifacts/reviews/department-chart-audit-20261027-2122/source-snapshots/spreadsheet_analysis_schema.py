"""Small, domain-independent spreadsheet analysis tool surface."""

from .spreadsheet_expression_schema import EXPRESSION_REF, EXPRESSION_DEFINITION
from .spreadsheet_query_schema import QUERY_TOOL

ANALYSIS_TOOL = {
    "type": "function",
    "function": {
        "name": "analyze_spreadsheet",
        "description": "只读执行你显式提交的表格分析计划：聚合、加权比率、跨表等式及字段规则。新增指标、总计、比率和变化值都须在工具计划中声明；程序不会自动补算，正文口算不能替代执行。返回精确事实、覆盖范围和证据ID。",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "file_path": {"type": "string"},
                "tables": {"type": "array", "maxItems": 16, "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"}, "sheet": {"type": "string"},
                        "data_range": {"type": "string", "description": "业务行范围，排除标题、表头、合计"},
                        "header_row": {"type": "integer", "minimum": 1},
                        "row_ids": {"type": "array", "items": {"type": "integer", "minimum": 1},
                                    "description": "可选精确来源行号；必须属于声明范围及过滤结果，用于复用查询事实的来源，不扩大范围"},
                        "filters": {"type": "array", "items": {"type": "object", "properties": {
                            "column": {"type": "string"},
                            "values": {"type": "array", "items": {"type": ["string", "number"]}},
                            "op": {"type": "string", "enum": ["in", "not_in", "prefix", "exclude_prefix"]},
                            "prefixes": {"type": "array", "items": {"type": "string"}},
                            "exclude_prefixes": {"type": "array", "items": {"type": "string"}},
                            "exclude_values": {"type": "array", "items": {"type": ["string", "number"]}},
                            "case_sensitive": {"type": "boolean"},
                        }, "required": ["column"], "additionalProperties": False}},
                        "where": {"type": "object", "description": "行过滤谓词树"},
                        "group_by": {"type": ["string", "array", "object"], "description": "分组维度"},
                        "having": {"type": "object", "description": "分组过滤条件"},
                    }, "required": ["id", "sheet", "data_range", "header_row"],
                }},
                "query": {"type": "object", "description": '声明式查询：source={sheet,header_row,data_range}；where用{op,field,value/values}及and/or/not；op支持eq/ne/gt/gte/lt/lte/between/in/not_in/contains/not_contains/starts_with/not_starts_with/ends_with/is_null/is_not_null/is_blank。group_by为字段数组；metrics=[{id,label,op,field,unit}]，计数用count_rows；金额度量unit默认设为"source"或"amount"以保持原表物理量纲（如K/千元/万元），无明确换算需求时严禁随意设为元导致千倍放大；label必须与unit保持一致；having用{metric:度量id,op,value}；order_by=[{ref:度量id或分组列,direction:asc/desc}]；limit整数。必须在同一计划中按WHERE→GROUP BY→HAVING→ORDER BY→LIMIT执行，不要用未筛选的全组结果替代最终结果。'},
                "where": {"type": "object", "description": "顶层行过滤谓词"},
                "group_by": {"type": ["string", "array", "object"], "description": "顶层分组"},
                "having": {"type": "object", "description": "顶层分组过滤条件"},
                "order_by": {"type": "array", "items": {"type": "object", "properties": {"ref": {"type": "string"}, "direction": {"type": "string", "enum": ["asc", "desc"]}}, "required": ["ref"]}},
                "limit": {"type": "integer", "minimum": 1},
                "offset": {"type": "integer", "minimum": 0},
                "distinct": {"type": "boolean"},
                "distinct_fields": {"type": "array", "items": {"type": "string"}},
                "calculations": {"type": "array", "maxItems": 64,
                    "description": "可与query同时提交：先查询，再执行全部派生计算。派生来源必须位于查询最终事实引用的单元格内；可ref精确引用query事实ID（含sum/min/max多行汇总），程序按其精确来源重算。计算失败时整份计划失败。",
                    "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"}, "label": {"type": "string"},
                        "metric_id": {"type": "string", "description": "可选：当前领域注册表中的稳定指标ID；不用于选择或切换领域"},
                        "expression": {"type": "object", "description": '受限表达式：{"aggregate":"sum|min|max|count","table":"id","column":"B","group_by":"J","unit":"amount|duration|count|number|ratio"}（group_by可选，支持单列如"部门名称"，多列组合如["部门编号","有偿无偿"]，或前缀截取如{"column":"WBS编号","prefix_length":2}，引擎将按维度唯一取值自动展开分组聚合）；{"cell":"B11","sheet":"真实表名","unit":"amount"}；{"op":"add|subtract|multiply|divide","args":[表达式,表达式]}；{"constant":0,"unit":"number"}。金额指定unit=amount，工时/时间度量指定duration，计数指定count，比率用divide指定ratio，禁止手工乘100。可用{"ref":"同一计划calculation id"}引用已有表达式；引用可前向但不可循环。'},
                        "output_unit": {"type": "string", "enum": ["source", "元", "千元", "万元", "亿元", "小时", "h", "天", "分钟", "条", "个", "次", "件", "户", "人", "%", "number"]},
                    }, "required": ["id", "label", "expression"],
                }},
                "checks": {"type": "array", "maxItems": 32, "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {"id": {"type": "string"}, "label": {"type": "string"},
                        "left": {"type": "object"}, "right": {"type": "object"},
                        "relation_type": {"type":"string","enum":["declared_equation","formula_identity","component_comparison"]},
                        "tolerance": {"type": "number", "minimum": 0},
                        "assumptions": {"type": "string", "description": "等式适用的期间、主体及其他调整假设"}},
                    "required": ["id", "label", "left", "right", "tolerance", "assumptions"],
                }},
                "rules": {"type": "array", "maxItems": 32, "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {"id": {"type": "string"}, "label": {"type": "string"},
                        "table": {"type": "string"}, "column": {"type": "string"},
                        "kind": {
                            "type": "string",
                            "enum": ["unique", "not_empty", "date_range", "allowed_values", "number_range", "outlier"],
                            "description": "规则类型：unique(唯一性), not_empty(非空), date_range(明确业务日期边界，需填min/max), allowed_values(明确业务枚举值，需填allowed), number_range(明确业务上下界，需填min/max), outlier(统计离群值检测，按3×IQR识别极端大额/离群数值异常，无需填min/max；未明确要求非负时严禁臆造min=0)"
                        },
                        "min": {"type": ["string", "number"]}, "max": {"type": ["string", "number"]},
                        "allowed": {"type": "array", "items": {"type": ["string", "number"]}},
                        "assumptions": {"type": "string", "description": "规则依据；推定规则须明确是待核查线索"}},
                    "required": ["id", "label", "table", "column", "kind", "assumptions"],
                }},
            }, "required": ["file_path"],
        },
    },
}

_parameters=ANALYSIS_TOOL['function']['parameters']
_parameters['$defs']={'expression':EXPRESSION_DEFINITION}
_parameters['properties']['calculations']['items']['properties']['expression']=EXPRESSION_REF
_parameters['properties']['checks']['items']['properties']['left']=EXPRESSION_REF
_parameters['properties']['checks']['items']['properties']['right']=EXPRESSION_REF

# Conditional schema documents the same per-kind requirements enforced by the
# compiler. No default thresholds or allowed approval states are introduced.
_rule_schema=ANALYSIS_TOOL['function']['parameters']['properties']['rules']['items']
_rule_schema['allOf']=[
    {'if':{'properties':{'kind':{'const':'allowed_values'}}},'then':{'required':['allowed']}},
    {'if':{'properties':{'kind':{'enum':['date_range','number_range']}}},
     'then':{'anyOf':[{'required':['min']},{'required':['max']}]}}
]
_rule_schema['properties']['allowed']['minItems']=1

ANALYSIS_INSTRUCTIONS = """
【Source-bound Spreadsheet Analysis】
所有数值与明细必须来自本轮原件执行；历史答案和样本不构成结果。已有明确data_region_candidates和header_candidates时直接查询；结构不足时用inspect_spreadsheet_structure指定真实Sheet读取。范围排除标题、表头、合计及附注。
普通查询统一调用aggregate_spreadsheet，只提交file_path和query。query内source声明sheet/header_row/data_range；where过滤原始行；group_by分组；metrics声明聚合列；having过滤聚合结果；order_by/limit控制最终顺序和数量。执行顺序为WHERE→GROUP BY→HAVING→ORDER BY→LIMIT。
查看员工/项目明细时，只用source和where，省略metrics、group_by和distinct，默认保留原始列及来源行号；仅用户要求选列时填fields。不能擅自用分组求和代替明细。
明细示例：query={"source":{"sheet":"真实表名","header_row":4,"data_range":"A5:R278"},"where":{"field":"员工姓名","op":"eq","value":"目标姓名"}}。真实表名、表头和范围须取自当前原件，不照抄示例。
聚合示例：query={"source":真实来源,"where":{"field":"WBS编号","op":"not_starts_with","values":["EX-"]},"group_by":["部门名称"],"metrics":[{"id":"amount","op":"sum","field":"金额(K)"},{"id":"records","op":"count_rows"}],"having":{"metric":"amount","op":"gt","value":100},"order_by":[{"ref":"amount","direction":"desc"}]}。聚合只在metrics声明一次，id用于HAVING/排序，不引用内部带组键的事实ID。
条件组合用{"and":[条件,条件]}、{"or":[条件,条件]}、{"not":条件}；不要写op=and。starts_with/not_starts_with使用values前缀列表；NULL、空串和纯空白统一用is_blank。去重清单用query.fields与query.distinct=true；count_distinct只返回数量。
比率、期间差额、增长率、跨表公式等派生计算使用analyze_spreadsheet，提交明确tables/calculations及受限表达式，不与query混写。可ref同一计划的calculation id，禁止引用内部query事实ID。金额聚合unit=amount，工时unit=duration，计数unit=count，比率divide用ratio；展示换算用calculation.output_unit。查询metrics省略unit时保持原字段单位，不随意换算为元。未知业务公式/口径先澄清，不臆造成本定义或用其他人员维度替代负责人。
等式用check_spreadsheet_equations提交完整checks及期间/主体/容差/假设；不把一个分项当成完整恒等式。质量检查用validate_spreadsheet_rows的tables/rules；未知上下界时用outlier或字段概况，不臆造min=0。规则不能证明业务合规，差额不能自动归因为来源公式错误。
变化/趋势需要至少两个同源不同期间或逐月数据，并显式执行各期间比率和变化；单期合计不构成变化。按任务覆盖全部要求，只补缺项，禁止正文口算或声称未执行的脚本已运行。
非量化信息归纳可用report_informational_spreadsheet声明理由。来源不足或用户要求先确认时可提出有依据的澄清。证据ID由程序维护；程序呈现核验事实、来源、覆盖范围和假设，不需要模型重写最终数字或内部ID。
"""


def capability_tool(name,description,fields,required):
    params=ANALYSIS_TOOL['function']['parameters']
    return {'type':'function','function':{'name':name,'description':description,
        'parameters':{'type':'object','additionalProperties':False,
                      'properties':{k:params['properties'][k] for k in fields},'required':required,
                      **({'$defs':params['$defs']} if {'calculations','checks'}&set(fields) else {})}}}


INFORMATIONAL_TOOL = {
    'type': 'function',
    'function': {
        'name': 'report_informational_spreadsheet',
        'description': '当表格主要为文本记录、配置信息、状态日志等非量化/非财务数据，或当前任务仅需状态解读与内容归纳而无需数值计算时调用此工具确认降级。由模型声明理由并解除计算证据核验。',
        'parameters': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'file_path': {'type': 'string', 'description': '工作簿文件路径'},
                'reason': {'type': 'string', 'description': '判定为信息/状态类表格而非数值计算表格的依据'},
                'summary_focus': {'type': 'string', 'description': '建议呈现的文本归纳或状态说明重点'},
            },
            'required': ['file_path', 'reason'],
        },
    },
}


ANALYSIS_CAPABILITIES = [
    QUERY_TOOL,
    capability_tool('check_spreadsheet_equations','只读检验明确的跨表等式，输出两侧值、残差、容差和假设；不将差额推断为公式错误。',
                    ['file_path','tables','checks'],['file_path','checks']),
    capability_tool('validate_spreadsheet_rows','按声明业务范围全量统计各数值列极值、日期范围、分类值计数及缺失值。可添加明确字段rules；不要添加calculations或checks。',
                    ['file_path','tables','rules'],['file_path','tables']),
    INFORMATIONAL_TOOL,
]

ADVANCED_ANALYSIS_TOOL = capability_tool(
    'analyze_spreadsheet',
    '只读执行比率、增长率、期间差额或跨表公式。提交tables/calculations，不接收query；普通明细及分组求和使用aggregate_spreadsheet。ref仅引用同一计划calculation id。',
    ['file_path', 'tables', 'calculations'], ['file_path', 'tables', 'calculations'])


DETAIL_QUERY_INSTRUCTIONS = """
【Source-bound Spreadsheet Analysis：原始明细】
本轮查看原始记录。已有真实表头和业务范围时，直接调用aggregate_spreadsheet，只提交file_path和query。
query.source={sheet,header_row,data_range}；query.where按原始列筛选。省略metrics、group_by、distinct及calculations，默认返回全部原始列与_row来源行号；仅用户指定选列时填写fields，不把同项目不同月份或计费属性的记录合并。
例如where={"field":"员工姓名","op":"eq","value":"目标姓名"}；前缀筛选用{"field":"WBS编号","op":"starts_with","values":["目标前缀"]}。and/or用条件数组，not用单个子条件；NULL、空串和纯空白用is_blank。仅用户要求时设置order_by/limit。
来源sheet、header_row、data_range使用当前原件提供的候选，范围排除标题、表头、合计和附注。结构不足时调用inspect_spreadsheet_structure，不编造列名、范围或业务含义。
保留员工/项目身份、期间、工时、金额、计费属性等原始信息；没有匹配行时如实说明。原件和执行证据由程序核验并呈现，历史答案或样本不构成结果。信息不足可澄清，不用汇总数字代替明细。
"""


def analysis_instructions_for(prompt):
    from .analysis_contract import build_analysis_contract
    from .analysis_delivery_constraints import requires_source_rows
    return (DETAIL_QUERY_INSTRUCTIONS if requires_source_rows(build_analysis_contract(prompt), prompt)
            else ANALYSIS_INSTRUCTIONS)


ANALYSIS_TOOL_NAMES={t['function']['name'] for t in ANALYSIS_CAPABILITIES}


def select_analysis_tools(tools, prompt):
    """One capability policy for prompt construction and dispatch enforcement."""
    from .analysis_contract import build_analysis_contract, required_analysis_capabilities
    from .analysis_delivery_constraints import requires_source_rows
    from .spreadsheet_context import STRUCTURE_TOOL_NAME
    contract = build_analysis_contract(prompt)
    if requires_source_rows(contract, prompt):
        allowed = {'aggregate_spreadsheet', STRUCTURE_TOOL_NAME}
        return [tool for tool in tools if tool.get('function', {}).get('name') in allowed]
    required=required_analysis_capabilities(contract)
    # A registered concept may require aggregation and a derived ratio together.
    # Formula execution remains available through its separate, unambiguous tool.
    allowed=(required or ANALYSIS_TOOL_NAMES)|{'analyze_spreadsheet', STRUCTURE_TOOL_NAME}
    return [tool for tool in tools if tool.get('function',{}).get('name') in allowed]
