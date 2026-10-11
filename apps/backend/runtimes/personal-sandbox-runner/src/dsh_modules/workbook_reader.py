"""
WorkbookReader: Manifest discovery and on-demand cell reader.
Implements the 'structure discovery -> target validation -> on-demand read' pipeline.
Extracts workbook manifest without costly recalculation, validating sheet names and
ranges before invoking execution engines.
"""

import os
import re
import json
import zipfile
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

import openpyxl
from .worksheet_metadata import worksheet_dimensions
from openpyxl.utils import range_boundaries, get_column_letter

from dsh_modules.tool_result import ToolResult, TextToolOutput
from dsh_modules.workbook_calculation import (
    get_or_create_recalculated_workbook,
    check_workbook_formulas,
    RECALC_CACHE_VERSION
)


@dataclass
class SheetMeta:
    name: str
    dimensions: str
    row_count: int
    col_count: int
    headers: List[str] = field(default_factory=list)
    formula_count: int = 0
    sample_rows: List[List[str]] = field(default_factory=list)


@dataclass
class WorkbookManifest:
    file_path: Path
    file_name: str
    file_hash: str
    sheet_names: List[str]
    sheets: Dict[str, SheetMeta] = field(default_factory=dict)
    total_formulas: int = 0

    def get_sheet_names_str(self) -> str:
        return ", ".join(self.sheet_names)

    def find_sheet(self, requested: str) -> Optional[str]:
        if not requested:
            return None
        req_clean = requested.strip().lower()
        for s in self.sheet_names:
            if s.lower() == req_clean:
                return s
        return None


def inspect_workbook(file_path: Union[str, Path]) -> Union[WorkbookManifest, ToolResult]:
    """
    Lightweight structure discovery without formula recalculation.
    Reads sheet names, dimensions, headers, and formula distributions in read-only stream mode.
    """
    p = Path(file_path)
    if not p.exists() or p.suffix.lower() not in [".xlsx", ".xlsm"]:
        err_msg = f"文件未找到或非合法 Excel 工作簿: {p}"
        return ToolResult.error(code="file_not_found", message=err_msg, text=err_msg)

    try:
        file_bytes = p.read_bytes()
        file_hash = hashlib.sha256(file_bytes).hexdigest()
    except Exception as e:
        return ToolResult.error(code="read_error", message=f"无法读取文件哈希: {e}")

    try:
        # Load workbook in read_only mode for fast manifest extraction
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        sheet_names = list(wb.sheetnames)
        sheets_meta: Dict[str, SheetMeta] = {}

        for s_name in sheet_names:
            try:
                ws = wb[s_name]
                dim = worksheet_dimensions(ws)
                max_r = ws.max_row or 0
                max_c = ws.max_column or 0

                # Sample top headers
                headers = []
                samples = []
                for r_idx, row in enumerate(ws.iter_rows(max_row=3, max_col=min(max_c, 20) or 1, values_only=True), start=1):
                    row_strs = [str(c) if c is not None else "" for c in row]
                    if r_idx == 1:
                        headers = row_strs[:20]
                    else:
                        samples.append(row_strs[:20])

                sheets_meta[s_name] = SheetMeta(
                    name=s_name,
                    dimensions=dim,
                    row_count=max_r,
                    col_count=max_c,
                    headers=headers,
                    sample_rows=samples
                )
            except Exception:
                sheets_meta[s_name] = SheetMeta(name=s_name, dimensions="未知", row_count=0, col_count=0)

        wb.close()
        return WorkbookManifest(
            file_path=p,
            file_name=p.name,
            file_hash=file_hash,
            sheet_names=sheet_names,
            sheets=sheets_meta
        )
    except Exception as e:
        return ToolResult.error(code="manifest_error", message=f"工作簿清单解析失败: {e}")


def validate_sheet_and_range(
    manifest: Union[WorkbookManifest, str, Path],
    sheet_name: Optional[str] = None,
    cell_range: Optional[str] = None
) -> Tuple[Optional[str], Optional[str], Optional[ToolResult]]:
    """
    Validates requested sheet and range against the manifest before running recalculation.
    Returns: (effective_sheet_name, parsed_cell_range, error_tool_result)
    """
    if isinstance(manifest, (str, Path)):
        inspect_res = inspect_workbook(manifest)
        if isinstance(inspect_res, ToolResult):
            return None, None, inspect_res
        manifest = inspect_res

    effective_sheet = sheet_name
    parsed_range = cell_range

    if cell_range and "!" in cell_range:
        parts = cell_range.split("!", 1)
        effective_sheet = parts[0].strip("'\"")
        parsed_range = parts[1].strip()

    all_sheets_str = manifest.get_sheet_names_str()

    # 1. 校验指定的工作表是否存在
    if effective_sheet:
        real_name = manifest.find_sheet(effective_sheet)
        if not real_name:
            err_text = (
                f"【错误: sheet_not_found】工作簿 ({manifest.file_name}) 中不存在工作表 '{effective_sheet}'。\n"
                f"- 状态: error\n"
                f"- 错误代码: sheet_not_found\n"
                f"- 请求工作表: '{effective_sheet}'\n"
                f"- 可用工作表清单: {all_sheets_str}\n"
                f"💡 [系统引导]: 目标文件不包含 '{effective_sheet}'。请直接从上述可用工作表清单 ({all_sheets_str}) 中选择真实存在的工作表读取，"
                "严禁臆造不存在的表名或向用户反问是否读取！"
            )
            tr = ToolResult.error(
                code="sheet_not_found",
                message=f"工作簿 ({manifest.file_name}) 中不存在工作表 '{effective_sheet}'",
                error_details={
                    "requested_sheet": effective_sheet,
                    "available_sheets": manifest.sheet_names,
                    "recovery": "select_existing_sheet",
                },
                provenance={"workbook_id": manifest.file_hash, "file_path": str(manifest.file_path)},
                text=err_text,
            )
            return None, None, tr
        effective_sheet = real_name

    # 2. 检查多表工作簿切片是否有歧义
    if parsed_range and not effective_sheet and len(manifest.sheet_names) > 1:
        err_text = (
            f"【错误: ambiguous_range】工作簿 ({manifest.file_name}) 包含多个工作表 ({len(manifest.sheet_names)} 个)，切片区域 '{cell_range}' 存在歧义。\n"
            f"- 状态: error\n"
            f"- 错误代码: ambiguous_range\n"
            f"- 可用工作表清单: {all_sheets_str}\n"
            f"💡 [系统引导]: 请同时指定 sheet 参数（如 sheet='{manifest.sheet_names[0]}'）或使用完整引用（如 '{manifest.sheet_names[0]}!{parsed_range}'）。"
        )
        tr = ToolResult.error(
            code="ambiguous_range",
            message=f"工作簿 ({manifest.file_name}) 包含多个工作表，切片区域 '{cell_range}' 存在歧义",
            error_details={"available_sheets": manifest.sheet_names, "recovery": "specify_sheet"},
            provenance={"workbook_id": manifest.file_hash, "file_path": str(manifest.file_path)},
            text=err_text,
        )
        return None, None, tr

    # 3. 校验区域格式
    if parsed_range:
        try:
            bounds = range_boundaries(parsed_range)
            if not bounds or any(b is None for b in bounds):
                err_text = (
                    f"【错误: invalid_range】切片区域 '{cell_range}' 格式无效。\n"
                    f"- 状态: error\n"
                    f"- 错误代码: invalid_range\n"
                    f"💡 [系统引导]: 有效格式示例: 'A1:H10'、'B2:D20'。"
                )
                tr = ToolResult.error(
                    code="invalid_range",
                    message=f"切片区域 '{cell_range}' 格式无效",
                    error_details={"cell_range": cell_range},
                    provenance={"workbook_id": manifest.file_hash, "file_path": str(manifest.file_path)},
                    text=err_text,
                )
                return None, None, tr
        except Exception as e:
            err_text = (
                f"【错误: invalid_range】切片区域 '{cell_range}' 格式无效: {e}。\n"
                f"- 状态: error\n"
                f"- 错误代码: invalid_range\n"
                f"💡 [系统引导]: 有效格式示例: 'A1:H10'、'B2:D20'。"
            )
            tr = ToolResult.error(
                code="invalid_range",
                message=f"切片区域 '{cell_range}' 格式无效: {e}",
                error_details={"cell_range": cell_range},
                provenance={"workbook_id": manifest.file_hash, "file_path": str(manifest.file_path)},
                text=err_text,
            )
            return None, None, tr

    return effective_sheet, parsed_range, None
