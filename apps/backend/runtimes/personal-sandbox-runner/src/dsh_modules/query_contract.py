"""Query contract and schema validation for deterministic Excel query execution.

Defines the canonical query intermediate representation (Query IR), allowed operators,
type constraints, and strict input validation rules.
"""

from decimal import Decimal
import re
from typing import Any, Dict, List, Optional, Set


PREDICATE_ALIASES = {">": "gt", ">=": "gte", "<": "lt", "<=": "lte",
                     "=": "eq", "==": "eq", "!=": "ne", "<>": "ne"}


def canonical_predicate_op(op):
    op = str(op or '').strip().lower()
    return PREDICATE_ALIASES.get(op, op)


CANONICAL_SCALAR_OPS = {"eq", "ne", "gt", "gte", "lt", "lte", "between"}
CANONICAL_COLLECTION_OPS = {"in", "not_in"}
CANONICAL_TEXT_OPS = {"contains", "not_contains", "starts_with", "not_starts_with", "ends_with"}
CANONICAL_NULL_OPS = {"is_null", "is_not_null", "is_blank"}
CANONICAL_BOOLEAN_OPS = {"and", "or", "not"}

CANONICAL_PREDICATE_OPS = (
    CANONICAL_SCALAR_OPS
    | CANONICAL_COLLECTION_OPS
    | CANONICAL_TEXT_OPS
    | CANONICAL_NULL_OPS
    | CANONICAL_BOOLEAN_OPS
)

CANONICAL_AGGREGATES = {
    "sum",
    "min",
    "max",
    "avg",
    "dec_avg",
    "count",
    "count_rows",
    "count_values",
    "count_distinct",
}


class QueryContractError(ValueError):
    """Raised when a query plan violates the contract."""
    pass


def validate_predicate_node(
    node: Any,
    available_columns: Set[str],
    depth: int = 0,
    max_depth: int = 10,
    for_having: bool = False,
    valid_metric_ids: Optional[Set[str]] = None,
) -> None:
    """Recursively validates a predicate node."""
    if depth > max_depth:
        raise QueryContractError(f"条件树嵌套深度超过限制 ({max_depth})")
    if not isinstance(node, dict):
        raise QueryContractError("条件节点必须是字典对象")

    # Boolean combinators
    bool_ops = {"and", "or", "not"} & set(node.keys())
    if len(bool_ops) > 1:
        raise QueryContractError(f"条件节点不能同时包含多个逻辑操作符: {bool_ops}")
    if "op" in node and bool_ops:
        raise QueryContractError("条件节点不能同时包含原子操作符 op 与逻辑组合操作符")

    if "and" in node or "or" in node:
        op = "and" if "and" in node else "or"
        args = node[op]
        if not isinstance(args, list) or not (1 <= len(args) <= 16):
            raise QueryContractError(f"{op} 组合操作需要 1 到 16 个子条件列表")
        for child in args:
            validate_predicate_node(
                child, available_columns, depth + 1, max_depth, for_having, valid_metric_ids
            )
        return

    if "not" in node:
        child = node["not"]
        if not isinstance(child, dict):
            raise QueryContractError("not 操作必须包含单一子条件字典")
        validate_predicate_node(
            child, available_columns, depth + 1, max_depth, for_having, valid_metric_ids
        )
        return

    # Atomic predicate
    op = node.get("op")
    if not op or not isinstance(op, str):
        raise QueryContractError("条件节点必须指定合法的 op 操作符")

    op_norm = canonical_predicate_op(op)
    if op_norm not in CANONICAL_PREDICATE_OPS:
        raise QueryContractError(f"不支持的操作符: '{op}'")

    if for_having:
        # HAVING predicates must reference an aggregate metric alias, not raw columns
        metric_ref = node.get("metric") or node.get("field") or node.get("ref")
        if not metric_ref or not isinstance(metric_ref, str):
            raise QueryContractError("HAVING 条件必须指定有效的度量引用 (metric/ref)")
        if valid_metric_ids and metric_ref not in valid_metric_ids:
            raise QueryContractError(f"HAVING 条件引用了未定义的聚合度量: '{metric_ref}'")
    else:
        field = node.get("field") or node.get("column")
        if not field or not isinstance(field, str):
            raise QueryContractError("条件节点必须指定有效的字段名 (field/column)")
        if available_columns and field not in available_columns:
            raise QueryContractError(f"条件字段不存在于工作表字段中: '{field}'")

    # Operator-specific type checks
    if op_norm in CANONICAL_COLLECTION_OPS:
        vals = node.get("values")
        if vals is None or not isinstance(vals, list) or len(vals) == 0:
            raise QueryContractError(f"{op_norm} 条件必须包含非空的 values 数组")

    elif op_norm in ("starts_with", "not_starts_with"):
        vals = node.get("values") or node.get("prefixes")
        if vals is None or not isinstance(vals, list) or len(vals) == 0:
            raise QueryContractError(f"{op_norm} 前缀匹配必须包含非空的前缀列表")

    elif op_norm in ("contains", "not_contains"):
        val = node.get("value")
        vals = node.get("values")
        if val is None and (vals is None or not isinstance(vals, list) or len(vals) == 0):
            raise QueryContractError(f"{op_norm} 匹配必须包含非空的 value 或 values 字符串")

    elif op_norm == "ends_with":
        val = node.get("value")
        if val is None or not isinstance(val, (str, int)):
            raise QueryContractError("ends_with 后缀匹配必须包含非空的目标值")

    elif op_norm == "between":
        has_min_max = "min" in node and "max" in node
        vals = node.get("values")
        has_two_vals = isinstance(vals, list) and len(vals) == 2
        if not has_min_max and not has_two_vals:
            raise QueryContractError("between 条件必须包含 min 和 max，或者长度为 2 的 values 数组")

    elif op_norm in ("gt", "gte", "lt", "lte", "eq", "ne"):
        if "value" not in node and "values" not in node:
            raise QueryContractError(f"{op_norm} 比较操作必须提供比较目标 value")


def validate_query_plan(plan: Dict[str, Any], available_columns: Set[str]) -> None:
    """Validates an entire query plan."""
    if not isinstance(plan, dict):
        raise QueryContractError("查询计划必须是字典对象")

    allowed_plan_keys = {
        "version",
        "source",
        "where",
        "group_by",
        "metrics",
        "having",
        "order_by",
        "limit",
        "offset",
        "distinct",
        "distinct_fields",
        "fields",
        "select",
        "mode",
    }
    unknown_keys = set(plan.keys()) - allowed_plan_keys
    if unknown_keys:
        raise QueryContractError(f"查询计划包含未知配置项: {unknown_keys}")

    # Validate where
    where_node = plan.get("where")
    if where_node:
        validate_predicate_node(where_node, available_columns)

    # Validate fields / select projection
    fields = plan.get("fields") or plan.get("select")
    if fields:
        if not isinstance(fields, list):
            raise QueryContractError("fields/select 必须是列表")
        for f in fields:
            fname = f.get("field") or f.get("column") if isinstance(f, dict) else f
            if not isinstance(fname, str) or not fname.strip():
                raise QueryContractError("投影字段必须是非空字符串")
            if available_columns and fname not in available_columns:
                raise QueryContractError(f"投影字段不存在于工作表字段中: '{fname}'")

    # Validate metrics / row projection
    metrics = plan.get("metrics")
    is_record_query = (
        bool(plan.get("distinct"))
        or bool(plan.get("fields"))
        or bool(plan.get("select"))
        or plan.get("mode") in ("records", "detail", "rows")
        or (not metrics and not plan.get("group_by"))
    )
    if not metrics and not is_record_query:
        raise QueryContractError("查询计划必须指定聚合度量 (metrics) 或声明明细投影字段 (fields/select/distinct)")

    metric_ids = set()
    if metrics:
        if not isinstance(metrics, list):
            raise QueryContractError("metrics 必须是列表")
        for m in metrics:
            if not isinstance(m, dict):
                raise QueryContractError("每个 metric 度量定义必须是字典")
            mid = m.get("id")
            if not mid or not isinstance(mid, str):
                raise QueryContractError("度量项必须包含明确的 id")
            if mid in metric_ids:
                raise QueryContractError(f"度量 id 重复: '{mid}'")
            metric_ids.add(mid)

            op = m.get("op", "sum").lower()
            if op not in CANONICAL_AGGREGATES:
                raise QueryContractError(f"不支持的聚合操作: '{op}'")

            field = m.get("field") or m.get("column")
            if op not in ("count_rows", "count") and not field:
                raise QueryContractError(f"度量 '{mid}' 的聚合操作 '{op}' 必须指定目标字段")
            if field and available_columns and field not in available_columns:
                raise QueryContractError(f"度量 '{mid}' 引用的字段不存在: '{field}'")

    # Validate group_by
    group_by = plan.get("group_by")
    if group_by:
        if not isinstance(group_by, list):
            raise QueryContractError("group_by 必须是列表")
        for g in group_by:
            if isinstance(g, str):
                field = g
            elif isinstance(g, dict):
                field = g.get("field") or g.get("column")
                pfx = g.get("prefix_length")
                if pfx is not None and (not isinstance(pfx, int) or not (1 <= pfx <= 32)):
                    raise QueryContractError("prefix_length 必须是 1 到 32 之间的整数")
            else:
                raise QueryContractError("group_by 分组项必须是字段名字符串或配置字典")
            if available_columns and field not in available_columns:
                raise QueryContractError(f"分组字段不存在于工作表字段中: '{field}'")

    # Validate having
    having_node = plan.get("having")
    if having_node:
        validate_predicate_node(
            having_node,
            available_columns,
            for_having=True,
            valid_metric_ids=metric_ids,
        )

    # Validate order_by
    order_by = plan.get("order_by")
    if order_by:
        if not isinstance(order_by, list):
            raise QueryContractError("order_by 必须是列表")
        for ord_item in order_by:
            if not isinstance(ord_item, dict) or "ref" not in ord_item:
                raise QueryContractError("排序项必须指定 ref 字段")
            direction = ord_item.get("direction", "asc").lower()
            if direction not in ("asc", "desc"):
                raise QueryContractError(f"不支持的排序方向: '{direction}'")

    # Validate limit & offset
    limit = plan.get("limit")
    if limit is not None and (not isinstance(limit, int) or limit < 0):
        raise QueryContractError("limit 必须是非负整数")

    offset = plan.get("offset")
    if offset is not None and (not isinstance(offset, int) or offset < 0):
        raise QueryContractError("offset 必须是非负整数")
