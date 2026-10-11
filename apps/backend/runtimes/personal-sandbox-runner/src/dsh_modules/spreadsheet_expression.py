"""Bounded expression interpreter with dimensions; never evaluates model code."""

from dataclasses import dataclass
from decimal import Decimal
import math
import re
from openpyxl.utils import column_index_from_string, range_boundaries


@dataclass
class Quantity:
    value: Decimal
    unit: str


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


def source_column(workbook,table,value):
    try:
        column=column_index(value)
        if table['bounds'][0]<=column<=table['bounds'][2]:
            return column
    except ValueError:
        pass
    ws=workbook[table['sheet']]
    matches=[c for c in range(table['bounds'][0],table['bounds'][2]+1)
             if str(ws.cell(table['header_row'],c).value or '').strip()==str(value).strip()]
    if len(matches)!=1:
        raise ValueError("列名不存在或重复，请使用明确列字母；实际字段："+str(table.get("headers",{})))
    return matches[0]


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
        units = {"amount": self.amount_unit, "number": "number", "ratio": "ratio"}
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
                return Quantity(Decimal(len(rows)), "number")
            vals = []
            for row in rows:
                self.deadline_check()
                cell = ws.cell(row, col)
                self.visited_cells.add(f"{ws.title}!{cell.coordinate}")
                if "%" in cell.number_format and expr["unit"] != "ratio":
                    raise ValueError("百分比列必须使用ratio维度")
                vals.append(numeric(cell.value))
            if not vals:
                raise ValueError("过滤后没有业务行")
            ops = {"sum": sum, "min": min, "max": max}
            if expr["aggregate"] not in ops:
                raise ValueError("不支持的聚合操作")
            return Quantity(ops[expr["aggregate"]](vals), units[expr["unit"]])
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


AMOUNT_SCALE = {"元": Decimal(1), "千元": Decimal(1000), "万元": Decimal(10000), "亿元": Decimal(100000000)}


def present_quantity(q, output_unit="source"):
    value, unit = q.value, q.unit
    if unit in ("ratio", "ratio_delta"):
        if output_unit not in ("source", "%"):
            raise ValueError("比率只能呈现为百分比")
        value, unit = value*100, "百分点" if unit=="ratio_delta" else "%"
    elif output_unit != "source":
        if unit in AMOUNT_SCALE and output_unit in AMOUNT_SCALE:
            value = value*AMOUNT_SCALE[unit]/AMOUNT_SCALE[output_unit]
            unit = output_unit
        elif unit != output_unit:
            raise ValueError("换算单位与来源维度不一致")
    if not math.isfinite(float(value)):
        raise ValueError("结果超出支持范围")
    return {"value": str(value), "unit": unit}
