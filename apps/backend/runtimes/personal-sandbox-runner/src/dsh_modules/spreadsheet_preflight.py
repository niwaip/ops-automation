"""
Spreadsheet pre-flight profiling and domain identification module.
Provides zero-hallucination table physical schemas, distinct value samplings,
and JIT domain guidance before agent planning.
"""

from pathlib import Path
import re
from typing import Dict, Any, List, Optional, Set
import openpyxl
from openpyxl.utils import get_column_letter


def profile_spreadsheet_for_planning(
    file_path: Path | str,
    prompt: str = "",
    max_distinct_sample: int = 12
) -> Dict[str, Any]:
    """
    Fast (<50ms) deterministic inspection of spreadsheet physical structure.
    Extracts true header rows, data boundaries (excluding titles/footers),
    column physical dimensions, and low-cardinality discrete value enumerations.
    """
    p = Path(file_path)
    if not p.exists() or p.suffix.lower() not in (".xlsx", ".xlsm"):
        return {"compact_markdown": "", "domain": "generic", "headers": {}}

    try:
        wb = openpyxl.load_workbook(p, data_only=True)
    except Exception:
        return {"compact_markdown": "", "domain": "generic", "headers": {}}

    try:
        sheet_names = wb.sheetnames
        if not sheet_names:
            return {"compact_markdown": "", "domain": "generic", "headers": {}}

        # Pick default sheet
        ws = wb[sheet_names[0]]
        max_r = ws.max_row or 1
        max_c = min(ws.max_column or 1, 64)

        # 1. Detect header row by scanning first 15 rows for highest density of strings
        observed_rows: Dict[int, List[Any]] = {}
        scan_limit = min(max_r, 15)
        for row in ws.iter_rows(min_row=1, max_row=scan_limit, max_col=max_c):
            filled = [c for c in row if c.value is not None]
            if filled:
                observed_rows[filled[0].row] = filled

        best_row = 1
        best_headers: Dict[str, str] = {}
        for r_idx, filled in observed_rows.items():
            strings = {get_column_letter(c.column): str(c.value).strip()
                       for c in filled if isinstance(c.value, str) and not str(c.value).startswith("=")}
            if len(strings) > len(best_headers):
                best_headers = strings
                best_row = r_idx

        # 2. Detect footer boundary from the bottom
        tail_scan_min = max(best_row + 1, max_r - 20)
        tail_rows: Dict[int, List[Any]] = {}
        for row in ws.iter_rows(min_row=tail_scan_min, max_row=max_r, max_col=max_c):
            filled = [c for c in row if c.value is not None]
            if filled:
                tail_rows[filled[0].row] = filled

        footer_prefix_patterns = (
            r'^(?:[\*＊#※]|查询条件|报表类别|填报说明|编制说明|制表人|制表时间|打印时间|导出时间|生成时间|温馨提示|特别提示|数据来源)(?:[:：\s]|$)',
            r'^(?:备注|注|说明|附注|声明)[:：]',
            r'^(?:合\s*计|总\s*计|小\s*计|grand\s+total|total|subtotal|summary)(?:[:：\s]|$)',
        )
        last_data_row = max_r
        header_col_count = len(best_headers)
        while last_data_row > best_row:
            if last_data_row in tail_rows:
                cells = tail_rows[last_data_row]
                first_val = str(cells[0].value or '').strip()
                is_footer = False
                # A row is only considered a footer if it is sparse or explicitly matches footer patterns
                if len(cells) <= max(3, header_col_count // 3):
                    if any(re.search(pat, first_val, re.I) for pat in footer_prefix_patterns):
                        is_footer = True
                    elif ":" in first_val or "：" in first_val:
                        is_footer = True
                elif re.match(r'^(?:合\s*计|总\s*计|小\s*计)(?:[:：\s]|$)', first_val):
                    is_footer = True

                if is_footer:
                    last_data_row -= 1
                    continue
            break

        data_start_row = best_row + 1
        total_data_records = max(0, last_data_row - data_start_row + 1)
        data_range_str = f"A{data_start_row}:{get_column_letter(max_c)}{last_data_row}"

        # 3. Sample column values and determine distinct counts
        distincts: Dict[str, Set[str]] = {letter: set() for letter in best_headers}
        top_samples: Dict[str, List[str]] = {letter: [] for letter in best_headers}
        val_sample_limit = min(last_data_row, data_start_row + 300)
        is_sampled_scan = (last_data_row > val_sample_limit)

        for r_idx, row in enumerate(ws.iter_rows(min_row=data_start_row, max_row=val_sample_limit, max_col=max_c)):
            for c in row:
                c_letter = get_column_letter(c.column)
                if c_letter in distincts and c.value is not None:
                    val_str = str(c.value).strip()
                    distincts[c_letter].add(val_str)
                    if r_idx < 5 and val_str not in top_samples[c_letter] and len(top_samples[c_letter]) < 3:
                        top_samples[c_letter].append(val_str)

        # 4. Infer physical dimension & role
        col_summaries: List[Dict[str, Any]] = []
        for c_letter in sorted(best_headers.keys(), key=lambda x: openpyxl.utils.column_index_from_string(x)):
            hname = best_headers[c_letter]
            vals = distincts.get(c_letter, set())
            d_count = len(vals)

            dim = "categorical"
            if any(k in hname for k in ("单价", "金额", "费用", "价格")) or (any(k in hname for k in ("元", "K", "k", "万")) and not any(k in hname for k in ("中心", "部门"))):
                dim = "currency"
            elif "成本" in hname and not any(k in hname for k in ("中心", "部门", "编号", "代码")):
                dim = "currency"
            elif any(k in hname for k in ("工数", "工时", "小时", "时数", "duration")):
                dim = "duration"
            elif any(k in hname for k in ("条数", "人数", "数量", "笔数")):
                dim = "count"
            elif any(k in hname for k in ("年月", "日期", "年度", "时间")):
                dim = "datetime"
            elif any(k in hname for k in ("编号", "代码", "ID", "id", "No", "账号")):
                dim = "identifier"
            elif any(k in hname for k in ("中心", "部门", "名称", "客户", "区分", "类型", "类别", "职级")):
                dim = "categorical"
            else:
                dim = "categorical"

            summary = {
                "letter": c_letter,
                "name": hname,
                "dimension": dim,
                "distinct_count": d_count,
                "is_sampled": is_sampled_scan,
            }
            if not is_sampled_scan and dim in ("categorical", "identifier") and 0 < d_count <= max_distinct_sample:
                summary["enum_values"] = sorted(vals)
            elif top_samples.get(c_letter):
                summary["sample_values"] = top_samples[c_letter]
            col_summaries.append(summary)

        # 5. Domain identification
        all_header_names = set(best_headers.values())
        domain_id = "generic"
        domain_title = "通用业务表格"
        domain_notes = ""

        if any("WBS" in h or "工数" in h or "职级" in h for h in all_header_names):
            domain_id = "timesheet_wbs"
            domain_title = "工数实绩与人力工时管理"
            domain_notes = (
                "- 【统计指导】: 当需要按主实体维度（如部门、项目）与业务分类维度交叉统计不同口径合计时：\n"
                "  * 推荐在 group_by 中传入多列维度组合，如 group_by: ['实体列名', '分类列名']。\n"
                "  * 或声明不同过滤条件的 table 分别汇总目标分类，切勿在单表上直接混算不同分类口径。"
            )
        elif any("营收" in h or "净利润" in h or "负债" in h or "资产" in h for h in all_header_names):
            domain_id = "finance_fpna"
            domain_title = "财务会计与经营分析"
            domain_notes = "- 【字段语义】: 金额类字段通常遵循损益表勾稽关系，注意区分收入、成本与净额。"

        # 6. Assemble compact Markdown
        truncation_note = f"（注意：物理表格共有 {ws.max_column} 列，当前扫描前 {max_c} 列）" if (ws.max_column or 1) > max_c else ""
        sampling_note = "（注意：数据行数超过300行，离散字段取值基于前300行采样，非全量枚举）" if is_sampled_scan else ""
        lines = [
            f"【表格预检与物理数据字典 (Pre-flight Sheet Profile)】",
            f"- 目标工作表: {ws.title} | 结构: 表头第 {best_row} 行，有效明细范围 {data_range_str}，共计 {total_data_records} 条有效业务明细（已排除表尾说明）{truncation_note}{sampling_note}。",
            f"- 物理字段清单与离散取值枚举:",
        ]
        for col in col_summaries:
            c_str = f"  * 列 {col['letter']}: [{col['name']}] ({col['dimension']})"
            if "enum_values" in col:
                c_str += f" | 离散取值枚举: {col['enum_values']}"
            elif "sample_values" in col:
                if col.get("is_sampled"):
                    c_str += f" | 样例: {col['sample_values']} (前300行采样发现 {col['distinct_count']} 种取值，非全量枚举)"
                else:
                    c_str += f" | 样例: {col['sample_values']} (共 {col['distinct_count']} 种取值)"
            lines.append(c_str)

        lines.append(f"\n【确认业务领域与口径指引】")
        lines.append(f"- 业务领域: {domain_title} ({domain_id})")
        if domain_notes:
            lines.append(domain_notes)

        compact_md = "\n".join(lines) + "\n"

        return {
            "compact_markdown": compact_md,
            "domain": domain_id,
            "sheet": ws.title,
            "header_row": best_row,
            "data_range": data_range_str,
            "records": total_data_records,
            "headers": best_headers,
            "columns": col_summaries
        }
    finally:
        wb.close()
