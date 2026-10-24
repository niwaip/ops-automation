"""One update path for the agent; no script-write fallback or guessed actions."""
UPDATE_INSTRUCTIONS = '\n'.join([
    '【工作簿更新流程】读取实际工作簿 → aggregate_spreadsheet → plan_spreadsheet_update → 立即调用 execute_spreadsheet_update 完成物理落盘。获得 plan_id 后必须立即调用 execute_spreadsheet_update，严禁停留在计划步骤或向用户索要二次确认！',
    '先根据本轮文件核对来源 Sheet、业务分组键、期间字段、过滤口径、金额字段及目标快照、区块和列标签。',
    '结构工具 label_bands 提供实际标题、期间和列标签的坐标；metadata_scan_complete 为真表示已扫描完整标签范围，不必再分页读全表。',
    '若完整结构证据没有目标单位声明，且任务契约无用户单位确认，直接用实际标签调用规划器获取 needs_input，不要分页读表、重复检查或先聚合来源。',
    '只在来源明细上聚合；目标工作簿使用结构工具读取，不要把多级表头当明细做聚合。',
    '更新聚合只填写 file_path、sheet、header_row、filters、group_by、value_field、operation；filters 的每项是实际 field/op/value，同时满足所有条件。不要填写 query/where/metrics 或 children。',
    '规划时传目标工作簿内被复制的 base_sheet 和新建的 new_sheet、period/period_field、section/target_label、target_kind、target_unit。',
    'section 是业务区块的独立标题，period 是期间值，target_label 是单独的指标列标签；不能把期间值填入 section，也不能把期间拼入 target_label。区块参数错误时按工具返回的实际标题候选修正 section，不能靠反复缩小范围代替修正字段。',
    '若指令要求更新多个业务区块（如同时更新有偿和无偿），可使用 sections 参数传入包含各区块 section 和对应 result_id 的列表（如 sections: [{\"section\": \"有偿\", \"result_id\": \"...\"}, {\"section\": \"无偿\", \"result_id\": \"...\"}]），或以逗号分隔 section（如 section: \"有偿, 无偿\"）一次性规划，系统会自动定位各区块并在同一新工作表中完成所有回填，严禁漏掉任何一个区块。',
    '区块标题支持从 label_bands 读取或使用业务标准名称（系统支持常见业务别名，如“无偿”自动匹配对应非有偿区块）。',
    '需要保护的列使用实际 protected_labels。目标单位可由用户明确确认或工作簿声明；用户对上轮单位问题的简短回答继续原更新任务，沿用原目标和来源，不得丢弃目标附件。用户确认经服务端核对原话后可用，不要求改写原表补单位。否则省略 target_unit，由规划器验证实际声明。unit_cell 只能指向真实单位说明；返回 needs_input 后停止并报告问题，不得猜单位或补造说明。',
    '多分组或多指标时用 key_field/metric_id 明确选择；重复区块可用读取到的 target_range 消歧。',
    'base_sheet 不是统计来源的明细 Sheet；target_range 通常省略，不能只填输入列范围。文件可直接使用当前附件名，不猜造目录。',
    '禁止填写原子操作、逐格金额、哈希、run_id 或自动执行开关。获得 plan_id 后必须立即调用 execute_spreadsheet_update 执行物理落盘，只有 published 才算完成交付，严禁输出计划草稿等待用户确认。',
    'needs_input 表示缺少业务依据，需要将具体问题告知用户；不能编造依据、生成样例文件或用脚本绕过。',
    '未匹配业务键保留原值并提示。完成后简要报告文件、新工作表、回填条数、单位与警告。',
])


def select_update_tools(tools):
    allowed = {'inspect_spreadsheet_structure', 'read_file', 'read_skill',
               'aggregate_spreadsheet', 'plan_spreadsheet_update',
               'execute_spreadsheet_update', 'get_spreadsheet_update_status'}
    from .aggregation_api import AGGREGATION_TOOL
    return [AGGREGATION_TOOL if tool.get('function', {}).get('name')=='aggregate_spreadsheet' else tool
            for tool in tools if tool.get('function', {}).get('name') in allowed]
