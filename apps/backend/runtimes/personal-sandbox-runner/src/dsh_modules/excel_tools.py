"""
Excel Tools Module (excel_tools.py)

Dedicated engine for:
1. Lossless cell formatting preserving dates, percentages, booleans, and floating point precision.
2. Excel workbook structure analysis, catalog streaming, and cell range slicing.
3. Headless recalculation integration with verified cache validation, cache versioning, and corrupt cache protection.
4. Structured DATA_COVERAGE metadata generation.
"""

import os
import re
import json
import time
import shutil
import hashlib
import zipfile
import datetime
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any, Union

import openpyxl
from openpyxl.utils import range_boundaries, get_column_letter

from dsh_modules.workbook_calculation import RECALC_CACHE_VERSION
EXCEL_ERRORS = {"#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"}


def _format_float_lossless(val: float) -> str:
    """Formats a float losslessly without scientific notation for small floats or truncation."""
    if val.is_integer():
        return str(int(val))
    # 避免科学计数法对于普通小小数（如 0.000049），同时保留完整无损精度
    s = f"{val:.10f}".rstrip("0").rstrip(".")
    if not s or s == "-0":
        s = "0"
    if val != 0 and (s == "0" or abs(float(s) - val) / abs(val) > 1e-6):
        return str(val)
    return s


def _format_excel_cell(cell_d, cell_f=None) -> str:
    """Formats cell values preserving data types: dates (YYYY-MM-DD), booleans, percentages, empty placeholders."""
    f_expr = None
    if cell_f is not None and isinstance(cell_f.value, str) and cell_f.value.startswith("="):
        f_expr = cell_f.value

    val = cell_d.value if cell_d is not None else None
    cell_dt = getattr(cell_d, "data_type", None)

    # 1. 日期处理
    if isinstance(val, (datetime.datetime, datetime.date)):
        if isinstance(val, datetime.datetime) and (val.hour != 0 or val.minute != 0 or val.second != 0):
            val_str = val.strftime("%Y-%m-%d %H:%M:%S")
        else:
            val_str = val.strftime("%Y-%m-%d")
    # 2. 布尔值处理
    elif isinstance(val, bool) or cell_dt == "b":
        val_str = "TRUE" if val else "FALSE"
    # 3. 数值与百分比处理 (精确根据 number_format 或无损展示，严禁粗暴 round(4))
    elif isinstance(val, (int, float)):
        fmt = getattr(cell_d, "number_format", "") or ""
        if "%" in fmt:
            pct_val = val * 100
            m_pct = re.search(r'\.(0+)', fmt.split("%")[0])
            if m_pct:
                decimals = len(m_pct.group(1))
                val_str = f"{pct_val:.{decimals}f}%"
            elif "0%" in fmt:
                val_str = f"{pct_val:.0f}%"
            else:
                # 通用百分比：保留必要有效位，不丢失精度
                val_str = f"{pct_val:.6f}".rstrip("0").rstrip(".") + "%"
                if val_str == "%":
                    val_str = "0%"
        else:
            if isinstance(val, float):
                # 检查格式中是否有显式固定小数位（如 0.0000）
                m_dec = re.search(r'\.(0+)', fmt) if fmt and fmt.lower() != "general" else None
                if m_dec and "%" not in fmt:
                    decimals = len(m_dec.group(1))
                    val_str = f"{val:.{decimals}f}"
                else:
                    val_str = _format_float_lossless(val)
            else:
                val_str = str(val)
    # 4. 空值与空字符串公式处理
    elif val is None:
        if cell_dt in ("str", "s"):
            # 合法空字符串计算结果 (如 ="")
            val_str = ""
        elif f_expr:
            return f"[公式: {f_expr}]"
        else:
            return "[EMPTY]"
    # 5. 错误值处理
    elif cell_dt == "e" or (isinstance(val, str) and val.strip() in EXCEL_ERRORS):
        val_str = str(val).strip()
    # 6. 普通文本
    else:
        val_str = str(val).strip()
        if not val_str:
            return "[EMPTY]"

    if f_expr:
        return f"{val_str} [公式: {f_expr}]"
    return val_str


def _has_uncalculated_formulas(p: Path) -> bool:
    """
    Checks if an Excel workbook contains uncalculated formulas using unified namespace-aware validator.
    """
    from dsh_modules.workbook_calculation import has_uncalculated_formulas
    return has_uncalculated_formulas(p)


def _is_catalog_query(query: Optional[str]) -> bool:
    """Detects whether a user prompt is asking purely for sheet listing/structure overview."""
    if not query:
        return False
    q = query.lower()
    catalog_keywords = [
        "有哪些sheet", "有哪些表", "有哪些工作表", "什么sheet", "列出sheet",
        "列出工作表", "每个sheet用途", "sheet用途", "工作表用途", "sheet清单",
        "工作表清单", "目录", "有哪些内容", "包含哪些表"
    ]
    is_deep_calc = any(k in q for k in [
        "收入", "利润", "毛利", "费用", "凭证", "明细", "计算", "核算", "偏差",
        "最大", "最小", "为什么", "原因", "查重", "重复", "变化", "勾稽", "对账"
    ])
    if is_deep_calc:
        return False
    return any(k in q for k in catalog_keywords)


def _get_or_create_recalculated_xlsx(
    p: Path,
    return_status: bool = False
) -> Union[Path, Tuple[Path, str]]:
    """
    Checks if an Excel workbook contains uncalculated formulas.
    If so, leverages the headless recalculation engine into an isolated read-only cache in /tmp/.dsh_xlsx_recalc/
    to obtain true mathematical values WITHOUT modifying the original file.
    Validates cache integrity, verification credentials, and validator version.
    Returns path_to_xlsx if return_status=False, or (path_to_xlsx, recalc_status_str) if return_status=True.
    """
    from dsh_modules.workbook_calculation import get_or_create_recalculated_workbook

    p = Path(p)
    if not p.exists() or p.suffix.lower() not in [".xlsx", ".xlsm"]:
        return (p, "not_applicable") if return_status else p

    out_p, meta = get_or_create_recalculated_workbook(p)
    status_str = meta.get("status", "unknown")
    if return_status:
        return out_p, status_str
    return out_p


def extract_xlsx_text(
    p: Path,
    max_chars: int = 24000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
    prompt: Optional[str] = None,
    sheet_name: Optional[str] = None,
    cell_range: Optional[str] = None
) -> str:
    """
    Extracts text from Excel workbooks with:
    - Pre-check fast path for catalog queries (lightweight streaming).
    - Precise sheet_name and cell_range slicing with strict validation.
    - Full column schema preservation without dropping empty edge fields.
    - Structured [DATA_COVERAGE: ...] metadata.
    """
    from dsh_modules.tool_result import ToolResult, TextToolOutput

    p = Path(p)
    if not p.exists():
        err_msg = f"文件未找到: {p}"
        return TextToolOutput(err_msg, ToolResult.error(code="file_not_found", message=err_msg, text=err_msg))

    is_catalog = _is_catalog_query(prompt)

    # 1. 结构发现与参数预校验 (在重算前验证 Sheet 和区域，无效输入极速返回引导，避免触发昂贵重算)
    from dsh_modules.workbook_reader import inspect_workbook, validate_sheet_and_range

    manifest = inspect_workbook(p)
    if isinstance(manifest, ToolResult):
        return TextToolOutput(manifest.render_text(), manifest)

    effective_sheet_name, parsed_range, err_tr = validate_sheet_and_range(
        manifest, sheet_name=sheet_name, cell_range=cell_range
    )
    if err_tr:
        return TextToolOutput(err_tr.render_text(), err_tr)

    all_sheet_names = manifest.sheet_names
    total_sheets = len(all_sheet_names)
    selected_sheets = [effective_sheet_name] if effective_sheet_name else all_sheet_names

    # 2. 计算与缓存重算 (仅当参数有效且非目录查询时按需进行)
    read_p = p
    recalc_status_val = "catalog_skipped" if is_catalog else "cached_unverified"
    if not is_catalog:
        read_p, recalc_status_val = _get_or_create_recalculated_xlsx(p, return_status=True)

    total_scanned_rows = 0
    total_displayed_rows = 0

    # 3. 主解析路径：openpyxl
    try:
        if is_catalog:
            wb_data = openpyxl.load_workbook(read_p, read_only=True, data_only=True)
            wb_formula = None
        else:
            wb_data = openpyxl.load_workbook(read_p, data_only=True)
            wb_formula = openpyxl.load_workbook(read_p, data_only=False)

        range_bounds = None
        if parsed_range:
            range_bounds = range_boundaries(parsed_range)

        target_sheets = []
        if prompt and not effective_sheet_name:
            p_lower = prompt.lower()
            for s_nm in all_sheet_names:
                if s_nm.lower() in p_lower:
                    target_sheets.append(s_nm)

        sheet_summaries = []
        all_sheet_rows = []

        for s_name in selected_sheets:
            ws_data = wb_data[s_name]
            ws_formula = wb_formula[s_name] if wb_formula and s_name in wb_formula.sheetnames else None

            from .worksheet_metadata import worksheet_dimensions
            dim_ref = worksheet_dimensions(ws_data)
            max_r = ws_data.max_row or 0
            max_c = ws_data.max_column or 0

            # 公式数量统计
            if is_catalog or not ws_formula:
                formula_stat_str = "未统计"
            else:
                f_count = 0
                for row in ws_formula.iter_rows():
                    for cell in row:
                        if cell.value and isinstance(cell.value, str) and cell.value.startswith("="):
                            f_count += 1
                formula_stat_str = str(f_count)

            # ----------------- 切片模式处理 -----------------
            if range_bounds:
                min_col, min_row, max_col, max_row = range_bounds
                sheet_rows = []
                for r_idx in range(min_row, max_row + 1):
                    row_cells = []
                    for c_idx in range(min_col, max_col + 1):
                        cd = ws_data.cell(row=r_idx, column=c_idx)
                        cf = ws_formula.cell(row=r_idx, column=c_idx) if ws_formula else None
                        row_cells.append(f"{cd.coordinate}:{_format_excel_cell(cd, cf)}")
                    sheet_rows.append(f"Row {r_idx}: " + " | ".join(row_cells))
                total_scanned_rows += (max_row - min_row + 1)
                total_displayed_rows += len(sheet_rows)

                sheet_summaries.append(
                    f"  - {s_name} (切片区域: {parsed_range}, 行数: {len(sheet_rows)}, 状态: SLICED)"
                )
                all_sheet_rows.append(f"--- [工作表: {s_name} (切片区域: {parsed_range})] ---")
                all_sheet_rows.extend(sheet_rows)
            # ----------------- 目录模式轻量处理 -----------------
            elif is_catalog:
                sheet_rows = []
                sample_count = 3
                for r_idx, row in enumerate(ws_data.iter_rows(max_row=sample_count, values_only=False), start=1):
                    row_cells = []
                    for c_idx, cd in enumerate(row, start=1):
                        if max_c and c_idx > max_c:
                            break
                        if not max_c and c_idx > 20:
                            break
                        coord = getattr(cd, "coordinate", None) or f"{get_column_letter(c_idx)}{r_idx}"
                        row_cells.append(f"{coord}:{_format_excel_cell(cd, None)}")
                    if row_cells:
                        sheet_rows.append(" | ".join(row_cells))
                total_scanned_rows += len(sheet_rows)
                total_displayed_rows += len(sheet_rows)

                sheet_summaries.append(
                    f"  - {s_name} (范围: {dim_ref}, 物理行数: {max_r}, 公式数: {formula_stat_str}, 状态: CATALOG_OVERVIEW)"
                )
                all_sheet_rows.append(f"--- [工作表: {s_name} (范围: {dim_ref})] ---")
                all_sheet_rows.extend(sheet_rows)
                if max_r > sample_count:
                    all_sheet_rows.append(
                        f"  ... [目录概览模式: 已呈现表头及前 {len(sheet_rows)} 行样本，余下 {max(0, max_r - len(sheet_rows))} 行略去] ..."
                    )
            # ----------------- 完整/目标表读取处理 -----------------
            else:
                # 确定该工作表全局有效列跨度（按表结构确定，严禁每行私自缩窄导致首尾空字段丢失）
                sheet_min_col = None
                sheet_max_col = None
                sample_check_rows = min(max_r, 50)
                for r_idx in range(1, sample_check_rows + 1):
                    for c_idx in range(1, max_c + 1):
                        cd = ws_data.cell(row=r_idx, column=c_idx)
                        cf = ws_formula.cell(row=r_idx, column=c_idx) if ws_formula else None
                        v = cd.value
                        f = cf.value if cf else None
                        if (v is not None and str(v).strip()) or (isinstance(f, str) and f.startswith("=")):
                            if sheet_min_col is None or c_idx < sheet_min_col:
                                sheet_min_col = c_idx
                            if sheet_max_col is None or c_idx > sheet_max_col:
                                sheet_max_col = c_idx

                if sheet_min_col is None:
                    sheet_min_col = 1
                    sheet_max_col = max_c or 1

                sheet_rows = []
                for r_idx in range(1, max_r + 1):
                    row_cells_raw = [ws_data.cell(row=r_idx, column=c_idx) for c_idx in range(1, max_c + 1)]
                    has_content = False
                    for cd in row_cells_raw:
                        if cd.value is not None and str(cd.value).strip():
                            has_content = True
                            break
                        if ws_formula:
                            cf = ws_formula.cell(row=r_idx, column=cd.column)
                            if cf.value and isinstance(cf.value, str) and cf.value.startswith("="):
                                has_content = True
                                break
                    if not has_content:
                        continue

                    # 始终输出从 sheet_min_col 到 sheet_max_col 的完整列结构，保留空字段 [EMPTY]
                    row_cells = []
                    for c_idx in range(sheet_min_col, sheet_max_col + 1):
                        cd = ws_data.cell(row=r_idx, column=c_idx)
                        cf = ws_formula.cell(row=r_idx, column=c_idx) if ws_formula else None
                        row_cells.append(f"{cd.coordinate}:{_format_excel_cell(cd, cf)}")
                    sheet_rows.append(" | ".join(row_cells))

                total_scanned_rows += len(sheet_rows)

                if target_sheets and s_name in target_sheets:
                    total_displayed_rows += len(sheet_rows)
                    sheet_summaries.append(
                        f"  - {s_name} (范围: {dim_ref}, 非空行数(含标题/表头): {len(sheet_rows)}, 公式数: {formula_stat_str}, 状态: FULL)"
                    )
                    all_sheet_rows.append(f"--- [工作表: {s_name} (范围: {dim_ref})] ---")
                    all_sheet_rows.extend(sheet_rows)
                elif target_sheets and s_name not in target_sheets:
                    sample_count = min(5, len(sheet_rows))
                    total_displayed_rows += sample_count
                    sheet_summaries.append(
                        f"  - {s_name} (范围: {dim_ref}, 非空行数(含标题/表头): {len(sheet_rows)}, 公式数: {formula_stat_str}, 状态: SAMPLED)"
                    )
                    all_sheet_rows.append(f"--- [工作表: {s_name} (范围: {dim_ref})] ---")
                    all_sheet_rows.extend(sheet_rows[:sample_count])
                    if len(sheet_rows) > sample_count:
                        all_sheet_rows.append(
                            f"  ... [非当前关注工作表: 已保留前 {sample_count} 行样本；如需全量数据请直接在提问中指定该表名] ..."
                        )
                elif start_line is None and end_line is None and total_sheets > 3 and len(sheet_rows) > 30:
                    sample_count = 30
                    total_displayed_rows += sample_count
                    sheet_summaries.append(
                        f"  - {s_name} (范围: {dim_ref}, 非空行数(含标题/表头): {len(sheet_rows)}, 公式数: {formula_stat_str}, 状态: SAMPLED)"
                    )
                    all_sheet_rows.append(f"--- [工作表: {s_name} (范围: {dim_ref})] ---")
                    all_sheet_rows.extend(sheet_rows[:sample_count])
                    all_sheet_rows.append(
                        f"  ⚠️ [工作表覆盖度提醒: 抽样 (已展示 {sample_count}/{len(sheet_rows)} 行)]：当前展示仅为前 {sample_count} 行样本，未覆盖全表！"
                        f"若需进行查重、全量汇总、极值对比或审计检验，必须使用本轮提供的确定性核算工具处理原件的完整声明范围，不能凭抽样断言全表结论。"
                    )
                else:
                    total_displayed_rows += len(sheet_rows)
                    sheet_summaries.append(
                        f"  - {s_name} (范围: {dim_ref}, 非空行数(含标题/表头): {len(sheet_rows)}, 公式数: {formula_stat_str}, 状态: FULL)"
                    )
                    all_sheet_rows.append(f"--- [工作表: {s_name} (范围: {dim_ref})] ---")
                    all_sheet_rows.extend(sheet_rows)

        wb_data.close()
        if wb_formula:
            wb_formula.close()

        cov_mode = (
            "SLICED" if range_bounds else (
                "CATALOG" if is_catalog else (
                    "TARGETED" if target_sheets else "FULL"
                )
            )
        )
        coverage_complete = (total_scanned_rows == total_displayed_rows and not is_catalog
                             and range_bounds is None and start_line is None and end_line is None)
        visible_mode = "SAMPLED" if cov_mode == "FULL" and not coverage_complete else cov_mode
        coverage_tag = (
            f"[DATA_COVERAGE: workbook={p.name}, sheets={len(selected_sheets)}/{total_sheets}, "
            f"mode={visible_mode}, extraction_mode={cov_mode}, coverage_complete={str(coverage_complete).lower()}, scanned_rows={total_scanned_rows}, displayed_rows={total_displayed_rows}, "
            f"recalc_status={recalc_status_val}]"
        )
        extra_hint = (
            "💡 [工作表概览模式]: 当前仅提取结构与内容线索。用途说明应依据实际标题和表头；部门、期间、记录数量及跨表数据链必须有来源证明，不可从表名猜测。计算应使用本轮提供的确定性核算工具。\n"
            if is_catalog else
            "💡 [分析与计算建议]: 涉及公式或聚合时，使用本轮提供的确定性核算工具处理原件，保留来源坐标、范围和重算状态。\n"
        )
        overview_header = [
            f"【Excel 工作簿概览 ({p.name})，共 {total_sheets} 个工作表】:",
            coverage_tag,
            "工作表清单:",
            *sheet_summaries,
            extra_hint
        ]

        tr_data = {"sheets": selected_sheets, "mode": visible_mode, "extraction_mode": cov_mode,
                   "coverage_complete":coverage_complete,"scanned_rows":total_scanned_rows,
                   "displayed_rows":total_displayed_rows,
                   "row_count_semantics":"nonempty_rows_including_titles_and_headers"}
        tr_prov = {"workbook": p.name, "recalc_status": recalc_status_val}

        if start_line is not None or end_line is not None:
            total_r = len(all_sheet_rows)
            s_idx = max(0, (start_line or 1) - 1)
            e_idx = min(total_r, end_line if end_line is not None else total_r)
            sliced = [f"Row {s_idx + 1 + i}: {r}" for i, r in enumerate(all_sheet_rows[s_idx:e_idx])]
            sliced_text = (
                "\n".join(overview_header)
                + f"\n【Excel 表格 ({p.name}) 切片数据（第 {s_idx + 1} 至 {e_idx} 行，共 {total_r} 行）】:\n"
                + "\n".join(sliced)[:max_chars]
            )
            tr = ToolResult.success(data=tr_data, text=sliced_text, provenance=tr_prov)
            return TextToolOutput(sliced_text, tr)

        full_content = "\n".join(overview_header) + "\n" + "\n".join(all_sheet_rows)
        for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
            tp = p.parent / txt_name
            try:
                tp.write_text(full_content, encoding="utf-8")
            except Exception:
                pass

        if len(full_content) > max_chars:
            hint = (
                f"\n\n[⚠️ Excel 表格截断提醒]: 表格提取总长 {len(full_content)} 字符 / {len(all_sheet_rows)} 行，已展示前 {max_chars} 字符。"
                f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取表格行，或使用 python 工具加载指定单元格区域]"
            )
            res_text = full_content[:max_chars] + hint
            tr = ToolResult.partial(data=tr_data, text=res_text, provenance=tr_prov)
            return TextToolOutput(res_text, tr)

        tr = ToolResult.success(data=tr_data, text=full_content, provenance=tr_prov)
        return TextToolOutput(full_content, tr)

    except Exception as pyxl_err:
        err_msg = f"【Excel 解析异常】({p.name}): {pyxl_err}"
        tr = ToolResult.error(code="excel_parse_error", message=str(pyxl_err), text=err_msg)
        return TextToolOutput(err_msg, tr)
