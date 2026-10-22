"""Bounded expression interpreter with dimensions; never evaluates model code."""

from dataclasses import dataclass
from decimal import Decimal
import math
import re
from openpyxl.utils import column_index_from_string, range_boundaries, get_column_letter


def resolve_column_dimension_and_unit(table, col, default_amount_unit):
    col_letter = get_column_letter(col)
    hdr_text = str(table.get("headers", {}).get(col_letter) or "")
    col_prof = table.get("column_profiles", {}).get(col_letter) if isinstance(table, dict) else None
    if col_prof:
        dim = getattr(col_prof, "physical_dimension", "general_numeric")
        decl_u = getattr(col_prof, "declared_unit", None)
        if dim == "duration":
            return "duration", decl_u or "小时"
        if dim == "currency":
            return "currency", decl_u or default_amount_unit
        if dim in ("percentage", "ratio"):
            return "ratio", "%"
        return dim, decl_u or "number"

    m_u = re.search(r"[（(]([^()]+)[)）]$", hdr_text.strip())
    if m_u:
        cand = m_u.group(1).strip()
        if cand in DURATION_SCALE:
            return "duration", cand
        if cand in AMOUNT_SCALE:
            return "currency", cand
        if cand in ("%", "百分比"):
            return "ratio", "%"

    return "general_numeric", None


@dataclass
class Quantity:
    value: Decimal
    unit: str
    dimension: str = "general_numeric"


def numeric(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)) or not math.isfinite(float(value)):
        raise ValueError("需要有限数值，不能使用空值、文本或公式错误")
    return Decimal(str(value))


def column_index(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z]{1,3}", value):
        raise ValueError("列必须是Excel列字母")
    result = column_index_from_string(value)
    if result > 16384:
        raise ValueError("列越界")
    return result


def source_column(workbook, table, value):
    try:
        column = column_index(value)
        if table['bounds'][0] <= column <= table['bounds'][2]:
            return column
    except ValueError:
        pass
    ws = workbook[table['sheet']]
    # 1. 完全精确匹配
    matches = [c for c in range(table['bounds'][0], table['bounds'][2]+1)
               if str(ws.cell(table['header_row'], c).value or '').strip() == str(value).strip()]
    if len(matches) == 1:
        return matches[0]

    # 2. 派生修饰容错（如 "项目编号前两个字符" 对应表头 "WBS编号"）
    val_str = str(value).strip()
    prefix_matches = [
        c for c in range(table['bounds'][0], table['bounds'][2]+1)
        if (hdr := str(ws.cell(table['header_row'], c).value or '').strip())
        and (val_str.startswith(hdr) or hdr.startswith(val_str))
    ]
    if len(prefix_matches) == 1:
        return prefix_matches[0]

    raise ValueError("列名不存在或重复，请使用明确列字母；实际字段："+str(table.get("headers",{})))


def bounded_range(ws, value, max_cells=200000):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*", value):
        raise ValueError("业务范围必须是明确的A1:B2区域")
    a, start, b, end = range_boundaries(value)
    if a > b or start > end or end > ws.max_row or b > ws.max_column:
        raise ValueError("范围超出真实工作表或方向错误")
    if (b-a+1)*(end-start+1) > max_cells:
        raise ValueError("计划范围超出受控读取预算，请拆分任务")
    return a, start, b, end


class ExpressionEvaluator:
    def __init__(self, workbook, tables, amount_unit, deadline_check):
        self.workbook, self.tables = workbook, tables
        self.amount_unit, self.deadline_check = amount_unit, deadline_check
        self.visited_cells = set()
        self.nodes = 0

    def evaluate(self, expr, depth=0):
        self.deadline_check()
        self.nodes += 1
        if depth > 12 or self.nodes > 4096 or not isinstance(expr, dict):
            raise ValueError("表达式结构超出预算")
        units = {"amount": self.amount_unit, "number": "number", "ratio": "ratio", "count": "number", "duration": "number"}
        if "unit" in expr and expr["unit"] not in units:
            raise ValueError("非法数值维度")
        if expr.get("unit") == "amount" and self.amount_unit not in AMOUNT_SCALE:
            raise ValueError("金额单位未声明或有冲突，不能构造金额或比率事实")
        if 'op' in expr and 'unit' in expr:
            result=self.evaluate({k:v for k,v in expr.items() if k!='unit'},depth+1)
            if result.unit!=units[expr['unit']] and not (result.unit=='ratio_delta' and expr['unit']=='ratio'):
                raise ValueError("运算声明单位与实际维度不一致")
            return result
        if "constant" in expr:
            if set(expr)-{"constant","unit"} or expr.get("unit","number") != "number":
                raise ValueError("常量只能是无量纲数值，不得伪造原件金额")
            return Quantity(numeric(expr["constant"]), "number")
        if "cell" in expr:
            if 'unit' not in expr:
                c=self.workbook[expr['sheet']][expr['cell']]
                expr={**expr,'unit':'ratio' if '%' in c.number_format else 'amount'}
            if set(expr) != {"cell", "sheet", "unit"}:
                raise ValueError("cell表达式需要且仅接受cell、sheet、unit")
            ws = self.workbook[expr["sheet"]]
            addr = expr["cell"]
            if not isinstance(addr, str) or not re.fullmatch(r"[A-Z]+[1-9][0-9]*", addr):
                raise ValueError("需要真实单元格地址")
            cell = ws[addr]
            if cell.row > ws.max_row or cell.column > ws.max_column:
                raise ValueError("单元格越界")
            self.visited_cells.add(f"{ws.title}!{addr}")
            if "%" in cell.number_format and expr["unit"] != "ratio":
                raise ValueError("百分比单元格必须使用ratio维度")
            return Quantity(numeric(cell.value), units[expr["unit"]])
        if "aggregate" in expr:
            if "group_by" in expr:
                raise ValueError("group_by 聚合计算需由顶层计算计划直接调度")
            if 'unit' not in expr:
                expr={**expr,'unit':'number' if expr.get('aggregate')=='count' else 'amount'}
            if set(expr) != {"aggregate", "table", "column", "unit"}:
                raise ValueError("aggregate需要aggregate、table、column、unit")
            table = self.tables[expr["table"]]
            col = source_column(self.workbook,table,expr["column"])
            if not table["bounds"][0] <= col <= table["bounds"][2]:
                raise ValueError("聚合列不在声明业务范围")
            rows, ws = table["selected_rows"], self.workbook[table["sheet"]]
            if expr["aggregate"] == "count":
                self.visited_cells.update(f"{ws.title}!{ws.cell(r,col).coordinate}" for r in rows)
                if not rows:
                    self.visited_cells.add(f"{ws.title}!{ws.cell(table['header_row'],col).coordinate}")
                return Quantity(Decimal(len(rows)), "number")
            vals = []
            for row in rows:
                self.deadline_check()
                cell = ws.cell(row, col)
                self.visited_cells.add(f"{ws.title}!{cell.coordinate}")
                if "%" in cell.number_format and expr["unit"] != "ratio":
                    raise ValueError("百分比列必须使用ratio维度")
                vals.append(numeric(cell.value))
            col_dim, col_unit = resolve_column_dimension_and_unit(table, col, self.amount_unit)
            if col_dim == "duration":
                final_unit = col_unit or "小时"
                final_dim = "duration"
            elif col_dim == "currency":
                final_unit = col_unit or units.get(expr["unit"], self.amount_unit)
                final_dim = "currency"
            elif col_dim == "ratio":
                final_unit = "%"
                final_dim = "ratio"
            else:
                final_unit = units.get(expr["unit"], "number")
                final_dim = "general_numeric"

            if not vals:
                if expr["aggregate"] == "sum":
                    self.visited_cells.add(f"{ws.title}!{ws.cell(table['header_row'],col).coordinate}")
                    return Quantity(Decimal("0"), final_unit, dimension=final_dim)
                raise ValueError("过滤后没有业务行")
            ops = {"sum": sum, "min": min, "max": max}
            if expr["aggregate"] not in ops:
                raise ValueError("不支持的聚合操作")
            return Quantity(ops[expr["aggregate"]](vals), final_unit, dimension=final_dim)
        if set(expr) != {"op", "args"} or not isinstance(expr["args"], list) or not 2<=len(expr['args'])<=8:
            raise ValueError("二元表达式需要op与两个args")
        if len(expr['args'])>2:
            if expr['op'] not in ('add','multiply'):
                raise ValueError("减法和除法只能接受两个操作数")
            folded={'op':expr['op'],'args':expr['args'][:2]}
            for arg in expr['args'][2:]:folded={'op':expr['op'],'args':[folded,arg]}
            return self.evaluate(folded,depth+1)
        a, b = [self.evaluate(e, depth+1) for e in expr["args"]]
        op = expr["op"]
        if op in ("add", "subtract"):
            if a.unit != b.unit:
                raise ValueError("不能相加/相减不同维度")
            unit="ratio_delta" if op=="subtract" and a.unit=="ratio" else a.unit
            return Quantity(a.value+b.value if op == "add" else a.value-b.value, unit)
        if op == "multiply":
            if a.unit not in ("number", "ratio") and b.unit not in ("number", "ratio"):
                raise ValueError("只支持数值比例乘法")
            unit = b.unit if a.unit in ("number", "ratio") else a.unit
            return Quantity(a.value*b.value, unit)
        if op == "divide":
            if not b.value:
                raise ValueError("分母为零，比率未定义")
            if a.unit == b.unit:
                return Quantity(a.value/b.value, "ratio")
            if b.unit == "number":
                return Quantity(a.value/b.value, a.unit)
        raise ValueError("不支持的运算或维度组合")

    def evaluate_grouped(self, expr):
        self.deadline_check()
        units = {"amount": self.amount_unit, "number": "number", "ratio": "ratio", "count": "number", "duration": "number"}
        if "unit" in expr and expr["unit"] not in units:
            raise ValueError("非法数值维度")
        if expr.get("unit") == "amount" and self.amount_unit not in AMOUNT_SCALE:
            raise ValueError("金额单位未声明或有冲突，不能构造金额或比率事实")
        if 'unit' not in expr:
            expr = {**expr, 'unit': 'number' if expr.get('aggregate') == 'count' else 'amount'}
        allowed_keys = {"aggregate", "table", "column", "unit", "group_by"}
        if set(expr) - allowed_keys or not {"aggregate", "table", "column", "group_by"} <= set(expr):
            raise ValueError("分组聚合需要aggregate、table、column、group_by")
        table = self.tables[expr["table"]]
        col = source_column(self.workbook, table, expr["column"])
        group_spec = expr['group_by']
        group_specs = group_spec if isinstance(group_spec, list) else [group_spec]
        resolved_groups = []
        for g_item in group_specs:
            explicit_prefix = None
            if isinstance(g_item, dict):
                if set(g_item) != {'column', 'prefix_length'} or isinstance(g_item['prefix_length'], bool) or not isinstance(g_item['prefix_length'], int) or not 1 <= g_item['prefix_length'] <= 32:
                    raise ValueError('前缀分组需要column与1至32的prefix_length')
                explicit_prefix = g_item['prefix_length']
                g_item = g_item['column']
            prefix_match = re.search(r'前([一二两三\d]+)个?(?:字母|字符|前缀|位)', str(g_item))
            source_group = str(g_item)[:prefix_match.start()].strip() if prefix_match else g_item
            grp_col = source_column(self.workbook, table, source_group)
            if not table["bounds"][0] <= grp_col <= table["bounds"][2]:
                raise ValueError("分组列不在声明业务范围")
            num_map = {'一': 1, '二': 2, '两': 2, '三': 3}
            p_len = explicit_prefix
            if prefix_match:
                p_val = prefix_match.group(1)
                p_len = num_map.get(p_val) or (int(p_val) if p_val.isdigit() else None)
            resolved_groups.append((grp_col, p_len))

        if not table["bounds"][0] <= col <= table["bounds"][2]:
            raise ValueError("聚合列不在声明业务范围")
        rows, ws = table["selected_rows"], self.workbook[table["sheet"]]

        groups = {}
        for row in rows:
            self.deadline_check()
            g_parts = []
            for grp_col, pfx_len in resolved_groups:
                g_raw = ws.cell(row, grp_col).value
                g_val = str(g_raw).strip() if g_raw is not None else "未分类"
                if pfx_len and len(g_val) >= pfx_len:
                    g_val = g_val[:pfx_len].upper()
                g_parts.append(g_val)
            internal_key = tuple(g_parts)
            groups.setdefault(internal_key, []).append(row)
        ops = {"sum": sum, "min": min, "max": max}
        agg = expr["aggregate"]
        unit_type = expr.get("unit", "number" if agg == "count" else "amount")
        col_dim, col_unit = resolve_column_dimension_and_unit(table, col, self.amount_unit)
        if col_dim == "duration":
            final_unit = col_unit or "小时"
            final_dim = "duration"
        elif col_dim == "currency":
            final_unit = col_unit or units.get(unit_type, self.amount_unit)
            final_dim = "currency"
        elif col_dim == "ratio":
            final_unit = "%"
            final_dim = "ratio"
        else:
            final_unit = units.get(unit_type, "number")
            final_dim = "general_numeric"

        results = []
        for g_tuple, g_rows in sorted(groups.items()):
            g_val = " - ".join(g_tuple) if len(g_tuple) > 1 else g_tuple[0]
            g_id_part = "__".join(g_tuple) if len(g_tuple) > 1 else g_tuple[0]
            g_fields = {k: v for k, v in zip(group_specs, g_tuple)} if len(group_specs) > 1 else {}
            g_cells = set()
            if agg == "count":
                for r in g_rows:
                    g_cells.add(f"{ws.title}!{ws.cell(r, col).coordinate}")
                results.append((g_val, Quantity(Decimal(len(g_rows)), "number"), g_cells, len(g_rows), g_id_part, g_fields))
            else:
                vals = []
                for r in g_rows:
                    self.deadline_check()
                    c = ws.cell(r, col)
                    g_cells.add(f"{ws.title}!{c.coordinate}")
                    if "%" in c.number_format and expr["unit"] != "ratio":
                        raise ValueError("百分比列必须使用ratio维度")
                    vals.append(numeric(c.value))
                if not vals:
                    val_q = Decimal("0") if agg == "sum" else Decimal("0")
                else:
                    if agg not in ops:
                        raise ValueError("不支持的聚合操作")
                    val_q = ops[agg](vals)
                results.append((g_val, Quantity(val_q, final_unit, dimension=final_dim), g_cells, len(g_rows), g_id_part, g_fields))
        return results


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
    "H": Decimal(3600),
    "天": Decimal(3600 * 8),
    "人天": Decimal(3600 * 8),
    "d": Decimal(3600 * 8),
}


def present_quantity(q, output_unit="source"):
    value, unit = q.value, q.unit
    dimension = getattr(q, "dimension", None)
    if not dimension or dimension == "general_numeric":
        if unit in AMOUNT_SCALE:
            dimension = "currency"
        elif unit in DURATION_SCALE:
            dimension = "duration"
        elif unit in ("ratio", "ratio_delta", "%"):
            dimension = "ratio"
        else:
            dimension = "general_numeric"

    # 1. 物理量纲跨界非法换算强阻断
    if output_unit not in ("source", "number"):
        if dimension == "duration" and output_unit in AMOUNT_SCALE:
            raise ValueError(f"物理量纲冲突：当前列为时间/工时时长（单位：{unit}），禁止换算为货币金额单位（{output_unit}）")
        if dimension == "currency" and output_unit in DURATION_SCALE:
            raise ValueError(f"物理量纲冲突：当前列为货币金额（单位：{unit}），禁止换算为时长单位（{output_unit}）")

    if unit in ("ratio", "ratio_delta"):
        if output_unit not in ("source", "%"):
            raise ValueError("比率只能呈现为百分比")
        value, unit = value*100, "百分点" if unit=="ratio_delta" else "%"
    elif output_unit != "source":
        if unit in AMOUNT_SCALE and output_unit in AMOUNT_SCALE:
            value = value*AMOUNT_SCALE[unit]/AMOUNT_SCALE[output_unit]
            unit = output_unit
        elif unit in DURATION_SCALE and output_unit in DURATION_SCALE:
            value = value*DURATION_SCALE[unit]/DURATION_SCALE[output_unit]
            unit = output_unit
        elif unit == 'number' and output_unit in ('条', '笔', '行', '个', '次', '件', '户', '人'):
            unit = output_unit
        elif output_unit == "number":
            unit = "number"
        elif unit != output_unit:
            raise ValueError("换算单位与来源维度不一致")
    if not math.isfinite(float(value)):
        raise ValueError("结果超出支持范围")
    return {"value": str(value), "unit": unit}
