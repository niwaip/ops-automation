"""Small, domain-independent spreadsheet analysis tool surface."""

from .spreadsheet_expression_schema import EXPRESSION_REF, EXPRESSION_DEFINITION

ANALYSIS_TOOL = {
    "type": "function",
    "function": {
        "name": "analyze_spreadsheet",
        "description": "只读执行显式表格分析计划：聚合、加权比率、跨表等式及字段规则。返回精确事实、覆盖范围和证据ID；不猜表名、期间或业务规则。",
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
                "calculations": {"type": "array", "maxItems": 64, "items": {
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
数值结论需要执行证据，历史答案和样本不是计算结果。信息不足或用户要求先确认定义时，可以先向用户澄清，不要求本轮算出结果。澄清只说明已核实的字段和确切缺口，不能推定金额字段的业务含义、臆造成本公式或用其他人员维度替代负责人。
来源包含data_region_candidates、header_candidates和带坐标row_labels。已有明确候选且口径清楚时，首轮直接调用对应原生分析工具；结构不足时用inspect_spreadsheet_structure指定真实Sheet按需读取，不先逐张read_file，也不输出分析过程。
tables/calculations/checks/rules都使用真正JSON数组。业务范围不得包含header_row，也不得把末尾合计再次计入求和；按真实月份或业务条件用filters筛选（支持values精确匹配、op="exclude_prefix"/exclude_prefixes排除前缀、op="prefix"/prefixes匹配前缀）。
按任务调用aggregate_spreadsheet（聚合/比率/分组）、check_spreadsheet_equations（等式）、validate_spreadsheet_rows（字段/异常）。它们共用同一个原件计算引擎；只提交本次任务需要的字段，不为字段检查添加无关的数值等式。当用户要求按某一维度（如部门、成本中心、类别）分组统计时，可在 aggregate 表达式中指定 group_by="维度列名"，引擎将自动按该列的唯一取值展开多维分组聚合，无需为每个组单独定义 table。若表格为IT运维日志、配置清单、状态记录等非计算数据，无数值指标可计算时，可调用 report_informational_spreadsheet 声明原因并转入文本归纳。
提交显式计划，覆盖用户全部要求。不能补造表名或业务规则。指标标签的半年/季度/月期间必须与实际范围一致；错误标签将被拒绝。
常用数据查询优先用aggregate_spreadsheet的query参数：source={sheet,header_row,data_range}，where筛选明细，group_by为列数组，metrics=[{id,label,op,field,unit}]，having引用度量id，order_by与limit控制最终顺序和数量。例如having={"and":[{"metric":"amount","op":"gt","value":100},{"metric":"records","op":"gte","value":10}]}。不要把逻辑组合写成op=and；and/or的值必须是子条件数组。列出不重复的取值使用query.distinct=true和query.fields=[真实列名]；count_distinct只返回数量，非空/唯一性检查不会交付取值清单。空值口径包括NULL、空串及纯空白时，用where={"field":真实列名,"op":"is_blank"}，不要叠加只匹配少数空串的values过滤缩小范围。
用户要求变化或趋势时，至少定义两个不同期间的同来源表范围（不同table id与filters），或逐月范围，并计算各期间比率及变化；一个期间的合计不构成变化分析。
需要复用计算可使用{"ref":"calculation id"}，输出单位放在calculation.output_unit，不放在表达式内部。范围规则必须实际填min/max，枚举必须填allowed；当未知具体上下界阈值但需识别数值/金额异常时，使用 kind="outlier"（按四分位距IQR统计准则识别极端离群值）或仅用字段概况，不凭空臆造 min=0。
等式检查用 checks 声明关系及假设；左右表达式必须完整，不能把合计的一个分项当成整个恒等式，不将差额自动归因为来源公式错误。
质量检查用 rules 扫描业务全范围；列类型由原件决定，范围、枚举、唯一性、统计离群(outlier)规则声明依据，不将统计异常直接认定为业务违规。
金额按原件单位；派生换算用 output_unit，禁止口算。金额单元格/聚合指定unit=amount（output_unit可选元/千元/万元/亿元）；工时/工数等时间度量指定unit=duration（output_unit可选小时/天，严禁换算为货币单位元）；计数指定count或number（output_unit可选条/个）；比率单元格指定ratio（output_unit="%"）。
证据ID由程序维护，不需要复述ID或重写最终数字。可选hypotheses为简短、无数字的待核查线索，格式错误不会阻断已核验事实。
程序返回结构化任务状态和missing_metrics。只补齐缺项的来源表达式，不重复已有指标；只读注册派生关系由程序在同源同范围条件下补算。
程序呈现本轮全部核验事实、规则、残差、覆盖范围和假设。不要虚构执行或把未通过的检查宣称成功。
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
    capability_tool('aggregate_spreadsheet','只读聚合与声明式查询。可用query独立提交WHERE→GROUP BY→HAVING→ORDER BY→LIMIT或DISTINCT清单，无需附带calculations；也兼容tables/calculations。返回原件精确事实和最终rows。',
                    ['file_path','tables','calculations','query','where','group_by','having','order_by','limit','offset','distinct','distinct_fields'],['file_path']),
    capability_tool('check_spreadsheet_equations','只读检验明确的跨表等式，输出两侧值、残差、容差和假设；不将差额推断为公式错误。',
                    ['file_path','tables','checks'],['file_path','checks']),
    capability_tool('validate_spreadsheet_rows','按声明业务范围全量统计各数值列极值、日期范围、分类值计数及缺失值。可添加明确字段rules；不要添加calculations或checks。',
                    ['file_path','tables','rules'],['file_path','tables']),
    INFORMATIONAL_TOOL,
]

ANALYSIS_TOOL_NAMES={t['function']['name'] for t in ANALYSIS_CAPABILITIES}


def select_analysis_tools(tools, prompt):
    """One capability policy for prompt construction and dispatch enforcement."""
    from .analysis_contract import build_analysis_contract, required_analysis_capabilities
    from .spreadsheet_context import STRUCTURE_TOOL_NAME
    required=required_analysis_capabilities(build_analysis_contract(prompt))
    allowed=(required or ANALYSIS_TOOL_NAMES|{'analyze_spreadsheet'})|{STRUCTURE_TOOL_NAME}
    return [tool for tool in tools if tool.get('function',{}).get('name') in allowed]
