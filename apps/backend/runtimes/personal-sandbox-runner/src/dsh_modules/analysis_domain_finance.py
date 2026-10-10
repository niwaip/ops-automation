"""Optional financial vocabulary and semantic constraints; no workbook bindings."""

import re

VERSION = "1"
METRICS = [{'name': '营业收入',
  'patterns': ['营业收入', '总收入', '主营业务收入', '营收', '收入'],
  'expected_type': 'number',
  'id': 'finance.revenue'},
 {'name': '毛利率',
  'patterns': ['毛利率', '综合毛利率', '销售毛利率'],
  'expected_type': 'percentage',
  'numerator_metric': '毛利润',
  'denominator_metric': '营业收入',
  'id': 'finance.gross_margin'},
 {'name': '营业利润率',
  'patterns': ['营业利润率', '经营利润率'],
  'expected_type': 'percentage',
  'numerator_metric': '营业利润',
  'denominator_metric': '营业收入',
  'id': 'finance.operating_margin'},
 {'name': '净利率',
  'patterns': ['净利率', '净利润率', '销售净利率'],
  'expected_type': 'percentage',
  'numerator_metric': '净利润',
  'denominator_metric': '营业收入',
  'id': 'finance.net_margin'},
 {'name': '毛利润',
  'patterns': ['毛利润', '主营业务毛利', '毛利(?!率)'],
  'expected_type': 'number',
  'id': 'finance.gross_profit'},
 {'name': '营业利润',
  'patterns': ['营业利润', '核心经营利润', '经营利润'],
  'expected_type': 'number',
  'id': 'finance.operating_profit'},
 {'name': '净利润',
  'patterns': ['净利润', '税后净利', '净收益', '纯利润'],
  'expected_type': 'number',
  'id': 'finance.net_profit'}]

CONCEPTS = [
    {"name":"profitability", "patterns":[r"盈利能力",r"盈利质量",r"\bprofitability\b"],
     "required_metrics":["营业收入","毛利润","营业利润","净利润","毛利率","营业利润率","净利率"],
     "capabilities":["aggregate_spreadsheet"]},
    {"name":"reconciliation", "patterns":[r"勾稽",r"跨表核对",r"\breconciliation\b"],
     "required_metrics":[], "capabilities":["check_spreadsheet_equations"]},
]
GUIDANCE = """
【可选财务领域定义】
盈利能力需比较相关期间的收入、毛利、营业利润、净利润与三种利润率。
期间利润率=汇总利润/同期间汇总收入，不取月度利润率平均。
财务等式、负数符号、报告主体及调整假设需基于来源核实；差额不直接证明某表公式错误。
这些定义不指定任何工作簿、表名、坐标或结果。
"""


def matching_metrics(text):
    return {m['name'] for m in METRICS if any(re.search(pattern,text,re.I) for pattern in m['patterns'])}


def aggregate_leaves(expression):
    if 'aggregate' in expression:
        yield expression
    for arg in expression.get('args', []):
        yield from aggregate_leaves(arg)


def validate_calculation(item, bindings):
    expr = bindings
    selected=next((m for m in METRICS if m['id']==item.get('metric_id')),None)
    caption_metrics = matching_metrics(item['label'])
    if selected and caption_metrics and selected['name'] not in caption_metrics:
        raise ValueError('metric_id 与已识别指标标签不一致')
    requested = {selected['name']} if selected else matching_metrics(item['label'])
    if 'aggregate' in expr and expr['aggregate'] != 'count':
        header = expr['source_header']
        actual = matching_metrics(header)
        if requested and not requested <= actual:
            raise ValueError(f"指标标签与来源字段不一致：{item['label']}引用了{header}")

    ratios=[m for m in METRICS if m.get('numerator_metric') and m['name'] in requested]
    if ratios and not re.search(r"变化|增减|增长|差额|差值|change|growth|difference",item['label'],re.I):
        if 'aggregate' in expr:
            raise ValueError('期间比率应使用汇总分子/汇总分母，不能聚合原始比率列')
        if expr.get('op')=='divide' and len(expr.get('args',[]))==2 and all('aggregate' in arg for arg in expr['args']):
            names=[];scopes=[]
            for arg in expr['args']:
                names.append(matching_metrics(arg['source_header']));scopes.append(arg['source_scope'])
            if (any(arg['aggregate']!='sum' for arg in expr['args']) or scopes[0]!=scopes[1]
                    or any(r['numerator_metric'] not in names[0] or r['denominator_metric'] not in names[1] for r in ratios)):
                raise ValueError(f"比率标签与来源分子/分母或期间不一致：{item['label']}；分子、分母分别来自{names}，行范围{scopes}。请在同一期间计算汇总分子/汇总收入，不删除要求的比率。")
        elif item.get('metric_id'):
            raise ValueError('已注册期间比率须显式绑定同期间sum分子与sum分母；变化量请使用单独指标')

    cardinality=re.search(r"([一二三四五六七八九]|[1-9])(?:项)?(费用|费|成本)",item['label'])
    if cardinality:
        token=cardinality[1];count=int(token) if token.isdigit() else '一二三四五六七八九'.index(token)+1
        fields=set()
        for leaf in aggregate_leaves(expr):
            if cardinality[2] in leaf['source_header']:fields.add(leaf['field_key'])
        if len(fields)!=count:raise ValueError(f"复合指标标签声明{count}项，但实际引用{len(fields)}个不同来源字段，请修正完整表达式或名称")
