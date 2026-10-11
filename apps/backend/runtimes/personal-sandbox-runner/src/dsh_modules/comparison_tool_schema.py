"""Public schema for a reusable, read-only column comparison capability."""

COMPARISON_TOOL = {
    "type": "function",
    "function": {
        "name": "compare_spreadsheet_columns",
        "description": (
            "只读比较工作表中任意数值列对，并按差额/绝对差额/绝对相对差额求最大或最小值。"
            "先从真实表头确定比较基准、列及完整数据范围；不要猜表名或把不同指标当成预算。"
            "支持多个指标、任意分组、指定范围、并列极值；返回结构化核算与来源证据，随后由你解释结果。"
        ),
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "file_path": {"type": "string"},
                "sheet": {"type": "string", "description": "真实工作表名称"},
                "data_range": {"type": "string", "description": "仅含数据行的有限区域，如A4:H15；排除标题、表头、合计"},
                "header_row": {"type": "integer", "minimum": 1, "description": "真实表头所在行"},
                "group_column": {"type": "string", "description": "月份/部门/产品等分组所在Excel列字母"},
                "comparisons": {
                    "type": "array", "minItems": 1,
                    "items": {
                        "type": "object", "additionalProperties": False,
                        "properties": {
                            "label": {"type": "string", "description": "此次比较对应的指标名"},
                            "left_column": {"type": "string", "description": "被比较值所在列字母"},
                            "right_column": {"type": "string", "description": "基准值所在列字母"},
                        },
                        "required": ["label", "left_column", "right_column"],
                    },
                },
                "basis": {"type": "string", "description": "明确选择的基准：budget、cross_metric、yoy、mom或custom；工具不猜业务含义"},
                "rank_by": {"type": "string", "enum": ["absolute_difference", "difference", "absolute_relative_difference"]},
                "extreme": {"type": "string", "enum": ["max", "min"]},
                "expected_groups": {"type": "array", "items": {"type": "string"}, "description": "本次任务应覆盖的全部分组标签；有此参数时缺失、重复或多余分组均报错"},
            },
            "required": ["file_path", "sheet", "data_range", "header_row", "group_column", "comparisons", "basis", "rank_by", "extreme"],
        },
    },
}
