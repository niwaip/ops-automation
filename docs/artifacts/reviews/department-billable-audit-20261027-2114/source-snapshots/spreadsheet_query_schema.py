"""Canonical SQL-style tool contract; legacy plan dialects stay in the executor."""

SCALAR = {"type": ["string", "number", "boolean", "null"]}
VALUE_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "not_contains"]
LIST_OPS = ["in", "not_in", "starts_with", "not_starts_with", "ends_with"]
NULL_OPS = ["is_null", "is_not_null", "is_blank"]


def _predicate_definition(name, operand):
    ref = {"$ref": "#/$defs/" + name}

    def atom(ops, argument=None, schema=None):
        properties = {operand: {"type": "string", "minLength": 1},
                      "op": {"type": "string", "enum": ops}}
        required = [operand, "op"]
        if argument:
            properties[argument] = schema
            required.append(argument)
        return {"type": "object", "additionalProperties": False,
                "properties": properties, "required": required}

    alternatives = [
        atom(VALUE_OPS, "value", SCALAR),
        atom(LIST_OPS, "values", {"type": "array", "minItems": 1, "items": SCALAR}),
        atom(["between"], "values", {"type": "array", "minItems": 2, "maxItems": 2, "items": SCALAR}),
        atom(NULL_OPS),
    ]
    for operator in ("and", "or", "not"):
        child = ref if operator == "not" else {
            "type": "array", "minItems": 1, "maxItems": 16, "items": ref}
        alternatives.append({"type": "object", "additionalProperties": False,
                             "properties": {operator: child}, "required": [operator]})
    return {"oneOf": alternatives}


QUERY_DEFINITIONS = {
    "where_predicate": _predicate_definition("where_predicate", "field"),
    "having_predicate": _predicate_definition("having_predicate", "metric"),
}

QUERY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "description": "SQL式只读查询，按WHERE→GROUP BY→HAVING→ORDER BY→LIMIT执行。明细只填source/where，默认返回全部原始列与行号；fields可显式选列。不做统计时省略metrics和group_by。",
    "properties": {
        "source": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "sheet": {"type": "string", "minLength": 1},
                "header_row": {"type": "integer", "minimum": 1},
                "data_range": {"type": "string", "pattern": "^[A-Za-z]+[1-9][0-9]*:[A-Za-z]+[1-9][0-9]*$",
                               "description": "真实业务行范围，排除标题、表头、合计与附注"},
            }, "required": ["sheet", "header_row", "data_range"],
        },
        "fields": {"type": "array", "minItems": 1, "uniqueItems": True,
                   "items": {"type": "string", "minLength": 1},
                   "description": "SELECT原始列；省略时明细返回全部列。分组统计使用group_by和metrics，不同时填fields。"},
        "where": {"$ref": "#/$defs/where_predicate",
                  "description": "过滤原始行。starts_with/not_starts_with用values前缀列表；and/or是子条件数组。"},
        "group_by": {"type": "array", "minItems": 1, "items": {"oneOf": [
            {"type": "string", "minLength": 1},
            {"type": "object", "additionalProperties": False,
             "properties": {"field": {"type": "string"},
                            "prefix_length": {"type": "integer", "minimum": 1, "maximum": 32},
                            "alias": {"type": "string"}}, "required": ["field", "prefix_length"]},
        ]}},
        "metrics": {
            "type": "array", "minItems": 1, "maxItems": 64,
            "description": "聚合列，只声明一次；id是HAVING与排序使用的稳定别名，无需引用内部事实ID。",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "id": {"type": "string", "minLength": 1},
                    "label": {"type": "string"},
                    "op": {"type": "string", "enum": ["sum", "min", "max", "avg", "count_rows", "count_values", "count_distinct", "first"]},
                    "field": {"type": "string", "minLength": 1},
                    "unit": {"type": "string", "description": "默认source保留原字段单位；仅明确要求换算时指定目标单位。"},
                }, "required": ["id", "op"],
                "allOf": [{"if": {"properties": {"op": {"enum": ["sum", "min", "max", "avg", "count_values", "count_distinct", "first"]}}},
                           "then": {"required": ["field"]}}],
            },
        },
        "having": {"$ref": "#/$defs/having_predicate", "description": "聚合后过滤，metric引用本次metrics.id；不能用原始列替代聚合别名。"},
        "order_by": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {"ref": {"type": "string"},
                           "direction": {"type": "string", "enum": ["asc", "desc"]}},
            "required": ["ref", "direction"],
        }},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
        "distinct": {"type": "boolean", "description": "去重清单搭配fields使用；count_distinct只返回数量。"},
    },
    "required": ["source"],
    "allOf": [
        {"if": {"required": ["having"]}, "then": {"required": ["metrics"]}},
        {"if": {"required": ["group_by"]}, "then": {"required": ["metrics"]}},
        {"if": {"required": ["metrics"]}, "then": {"not": {"required": ["fields"]}}},
    ],
}

QUERY_TOOL = {
    "type": "function",
    "function": {
        "name": "aggregate_spreadsheet",
        "description": "查询原件明细或执行SQL式聚合。只提交file_path和query。明细省略metrics/group_by；统计只在metrics声明聚合。返回精确rows、来源行号和核验证据。",
        "parameters": {
            "type": "object", "additionalProperties": False,
            "properties": {"file_path": {"type": "string"}, "query": QUERY_SCHEMA},
            "required": ["file_path", "query"], "$defs": QUERY_DEFINITIONS,
        },
    },
}
