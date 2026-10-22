"""Deterministic query execution pipeline for spreadsheets.

Implements the 5-stage pipeline:
1. Bounds & Footer Resolution
2. Row Filtering (WHERE with restricted predicate tree)
3. Grouping (GROUP BY single/multi-column and prefix)
4. Aggregations (SUM, MIN, MAX, AVG, COUNT, COUNT_DISTINCT)
5. Group Filtering (HAVING) -> Deduplication (DISTINCT) -> Sorting & Slicing (ORDER BY, LIMIT)
"""

from decimal import Decimal
import re
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import openpyxl
from openpyxl.utils import get_column_letter, range_boundaries

from .query_contract import validate_query_plan, QueryContractError
from .query_predicates import (
    eval_row_predicate,
    eval_having_predicate,
    to_decimal,
)
from .query_result import QueryResult


AMOUNT_SCALE = {
    "元": Decimal(1),
    "千元": Decimal(1000),
    "K": Decimal(1000),
    "k": Decimal(1000),
    "万元": Decimal(10000),
    "百万元": Decimal(1000000),
    "M": Decimal(1000000),
    "m": Decimal(1000000),
    "亿元": Decimal(100000000),
}

DURATION_SCALE = {
    "秒": Decimal(1),
    "分钟": Decimal(60),
    "小时": Decimal(3600),
    "工时": Decimal(3600),
    "h": Decimal(3600),
    "天": Decimal(86400),
}


def bounded_range_boundaries(ws, range_str: str) -> Tuple[int, int, int, int]:
    """Parses A1:B2 range string into 1-based (min_col, min_row, max_col, max_row)."""
    if not isinstance(range_str, str) or not re.fullmatch(r"[A-Za-z]+[1-9][0-9]*:[A-Za-z]+[1-9][0-9]*", range_str):
        raise ValueError("业务范围必须是明确的A1:B2区域")
    min_col, min_row, max_col, max_row = range_boundaries(range_str)
    if min_col > max_col or min_row > max_row:
        raise ValueError("范围方向错误")
    if (ws.max_column and max_col > ws.max_column) or (ws.max_row and max_row > ws.max_row):
        raise ValueError("声明范围超出工作表物理边界")
    return min_col, min_row, max_col, max_row


def detect_footer_pruning(ws, min_col: int, start_row: int, max_col: int, end_row: int) -> Tuple[int, List[int]]:
    """Trims trailing non-business summary, footer, or note rows."""
    footer_pat = re.compile(
        r'^\s*(?:'
        r'[\*＊#※]'
        r'|(?:合\s*计|总\s*计|小\s*计|grand\s+total|subtotal|total|summary)(?:[:：\s]|$)'
        r'|(?:查询条件|报表(?:类别|说明)|填报说明|编制(?:说明|单位)|制表人|制表时间|打印时间|导出时间|生成时间|温馨提示|特别提示|数据来源)(?:[:：\s]|$)'
        r'|(?:备注|注|说明|附注|声明)[:：]'
        r'|(?:第\s*\d+\s*页|page\s*\d+)'
        r')',
        re.I
    )
    col_count = max_col - min_col + 1
    excluded = []
    curr_end = end_row

    while curr_end >= start_row:
        row_cells = [ws.cell(curr_end, c) for c in range(min_col, max_col + 1) if ws.cell(curr_end, c).value is not None]
        if not row_cells:
            excluded.append(curr_end)
            curr_end -= 1
            continue

        first_val = str(row_cells[0].value or "").strip()
        is_footer = False

        populated_ratio = len(row_cells) / max(col_count, 1)
        has_measure_numbers = any(
            isinstance(c.value, (int, float, Decimal)) and not isinstance(c.value, bool)
            for c in row_cells[1:]
        )

        if populated_ratio >= 0.5 and has_measure_numbers:
            if re.fullmatch(r'(?:合\s*计|总\s*计|小\s*计|grand\s+total|total|subtotal|summary)[:：]?', first_val, re.I):
                is_footer = True
        else:
            if footer_pat.search(first_val):
                is_footer = True
            elif col_count >= 4 and len(row_cells) <= max(2, col_count // 4):
                if any(footer_pat.search(str(c.value or "").strip()) for c in row_cells):
                    is_footer = True

        if is_footer:
            excluded.append(curr_end)
            curr_end -= 1
        else:
            break

    return curr_end, excluded


def execute_query_plan(
    workbook: openpyxl.Workbook,
    plan: Dict[str, Any],
    check_deadline: Optional[Callable[[], None]] = None,
    default_amount_unit: str = "K",
) -> QueryResult:
    """Executes a validated query plan against an openpyxl workbook."""
    check = check_deadline or (lambda: None)
    check()

    # 1. Resolve table specifications
    source_spec = plan.get("source", {})
    sheet_name = source_spec.get("sheet")
    if not sheet_name:
        # Default to first non-empty sheet
        sheet_name = workbook.sheetnames[0]
    if sheet_name not in workbook.sheetnames:
        raise KeyError(f"工作表 '{sheet_name}' 不存在")

    ws = workbook[sheet_name]
    header_row = int(source_spec.get("header_row", 1))
    data_range_str = source_spec.get("data_range")

    if data_range_str:
        min_col, min_row, max_col, max_row = bounded_range_boundaries(ws, data_range_str)
    else:
        min_col = 1
        min_row = header_row + 1
        max_col = ws.max_column
        max_row = ws.max_row

    # Footer pruning
    effective_end_row, excluded_rows = detect_footer_pruning(ws, min_col, min_row, max_col, max_row)

    # 2. Extract and index column headers
    col_to_header: Dict[int, str] = {}
    header_to_col: Dict[str, int] = {}
    available_columns: Set[str] = set()

    for col in range(min_col, max_col + 1):
        cell_val = ws.cell(header_row, col).value
        hdr_str = str(cell_val or "").strip()
        if hdr_str:
            col_to_header[col] = hdr_str
            header_to_col[hdr_str] = col
            available_columns.add(hdr_str)
        # Also map column letters as available references
        letter = get_column_letter(col)
        header_to_col[letter] = col
        available_columns.add(letter)

    # Validate plan contract
    validate_query_plan(plan, available_columns)

    def resolve_col_idx(field_name: str) -> Optional[int]:
        if field_name in header_to_col:
            return header_to_col[field_name]
        fn_clean = field_name.strip()
        if fn_clean in header_to_col:
            return header_to_col[fn_clean]
        for h, c in header_to_col.items():
            if h.startswith(fn_clean) or fn_clean.startswith(h):
                return c
        return None

    # 3. WHERE stage: Row filtering
    where_node = plan.get("where")
    selected_row_ids: List[int] = []
    visited_cells: Set[str] = set()

    # Pre-cache rows
    row_records: Dict[int, Dict[str, Any]] = {}
    for r in range(min_row, effective_end_row + 1):
        check()
        r_dict: Dict[str, Any] = {}
        for col, hdr in col_to_header.items():
            val = ws.cell(r, col).value
            r_dict[hdr] = val
            r_dict[get_column_letter(col)] = val
        row_records[r] = r_dict

        if where_node:
            matches = eval_row_predicate(
                where_node,
                r_dict,
                field_resolver=lambda f: r_dict.get(f) if f in r_dict else r_dict.get(col_to_header.get(resolve_col_idx(f) or 0)),
            )
        else:
            matches = True

        if matches:
            selected_row_ids.append(r)

    total_source_rows = max(0, effective_end_row - min_row + 1)
    where_row_count = len(selected_row_ids)

    # 4. Handle Row-level Projection / Records Query without metrics (or DISTINCT)
    if not plan.get("metrics"):
        is_distinct = bool(plan.get("distinct"))
        raw_fields = plan.get("fields") or plan.get("select") or plan.get("distinct_fields")
        if not raw_fields and plan.get("group_by"):
            raw_fields = [
                g["field"] if isinstance(g, dict) else g
                for g in plan["group_by"]
            ]
        if not raw_fields:
            # Default to all declared business column headers
            raw_fields = [col_to_header[c] for c in sorted(col_to_header.keys())]

        field_specs = []
        for df in raw_fields:
            if isinstance(df, dict):
                fname = df.get("field") or df.get("column")
                falias = df.get("alias") or fname
            else:
                fname = df
                falias = df
            field_specs.append((fname, falias))

        seen_tuples = set()
        projected_rows = []
        projected_facts = []

        for r in selected_row_ids:
            check()
            row_dict = row_records[r]
            tup = tuple((type(row_dict.get(fname)), row_dict.get(fname)) for fname, _ in field_specs)
            if is_distinct:
                if tup in seen_tuples:
                    continue
                seen_tuples.add(tup)

            row_res = {}
            for fname, falias in field_specs:
                col_idx = resolve_col_idx(fname)
                val = row_dict.get(fname)
                if val is None and fname not in row_dict and col_idx:
                    val = row_dict.get(col_to_header.get(col_idx))
                row_res[falias] = val
                if col_idx:
                    col_let = get_column_letter(col_idx)
                    visited_cells.add(f"{sheet_name}!{col_let}{r}")

            projected_rows.append(row_res)

        # Sort if order_by
        if plan.get("order_by"):
            for ord_spec in reversed(plan["order_by"]):
                ref = ord_spec["ref"]
                rev = ord_spec.get("direction", "asc").lower() == "desc"
                def sort_key(item):
                    val = item.get(ref)
                    d = to_decimal(val)
                    return (0, d) if d is not None else (1, str(val or ""))
                projected_rows.sort(key=sort_key, reverse=rev)

        offset = plan.get("offset") or 0
        limit = plan.get("limit")
        if offset:
            projected_rows = projected_rows[offset:]
        if limit is not None:
            projected_rows = projected_rows[:limit]

        fact_count = {
            "id": "matched_rows_count",
            "label": "匹配明细行数",
            "group_key": None,
            "group_fields": {},
            "value": str(len(projected_rows)),
            "unit": "条",
            "source_cells": sorted(visited_cells)[:50],
            "matched_records": len(selected_row_ids),
        }
        projected_facts.append(fact_count)

        coverage = [{
            "id": source_spec.get("table_id", "detail"),
            "sheet": sheet_name,
            "data_range": f"{get_column_letter(min_col)}{min_row}:{get_column_letter(max_col)}{effective_end_row}",
            "header_row": header_row,
            "input_records": total_source_rows,
            "evaluated_records": len(selected_row_ids),
            "excluded_header_rows": excluded_rows,
            "headers": {get_column_letter(c): h for c, h in col_to_header.items()},
            "selected_rows": selected_row_ids,
            "coverage_complete": True,
            "filters": plan.get("filters") or ([] if not plan.get("where") else [plan.get("where")]),
        }]

        return QueryResult(
            rows=projected_rows,
            selected_row_ids=selected_row_ids,
            total_source_rows=total_source_rows,
            where_row_count=where_row_count,
            group_count=len(projected_rows),
            having_group_count=len(projected_rows),
            final_row_count=len(projected_rows),
            facts=projected_facts,
            coverage=coverage,
            visited_cells=sorted(visited_cells),
            ordered=bool(plan.get("order_by")),
        )

    # 5. GROUP BY stage
    group_specs = plan.get("group_by") or []
    groups: Dict[Any, Dict[str, Any]] = {}

    if group_specs:
        for r in selected_row_ids:
            check()
            row_dict = row_records[r]
            typed_parts = []
            display_parts = []
            group_fields = {}

            for g_spec in group_specs:
                if isinstance(g_spec, str):
                    fname = g_spec
                    falias = fname
                    pfx_len = None
                else:
                    fname = g_spec.get("field") or g_spec.get("column")
                    falias = g_spec.get("alias") or fname
                    pfx_len = g_spec.get("prefix_length")

                raw_val = row_dict.get(fname)
                if raw_val is None and fname not in row_dict:
                    idx = resolve_col_idx(fname)
                    raw_val = row_dict.get(col_to_header.get(idx or 0))

                # Retain raw scalar typing for typed group separation (B09: int 1 != str '1' != None != '')
                val_type = type(raw_val).__name__
                if pfx_len and raw_val is not None:
                    val_str = str(raw_val).strip()
                    effective_val = val_str[:pfx_len].upper() if len(val_str) >= pfx_len else val_str
                else:
                    effective_val = raw_val

                typed_parts.append((val_type, effective_val))
                display_val = str(effective_val) if effective_val is not None else ""
                display_parts.append(display_val)
                group_fields[falias] = effective_val

            internal_key = tuple(typed_parts)
            display_group_key = display_parts[0] if len(group_specs) == 1 else " - ".join(display_parts)
            if internal_key not in groups:
                groups[internal_key] = {
                    "group_key": display_group_key,
                    "group_fields": group_fields,
                    "rows": [],
                }
            groups[internal_key]["rows"].append(r)
    else:
        # No grouping: single group
        groups[None] = {
            "group_key": None,
            "group_fields": {},
            "rows": selected_row_ids,
        }

    group_count = len(groups)

    # 6. METRICS Aggregation stage
    metrics_spec = plan.get("metrics", [])
    group_results: List[Dict[str, Any]] = []

    for g_key, g_info in groups.items():
        check()
        g_rows = g_info["rows"]
        row_res = {}
        if len(group_specs) == 1:
            g_spec = group_specs[0]
            if isinstance(g_spec, dict) and g_spec.get("alias"):
                row_res[g_spec["alias"]] = next(iter(g_info["group_fields"].values())) if g_info["group_fields"] else g_info["group_key"]
            else:
                row_res["group_key"] = next(iter(g_info["group_fields"].values())) if g_info["group_fields"] else g_info["group_key"]
        elif len(group_specs) > 1:
            row_res.update(g_info["group_fields"])

        metric_vals: Dict[str, Any] = {}
        metric_facts: List[Dict[str, Any]] = []

        for m in metrics_spec:
            mid = m["id"]
            op = m.get("op", "sum").lower()
            field_name = m.get("field") or m.get("column")
            col_idx = resolve_col_idx(field_name) if field_name else None
            col_letter = get_column_letter(col_idx) if col_idx else ""

            # Cells for evidence tracking
            if col_idx:
                if g_rows:
                    m_cells = [f"{sheet_name}!{col_letter}{r}" for r in g_rows]
                else:
                    m_cells = [f"{sheet_name}!{col_letter}{header_row}"]
                visited_cells.update(m_cells)
            else:
                m_cells = []

            # Compute metric value
            if op in ("count_rows", "count"):
                calc_val = Decimal(len(g_rows))
            elif op == "count_distinct":
                vals = set()
                for r in g_rows:
                    cv = ws.cell(r, col_idx).value if col_idx else None
                    if cv is not None:
                        vals.add((type(cv), cv))
                calc_val = Decimal(len(vals))
            elif op == "count_values":
                c = sum(1 for r in g_rows if ws.cell(r, col_idx).value is not None)
                calc_val = Decimal(c)
            elif op in ("sum", "min", "max", "avg", "dec_avg"):
                dec_list = []
                for r in g_rows:
                    cv = ws.cell(r, col_idx).value if col_idx else None
                    d = to_decimal(cv)
                    if d is not None:
                        dec_list.append(d)

                if op == "sum":
                    calc_val = sum(dec_list) if dec_list else Decimal(0)
                elif op == "min":
                    calc_val = min(dec_list) if dec_list else None
                elif op == "max":
                    calc_val = max(dec_list) if dec_list else None
                elif op in ("avg", "dec_avg"):
                    calc_val = sum(dec_list) / Decimal(len(dec_list)) if dec_list else None
            else:
                raise ValueError(f"不支持的聚合操作: '{op}'")

            # Unit determination and mathematical scaling (B07, B12, D02, D03, D04)
            req_unit = m.get("unit")
            src_unit = None
            is_count_op = op in ("count_rows", "count", "count_distinct", "count_values")

            if is_count_op:
                src_unit = "number"
            else:
                real_header = col_to_header.get(col_idx) if col_idx else field_name
                if real_header:
                    m_hdr = re.search(r'[\(（]([^\)）]+)[\)）]', str(real_header))
                    if m_hdr:
                        src_unit = m_hdr.group(1).strip()
                if not src_unit:
                    src_unit = default_amount_unit if op in ("sum", "min", "max", "avg", "dec_avg") else "number"

            if not req_unit or req_unit == "source":
                final_unit = src_unit
            elif req_unit == "duration":
                final_unit = "小时"
            elif req_unit == "amount":
                final_unit = default_amount_unit
            else:
                final_unit = req_unit

            # Dimensional consistency check (D04): reject converting currency to hours without dimensional conversion
            if final_unit != src_unit and not is_count_op:
                src_is_amount = src_unit in AMOUNT_SCALE
                src_is_duration = src_unit in DURATION_SCALE
                dst_is_amount = final_unit in AMOUNT_SCALE
                dst_is_duration = final_unit in DURATION_SCALE

                if (src_is_amount and dst_is_duration) or (src_is_duration and dst_is_amount):
                    raise ValueError(f"无法将物理量纲 '{src_unit}' 转换为不兼容的量纲 '{final_unit}'")

            # Perform mathematical scaling if units differ and known scale factors exist
            if calc_val is not None and final_unit != src_unit:
                if src_unit in AMOUNT_SCALE and final_unit in AMOUNT_SCALE:
                    scale = AMOUNT_SCALE[src_unit] / AMOUNT_SCALE[final_unit]
                    calc_val = calc_val * scale
                elif src_unit in DURATION_SCALE and final_unit in DURATION_SCALE:
                    scale = DURATION_SCALE[src_unit] / DURATION_SCALE[final_unit]
                    calc_val = calc_val * scale

            metric_vals[mid] = calc_val

            # Format for row representation
            if calc_val is not None:
                if op in ("count_rows", "count", "count_distinct"):
                    row_res[mid] = int(calc_val)
                else:
                    # Keep exact string representation without exponent scientific notation
                    row_res[mid] = f"{calc_val:f}".rstrip('0').rstrip('.') if '.' in f"{calc_val:f}" else str(calc_val)
            else:
                row_res[mid] = None

            unit = final_unit

            fact_id = f"{mid}__{g_key}" if g_key is not None else mid
            metric_facts.append({
                "id": fact_id,
                "label": f"{g_info['group_key']} {m.get('label', mid)}" if g_key is not None else m.get('label', mid),
                "group_key": g_info['group_key'],
                "group_fields": g_info["group_fields"],
                "value": row_res[mid],
                "unit": unit,
                "source_cells": sorted(m_cells),
                "matched_records": len(g_rows),
            })

        group_results.append({
            "group_key": g_key,
            "group_fields": g_info['group_fields'],
            "row": row_res,
            "metric_vals": metric_vals,
            "facts": metric_facts,
        })

    # 7. HAVING stage: Filter groups
    having_node = plan.get("having")
    surviving_groups: List[Dict[str, Any]] = []

    for grp in group_results:
        check()
        if having_node:
            passed = eval_having_predicate(having_node, grp["metric_vals"])
        else:
            passed = True

        if passed:
            surviving_groups.append(grp)

    having_group_count = len(surviving_groups)

    # 8. ORDER BY & LIMIT stage
    order_by_specs = plan.get("order_by")
    if order_by_specs:
        for ord_spec in reversed(order_by_specs):
            ref = ord_spec["ref"]
            rev = ord_spec.get("direction", "asc").lower() == "desc"

            def sort_key(grp_item: Dict[str, Any]) -> Any:
                r_item = grp_item["row"]
                m_vals = grp_item["metric_vals"]
                if ref in m_vals and m_vals[ref] is not None:
                    return (0, m_vals[ref])
                val = r_item.get(ref) if ref in r_item else grp_item.get('group_fields', {}).get(ref)
                d_val = to_decimal(val)
                if d_val is not None:
                    return (0, d_val)
                return (1, str(val or ""))

            surviving_groups.sort(key=sort_key, reverse=rev)

    offset = plan.get("offset") or 0
    if offset:
        surviving_groups = surviving_groups[offset:]
    limit = plan.get("limit")
    if limit is not None:
        surviving_groups = surviving_groups[:limit]

    # Final result assembly
    final_rows: List[Dict[str, Any]] = [g["row"] for g in surviving_groups]
    final_facts: List[Dict[str, Any]] = [
        f for g in surviving_groups for f in g["facts"]
    ]

    coverage = [{
        "id": source_spec.get("table_id", "detail"),
        "sheet": sheet_name,
        "data_range": f"{get_column_letter(min_col)}{min_row}:{get_column_letter(max_col)}{effective_end_row}",
        "header_row": header_row,
        "input_records": total_source_rows,
        "evaluated_records": len(selected_row_ids),
        "excluded_header_rows": excluded_rows,
        "headers": {get_column_letter(c): h for c, h in col_to_header.items()},
        "selected_rows": selected_row_ids,
        "coverage_complete": True,
        "filters": plan.get("filters") or ([] if not plan.get("where") else [plan.get("where")]),
    }]

    return QueryResult(
        rows=final_rows,
        selected_row_ids=selected_row_ids,
        total_source_rows=total_source_rows,
        where_row_count=where_row_count,
        group_count=group_count,
        having_group_count=having_group_count,
        final_row_count=len(final_rows),
        facts=final_facts,
        coverage=coverage,
        visited_cells=sorted(visited_cells),
        ordered=bool(order_by_specs),
    )
