from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Dict, List, Tuple

from generate_excel_template_sample import (
    SharedStrings,
    add_cell,
    build_content_types_xml,
    build_root_rels_xml,
    build_sheet_table_rel,
    build_sheet_xml,
    build_styles_xml,
    build_table_xml,
    build_workbook_rels_xml,
    make_formula_cell,
    make_string_cell,
)


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "procurement-contract-template-sample.xlsx"


def build_workbook_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr/>
  <bookViews><workbookView xWindow="240" yWindow="15" windowWidth="16095" windowHeight="9660"/></bookViews>
  <sheets>
    <sheet name="合同首页" sheetId="1" r:id="rId1"/>
    <sheet name="采购清单" sheetId="2" r:id="rId2"/>
    <sheet name="交付计划" sheetId="3" r:id="rId3"/>
    <sheet name="付款条款" sheetId="4" r:id="rId4"/>
    <sheet name="验收与违约" sheetId="5" r:id="rId5"/>
  </sheets>
  <definedNames>
    <definedName name="buyer_name">'合同首页'!$B$3</definedName>
    <definedName name="supplier_name">'合同首页'!$B$4</definedName>
    <definedName name="contract_no">'合同首页'!$E$3</definedName>
    <definedName name="tax_rate">'合同首页'!$E$7</definedName>
    <definedName name="contract_total">'付款条款'!$B$8</definedName>
  </definedNames>
  <calcPr calcId="191029"/>
</workbook>"""


def build_parts() -> Dict[str, str]:
    shared = SharedStrings()

    cover: List[Tuple[str, str]] = []
    add_cell(cover, "A1", make_string_cell("A1", "采购合同模板提取测试样例", shared, 1))
    add_cell(cover, "A3", make_string_cell("A3", "采购方", shared, 2))
    add_cell(cover, "B3", make_string_cell("B3", "{d.buyer.name}", shared, 4))
    add_cell(cover, "A4", make_string_cell("A4", "供应商", shared, 2))
    add_cell(cover, "B4", make_string_cell("B4", "{d.supplier.name}", shared, 4))
    add_cell(cover, "A5", make_string_cell("A5", "项目名称", shared, 2))
    add_cell(cover, "B5", make_string_cell("B5", "{d.project.name}", shared, 4))
    add_cell(cover, "D3", make_string_cell("D3", "合同编号", shared, 2))
    add_cell(cover, "E3", make_string_cell("E3", "{d.contract.no}", shared, 4))
    add_cell(cover, "D4", make_string_cell("D4", "签订日期", shared, 2))
    add_cell(cover, "E4", make_string_cell("E4", "{d.contract.signDate}", shared, 4))
    add_cell(cover, "D5", make_string_cell("D5", "币种", shared, 2))
    add_cell(cover, "E5", make_string_cell("E5", "{d.contract.currency}", shared, 4))
    add_cell(cover, "A7", make_string_cell("A7", "税率", shared, 2))
    add_cell(cover, "B7", make_string_cell("B7", "{d.contract.taxRate}", shared, 4))
    add_cell(cover, "D7", make_string_cell("D7", "是否含安装服务", shared, 2))
    add_cell(cover, "E7", make_string_cell("E7", "{d.flags.hasInstallation}", shared, 4))
    add_cell(cover, "A9", make_string_cell("A9", "条件说明", shared, 2))
    add_cell(
        cover,
        "B9",
        make_string_cell(
            "B9",
            "若 hasInstallation = true，则在验收与违约页启用安装验收条款；否则仅保留到货验收条款。",
            shared,
            4,
        ),
    )
    cover_xml = build_sheet_xml("合同首页", cover, merges=["A1:F1"], dimension="A1:F9")

    items: List[Tuple[str, str]] = []
    item_headers = ["循环开始", "物料编码", "设备名称", "规格型号", "数量", "含税单价", "小计", "循环结束"]
    add_cell(items, "A1", make_string_cell("A1", "采购清单", shared, 1))
    add_cell(items, "A2", make_string_cell("A2", "本页为采购明细循环区，包含真实 Excel Table", shared, 4))
    for i, header in enumerate(item_headers, start=1):
        cell = f"{chr(64 + i)}3"
        add_cell(items, cell, make_string_cell(cell, header, shared, 2))
    row4 = {
        "A4": make_string_cell("A4", "{#d.items}", shared),
        "B4": make_string_cell("B4", "{d.items.materialCode}", shared),
        "C4": make_string_cell("C4", "{d.items.productName}", shared),
        "D4": make_string_cell("D4", "{d.items.specModel}", shared),
        "E4": make_string_cell("E4", "{d.items.qty}", shared),
        "F4": make_string_cell("F4", "{d.items.unitPriceTax}", shared),
        "G4": make_formula_cell("G4", "E4*F4", 0, 3),
        "H4": make_string_cell("H4", "{/d.items}", shared),
    }
    for ref, xml in row4.items():
        add_cell(items, ref, xml)
    items_xml = build_sheet_xml("采购清单", items, merges=["A1:H1"], table_rel_id="rId1", dimension="A1:H4")

    delivery: List[Tuple[str, str]] = []
    delivery_headers = ["循环开始", "批次", "交付地点", "计划到货日", "安装完成日", "条件标签", "循环结束"]
    add_cell(delivery, "A1", make_string_cell("A1", "交付计划", shared, 1))
    add_cell(delivery, "A2", make_string_cell("A2", "用于测试第二个循环、日期字段和条件公式", shared, 4))
    for i, header in enumerate(delivery_headers, start=1):
        cell = f"{chr(64 + i)}3"
        add_cell(delivery, cell, make_string_cell(cell, header, shared, 2))
    row4_delivery = {
        "A4": make_string_cell("A4", "{#d.deliveries}", shared),
        "B4": make_string_cell("B4", "{d.deliveries.batchNo}", shared),
        "C4": make_string_cell("C4", "{d.deliveries.location}", shared),
        "D4": make_string_cell("D4", "{d.deliveries.arrivalDate}", shared),
        "E4": make_string_cell("E4", "{d.deliveries.installDoneDate}", shared),
        "F4": make_formula_cell("F4", 'IF(E4<>"","含安装","仅到货")', 0),
        "G4": make_string_cell("G4", "{/d.deliveries}", shared),
    }
    for ref, xml in row4_delivery.items():
        add_cell(delivery, ref, xml)
    delivery_xml = build_sheet_xml("交付计划", delivery, merges=["A1:G1"], table_rel_id="rId1", dimension="A1:G4")

    payment: List[Tuple[str, str]] = []
    payment_headers = ["循环开始", "付款节点", "付款条件", "付款比例", "应付金额", "循环结束"]
    add_cell(payment, "A1", make_string_cell("A1", "付款条款", shared, 1))
    add_cell(payment, "A2", make_string_cell("A2", "付款计划循环区，金额引用采购清单汇总", shared, 4))
    for i, header in enumerate(payment_headers, start=1):
        cell = f"{chr(64 + i)}3"
        add_cell(payment, cell, make_string_cell(cell, header, shared, 2))
    row4_payment = {
        "A4": make_string_cell("A4", "{#d.paymentTerms}", shared),
        "B4": make_string_cell("B4", "{d.paymentTerms.stage}", shared),
        "C4": make_string_cell("C4", "{d.paymentTerms.condition}", shared),
        "D4": make_string_cell("D4", "{d.paymentTerms.percent}", shared),
        "E4": make_formula_cell("E4", "D4*$B$8", 0, 3),
        "F4": make_string_cell("F4", "{/d.paymentTerms}", shared),
    }
    for ref, xml in row4_payment.items():
        add_cell(payment, ref, xml)
    add_cell(payment, "A8", make_string_cell("A8", "合同总金额(含税)", shared, 2))
    add_cell(payment, "B8", make_formula_cell("B8", "SUM('采购清单'!G4:G30)", 0, 3))
    add_cell(payment, "D8", make_string_cell("D8", "预付款条件", shared, 2))
    add_cell(payment, "E8", make_formula_cell("E8", 'IF(B8>500000,"需要预付款保函","常规付款")', 0))
    payment_xml = build_sheet_xml("付款条款", payment, merges=["A1:F1"], table_rel_id="rId1", dimension="A1:F8")

    acceptance: List[Tuple[str, str]] = []
    add_cell(acceptance, "A1", make_string_cell("A1", "验收与违约条款", shared, 1))
    add_cell(acceptance, "A3", make_string_cell("A3", "到货验收标准", shared, 2))
    add_cell(acceptance, "B3", make_string_cell("B3", "{d.acceptance.arrivalStandard}", shared, 4))
    add_cell(acceptance, "A4", make_string_cell("A4", "安装验收标准", shared, 2))
    add_cell(acceptance, "B4", make_formula_cell("B4", 'IF(\'合同首页\'!E7="true","{d.acceptance.installationStandard}","不适用")', 0))
    add_cell(acceptance, "A5", make_string_cell("A5", "质保期(月)", shared, 2))
    add_cell(acceptance, "B5", make_string_cell("B5", "{d.warranty.months}", shared, 4))
    add_cell(acceptance, "A6", make_string_cell("A6", "逾期交付违约金比例", shared, 2))
    add_cell(acceptance, "B6", make_string_cell("B6", "{d.penalty.delayRate}", shared, 4))
    add_cell(acceptance, "A7", make_string_cell("A7", "质量违约处理", shared, 2))
    add_cell(acceptance, "B7", make_string_cell("B7", "{d.penalty.qualityClause}", shared, 4))
    add_cell(acceptance, "A9", make_string_cell("A9", "风险提示", shared, 2))
    add_cell(
        acceptance,
        "B9",
        make_formula_cell("B9", 'IF(\'付款条款\'!B8>1000000,"高金额合同，需增加履约保障条款","标准合同条款")', 0),
    )
    acceptance_xml = build_sheet_xml("验收与违约", acceptance, merges=["A1:F1"], dimension="A1:F9")

    table1 = build_table_xml(1, "tblProcurementItems", "A3:H4", item_headers)
    table2 = build_table_xml(2, "tblDeliveryPlan", "A3:G4", delivery_headers)
    table3 = build_table_xml(3, "tblPaymentTerms", "A3:F4", payment_headers)

    return {
        "[Content_Types].xml": build_content_types_xml().replace(
            "</Types>",
            '  <Override PartName="/xl/tables/table3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>\n</Types>',
        ),
        "_rels/.rels": build_root_rels_xml(),
        "xl/workbook.xml": build_workbook_xml(),
        "xl/_rels/workbook.xml.rels": build_workbook_rels_xml(),
        "xl/styles.xml": build_styles_xml(),
        "xl/sharedStrings.xml": shared.to_xml(),
        "xl/worksheets/sheet1.xml": cover_xml,
        "xl/worksheets/sheet2.xml": items_xml,
        "xl/worksheets/sheet3.xml": delivery_xml,
        "xl/worksheets/sheet4.xml": payment_xml,
        "xl/worksheets/sheet5.xml": acceptance_xml,
        "xl/worksheets/_rels/sheet2.xml.rels": build_sheet_table_rel("table1.xml"),
        "xl/worksheets/_rels/sheet3.xml.rels": build_sheet_table_rel("table2.xml"),
        "xl/worksheets/_rels/sheet4.xml.rels": build_sheet_table_rel("table3.xml"),
        "xl/tables/table1.xml": table1,
        "xl/tables/table2.xml": table2,
        "xl/tables/table3.xml": table3,
    }


def main() -> None:
    parts = build_parts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in parts.items():
            zf.writestr(path, content)
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    main()
