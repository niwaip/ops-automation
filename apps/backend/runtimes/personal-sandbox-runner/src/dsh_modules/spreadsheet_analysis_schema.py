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
                            "column": {"type": "string"}, "values": {"type": "array", "items": {"type": ["string", "number"]}}},
                            "required": ["column", "values"], "additionalProperties": False}},
                    }, "required": ["id", "sheet", "data_range", "header_row"],
                }},
                "calculations": {"type": "array", "maxItems": 64, "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"}, "label": {"type": "string"},
                        "metric_id": {"type": "string", "description": "可选：当前领域注册表中的稳定指标ID；不用于选择或切换领域"},
                        "expression": {"type": "object", "description": '受限表达式：{"aggregate":"sum|min|max|count","table":"id","column":"B","unit":"amount|number|ratio"}；{"cell":"B11","sheet":"真实表名","unit":"amount"}；{"op":"add|subtract|multiply|divide","args":[表达式,表达式]}；{"constant":0,"unit":"number"}。金额单位从原件声明读取，比率用divide，禁止手工乘100。可用{"ref":"同一计划calculation id"}引用已有表达式；引用可前向但不可循环。'},
                        "output_unit": {"type": "string", "enum": ["source", "元", "千元", "万元", "亿元", "%", "number"]},
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
                        "kind": {"type": "string", "enum": ["unique", "not_empty", "date_range", "allowed_values", "number_range"]},
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
本轮需要执行证据，历史答案和样本不是计算结果。先从来源结构识别真实表头、业务范围、期间及单位。
来源包含data_region_candidates、header_candidates和带坐标row_labels。已有明确候选时，首轮直接调用对应原生分析工具；结构不足时用inspect_spreadsheet_structure指定真实Sheet按需读取，不先逐张read_file，也不输出分析过程。
tables/calculations/checks/rules都使用真正JSON数组。业务范围不得包含header_row，也不得把末尾合计再次计入求和；按真实月份标签用filters筛选期间。
按任务调用aggregate_spreadsheet（聚合/比率）、check_spreadsheet_equations（等式）、validate_spreadsheet_rows（字段/异常）。它们共用同一个原件计算引擎；只提交本次任务需要的字段，不为字段检查添加无关的数值等式。
提交显式计划，覆盖用户全部要求。不能补造表名或业务规则。指标标签的半年/季度/月期间必须与实际范围一致；错误标签将被拒绝。
用户要求变化或趋势时，至少定义两个不同期间的同来源表范围（不同table id与filters），或逐月范围，并计算各期间比率及变化；一个期间的合计不构成变化分析。
需要复用计算可使用{"ref":"calculation id"}，输出单位放在calculation.output_unit，不放在表达式内部。范围规则必须实际填min/max，枚举必须填allowed，未知阈值只用字段概况，不补造规则。
等式检查用 checks 声明关系及假设；左右表达式必须完整，不能把合计的一个分项当成整个恒等式，不将差额自动归因为来源公式错误。
质量检查用 rules 扫描业务全范围；列类型由原件决定，范围、枚举、唯一性规则声明依据，不将统计异常直接认定为业务违规。
金额按原件单位；派生换算用 output_unit，禁止口算。金额单元格/聚合指定unit=amount，比率单元格指定ratio，计数指定number。
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


ANALYSIS_CAPABILITIES = [
    capability_tool('aggregate_spreadsheet','只读聚合、加权比率和变化分析。表头/列名来自原件，金额换算由程序完成；最终数字由回执生成。',
                    ['file_path','tables','calculations'],['file_path','calculations']),
    capability_tool('check_spreadsheet_equations','只读检验明确的跨表等式，输出两侧值、残差、容差和假设；不将差额推断为公式错误。',
                    ['file_path','tables','checks'],['file_path','checks']),
    capability_tool('validate_spreadsheet_rows','按声明业务范围全量统计各数值列极值、日期范围、分类值计数及缺失值。可添加明确字段rules；不要添加calculations或checks。',
                    ['file_path','tables','rules'],['file_path','tables']),
]

ANALYSIS_TOOL_NAMES={t['function']['name'] for t in ANALYSIS_CAPABILITIES}


def select_analysis_tools(tools, prompt):
    """One capability policy for prompt construction and dispatch enforcement."""
    from .analysis_contract import build_analysis_contract, required_analysis_capabilities
    from .spreadsheet_context import STRUCTURE_TOOL_NAME
    required=required_analysis_capabilities(build_analysis_contract(prompt))
    allowed=(required or ANALYSIS_TOOL_NAMES|{'analyze_spreadsheet'})|{STRUCTURE_TOOL_NAME}
    return [tool for tool in tools if tool.get('function',{}).get('name') in allowed]
