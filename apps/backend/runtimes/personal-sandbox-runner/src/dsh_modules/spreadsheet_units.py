"""Read declared amount units from source notes; never infer magnitude from values."""

import re
from openpyxl.utils import get_column_letter

AMOUNT_UNIT_FACTORS = {"元": 1, "千元": 1000, "万元": 10000, "亿元": 100000000}


def declared_amount_unit(workbook, selected_sheet, header_row):
    def collect(sheets):
        found = {}
        for sheet, last_row in sheets:
            for row in sheet.iter_rows(max_row=last_row, max_col=min(sheet.max_column, 128)):
                for cell in row:
                    value = cell.value
                    if not isinstance(value, str) or "单位" not in value or value.startswith("="):
                        continue
                    for match in re.finditer(r"单位\s*[:：为]?\s*(?:人民币[，,\s]*)?(亿元|万元|千元|元)", value):
                        found.setdefault(match.group(1), []).append(f"{sheet.title}!{get_column_letter(cell.column)}{cell.row}")
                    # Common metadata layout: a unit label in one cell, its
                    # declared value in the adjacent cell. Read that field only.
                    if re.fullmatch(r"(?:币种及|金额|币种和)?单位[:：\s]*", value.strip()):
                        adjacent = sheet.cell(cell.row, cell.column+1)
                        if isinstance(adjacent.value, str):
                            for match in re.finditer(r"(亿元|万元|千元|元)(?=$|[\s，,。；;）)])", adjacent.value):
                                found.setdefault(match.group(1), []).append(
                                    f"{sheet.title}!{get_column_letter(adjacent.column)}{adjacent.row}")
        if len(found) == 1:
            unit, locations = next(iter(found.items()))
            return unit, locations
        if found:
            return None, [ref for refs in found.values() for ref in refs]
        return None, []
    unit, locations = collect([(workbook[selected_sheet], min(header_row, 20))])
    if unit or locations:
        return unit, locations
    return collect([(s, min(s.max_row, 20)) for s in workbook])
