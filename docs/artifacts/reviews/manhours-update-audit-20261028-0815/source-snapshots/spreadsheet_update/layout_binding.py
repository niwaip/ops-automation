"""Bind observed labels and keys; zero hardcoded domain aliases, tri-evidence grounded."""
import re
from decimal import Decimal
from openpyxl.utils.cell import range_boundaries
from .result_catalog import normalize_unit
from ..spreadsheet_units import AMOUNT_UNIT_FACTORS


class BindingNeedsInput(ValueError):
    """A business fact is absent or ambiguous; the engine must ask the user instead of guessing."""
    def __init__(self, message, clarification_type="general", candidates=None):
        super().__init__(message)
        self.message = message
        self.clarification_type = clarification_type
        self.candidates = candidates or []


def text_value(value):
    return '' if value is None else str(value).strip()


def _effective(ws, row, col):
    cell = ws.cell(row, col)
    if cell.value is not None:
        return text_value(cell.value)
    for merged in ws.merged_cells.ranges:
        if merged.min_row <= row <= merged.max_row and merged.min_col <= col <= merged.max_col:
            return text_value(ws.cell(merged.min_row, merged.min_col).value)
    return ''


def locate(ws, section, period, target_label, source_keys, target_range=None,
           protected_labels=(), file_hash=None, file_name=None, template_name=None, workspace=None):
    """Locate target section, period/target columns, and all target business keys."""
    bounds = range_boundaries(target_range) if target_range else (1, 1, ws.max_column, ws.max_row)
    min_c, min_r, max_c, max_r = bounds

    # 1. Exact match on raw worksheet cells
    titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
              for cell in row if text_value(cell.value) == section]

    # 2. Match via Grounded User Declarations (from active turn)
    if len(titles) == 0:
        try:
            from ..user_declarations import section_confirmation
            s_decl = section_confirmation() or {}
            if section in s_decl and s_decl[section].get('target_title'):
                target_title = s_decl[section]['target_title']
                titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
                          for cell in row if text_value(cell.value) == target_title]
                if len(titles) == 0:
                    norm = lambda s: re.sub(r'[\s（）()/*_\-]+', '', str(s or '').lower())
                    norm_tgt = norm(target_title)
                    if norm_tgt:
                        titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
                                  for cell in row if cell.value and norm(cell.value) == norm_tgt]
        except Exception:
            pass

    # 3. Match via Persistent Domain Memory (learned from prior user confirmations)
    # 严格遵循补足信息定位：必须在当前工作表中完全匹配且唯一，才作为入力，否则坚决不猜
    if len(titles) == 0:
        try:
            from ..domain_memory import resolve_section_mapping
            remembered_title = resolve_section_mapping(
                section, file_hash=file_hash, file_name=file_name,
                template_name=template_name, workspace=workspace
            )
            if remembered_title:
                matched_titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
                                  for cell in row if text_value(cell.value) == remembered_title]
                if len(matched_titles) == 0:
                    norm = lambda s: re.sub(r'[\s（）()/*_\-]+', '', str(s or '').lower())
                    norm_rem = norm(remembered_title)
                    if norm_rem:
                        matched_titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
                                          for cell in row if cell.value and norm(cell.value) == norm_rem]
                # 只有当且仅当在当前 Sheet 中完全匹配出唯一一处目标标题时，才采纳为有效输入
                if len(matched_titles) == 1:
                    titles = matched_titles
        except Exception:
            pass

    # 4. Normalized punctuation/whitespace comparison (no semantic guessing)
    if len(titles) == 0:
        norm = lambda s: re.sub(r'[\s（）()/*_\-]+', '', str(s or '').lower())
        norm_sec = norm(section)
        if norm_sec:
            titles = [cell for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c)
                      for cell in row if cell.value and norm(cell.value) == norm_sec]

    # 5. If still not matched, collect candidate standalone titles and prompt user clarification
    if len(titles) != 1:
        if section == period:
            candidates = []
            for row in ws.iter_rows():
                populated = [cell for cell in row if cell.value is not None]
                if len(populated) == 1 and isinstance(populated[0].value, str) and populated[0].data_type != 'f':
                    cell = populated[0]
                    candidates.append(f'{cell.coordinate}={cell.value}')
            raise ValueError('section 被误填成 period 期间值；section 应是业务区块的独立标题。'
                             '请修改 section，不要反复缩小 target_range；当前工作表实际独立标题候选：'
                             + '；'.join(candidates[:30]))
        if target_range and not titles:
            raise ValueError('target_range 必须包含区块标题、完整表头和关联键列；请省略范围让服务端定位，不能只给目标列')

        # Detect standalone block title candidates across the worksheet
        candidates = []
        for row in ws.iter_rows(min_row=min_r, max_row=max_r, min_col=min_c, max_col=max_c):
            populated = [cell for cell in row if cell.value is not None]
            if len(populated) == 1 and isinstance(populated[0].value, str) and populated[0].data_type != 'f':
                val = text_value(populated[0].value)
                if val and val not in candidates and val != section and not val.startswith('='):
                    candidates.append(val)

        if len(titles) == 0 and candidates:
            c_str = '、'.join(f'【{c}】' for c in candidates[:6])
            raise BindingNeedsInput(
                f'目标工作表中未找到名为【{section}】的区块。检测到以下候选区块标题：{c_str}。'
                f'请确认【{section}】是否对应上述某个候选区块？本次尚未生成更新文件。',
                clarification_type='section_mapping',
                candidates=candidates
            )

        hint = f'；当前工作表检测到的独立标题候选：{candidates[:10]}' if candidates else ''
        raise ValueError(f'区块标题必须唯一：{section}，匹配 {len(titles)} 处；可用 target_range 限定{hint}')

    start = titles[0].row
    t_col = titles[0].column
    # Pre-bound section: do not scan into subsequent standalone section titles
    section_max_r = max_r
    ignored_title_words = {
        '部门', '部门编号', '部门名称', '编号', 'code', 'dept', 'no', '项目', '名称',
        '总计', '合计', 'grand total', '小计', 'subtotal', str(period).lower(), str(target_label).lower()
    }
    for r in range(start + 1, max_r + 1):
        c = ws.cell(r, t_col)
        v = text_value(c.value)
        if v and v.lower() not in ignored_title_words and not v.startswith('='):
            populated = [cell for cell in ws[r] if cell.value is not None]
            if len(populated) == 1:
                section_max_r = r - 1
                break

    matches = [cell for row in ws.iter_rows(min_row=start + 1, max_row=section_max_r, min_col=min_c, max_col=max_c)
               for cell in row if text_value(cell.value) in source_keys]
    if not matches:
        raise ValueError('目标区块未发现来源业务键')

    first_match = min(cell.row for cell in matches)
    first_columns = {cell.column for cell in matches if cell.row == first_match}
    scores = {column: len({text_value(cell.value) for cell in matches if cell.column == column})
              for column in first_columns}
    key_columns = {column for column, score in scores.items() if score == max(scores.values())}
    if len(key_columns) != 1:
        raise ValueError('首个业务行的关联键列不唯一')
    key_col = key_columns.pop()
    min_match_row = min(cell.row for cell in matches if cell.column == key_col)

    # Locate target period and label column
    candidates = []
    header_end_rows = []
    for col in range(min_c, max_c + 1):
        headers = {_effective(ws, row, col) for row in range(start, min_match_row)}
        matches_period = (period in headers) if period else True
        if matches_period and target_label in headers:
            if headers.intersection(protected_labels):
                raise ValueError('目标列属于声明保护的表头')
            candidates.append(col)
            # Track header rows where period or label appeared
            p_rows = [r for r in range(start, min_match_row) if period and _effective(ws, r, col) == period]
            l_rows = [r for r in range(start, min_match_row) if _effective(ws, r, col) == target_label]
            if p_rows or l_rows:
                header_end_rows.append(max(p_rows + l_rows))

    if len(candidates) != 1:
        desc = f'{period}/{target_label}' if period else target_label
        raise ValueError(f'期间与目标表头不唯一：{desc}，匹配 {len(candidates)} 列')
    col = candidates[0]

    # Determine first true business data row: start immediately after header band
    # to avoid skipping leading target-only keys (e.g. FC48005, FC34032)
    header_end = max(header_end_rows) if header_end_rows else (min_match_row - 1)
    first = header_end + 1
    # Guard against invalid header_end
    if first > min_match_row or first <= start:
        first = min_match_row

    # Determine boundary of this block
    key_rows = sorted({cell.row for cell in matches if cell.column == key_col})
    boundary = section_max_r
    for previous, next_row in zip(key_rows, key_rows[1:]):
        periods = [r for r in range(previous + 1, next_row) if _effective(ws, r, col) == period]
        labels = [r for r in range(previous + 1, next_row) if _effective(ws, r, col) == target_label]
        if periods and labels:
            boundary = min(min(periods), min(labels)) - 1
            break
        totals = [r for r in range(previous + 1, next_row)
                  if any(text_value(ws.cell(r, c).value) in ('总计', '合计', 'Grand Total') for c in range(min_c, max_c + 1))]
        blanks = [r for r in range(previous + 1, next_row)
                  if all(ws.cell(r, c).value is None or text_value(ws.cell(r, c).value) == '' for c in range(min_c, max_c + 1))]
        if totals or blanks:
            boundary = min(totals + blanks) - 1
            break

    # Extract all target business keys across [first, boundary]
    keys = {}
    header_like_words = {'部门', '部门编号', '部门名称', '编号', 'code', 'dept', 'no', '项目', '名称'}
    for row in range(first, boundary + 1):
        if any(text_value(ws.cell(row, c).value) in ('总计', '合计', 'Grand Total') for c in range(min_c, max_c + 1)):
            break
        raw = ws.cell(row, key_col).value
        key = text_value(raw)
        if raw is None or not key or key == 'Subtotal' or key.lower() in header_like_words:
            continue
        target = ws.cell(row, col)
        if key not in source_keys and target.data_type == 'f':
            continue
        if key in keys:
            raise ValueError(f'区块内业务键重复：{key}；请限定 target_range')
        keys[key] = row

    missing = source_keys - keys.keys()
    if missing:
        raise ValueError('来源键未匹配当前区块：' + ', '.join(sorted(missing)))

    protected = []
    for column in range(min_c, max_c + 1):
        headers = {_effective(ws, row, column) for row in range(start, first)}
        if headers.intersection(protected_labels):
            protected.extend(ws.cell(row, column).coordinate for row in range(first, boundary + 1))

    return {
        'region_id': section, 'header_row': first - 1, 'key_col': key_col,
        'min_row': start, 'max_row': boundary, 'min_col': min_c, 'max_col': max_c,
        'period_columns': {period: col}, 'department_rows': keys,
        'protected_coordinates': protected
    }, col


def verify_unit(ws, unit, unit_cell=None, confirmation=None):
    """Accept a grounded user declaration or worksheet evidence, never a model guess."""
    aliases = set(AMOUNT_UNIT_FACTORS) | {unit, 'hours', '小时', 'h'}
    cells = [ws[unit_cell]] if unit_cell else [cell for row in ws for cell in row]
    found = set()
    for cell in cells:
        value = cell.value
        if not isinstance(value, str) or cell.data_type == 'f':
            continue
        tokens = set(re.split(r'[\s:：()（）\[\]]+', value.strip()))
        if unit_cell or value.strip() in aliases or re.search(r'(?:单位|unit)\s*[:：]|[（(]', value, re.I):
            found.update(normalize_unit(token) for token in tokens.intersection(aliases))
    if confirmation:
        confirmed = confirmation['unit']
        if unit is not None and unit != confirmed:
            raise ValueError('规划单位与用户明确确认的目标单位不一致')
        if len(found) == 1 and found != {confirmed}:
            raise BindingNeedsInput('用户确认的目标单位与工作簿声明冲突，请确认适用的单位及范围；本次尚未生成更新文件。')
        return confirmed
    if len(found) != 1 or (unit is not None and found != {unit}):
        raise BindingNeedsInput('目标工作簿未声明可唯一验证的金额单位。请确认应以什么单位更新；本次尚未生成更新文件。')
    return found.pop()
