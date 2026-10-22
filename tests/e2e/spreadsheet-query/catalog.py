"""Query families, independent SQL specifications and optional native adapters.

SQL and expected values are evaluator-only assets. Never send them to the agent.
Native plans describe current public operations; missing adapters are coverage gaps.
"""

FIELDS = {
    'year': '会计年度', 'month': '工数年月', 'department': '部门编号',
    'department_name': '部门名称', 'employee': '员工编号', 'employee_name': '员工姓名',
    'grade': '员工职级', 'unit_price': '职级单价', 'wbs': 'WBS编号',
    'cost_center': 'WBS负责成本中心', 'project': 'WBS名称', 'customer': '客户名称',
    'billable': '有偿无偿', 'direct': '直接间接', 'hours': '工数(小时)',
    'amount': '金额(K)', 'bu': 'BU编号', 'bu_name': 'BU名称',
}

SUMMARY = 'COUNT(*) AS records, SUM(amount) AS amount_k, SUM(hours) AS hours'


def native_filter(column, op, values):
    key = 'prefixes' if op in ('prefix', 'exclude_prefix') else 'values'
    return {'column': FIELDS[column], 'op': op, key: values}


def case(cid, family, prompt, where='1', *, select=SUMMARY, group=None,
         having=None, order=None, limit=None, native=None, notes=None):
    sql = f'SELECT {select} FROM detail WHERE {where}'
    if group:
        sql += f' GROUP BY {group}'
    if having:
        sql += f' HAVING {having}'
    if order:
        sql += f' ORDER BY {order}'
    if limit:
        sql += f' LIMIT {limit}'
    return dict(id=cid, family=family,
                prompt='读取附件，只统计明细，排除标题、表头和报表尾注。' + prompt + '只在聊天中回答，不生成文件。',
                sql=sql, selection_sql=f'SELECT row_id FROM detail WHERE {where} ORDER BY row_id',
                ordered=bool(order), native=native, notes=notes,
                coverage_scope='pre_having_pre_limit',
                # Aggregate predicates must never be mistaken for row predicates.
                has_having=bool(having), has_limit=bool(limit))


CASES = [
    case('Q01', 'baseline', '统计总条数、金额(K)与工数(小时)。', native={}),
    case('Q02', 'eq', '仅保留有偿无偿为无偿的记录，统计条数、金额(K)与工数(小时)。',
         "billable='无偿'", native={'filters': [native_filter('billable', 'in', ['无偿'])]}),
    case('Q03', 'ne', '排除无偿记录，统计条数、金额(K)与工数(小时)。',
         "billable<>'无偿'", native={'filters': [native_filter('billable', 'not_in', ['无偿'])]}),
    case('Q04', 'in', '职级只保留MIS10或BAS10，统计条数、金额(K)与工数(小时)。',
         "grade IN ('MIS10','BAS10')", native={'filters': [native_filter('grade', 'in', ['MIS10', 'BAS10'])]}),
    case('Q05', 'not_in', '排除职级MIS10和BAS10，统计条数、金额(K)与工数(小时)。',
         "grade NOT IN ('MIS10','BAS10')", native={'filters': [native_filter('grade', 'not_in', ['MIS10', 'BAS10'])]}),
    case('Q06', 'prefix', '不区分大小写保留WBS编号以ex、sp或ip开头的记录，统计条数、金额(K)与工数(小时)。',
         "lower(trim(wbs)) LIKE 'ex%' OR lower(trim(wbs)) LIKE 'sp%' OR lower(trim(wbs)) LIKE 'ip%'",
         native={'filters': [native_filter('wbs', 'prefix', ['ex', 'sp', 'ip'])]}),
    case('Q07', 'not_prefix', '不区分大小写排除WBS编号以ex、sy、sp、ip、ib、sz开头的记录，统计条数、金额(K)与工数(小时)。',
         "NOT (lower(trim(wbs)) LIKE 'ex%' OR lower(trim(wbs)) LIKE 'sy%' OR lower(trim(wbs)) LIKE 'sp%' OR lower(trim(wbs)) LIKE 'ip%' OR lower(trim(wbs)) LIKE 'ib%' OR lower(trim(wbs)) LIKE 'sz%')",
         native={'filters': [native_filter('wbs', 'exclude_prefix', ['ex','sy','sp','ip','ib','sz'])]}),
    case('Q08', 'contains', 'WBS名称包含字面文本“运维”，统计条数、金额(K)与工数(小时)。', "instr(project,'运维')>0",
         native={'where': {'op': 'contains', 'field': FIELDS['project'], 'value': '运维'}}),
    case('Q09', 'not_contains', 'WBS名称不包含字面文本“运维”，统计条数、金额(K)与工数(小时)。', "instr(project,'运维')=0",
         native={'where': {'op': 'not_contains', 'field': FIELDS['project'], 'value': '运维'}}),
    case('Q10', 'suffix', 'WBS编号以-001结尾，统计条数、金额(K)与工数(小时)。', "substr(wbs,-4)='-001'",
         native={'where': {'op': 'ends_with', 'field': FIELDS['wbs'], 'value': '-001'}}),
    case('Q11', 'literal_text', 'WBS名称包含字面字符%，不是通配符，统计条数、金额(K)与工数(小时)。', "instr(project,'%')>0",
         native={'where': {'op': 'contains', 'field': FIELDS['project'], 'value': '%'}}),
    case('Q12', 'gt', '仅保留工数(小时)大于20的明细，统计条数、金额(K)与工数(小时)。', 'hours>20*:hours_scale',
         native={'where': {'op': 'gt', 'field': FIELDS['hours'], 'value': 20}}),
    case('Q13', 'gte', '仅保留工数(小时)大于或等于20的明细，统计条数、金额(K)与工数(小时)。', 'hours>=20*:hours_scale',
         native={'where': {'op': 'gte', 'field': FIELDS['hours'], 'value': 20}}),
    case('Q14', 'between', '工数(小时)在10到20之间，包含两端，统计条数、金额(K)与工数(小时)。', 'hours BETWEEN 10*:hours_scale AND 20*:hours_scale',
         native={'where': {'op': 'between', 'field': FIELDS['hours'], 'min': 10, 'max': 20}}),
    case('Q15', 'and', '只保留无偿且职级为MIS11的明细，统计条数、金额(K)与工数(小时)。',
         "billable='无偿' AND grade='MIS11'",
         native={'filters': [native_filter('billable','in',['无偿']),native_filter('grade','in',['MIS11'])]}),
    case('Q16', 'or', '只要满足无偿或者工数(小时)大于20就保留，统计条数、金额(K)与工数(小时)。', "billable='无偿' OR hours>20*:hours_scale",
         native={'where': {'or': [{'op': 'eq', 'field': FIELDS['billable'], 'value': '无偿'}, {'op': 'gt', 'field': FIELDS['hours'], 'value': 20}]}}),
    case('Q17', 'boolean_tree', '保留（无偿或者工数(小时)大于20）且职级不是MIS10的明细，统计条数、金额(K)与工数(小时)。', "(billable='无偿' OR hours>20*:hours_scale) AND grade<>'MIS10'",
         native={'where': {'and': [{'or': [{'op': 'eq', 'field': FIELDS['billable'], 'value': '无偿'}, {'op': 'gt', 'field': FIELDS['hours'], 'value': 20}]}, {'op': 'ne', 'field': FIELDS['grade'], 'value': 'MIS10'}]}}),
    case('Q18', 'is_null', '仅保留客户名称为空的明细，统计条数、金额(K)与工数(小时)。', 'customer IS NULL', notes='原件无空值，必须另测有NULL/空串/空白字符串的变体',
         native={'where': {'op': 'is_null', 'field': FIELDS['customer']}}),
    case('Q19', 'not_null', '仅保留客户名称不为空的明细，统计条数、金额(K)与工数(小时)。', 'customer IS NOT NULL',
         native={'where': {'op': 'is_not_null', 'field': FIELDS['customer']}}),
    case('Q20', 'group_one', '按WBS负责成本中心分组，列出每组条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', native={'group_by': FIELDS['cost_center']}),
    case('Q21', 'group_many', '按WBS负责成本中心及有偿无偿两列分组，列出每组条数、金额(K)与工数(小时)。',
         select='cost_center, billable, '+SUMMARY, group='cost_center,billable',
         native={'group_by': [{'field': FIELDS['cost_center'], 'alias': 'cost_center'}, {'field': FIELDS['billable'], 'alias': 'billable'}]}),
    case('Q22', 'group_prefix', '按WBS编号去除首尾空格后的前两个字符分组，不区分大小写，列出每组条数、金额(K)与工数(小时)。',
         select='upper(substr(trim(wbs),1,2)) AS group_key, '+SUMMARY,
         group='upper(substr(trim(wbs),1,2))', native={'group_by': {'column':FIELDS['wbs'],'prefix_length':2}}),
    case('Q23', 'having_sum', '按WBS负责成本中心汇总，只保留分组金额(K)合计大于100的组，列出每组条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', having='SUM(amount)>100*:amount_scale',
         native={'group_by': FIELDS['cost_center'], 'having': {'op': 'gt', 'metric': 'amount_k', 'value': 100}}),
    case('Q24', 'having_count', '按WBS负责成本中心汇总，只保留明细条数大于等于10的组，列出每组条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', having='COUNT(*)>=10',
         native={'group_by': FIELDS['cost_center'], 'having': {'op': 'gte', 'metric': 'records', 'value': 10}}),
    case('Q25', 'where_having', '先只保留有偿明细，再按WBS负责成本中心汇总，只保留分组金额(K)合计大于100的组，列出每组条数、金额(K)与工数(小时)。',
         "billable='有偿'", select='cost_center AS group_key, '+SUMMARY, group='cost_center', having='SUM(amount)>100*:amount_scale',
         native={'where': {'op': 'eq', 'field': FIELDS['billable'], 'value': '有偿'}, 'group_by': FIELDS['cost_center'], 'having': {'op': 'gt', 'metric': 'amount_k', 'value': 100}}),
    case('Q26', 'having_and', '按WBS负责成本中心汇总，只保留金额(K)合计大于100且条数至少10的组，列出每组条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', having='SUM(amount)>100*:amount_scale AND COUNT(*)>=10',
         native={'group_by': FIELDS['cost_center'], 'having': {'and': [{'op': 'gt', 'metric': 'amount_k', 'value': 100}, {'op': 'gte', 'metric': 'records', 'value': 10}]}}),
    case('Q27', 'order_limit', '按WBS负责成本中心汇总，按金额(K)降序取前3组；金额相同按成本中心升序，列出条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', order='SUM(amount) DESC,cost_center ASC', limit=3,
         native={'group_by': FIELDS['cost_center'], 'order_by': [{'ref': 'amount_k', 'direction': 'desc'}, {'ref': 'group_key', 'direction': 'asc'}], 'limit': 3}),
    case('Q28', 'distinct', '列出所有不同的WBS负责成本中心，不重复。', select='DISTINCT cost_center', order='cost_center',
         native={'distinct': True, 'fields': [{'field': FIELDS['cost_center'], 'alias': 'cost_center'}], 'order_by': [{'ref': 'cost_center', 'direction': 'asc'}]}),
    case('Q29', 'min_max', '列出明细工数(小时)的最小值与最大值。', select='MIN(hours) AS min_hours, MAX(hours) AS max_hours',
         native={'metrics':[('min_hours','hours','min','duration'),('max_hours','hours','max','duration')]}),
    case('Q30', 'avg', '计算平均每条明细的工数(小时)，空值不计入分母，保留至少6位小数。', select='DEC_AVG(hours) AS avg_hours',
         native={'metrics':[('avg_hours','hours','avg','duration')]}),
    case('Q31', 'count_distinct', '统计不同WBS编号数量，同一编号重复出现只算一次。', select='COUNT(DISTINCT wbs) AS distinct_wbs',
         native={'metrics':[('distinct_wbs','wbs','count_distinct','number')]}),
    case('Q32', 'no_match', '只保留WBS编号以SY、IB或SZ开头的明细，统计条数、金额(K)与工数(小时)。无匹配返回0条及0合计。',
         "lower(wbs) LIKE 'sy%' OR lower(wbs) LIKE 'ib%' OR lower(wbs) LIKE 'sz%'",
         native={'filters': [native_filter('wbs','prefix',['sy','ib','sz'])]}),
    case('Q33', 'month', '仅保留工数年月202610，统计条数、金额(K)与工数(小时)。',
         "month='202610'", native={'filters': [native_filter('month','in',['202610'])]}, notes='原件只有一个月份，另需跨月变体'),
    case('Q34', 'having_not_where', '按WBS负责成本中心分组，只保留组内工数(小时)合计大于100的组。不要先按单条工数筛选。列出每组条数、金额(K)与工数(小时)。',
         select='cost_center AS group_key, '+SUMMARY, group='cost_center', having='SUM(hours)>100*:hours_scale',
         native={'group_by': FIELDS['cost_center'], 'having': {'op': 'gt', 'metric': 'hours', 'value': 100}}),
    case('Q35', 'lt', '仅保留工数(小时)小于20的明细，统计条数、金额(K)与工数(小时)。', 'hours<20*:hours_scale',
         native={'where': {'op': 'lt', 'field': FIELDS['hours'], 'value': 20}}),
    case('Q36', 'lte', '仅保留工数(小时)小于或等于20的明细，统计条数、金额(K)与工数(小时)。', 'hours<=20*:hours_scale',
         native={'where': {'op': 'lte', 'field': FIELDS['hours'], 'value': 20}}),
]

# These are protocol refusal tests, not claimed implementations of new operators.
NEGATIVE_PROBES = [
    {'id':'N01','filter':{'column':'WBS名称','op':'contains','values':['运维']}, 'reason':'Schema禁止的contains不得静默按in执行'},
    {'id':'N02','filter':{'column':'WBS编号','op':'typo_operator','values':['IK-S63021-00-001']}, 'reason':'未知op必须拒绝'},
    {'id':'N03','filter':{'column':'有偿无偿','op':'in','values':'有偿'}, 'reason':'values必须为数组'},
    {'id':'N04','filter':{'column':'有偿无偿','op':'not_in','values':'无偿'}, 'reason':'not_in同样必须校验数组类型'},
    {'id':'N05','filter':{'column':'不存在的字段','op':'in','values':['x']}, 'reason':'未知字段不能静默替换'},
]
