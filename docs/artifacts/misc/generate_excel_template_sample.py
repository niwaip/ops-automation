from __future__ import annotations

import zipfile
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "office-addin-template-extraction-sample.xlsx"


def col_name(index: int) -> str:
    result = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


class SharedStrings:
    def __init__(self) -> None:
        self.items: List[str] = []
        self.index: Dict[str, int] = {}
        self.count = 0

    def add(self, value: str) -> int:
        self.count += 1
        if value not in self.index:
            self.index[value] = len(self.items)
            self.items.append(value)
        return self.index[value]

    def to_xml(self) -> str:
        si = "".join(f"<si><t>{escape(item)}</t></si>" for item in self.items)
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'count="{self.count}" uniqueCount="{len(self.items)}">{si}</sst>'
        )


def make_string_cell(ref: str, value: str, shared: SharedStrings, style: int = 0) -> str:
    idx = shared.add(value)
    style_attr = f' s="{style}"' if style else ""
    return f'<c r="{ref}" t="s"{style_attr}><v>{idx}</v></c>'


def make_number_cell(ref: str, value: float | int, style: int = 0) -> str:
    style_attr = f' s="{style}"' if style else ""
    return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'


def make_formula_cell(
    ref: str,
    formula: str,
    cached_value: str | int | float = 0,
    style: int = 0,
) -> str:
    style_attr = f' s="{style}"' if style else ""
    return f'<c r="{ref}"{style_attr}><f>{escape(str(formula))}</f><v>{escape(str(cached_value))}</v></c>'


def build_sheet_xml(
    name: str,
    cells: List[Tuple[str, str]],
    merges: Optional[List[str]] = None,
    table_rel_id: Optional[str] = None,
    dimension: Optional[str] = None,
) -> str:
    rows: "OrderedDict[int, List[Tuple[str, str]]]" = OrderedDict()
    for ref, cell_xml in cells:
      row_no = int("".join(ch for ch in ref if ch.isdigit()))
      rows.setdefault(row_no, []).append((ref, cell_xml))

    row_xml = []
    for row_no, row_cells in rows.items():
        row_cells.sort(key=lambda item: item[0])
        row_xml.append(
            f'<row r="{row_no}">' + "".join(cell for _, cell in row_cells) + "</row>"
        )

    merge_xml = ""
    if merges:
        merge_items = "".join(f'<mergeCell ref="{ref}"/>' for ref in merges)
        merge_xml = f'<mergeCells count="{len(merges)}">{merge_items}</mergeCells>'

    table_parts_xml = ""
    if table_rel_id:
        table_parts_xml = (
            f'<tableParts count="1"><tablePart xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            f'r:id="{table_rel_id}"/></tableParts>'
        )

    dimension_ref = dimension or f"A1:{cells[-1][0]}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<dimension ref="{dimension_ref}"/>'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        f'{merge_xml}'
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
        f'{table_parts_xml}'
        '</worksheet>'
    )


def build_table_xml(table_id: int, name: str, ref: str, headers: List[str]) -> str:
    columns = "".join(
        f'<tableColumn id="{idx}" name="{escape(header)}"/>'
        for idx, header in enumerate(headers, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'id="{table_id}" name="{name}" displayName="{name}" ref="{ref}" totalsRowShown="0">'
        f'<autoFilter ref="{ref}"/>'
        f'<tableColumns count="{len(headers)}">{columns}</tableColumns>'
        '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" '
        'showRowStripes="1" showColumnStripes="0"/>'
        '</table>'
    )


def build_styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>"""


def build_workbook_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr/>
  <bookViews><workbookView xWindow="240" yWindow="15" windowWidth="16095" windowHeight="9660"/></bookViews>
  <sheets>
    <sheet name="封面说明" sheetId="1" r:id="rId1"/>
    <sheet name="订单主数据" sheetId="2" r:id="rId2"/>
    <sheet name="订单明细" sheetId="3" r:id="rId3"/>
    <sheet name="付款计划" sheetId="4" r:id="rId4"/>
    <sheet name="汇总校验" sheetId="5" r:id="rId5"/>
  </sheets>
  <definedNames>
    <definedName name="customer_name">'订单主数据'!$B$3</definedName>
    <definedName name="contract_no">'订单主数据'!$B$5</definedName>
    <definedName name="discount_flag">'订单主数据'!$B$8</definedName>
    <definedName name="grand_total">'汇总校验'!$B$3</definedName>
  </definedNames>
  <calcPr calcId="191029"/>
</workbook>"""


def build_workbook_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>"""


def build_root_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""


def build_content_types_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
  <Override PartName="/xl/tables/table2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>"""


def build_sheet_table_rel(table_target: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/{table_target}"/>
</Relationships>"""


def add_cell(cells: List[Tuple[str, str]], ref: str, xml: str) -> None:
    cells.append((ref, xml))


def build_workbook_parts() -> Dict[str, str]:
    shared = SharedStrings()

    cover: List[Tuple[str, str]] = []
    add_cell(cover, "A1", make_string_cell("A1", "Office Add-in Excel 模板提取测试样例", shared, 1))
    add_cell(cover, "A3", make_string_cell("A3", "用途", shared, 2))
    add_cell(cover, "B3", make_string_cell("B3", "用于测试多 Sheet、表格、循环、条件、公式、命名区域等模板识别能力", shared, 4))
    add_cell(cover, "A4", make_string_cell("A4", "覆盖点", shared, 2))
    add_cell(cover, "B4", make_string_cell("B4", "1) 主数据字段 2) 明细循环表 3) 付款计划循环表 4) IF 条件公式 5) 跨 Sheet 汇总公式", shared, 4))
    add_cell(cover, "A6", make_string_cell("A6", "建议提取字段", shared, 2))
    add_cell(cover, "B6", make_string_cell("B6", "客户名称、客户编号、合同编号、币种、折扣标记、审批人、明细行、付款计划、汇总金额", shared, 4))
    cover_xml = build_sheet_xml("封面说明", cover, merges=["A1:F1"], dimension="A1:F6")

    master: List[Tuple[str, str]] = []
    add_cell(master, "A1", make_string_cell("A1", "订单主数据", shared, 1))
    rows = [
        ("A3", "客户名称", "B3", "{d.customer.name}"),
        ("A4", "客户编号", "B4", "{d.customer.code}"),
        ("A5", "合同编号", "B5", "{d.contract.no}"),
        ("A6", "订单日期", "B6", "{d.order.date}"),
        ("A7", "币种", "B7", "{d.currency}"),
        ("A8", "是否启用折扣", "B8", "{d.flags.discountEligible}"),
        ("A9", "审批人", "B9", "{d.approval.owner}"),
        ("A10", "条件文案提示", "B10", "若 discountEligible = true，则在汇总页展示折扣率与折后金额"),
    ]
    for left_ref, left_text, right_ref, right_text in rows:
        add_cell(master, left_ref, make_string_cell(left_ref, left_text, shared, 2))
        add_cell(master, right_ref, make_string_cell(right_ref, right_text, shared, 4))
    master_xml = build_sheet_xml("订单主数据", master, merges=["A1:E1"], dimension="A1:E10")

    detail: List[Tuple[str, str]] = []
    headers1 = ["循环开始", "产品名称", "规格", "数量", "单价", "金额", "循环结束"]
    add_cell(detail, "A1", make_string_cell("A1", "订单明细循环表", shared, 1))
    add_cell(detail, "A2", make_string_cell("A2", "该 Sheet 含真实 Excel Table，可用于测试循环识别与表格区域提取", shared, 4))
    for idx, header in enumerate(headers1, start=1):
        ref = f"{col_name(idx)}3"
        add_cell(detail, ref, make_string_cell(ref, header, shared, 2))
    row4 = {
        "A4": make_string_cell("A4", "{#d.items}", shared),
        "B4": make_string_cell("B4", "{d.items.productName}", shared),
        "C4": make_string_cell("C4", "{d.items.spec}", shared),
        "D4": make_string_cell("D4", "{d.items.qty}", shared),
        "E4": make_string_cell("E4", "{d.items.unitPrice}", shared),
        "F4": make_formula_cell("F4", "D4*E4", 0, 3),
        "G4": make_string_cell("G4", "{/d.items}", shared),
    }
    for ref, xml in row4.items():
        add_cell(detail, ref, xml)
    detail_xml = build_sheet_xml("订单明细", detail, merges=["A1:G1"], table_rel_id="rId1", dimension="A1:G4")

    payment: List[Tuple[str, str]] = []
    headers2 = ["循环开始", "付款阶段", "计划日期", "计划金额", "条件标签", "循环结束"]
    add_cell(payment, "A1", make_string_cell("A1", "付款计划循环表", shared, 1))
    add_cell(payment, "A2", make_string_cell("A2", "此表用于测试第二个循环区域以及 IF 条件逻辑", shared, 4))
    for idx, header in enumerate(headers2, start=1):
        ref = f"{col_name(idx)}3"
        add_cell(payment, ref, make_string_cell(ref, header, shared, 2))
    row4_payment = {
        "A4": make_string_cell("A4", "{#d.payments}", shared),
        "B4": make_string_cell("B4", "{d.payments.stage}", shared),
        "C4": make_string_cell("C4", "{d.payments.planDate}", shared),
        "D4": make_string_cell("D4", "{d.payments.amount}", shared),
        "E4": make_formula_cell("E4", 'IF(D4>50000,"大额付款","常规付款")', 0),
        "F4": make_string_cell("F4", "{/d.payments}", shared),
    }
    for ref, xml in row4_payment.items():
        add_cell(payment, ref, xml)
    payment_xml = build_sheet_xml("付款计划", payment, merges=["A1:F1"], table_rel_id="rId1", dimension="A1:F4")

    summary: List[Tuple[str, str]] = []
    add_cell(summary, "A1", make_string_cell("A1", "汇总校验与条件示例", shared, 1))
    add_cell(summary, "A3", make_string_cell("A3", "明细总金额", shared, 2))
    add_cell(summary, "B3", make_formula_cell("B3", "SUM('订单明细'!F4:F20)", 0, 3))
    add_cell(summary, "A4", make_string_cell("A4", "付款总金额", shared, 2))
    add_cell(summary, "B4", make_formula_cell("B4", "SUM('付款计划'!D4:D20)", 0, 3))
    add_cell(summary, "A5", make_string_cell("A5", "折扣系数", shared, 2))
    add_cell(summary, "B5", make_formula_cell("B5", 'IF(\'订单主数据\'!B8="true",0.95,1)', 1))
    add_cell(summary, "A6", make_string_cell("A6", "折后金额", shared, 2))
    add_cell(summary, "B6", make_formula_cell("B6", "B3*B5", 0, 3))
    add_cell(summary, "A7", make_string_cell("A7", "条件校验", shared, 2))
    add_cell(summary, "B7", make_formula_cell("B7", 'IF(COUNTA(\'订单明细\'!B4:B20)>0,1,0)', 1))
    add_cell(summary, "A9", make_string_cell("A9", "条件说明", shared, 2))
    add_cell(summary, "B9", make_string_cell("B9", "当 B5 < 1 时，表示折扣条件已命中；当 B7 = 1 时，表示检测到循环明细", shared, 4))
    summary_xml = build_sheet_xml("汇总校验", summary, merges=["A1:E1"], dimension="A1:E9")

    table1 = build_table_xml(1, "tblOrderItems", "A3:G4", headers1)
    table2 = build_table_xml(2, "tblPaymentPlan", "A3:F4", headers2)

    return {
        "[Content_Types].xml": build_content_types_xml(),
        "_rels/.rels": build_root_rels_xml(),
        "xl/workbook.xml": build_workbook_xml(),
        "xl/_rels/workbook.xml.rels": build_workbook_rels_xml(),
        "xl/styles.xml": build_styles_xml(),
        "xl/sharedStrings.xml": shared.to_xml(),
        "xl/worksheets/sheet1.xml": cover_xml,
        "xl/worksheets/sheet2.xml": master_xml,
        "xl/worksheets/sheet3.xml": detail_xml,
        "xl/worksheets/sheet4.xml": payment_xml,
        "xl/worksheets/sheet5.xml": summary_xml,
        "xl/worksheets/_rels/sheet3.xml.rels": build_sheet_table_rel("table1.xml"),
        "xl/worksheets/_rels/sheet4.xml.rels": build_sheet_table_rel("table2.xml"),
        "xl/tables/table1.xml": table1,
        "xl/tables/table2.xml": table2,
    }


def main() -> None:
    parts = build_workbook_parts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in parts.items():
            zf.writestr(path, content)
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    main()
