"""Public semantic API. Internal operations, hashes and cell bindings are not model inputs."""

def _tool(name, description, properties, required):
    return {'type': 'function', 'function': {'name': name, 'description': description,
            'parameters': {'type': 'object', 'additionalProperties': False,
                           'properties': properties, 'required': required}}}


def _string(description, **extra):
    return {'type': 'string', 'description': description, **extra}


SPREADSHEET_UPDATE_TOOL_DEFINITIONS = [
    _tool('plan_spreadsheet_update',
          '根据本轮已验证聚合结果和实际工作簿标签规划按键回填。获得 plan_id 后必须紧接着在同一轮中调用 execute_spreadsheet_update(plan_id=...) 完成实际落盘与交付，严禁停留在计划步骤或向用户索要二次确认。',
          {'target_file':_string('本轮目标工作簿路径'),
           'base_sheet':_string('目标工作簿内被复制的快照 Sheet；绝不是统计来源文件里的明细 Sheet。先读取目标清单选择'),
           'new_sheet':_string('用户要求的新工作表名；用户只给日期时依据其命名要求确定'),
           'period':_string('本次业务期间标识，必须与来源筛选及目标表头一致'),
           'period_field':_string('来源查询中实际用于期间等值筛选的字段名'),
           'section':_string('业务区块的实际独立标题，从 label_bands 读取；若需同时更新多个区块可传逗号分隔名称（如 "有偿, 无偿"）或使用 sections 参数；若提供 sections 列表则本参数可省略；不能把 period 填入此字段'),
           'sections':{'type':'array','items':{'type':'object'},'description':'可选：多区块更新列表。每个对象可包含 section、result_id、target_label、target_kind 等；当需要同时更新多个独立区块（如同时更新有偿和无偿）时使用'},
           'target_label':_string('目标列的实际表头文本，必须从工作簿读取；若在 sections 参数中为每个区块分别指定则本字段可省略'),
           'target_kind':_string('用户要求更新的数值性质',enum=['forecast','actual']),
           'target_unit':_string('可选：用户明确确认或工作簿声明的目标单位；省略时使用经服务端核对的用户确认或真实声明，不能从来源推断'),
           'unit_cell':_string('目标工作表中实际声明单位的单元格；多个单位时用其消歧'),
           'key_field':_string('来源聚合查询的业务分组键；仅一个分组字段时可省略'),
           'result_id':_string('已验证统计结果 ID；仅一个结果时可省略'),
           'metric_id':_string('多个统计指标时指定实际指标 ID'),
           'target_range':_string('通常省略。仅区块歧义时指定；必须包含区块标题、完整表头和业务键列，不能只传目标列或数据行'),
           'protected_labels':{'type':'array','items':{'type':'string'},'description':'需要保护的实际列标签，从目标工作簿读取'},
           'output_name':_string('尚不存在的新 xlsx 文件名')},
          ['target_file','base_sheet','new_sheet','period','period_field','target_kind']),
    _tool('execute_spreadsheet_update',
          '执行已锁定计划、重算公式、验证作用域和来源后交付新 Excel。仅 published 表示文件已生成。',
          {'plan_id': _string('plan_spreadsheet_update 返回的计划 ID')}, ['plan_id']),
    _tool('get_spreadsheet_update_status', '查询运行状态',
          {'plan_id': _string('计划 ID')}, ['plan_id']),
]
