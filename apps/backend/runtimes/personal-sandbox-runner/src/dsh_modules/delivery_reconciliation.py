"""
Delivery reconciliation and grounded presentation alignment.
Ensures chat presentation, generated deliverables (Excel), and markdown tables
maintain strict mathematical closure and numeric consistency (preventing LLM mental-math hallucination).
"""

from decimal import Decimal
import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _parse_decimal_clean(val: Any) -> Optional[Decimal]:
    if val is None:
        return None
    cleaned = str(val).replace(",", "").replace("，", "").replace("¥", "").replace("$", "").strip()
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except Exception:
        return None


def extract_markdown_table_totals(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses markdown tables in reply_text, identifies amount and count columns,
    and calculates exact mathematical closures (sums) across data rows.
    """
    if not text or "|" not in text:
        return None

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    table_lines: List[str] = []
    in_table = False

    best_table: Optional[Dict[str, Any]] = None

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("|") and line.endswith("|"):
            table_lines.append(line)
            in_table = True
        else:
            if in_table and len(table_lines) >= 3:
                # Process collected table
                t_res = _process_single_markdown_table(table_lines)
                if t_res and (best_table is None or t_res.get("data_rows_count", 0) > best_table.get("data_rows_count", 0)):
                    best_table = t_res
            table_lines = []
            in_table = False
        i += 1

    if in_table and len(table_lines) >= 3:
        t_res = _process_single_markdown_table(table_lines)
        if t_res and (best_table is None or t_res.get("data_rows_count", 0) > best_table.get("data_rows_count", 0)):
            best_table = t_res

    return best_table


def _process_single_markdown_table(table_lines: List[str]) -> Optional[Dict[str, Any]]:
    header_line = table_lines[0]
    sep_line = table_lines[1]
    if not re.search(r"^\|(?:\s*:?-+:?\s*\|)+$", sep_line):
        return None

    headers = [c.strip() for c in header_line.split("|")[1:-1]]
    if len(headers) < 2:
        return None

    amt_col = -1
    cnt_col = -1
    for idx, h in enumerate(headers):
        if amt_col == -1 and any(k in h for k in ("金额", "Amount", "汇总金额", "工数", "Hours", "时数")):
            amt_col = idx
        if cnt_col == -1 and any(k in h for k in ("条数", "明细条数", "数量", "笔数", "Count", "记录数")):
            cnt_col = idx

    if amt_col == -1 and cnt_col == -1:
        return None

    sum_amt = Decimal(0)
    has_amt = False
    amt_decimals = 2
    amt_has_comma = False

    sum_cnt = Decimal(0)
    has_cnt = False

    data_rows_count = 0

    for row_str in table_lines[2:]:
        cols = [c.strip() for c in row_str.split("|")[1:-1]]
        if len(cols) != len(headers):
            continue
        # Skip total / summary row if present in table
        if any(any(k in c for k in ("总计", "合计", "Total", "Summary")) for c in cols):
            continue

        if amt_col != -1 and amt_col < len(cols):
            raw_amt = cols[amt_col]
            if "," in raw_amt or "，" in raw_amt:
                amt_has_comma = True
            d_amt = _parse_decimal_clean(raw_amt)
            if d_amt is not None:
                sum_amt += d_amt
                has_amt = True
                if "." in raw_amt:
                    dec_len = len(raw_amt.split(".")[-1].strip())
                    if dec_len > amt_decimals:
                        amt_decimals = dec_len

        if cnt_col != -1 and cnt_col < len(cols):
            raw_cnt = cols[cnt_col]
            d_cnt = _parse_decimal_clean(raw_cnt)
            if d_cnt is not None:
                sum_cnt += d_cnt
                has_cnt = True

        data_rows_count += 1

    if data_rows_count == 0:
        return None

    return {
        "amount": sum_amt if has_amt else None,
        "count": int(sum_cnt) if has_cnt else None,
        "data_rows_count": data_rows_count,
        "amount_decimals": amt_decimals,
        "amount_has_comma": amt_has_comma,
    }


def extract_generated_workbook_totals(
    workspace_dir: str, turn_start_time: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """
    Inspects generated (non-protected) xlsx deliverables in workspace_dir
    to read authoritative grand total rows and formula cache values.
    """
    from .file_tools import is_protected_session_file
    import openpyxl

    ws_path = Path(workspace_dir)
    if not ws_path.exists():
        return None

    mtime_threshold = (turn_start_time - 2.0) if turn_start_time else None

    # Sort files by mtime desc to pick the newest generated deliverable
    candidates = []
    for fname in os.listdir(workspace_dir):
        if fname.lower().endswith((".xlsx", ".xlsm")) and not fname.startswith("."):
            fpath = ws_path / fname
            if is_protected_session_file(fpath):
                continue
            try:
                mtime = fpath.stat().st_mtime
                if mtime_threshold is None or mtime >= mtime_threshold:
                    candidates.append((mtime, fpath))
            except Exception:
                pass

    candidates.sort(key=lambda x: x[0], reverse=True)

    from .workbook_delivery import generated_workbook_totals
    for _, fpath in candidates:
        totals = generated_workbook_totals(fpath)
        if totals is not None:
            return totals

    return None


def get_source_record_count(
    workspace_dir: str, messages: Optional[List[Dict[str, Any]]] = None
) -> Optional[int]:
    """
    Determines the total valid data records in the protected session input attachment,
    skipping title metadata headers and footer notes.
    """
    from .file_tools import is_protected_session_file
    import openpyxl

    ws_path = Path(workspace_dir)
    if not ws_path.exists():
        return None

    # 1. Locate protected session attachment
    src_file: Optional[Path] = None
    for fname in os.listdir(workspace_dir):
        if fname.lower().endswith((".xlsx", ".xlsm")) and not fname.startswith("."):
            fpath = ws_path / fname
            if is_protected_session_file(fpath):
                src_file = fpath
                break

    if not src_file:
        return None

    try:
        wb = openpyxl.load_workbook(src_file, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return None

        # Find best header row in top 10 rows
        best_header_row = -1
        max_cols = 0
        for idx, row in enumerate(rows[:10]):
            valid_cnt = sum(1 for c in row if c is not None and str(c).strip() != "")
            if valid_cnt > max_cols:
                max_cols = valid_cnt
                best_header_row = idx

        if best_header_row == -1 or max_cols == 0:
            return None

        # Count data rows below header that have at least half of the columns populated
        # (this cleanly filters single-cell footer query notes)
        min_required_cols = max(1, max_cols // 2)
        footer_keywords = ("查询条件", "报表类别", "报表说明", "*会计年度", "工数年月", "*部门编号", "导出日期", "说明：", "注：", "查询说明")
        valid_records = 0
        for row in rows[best_header_row + 1:]:
            first_cell_str = str(row[0] or "").strip()
            # If row starts with footer keyword and has only 1 populated cell, skip as footer note
            valid_cnt = sum(1 for c in row if c is not None and str(c).strip() != "")
            if valid_cnt <= 2 and any(k in first_cell_str for k in footer_keywords):
                continue
            if max_cols > 2 and valid_cnt < min_required_cols:
                continue
            if valid_cnt > 0:
                valid_records += 1

        return valid_records if valid_records > 0 else None
    except Exception as e:
        logger.debug("Failed to count source records in %s: %s", src_file, e)
        return None


def reconcile_delivery_presentation(
    reply_text: str,
    workspace_dir: str,
    messages: Optional[List[Dict[str, Any]]] = None,
    prompt: str = "",
    turn_start_time: Optional[float] = None
) -> str:
    """
    Reconciles agent reply text against authoritative workbook deliverables and markdown tables:
    1. Reconciles mental-math total amount discrepancy against exact table sum / deliverable total.
    2. Reconciles excluded count discrepancy (N_source - N_retained) against ground truth records.
    """
    if not reply_text:
        return reply_text

    # 1. Gather authoritative totals from generated deliverable and markdown table
    wb_totals = extract_generated_workbook_totals(workspace_dir, turn_start_time=turn_start_time)
    tbl_totals = extract_markdown_table_totals(reply_text)

    true_amount: Optional[Decimal] = None
    true_count: Optional[int] = None
    amt_decimals = 3
    amt_has_comma = True

    if wb_totals and wb_totals.get("amount") is not None:
        true_amount = wb_totals["amount"]
    elif tbl_totals and tbl_totals.get("amount") is not None:
        true_amount = tbl_totals["amount"]

    if wb_totals and wb_totals.get("count") is not None:
        true_count = wb_totals["count"]
    elif tbl_totals and tbl_totals.get("count") is not None:
        true_count = tbl_totals["count"]

    if tbl_totals:
        amt_decimals = tbl_totals.get("amount_decimals", 3)
        amt_has_comma = tbl_totals.get("amount_has_comma", True)

    text = reply_text

    # 2. Reconcile Grand Total Amount
    if true_amount is not None:
        # Match lines like: - **总金额(K)**：1,436.420 或 总金额：1436.42
        def _replace_total_amount(m: re.Match) -> str:
            prefix = m.group(1)
            raw_val = m.group(2)
            suffix = m.group(3)
            from .spreadsheet_expression import AMOUNT_SCALE
            target_amount = true_amount
            source_unit = wb_totals.get('amount_unit') if wb_totals else None
            unit_match = re.search(r'亿元|万元|千元|元|\bK\b|\bM\b', prefix + suffix[:8])
            target_unit = unit_match.group(0) if unit_match else source_unit
            if source_unit and target_unit and source_unit != target_unit:
                if source_unit not in AMOUNT_SCALE or target_unit not in AMOUNT_SCALE:
                    return m.group(0)
                target_amount = true_amount * AMOUNT_SCALE[source_unit] / AMOUNT_SCALE[target_unit]
            current_dec = _parse_decimal_clean(raw_val)
            if current_dec is not None and abs(current_dec - target_amount) > Decimal("0.01"):
                # Determine format based on raw_val or tbl_totals
                has_comma = ("," in raw_val) or amt_has_comma
                dec_places = len(raw_val.split(".")[-1]) if "." in raw_val else amt_decimals
                if has_comma:
                    formatted = f"{target_amount:,.{dec_places}f}"
                else:
                    formatted = f"{target_amount:.{dec_places}f}"
                logger.info(
                    "Reconciled total amount in reply: changed '%s' to '%s' to match deliverable closure.",
                    raw_val,
                    formatted
                )
                return f"{prefix}{formatted}{suffix}"
            return m.group(0)

        text = re.sub(
            r"((?:总金额|合计金额|汇总金额|总计金额|金额总计|总额)[^\d\n\r]*?)([\d,]+(?:\.\d+)?)([^\d\n\r]*)",
            _replace_total_amount,
            text,
            count=1
        )

    # 3. Reconcile Excluded Record Count (if exclusion intent present)
    has_exclusion_intent = bool(re.search(r"排除|过滤|不包含|剔除|除外", prompt + " " + text))
    if has_exclusion_intent and true_count is not None and true_count > 0:
        src_records = get_source_record_count(workspace_dir, messages=messages)
        if src_records is not None and src_records > true_count:
            true_excluded = src_records - true_count

            def _replace_excluded_count(m: re.Match) -> str:
                prefix = m.group(1)
                raw_cnt = m.group(2)
                suffix = m.group(3)
                try:
                    c_val = int(raw_cnt)
                    if c_val != true_excluded:
                        logger.info(
                            "Reconciled excluded count in reply: changed '%d' to '%d' (source=%d, retained=%d).",
                            c_val,
                            true_excluded,
                            src_records,
                            true_count
                        )
                        return f"{prefix}{true_excluded}{suffix}"
                except Exception:
                    pass
                return m.group(0)

            text = re.sub(
                r"(共?(?:排除|过滤|剔除)[^\d\n\r]*?)(\d+)(\s*条)",
                _replace_excluded_count,
                text,
                count=1
            )

    return text
