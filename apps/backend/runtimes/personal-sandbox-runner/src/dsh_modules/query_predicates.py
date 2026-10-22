"""Deterministic predicate evaluator for spreadsheet row and group expressions.

Handles strict SQL-like comparison semantics, decimal scaling, null handling,
and literal string matching.
"""

from decimal import Decimal, InvalidOperation
import math
from .query_contract import canonical_predicate_op
from typing import Any, Callable, Dict, List, Optional, Union


def to_decimal(val: Any) -> Optional[Decimal]:
    """Converts a value to Decimal, or returns None if not a finite number."""
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, (int, Decimal)):
        if isinstance(val, Decimal) and not val.is_finite():
            return None
        return Decimal(val)
    if isinstance(val, float):
        if not math.isfinite(val):
            return None
        return Decimal(str(val))
    if isinstance(val, str):
        cleaned = val.strip().replace(",", "")
        try:
            d = Decimal(cleaned)
            if not d.is_finite():
                return None
            return d
        except (InvalidOperation, TypeError):
            return None
    return None


def eval_predicate_3vl(
    node: Dict[str, Any],
    row_dict: Dict[str, Any],
    field_resolver: Optional[Callable[[str], Any]] = None,
) -> Optional[bool]:
    """Evaluates a predicate tree returning True, False, or None (SQL UNKNOWN)."""
    if "and" in node:
        results = [eval_predicate_3vl(c, row_dict, field_resolver) for c in node["and"]]
        if any(r is False for r in results):
            return False
        if all(r is True for r in results):
            return True
        return None

    if "or" in node:
        results = [eval_predicate_3vl(c, row_dict, field_resolver) for c in node["or"]]
        if any(r is True for r in results):
            return True
        if all(r is False for r in results):
            return False
        return None

    if "not" in node:
        res = eval_predicate_3vl(node["not"], row_dict, field_resolver)
        if res is None:
            return None  # NOT(UNKNOWN) remains UNKNOWN
        return not res

    op = canonical_predicate_op(node.get("op"))
    field = node.get("field") or node.get("column")
    raw_val = field_resolver(field) if field_resolver else row_dict.get(field)

    if op == "is_null":
        return raw_val is None
    if op == "is_not_null":
        return raw_val is not None
    if op == "is_blank":
        return raw_val is None or str(raw_val).strip() == ""

    # SQL semantics: comparisons with NULL evaluate to UNKNOWN (None)
    if raw_val is None:
        return None

    if op in ("eq", "=="):
        target = node.get("value")
        if target is None:
            return None
        # String identifiers comparison (B02): If both are strings, compare as text directly
        if isinstance(raw_val, str) and isinstance(target, str):
            return raw_val.strip() == target.strip()
        d_raw = to_decimal(raw_val)
        d_target = to_decimal(target)
        if d_raw is not None and d_target is not None:
            return d_raw == d_target
        return str(raw_val).strip() == str(target).strip()

    if op in ("ne", "!=", "<>"):
        target = node.get("value")
        if target is None:
            return None
        if isinstance(raw_val, str) and isinstance(target, str):
            return raw_val.strip() != target.strip()
        d_raw = to_decimal(raw_val)
        d_target = to_decimal(target)
        if d_raw is not None and d_target is not None:
            return d_raw != d_target
        return str(raw_val).strip() != str(target).strip()

    if op in ("gt", "gte", "lt", "lte", "between"):
        d_raw = to_decimal(raw_val)
        if d_raw is None:
            return False
        if op == "gt":
            d_target = to_decimal(node.get("value"))
            return d_target is not None and d_raw > d_target
        if op == "gte":
            d_target = to_decimal(node.get("value"))
            return d_target is not None and d_raw >= d_target
        if op == "lt":
            d_target = to_decimal(node.get("value"))
            return d_target is not None and d_raw < d_target
        if op == "lte":
            d_target = to_decimal(node.get("value"))
            return d_target is not None and d_raw <= d_target
        if op == "between":
            min_val = to_decimal(node.get("min")) if "min" in node else to_decimal(node.get("values", [None, None])[0])
            max_val = to_decimal(node.get("max")) if "max" in node else to_decimal(node.get("values", [None, None])[1])
            if min_val is None or max_val is None:
                return False
            return min_val <= d_raw <= max_val

    if op == "in":
        targets = node.get("values", [])
        raw_str = str(raw_val).strip()
        case_sensitive = node.get("case_sensitive", False)
        d_raw = to_decimal(raw_val)
        for t in targets:
            if isinstance(raw_val, str) and isinstance(t, str):
                if case_sensitive:
                    if raw_str == t.strip():
                        return True
                else:
                    if raw_str.casefold() == t.strip().casefold():
                        return True
            else:
                d_t = to_decimal(t)
                if d_raw is not None and d_t is not None and d_raw == d_t:
                    return True
                if case_sensitive:
                    if raw_str == str(t).strip():
                        return True
                else:
                    if raw_str.casefold() == str(t).strip().casefold():
                        return True
        return False

    if op == "not_in":
        targets = node.get("values", [])
        raw_str = str(raw_val).strip()
        case_sensitive = node.get("case_sensitive", False)
        d_raw = to_decimal(raw_val)
        for t in targets:
            if isinstance(raw_val, str) and isinstance(t, str):
                if case_sensitive:
                    if raw_str == t.strip():
                        return False
                else:
                    if raw_str.casefold() == t.strip().casefold():
                        return False
            else:
                d_t = to_decimal(t)
                if d_raw is not None and d_t is not None and d_raw == d_t:
                    return False
                if case_sensitive:
                    if raw_str == str(t).strip():
                        return False
                else:
                    if raw_str.casefold() == str(t).strip().casefold():
                        return False
        return True

    if op == "contains":
        targets = node.get("values") or [node.get("value")]
        raw_str = str(raw_val)
        case_sensitive = node.get("case_sensitive", True)
        if not case_sensitive:
            raw_str = raw_str.lower()
            return any(str(t).lower() in raw_str for t in targets if t is not None)
        return any(str(t) in raw_str for t in targets if t is not None)

    if op == "not_contains":
        targets = node.get("values") or [node.get("value")]
        raw_str = str(raw_val)
        case_sensitive = node.get("case_sensitive", True)
        if not case_sensitive:
            raw_str = raw_str.lower()
            return not any(str(t).lower() in raw_str for t in targets if t is not None)
        return not any(str(t) in raw_str for t in targets if t is not None)

    if op == "starts_with":
        targets = node.get("values") or node.get("prefixes") or [node.get("value")]
        val_str = str(raw_val).strip()
        case_sensitive = node.get("case_sensitive", False)
        if not case_sensitive:
            val_str = val_str.lower()
            return any(val_str.startswith(str(p).strip().lower()) for p in targets if p is not None)
        return any(val_str.startswith(str(p).strip()) for p in targets if p is not None)

    if op == "not_starts_with":
        targets = node.get("values") or node.get("prefixes") or [node.get("value")]
        val_str = str(raw_val).strip()
        case_sensitive = node.get("case_sensitive", False)
        if not case_sensitive:
            val_str = val_str.lower()
            return not any(val_str.startswith(str(p).strip().lower()) for p in targets if p is not None)
        return not any(val_str.startswith(str(p).strip()) for p in targets if p is not None)

    if op == "ends_with":
        target = str(node.get("value", "")).strip()
        val_str = str(raw_val).strip()
        case_sensitive = node.get("case_sensitive", False)
        if not case_sensitive:
            return val_str.lower().endswith(target.lower())
        return val_str.endswith(target)

    raise ValueError(f"未知或未实现的行谓词操作符: '{op}'")


def eval_row_predicate(
    node: Dict[str, Any],
    row_dict: Dict[str, Any],
    field_resolver: Optional[Callable[[str], Any]] = None,
) -> bool:
    """Evaluates a WHERE condition tree against a row dictionary.
    
    Adheres to SQL 3-valued logic for comparisons involving NULL:
    comparisons with NULL evaluate to UNKNOWN (filtered out as False in WHERE).
    """
    return eval_predicate_3vl(node, row_dict, field_resolver) is True


def eval_having_predicate(
    node: Dict[str, Any],
    metric_values: Dict[str, Any],
) -> bool:
    """Evaluates a HAVING predicate against aggregate metric values for a group."""
    if "and" in node:
        return all(eval_having_predicate(c, metric_values) for c in node["and"])
    if "or" in node:
        return any(eval_having_predicate(c, metric_values) for c in node["or"])
    if "not" in node:
        return not eval_having_predicate(node["not"], metric_values)

    op = node.get("op", "").lower().strip()
    metric_ref = node.get("metric") or node.get("ref") or node.get("field")
    raw_val = metric_values.get(metric_ref)

    d_raw = to_decimal(raw_val)
    d_target = to_decimal(node.get("value"))

    if op in ("gt", ">"):
        return d_raw is not None and d_target is not None and d_raw > d_target
    if op in ("gte", ">="):
        return d_raw is not None and d_target is not None and d_raw >= d_target
    if op in ("lt", "<"):
        return d_raw is not None and d_target is not None and d_raw < d_target
    if op in ("lte", "<="):
        return d_raw is not None and d_target is not None and d_raw <= d_target
    if op in ("eq", "=="):
        if d_raw is not None and d_target is not None:
            return d_raw == d_target
        return str(raw_val).strip() == str(node.get("value")).strip()
    if op in ("ne", "!=", "<>"):
        if d_raw is not None and d_target is not None:
            return d_raw != d_target
        return str(raw_val).strip() != str(node.get("value")).strip()

    raise ValueError(f"未知或未实现的 HAVING 谓词操作符: '{op}'")
