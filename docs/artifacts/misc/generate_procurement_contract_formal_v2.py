from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Dict, List, Tuple
from xml.sax.saxutils import escape

from generate_excel_template_sample import (
    SharedStrings,
    add_cell,
    build_root_rels_xml,
    build_sheet_table_rel,
    build_sheet_xml,
    build_styles_xml,
    build_table_xml,
    make_formula_cell,
    make_number_cell,
    make_string_cell,
)


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "procurement-contract-formal-v2.xlsx"

SHEET_NAMES = [
    "合同首页_模板",
    "合同首页_数据",
    "合同正文_模板",
    "合同正文_数据",
    "采购明细_模板",
    "采购明细_数据",
    "交付验收_模板",
    "交付验收_数据",
    "付款违约_模板",
    "付款违约_数据",
]


def build_content_types_xml(sheet_count: int, table_count: int) -> str:
    sheet_overrides = "".join(
        f'  <Override PartName="/xl/worksheets/sheet{idx}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n'
        for idx in range(1, sheet_count + 1)
    )
    table_overrides = "".join(
        f'  <Override PartName="/xl/tables/table{idx}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>\n'
        for idx in range(1, table_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n'
        f"{sheet_overrides}"
        f"{table_overrides}"
        '  <Override PartName="/xl/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\n'
        '  <Override PartName="/xl/sharedStrings.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>\n'
        "</Types>"
    )


def build_workbook_rels_xml(sheet_count: int) -> str:
    relationships = []
    for idx in range(1, sheet_count + 1):
        relationships.append(
            f'  <Relationship Id="rId{idx}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{idx}.xml"/>'
        )
    relationships.append(
        f'  <Relationship Id="rId{sheet_count + 1}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
    )
    relationships.append(
        f'  <Relationship Id="rId{sheet_count + 2}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
        'Target="sharedStrings.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        + "\n".join(relationships)
        + "\n</Relationships>"
    )


def build_workbook_xml(sheet_names: List[str], defined_names: List[Tuple[str, str]]) -> str:
    sheets_xml = "\n".join(
        f'    <sheet name="{escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, name in enumerate(sheet_names, start=1)
    )
    defined_names_xml = "\n".join(
        f'    <definedName name="{escape(name)}">{escape(ref)}</definedName>'
        for name, ref in defined_names
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n'
        "  <workbookPr/>\n"
        '  <bookViews><workbookView xWindow="240" yWindow="15" windowWidth="16095" windowHeight="9660"/></bookViews>\n'
        "  <sheets>\n"
        f"{sheets_xml}\n"
        "  </sheets>\n"
        "  <definedNames>\n"
        f"{defined_names_xml}\n"
        "  </definedNames>\n"
        '  <calcPr calcId="191029"/>\n'
        "</workbook>"
    )


def add_labeled_value(
    cells: List[Tuple[str, str]],
    label_ref: str,
    label: str,
    value_ref: str,
    value_xml: str,
    shared: SharedStrings,
) -> None:
    add_cell(cells, label_ref, make_string_cell(label_ref, label, shared, 2))
    add_cell(cells, value_ref, value_xml)


def blank_cell(ref: str, shared: SharedStrings, style: int = 4) -> str:
    return make_string_cell(ref, "", shared, style)


def build_parts() -> Dict[str, str]:
    shared = SharedStrings()

    home_template: List[Tuple[str, str]] = []
    add_cell(home_template, "A1", make_string_cell("A1", "设备采购合同-首页（模板）", shared, 1))
    add_labeled_value(home_template, "A3", "合同编号", "B3", blank_cell("B3", shared), shared)
    add_labeled_value(home_template, "E3", "签订日期", "F3", blank_cell("F3", shared), shared)
    add_labeled_value(home_template, "A5", "甲方（采购方）", "B5", blank_cell("B5", shared), shared)
    add_labeled_value(home_template, "A6", "乙方（供应商）", "B6", blank_cell("B6", shared), shared)
    add_labeled_value(home_template, "A7", "项目名称", "B7", blank_cell("B7", shared), shared)
    add_labeled_value(home_template, "E5", "币种", "F5", blank_cell("F5", shared), shared)
    add_labeled_value(home_template, "E6", "含安装服务", "F6", blank_cell("F6", shared), shared)
    add_labeled_value(home_template, "E7", "质保期(月)", "F7", blank_cell("F7", shared), shared)
    add_labeled_value(home_template, "A9", "合同摘要", "B9", blank_cell("B9", shared), shared)
    xml1 = build_sheet_xml("合同首页_模板", home_template, merges=["A1:F1"], dimension="A1:F9")

    home_data: List[Tuple[str, str]] = []
    add_cell(home_data, "A1", make_string_cell("A1", "设备采购合同-首页（数据）", shared, 1))
    add_labeled_value(home_data, "A3", "合同编号", "B3", make_string_cell("B3", "PC-2026-0178", shared, 4), shared)
    add_labeled_value(home_data, "E3", "签订日期", "F3", make_string_cell("F3", "2026-05-09", shared, 4), shared)
    add_labeled_value(home_data, "A5", "甲方（采购方）", "B5", make_string_cell("B5", "星海智造科技有限公司", shared, 4), shared)
    add_labeled_value(home_data, "A6", "乙方（供应商）", "B6", make_string_cell("B6", "华东精工设备股份有限公司", shared, 4), shared)
    add_labeled_value(home_data, "A7", "项目名称", "B7", make_string_cell("B7", "苏州智能产线升级项目", shared, 4), shared)
    add_labeled_value(home_data, "E5", "币种", "F5", make_string_cell("F5", "CNY", shared, 4), shared)
    add_labeled_value(home_data, "E6", "含安装服务", "F6", make_string_cell("F6", "是", shared, 4), shared)
    add_labeled_value(home_data, "E7", "质保期(月)", "F7", make_number_cell("F7", 24, 3), shared)
    add_labeled_value(
        home_data,
        "A9",
        "合同摘要",
        "B9",
        make_string_cell("B9", "本工作簿用于测试成对 sheet、真实 Excel Table、循环明细与付款计划的模板识别。", shared, 4),
        shared,
    )
    xml2 = build_sheet_xml("合同首页_数据", home_data, merges=["A1:F1"], dimension="A1:F9")

    body_template: List[Tuple[str, str]] = []
    add_cell(body_template, "A1", make_string_cell("A1", "设备采购合同-正文（模板）", shared, 1))
    add_labeled_value(body_template, "A3", "1.1 合同标的说明", "B3", blank_cell("B3", shared), shared)
    add_labeled_value(body_template, "A5", "2.1 质量标准", "B5", blank_cell("B5", shared), shared)
    add_labeled_value(body_template, "A7", "3.1 交付地点", "B7", blank_cell("B7", shared), shared)
    add_labeled_value(body_template, "A9", "4.1 安装条款", "B9", blank_cell("B9", shared), shared)
    add_labeled_value(body_template, "A11", "5.1 其他约定", "B11", blank_cell("B11", shared), shared)
    xml3 = build_sheet_xml("合同正文_模板", body_template, merges=["A1:B1"], dimension="A1:B11")

    body_data: List[Tuple[str, str]] = []
    add_cell(body_data, "A1", make_string_cell("A1", "设备采购合同-正文（数据）", shared, 1))
    add_labeled_value(
        body_data,
        "A3",
        "1.1 合同标的说明",
        "B3",
        make_string_cell("B3", "乙方向甲方提供工业机器人、伺服模组、视觉检测工站及现场安装调试服务，具体配置以采购明细表为准。", shared, 4),
        shared,
    )
    add_labeled_value(
        body_data,
        "A5",
        "2.1 质量标准",
        "B5",
        make_string_cell("B5", "乙方提供的设备应符合国家标准、行业规范及甲方技术协议要求，关键部件需为原厂正品。", shared, 4),
        shared,
    )
    add_labeled_value(
        body_data,
        "A7",
        "3.1 交付地点",
        "B7",
        make_string_cell("B7", "交付地点为江苏省苏州市工业园区星海智造二期厂房，乙方负责运输、卸货及现场就位。", shared, 4),
        shared,
    )
    add_labeled_value(
        body_data,
        "A9",
        "4.1 安装条款",
        "B9",
        make_string_cell("B9", "乙方应在设备到场后 7 日内完成安装与联调，并配合甲方进行试生产验证。", shared, 4),
        shared,
    )
    add_labeled_value(
        body_data,
        "A11",
        "5.1 其他约定",
        "B11",
        make_string_cell("B11", "双方确认所有往来通知均以加盖公章的书面文件或双方确认的企业邮箱通知为准。", shared, 4),
        shared,
    )
    xml4 = build_sheet_xml("合同正文_数据", body_data, merges=["A1:B1"], dimension="A1:B11")

    detail_headers = ["序号", "物料编码", "设备名称", "规格型号", "单位", "数量", "含税单价", "含税小计"]

    detail_template: List[Tuple[str, str]] = []
    add_cell(detail_template, "A1", make_string_cell("A1", "采购明细（模板）", shared, 1))
    add_cell(detail_template, "A2", make_string_cell("A2", "与“采购明细_数据”成对，用于按 sheet 对比识别明细循环表。", shared, 4))
    for idx, header in enumerate(detail_headers, start=1):
        ref = f"{chr(64 + idx)}4"
        add_cell(detail_template, ref, make_string_cell(ref, header, shared, 2))
    for row_no in range(5, 8):
        for col in "ABCDEFGH":
            ref = f"{col}{row_no}"
            add_cell(detail_template, ref, blank_cell(ref, shared))
    add_cell(detail_template, "G9", make_string_cell("G9", "合计", shared, 2))
    add_cell(detail_template, "H9", make_formula_cell("H9", "SUM(H5:H7)", 0, 3))
    xml5 = build_sheet_xml("采购明细_模板", detail_template, merges=["A1:H1", "A2:H2"], table_rel_id="rId1", dimension="A1:H9")

    detail_data: List[Tuple[str, str]] = []
    add_cell(detail_data, "A1", make_string_cell("A1", "采购明细（数据）", shared, 1))
    add_cell(detail_data, "A2", make_string_cell("A2", "与“采购明细_模板”成对，保留真实采购表格数据。", shared, 4))
    for idx, header in enumerate(detail_headers, start=1):
        ref = f"{chr(64 + idx)}4"
        add_cell(detail_data, ref, make_string_cell(ref, header, shared, 2))
    detail_rows = [
        (5, 1, "RB-6A-001", "六轴工业机器人", "XR-600", "台", 4, 185000, 740000),
        (6, 2, "SV-4L-013", "伺服滑台模组", "SM-420", "套", 6, 28000, 168000),
        (7, 3, "VI-2C-021", "视觉检测工站", "VC-900", "套", 2, 126000, 252000),
    ]
    for row_no, index_no, material_code, product_name, spec_model, unit_name, qty, unit_price, line_total in detail_rows:
        add_cell(detail_data, f"A{row_no}", make_number_cell(f"A{row_no}", index_no, 3))
        add_cell(detail_data, f"B{row_no}", make_string_cell(f"B{row_no}", material_code, shared, 4))
        add_cell(detail_data, f"C{row_no}", make_string_cell(f"C{row_no}", product_name, shared, 4))
        add_cell(detail_data, f"D{row_no}", make_string_cell(f"D{row_no}", spec_model, shared, 4))
        add_cell(detail_data, f"E{row_no}", make_string_cell(f"E{row_no}", unit_name, shared, 4))
        add_cell(detail_data, f"F{row_no}", make_number_cell(f"F{row_no}", qty, 3))
        add_cell(detail_data, f"G{row_no}", make_number_cell(f"G{row_no}", unit_price, 3))
        add_cell(detail_data, f"H{row_no}", make_formula_cell(f"H{row_no}", f"F{row_no}*G{row_no}", line_total, 3))
    add_cell(detail_data, "G9", make_string_cell("G9", "合计", shared, 2))
    add_cell(detail_data, "H9", make_formula_cell("H9", "SUM(H5:H7)", 1160000, 3))
    xml6 = build_sheet_xml("采购明细_数据", detail_data, merges=["A1:H1", "A2:H2"], table_rel_id="rId1", dimension="A1:H9")

    delivery_headers = ["批次", "交付地点", "计划到货日", "安装完成日", "验收类型"]

    delivery_template: List[Tuple[str, str]] = []
    add_cell(delivery_template, "A1", make_string_cell("A1", "交付验收（模板）", shared, 1))
    add_cell(delivery_template, "A2", make_string_cell("A2", "与“交付验收_数据”成对，用于测试交付计划循环表。", shared, 4))
    for idx, header in enumerate(delivery_headers, start=1):
        ref = f"{chr(64 + idx)}4"
        add_cell(delivery_template, ref, make_string_cell(ref, header, shared, 2))
    for row_no in range(5, 7):
        for col in "ABCDE":
            ref = f"{col}{row_no}"
            add_cell(delivery_template, ref, blank_cell(ref, shared))
    add_labeled_value(delivery_template, "A9", "验收标准", "B9", blank_cell("B9", shared), shared)
    add_labeled_value(delivery_template, "A10", "安装条件说明", "B10", blank_cell("B10", shared), shared)
    xml7 = build_sheet_xml("交付验收_模板", delivery_template, merges=["A1:E1", "A2:E2"], table_rel_id="rId1", dimension="A1:E10")

    delivery_data: List[Tuple[str, str]] = []
    add_cell(delivery_data, "A1", make_string_cell("A1", "交付验收（数据）", shared, 1))
    add_cell(delivery_data, "A2", make_string_cell("A2", "与“交付验收_模板”成对，展示真实交付与验收计划。", shared, 4))
    for idx, header in enumerate(delivery_headers, start=1):
        ref = f"{chr(64 + idx)}4"
        add_cell(delivery_data, ref, make_string_cell(ref, header, shared, 2))
    delivery_rows = [
        (5, "第一批", "苏州园区二期厂房", "2026-06-15", "2026-06-22", "到货+安装验收"),
        (6, "第二批", "苏州园区二期厂房", "2026-06-28", "2026-07-05", "到货+安装验收"),
    ]
    for row_no, batch_no, location, arrival_date, install_done_date, acceptance_type in delivery_rows:
        add_cell(delivery_data, f"A{row_no}", make_string_cell(f"A{row_no}", batch_no, shared, 4))
        add_cell(delivery_data, f"B{row_no}", make_string_cell(f"B{row_no}", location, shared, 4))
        add_cell(delivery_data, f"C{row_no}", make_string_cell(f"C{row_no}", arrival_date, shared, 4))
        add_cell(delivery_data, f"D{row_no}", make_string_cell(f"D{row_no}", install_done_date, shared, 4))
        add_cell(delivery_data, f"E{row_no}", make_string_cell(f"E{row_no}", acceptance_type, shared, 4))
    add_labeled_value(
        delivery_data,
        "A9",
        "验收标准",
        "B9",
        make_string_cell("B9", "设备运行稳定 72 小时无重大异常，核心性能指标达到技术协议要求，甲方签署验收单。", shared, 4),
        shared,
    )
    add_labeled_value(
        delivery_data,
        "A10",
        "安装条件说明",
        "B10",
        make_string_cell("B10", "安装服务已启用，乙方需完成现场联调后再组织最终验收。", shared, 4),
        shared,
    )
    xml8 = build_sheet_xml("交付验收_数据", delivery_data, merges=["A1:E1", "A2:E2"], table_rel_id="rId1", dimension="A1:E10")

    payment_headers = ["付款节点", "付款条件", "比例", "应付金额"]

    payment_template: List[Tuple[str, str]] = []
    add_cell(payment_template, "A1", make_string_cell("A1", "付款违约（模板）", shared, 1))
    add_labeled_value(
        payment_template,
        "A3",
        "合同总金额(含税)",
        "B3",
        make_formula_cell("B3", "SUM('采购明细_模板'!H5:H7)", 0, 3),
        shared,
    )
    add_labeled_value(payment_template, "A4", "逾期交付违约金比例", "B4", blank_cell("B4", shared), shared)
    for idx, header in enumerate(payment_headers, start=1):
        ref = f"{chr(64 + idx)}6"
        add_cell(payment_template, ref, make_string_cell(ref, header, shared, 2))
    for row_no in range(7, 11):
        for col in "ABCD":
            ref = f"{col}{row_no}"
            add_cell(payment_template, ref, blank_cell(ref, shared))
    add_labeled_value(payment_template, "A12", "质量违约责任", "B12", blank_cell("B12", shared), shared)
    xml9 = build_sheet_xml("付款违约_模板", payment_template, merges=["A1:D1"], table_rel_id="rId1", dimension="A1:D12")

    payment_data: List[Tuple[str, str]] = []
    add_cell(payment_data, "A1", make_string_cell("A1", "付款违约（数据）", shared, 1))
    add_labeled_value(
        payment_data,
        "A3",
        "合同总金额(含税)",
        "B3",
        make_formula_cell("B3", "SUM('采购明细_数据'!H5:H7)", 1160000, 3),
        shared,
    )
    add_labeled_value(
        payment_data,
        "A4",
        "逾期交付违约金比例",
        "B4",
        make_string_cell("B4", "每日按迟延部分货款的 0.3% 计收违约金", shared, 4),
        shared,
    )
    for idx, header in enumerate(payment_headers, start=1):
        ref = f"{chr(64 + idx)}6"
        add_cell(payment_data, ref, make_string_cell(ref, header, shared, 2))
    payment_rows = [
        (7, "预付款", "合同生效且收到预付款发票后 5 个工作日内", 0.30, 348000),
        (8, "到货款", "首批设备到场并完成到货验收后", 0.40, 464000),
        (9, "验收款", "全部设备完成安装调试并通过最终验收后", 0.25, 290000),
        (10, "质保金", "质保期满且无质量争议后", 0.05, 58000),
    ]
    for row_no, stage, condition, percent, amount in payment_rows:
        add_cell(payment_data, f"A{row_no}", make_string_cell(f"A{row_no}", stage, shared, 4))
        add_cell(payment_data, f"B{row_no}", make_string_cell(f"B{row_no}", condition, shared, 4))
        add_cell(payment_data, f"C{row_no}", make_number_cell(f"C{row_no}", percent, 3))
        add_cell(payment_data, f"D{row_no}", make_formula_cell(f"D{row_no}", f"C{row_no}*$B$3", amount, 3))
    add_labeled_value(
        payment_data,
        "A12",
        "质量违约责任",
        "B12",
        make_string_cell("B12", "若设备存在重大质量缺陷，乙方应在 48 小时内响应并承担更换、返修及由此造成的直接损失。", shared, 4),
        shared,
    )
    xml10 = build_sheet_xml("付款违约_数据", payment_data, merges=["A1:D1"], table_rel_id="rId1", dimension="A1:D12")

    tables = {
        "xl/tables/table1.xml": build_table_xml(1, "tblProcurementDetailMock", "A4:H7", detail_headers),
        "xl/tables/table2.xml": build_table_xml(2, "tblProcurementDetailData", "A4:H7", detail_headers),
        "xl/tables/table3.xml": build_table_xml(3, "tblDeliveryPlanMock", "A4:E6", delivery_headers),
        "xl/tables/table4.xml": build_table_xml(4, "tblDeliveryPlanData", "A4:E6", delivery_headers),
        "xl/tables/table5.xml": build_table_xml(5, "tblPaymentPlanMock", "A6:D10", payment_headers),
        "xl/tables/table6.xml": build_table_xml(6, "tblPaymentPlanData", "A6:D10", payment_headers),
    }

    defined_names = [
        ("contract_no_mock", "'合同首页_模板'!$B$3"),
        ("contract_no_data", "'合同首页_数据'!$B$3"),
        ("buyer_name_data", "'合同首页_数据'!$B$5"),
        ("supplier_name_data", "'合同首页_数据'!$B$6"),
        ("installation_flag_data", "'合同首页_数据'!$F$6"),
        ("contract_amount_data", "'付款违约_数据'!$B$3"),
    ]

    parts = {
        "[Content_Types].xml": build_content_types_xml(sheet_count=len(SHEET_NAMES), table_count=len(tables)),
        "_rels/.rels": build_root_rels_xml(),
        "xl/workbook.xml": build_workbook_xml(SHEET_NAMES, defined_names),
        "xl/_rels/workbook.xml.rels": build_workbook_rels_xml(sheet_count=len(SHEET_NAMES)),
        "xl/styles.xml": build_styles_xml(),
        "xl/sharedStrings.xml": shared.to_xml(),
        "xl/worksheets/sheet1.xml": xml1,
        "xl/worksheets/sheet2.xml": xml2,
        "xl/worksheets/sheet3.xml": xml3,
        "xl/worksheets/sheet4.xml": xml4,
        "xl/worksheets/sheet5.xml": xml5,
        "xl/worksheets/sheet6.xml": xml6,
        "xl/worksheets/sheet7.xml": xml7,
        "xl/worksheets/sheet8.xml": xml8,
        "xl/worksheets/sheet9.xml": xml9,
        "xl/worksheets/sheet10.xml": xml10,
        "xl/worksheets/_rels/sheet5.xml.rels": build_sheet_table_rel("table1.xml"),
        "xl/worksheets/_rels/sheet6.xml.rels": build_sheet_table_rel("table2.xml"),
        "xl/worksheets/_rels/sheet7.xml.rels": build_sheet_table_rel("table3.xml"),
        "xl/worksheets/_rels/sheet8.xml.rels": build_sheet_table_rel("table4.xml"),
        "xl/worksheets/_rels/sheet9.xml.rels": build_sheet_table_rel("table5.xml"),
        "xl/worksheets/_rels/sheet10.xml.rels": build_sheet_table_rel("table6.xml"),
    }
    parts.update(tables)
    return parts


def main() -> None:
    parts = build_parts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in parts.items():
            zf.writestr(path, content)
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    main()
