"""Optional timesheet, labor cost and WBS vocabulary and semantic constraints."""

import re

VERSION = "1"

METRICS = [
    {
        'name': '工数',
        'patterns': ['工数', '工数实绩', '实绩工数', '工数计划', '计划工数', '工数明细', '投入工数'],
        'expected_type': 'number',
        'id': 'timesheet.work_amount'
    },
    {
        'name': '工时',
        'patterns': ['工时', '标准工时', '实际工时', '工时数', '工作时间', '加班工时'],
        'expected_type': 'number',
        'id': 'timesheet.work_hours'
    },
    {
        'name': '工数金额',
        'patterns': ['工数金额', '人工成本', '工时金额', '人工费用', '工时成本', '人力成本'],
        'expected_type': 'number',
        'id': 'timesheet.labor_cost'
    },
    {
        'name': '人员单价',
        'patterns': ['单价', '工时单价', '人员单价', '标准单价', '小时费率'],
        'expected_type': 'number',
        'id': 'timesheet.unit_rate'
    }
]

CONCEPTS = [
    {
        "name": "department_summary",
        "patterns": [r"部门统计", r"按部门", r"部门汇总", r"部门明细"],
        "required_metrics": ["工数", "工数金额"],
        "capabilities": ["aggregate_spreadsheet"]
    },
    {
        "name": "wbs_aggregation",
        "patterns": [r"WBS", r"项目工数", r"项目核算", r"作业项", r"工单"],
        "required_metrics": [],
        "capabilities": ["aggregate_spreadsheet"]
    }
]

GUIDANCE = """
【可选工数与人力成本领域定义】
工数/工时核算必须基于原件中的物理列（如工数、工数金额、部门编号、部门名称、会计年度、工数年月）。
统计部门或项目工数/金额时，必须严格基于物理表头进行分组统计或过滤，避免跨期间或跨维度重复求和。
优先使用 aggregate_spreadsheet 进行结构化聚合，或调用 bash 运行 Python 脚本进行精确核算。
"""


def matching_metrics(text):
    return {m['name'] for m in METRICS if any(re.search(pattern, text, re.I) for pattern in m['patterns'])}


def validate_calculation(item, bindings):
    selected = next((m for m in METRICS if m['id'] == item.get('metric_id')), None)
    if not selected:
        return
    # Non-count aggregates must align with field semantics
    if 'aggregate' in bindings and bindings['aggregate'] != 'count':
        source_header = bindings.get('source_header', '')
        if not any(re.search(pattern, source_header, re.I) for pattern in selected['patterns']):
            raise ValueError(f"已注册指标 {selected['name']} 与来源字段 {source_header} 不一致")
