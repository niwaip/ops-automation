"""Readable projections of verified receipts; no model text or new calculations."""

import re
from decimal import Decimal, localcontext
from pathlib import Path
from urllib.parse import quote

from .analysis_contract import build_analysis_contract
from .spreadsheet_fact_identity import fact_identity


def text(value):
    value = str(value).replace('\n', ' ').replace('\r', ' ')
    value = value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return re.sub(r'([\\`*_|\[\]])', r'\\\1', value)


def number(value, signed=False):
    """Display rounding only; exact receipt values remain in the audit section."""
    value = Decimal(str(value))
    with localcontext() as context:
        context.prec = max(32, len(value.as_tuple().digits) + abs(value.as_tuple().exponent) + 6)
        rounded = value.quantize(Decimal('0.01'))
    if value and not rounded:
        return ('+' if signed and value > 0 else '') + str(value)
    rendered = format(rounded, ',.2f').rstrip('0').rstrip('.')
    return ('+' if signed and rounded > 0 else '') + rendered


def quantity(value, unit):
    suffix = '%' if unit == '%' else (' ' + text(unit) if unit and unit != 'number' else '')
    return number(value) + suffix


def _format_facts_source_cells(facts):
    items = []
    for fact in facts or []:
        if not isinstance(fact, dict):
            continue
        sc = [str(c).strip() for c in (fact.get('source_cells') or []) if str(c).strip()]
        if not sc:
            continue
        lbl = text(fact.get('label') or fact.get('id') or '')
        cell_desc = '、'.join(f"`{c}`" for c in sc) if len(sc) <= 4 else f"`{sc[0]}..{sc[-1]}`（共{len(sc)}个单元格）"
        items.append(f"{lbl}（{cell_desc}）")
    if items and len(items) <= 12:
        return "\n来源单元格：" + "、".join(items) + "。"
    return ""


def with_sources(main, audit, receipts):
    sources = dict.fromkeys((r.provenance or {}).get('file_path') for r in receipts)
    links = []
    for source in sources:
        if not source:
            continue
        path = Path(source)
        label = text(path.name)
        # The existing workspace download endpoint serves root workspace files.
        # Do not fabricate a downloadable URL for another path or nested file.
        if str(path.parent) == '/workspace':
            label = f'[{label}](/api/ai/chat/workspace-files/me/{quote(path.name, safe="")})'
        links.append(label)
    downloads = '原始文件：' + '、'.join(links) + '。\n\n' if links else ''
    return (main + '\n\n<details>\n<summary>查看来源与核算明细</summary>\n\n'
            + downloads + audit + '\n\n</details>')


from .analysis_fact_selection import resolve_conforming_facts


def select_delivery_queries(queries, contract):
    """Filter out auxiliary/exploratory query receipts from final delivery presentation."""
    if len(queries) <= 1:
        return queries

    # 1. 实体限定：用户要求特定实体时，优先展示针对该实体的查询，排除全表探索或辅助去重查询
    if contract.entity_predicates:
        from .analysis_task_state import filter_matches_entities
        entity_queries = [q for q in queries if filter_matches_entities(q, contract.entity_predicates)]
        if entity_queries:
            return entity_queries

    # 2. 去重意图：若用户未请求不重复/去重列表，排除纯辅助性的 distinct 探索查询
    if not contract.has_distinct_list:
        non_distinct = [q for q in queries if not (q.data.get('plan') or {}).get('distinct')]
        if non_distinct:
            return non_distinct

    return queries


def analysis_overview(receipts, prompt):
    contract = build_analysis_contract(prompt)
    has_derived = any(
        (r.provenance or {}).get('execution_origin') == 'registered_derivation'
        or any(f.get('calculation_stage') == 'post_query' for f in r.data.get('facts', []))
        for r in receipts)
    queries = [r for r in receipts if r.data.get('query_ir_version') and r.data.get('plan', {}).get('source')]
    if queries and all(r.data.get('query_ir_version') for r in receipts) and not has_derived:
        delivery_queries = select_delivery_queries(queries, contract)
        return query_overview(delivery_queries, contract)
    visible = resolve_conforming_facts(receipts, prompt)
    all_rows = [r for rc in receipts for r in (rc.data.get('rows', []) if hasattr(rc, 'data') else (rc.get('data', {}).get('rows', []) if isinstance(rc, dict) else [])) if isinstance(r, dict)]
    parts = []

    # 若为明细查询任务（且非分组统计汇总任务），优先按明细表格呈现行级数据
    is_detail = not has_derived and ((contract.is_detail_query and not contract.is_grouped)
                                   or any(f.get('id') == 'matched_rows_count' for f in visible))
    if is_detail and all_rows:
        cols = list(dict.fromkeys(k for r in all_rows[:50] for k in r.keys() if k != 'group_key'))
        active_cols = [c for c in cols if any(r.get(c) not in (None, "") for r in all_rows[:50])]
        if not active_cols:
            active_cols = cols
        if active_cols:
            parts.extend([f'已检索到符合条件的明细数据，共 {len(all_rows)} 条记录：', '',
                          '| ' + ' | '.join(text(c) for c in active_cols) + ' |',
                          '|' + '|'.join('---' for _ in active_cols) + '|'])
            for r in all_rows[:50]:
                parts.append('| ' + ' | '.join(text(str(r.get(c, '') if r.get(c) is not None else '')) for c in active_cols) + ' |')
            if len(all_rows) > 50:
                parts.append(f'\n*注：仅展示前 50 条明细记录，完整匹配共 {len(all_rows)} 条。*')
        if visible:
            parts.extend(['', '### 核心指标汇总', '', '| 统计指标 | 核算结果 |', '|---|---:|'])
            for fact in visible:
                parts.append(f"| {text(fact['label'])} | {quantity(fact['value'], fact['unit'])} |")
            src_line = _format_facts_source_cells(visible)
            if src_line:
                parts.append(src_line)
    elif visible:
        parts.extend(['已完成数据的核算与多维统计，核心核算结果汇总如下（金额与比例的单位分别标注；数值已四舍五入）：', '',
                      '| 统计指标 / 分组 | 核算结果 |', '|---|---:|'])
        for fact in visible:
            parts.append(f"| {text(fact['label'])} | {quantity(fact['value'], fact['unit'])} |")
        src_line = _format_facts_source_cells(visible)
        if src_line:
            parts.append(src_line)

        # 若用户请求了总计/合计，且当前仅展示了各分组事实而未包含全表总计，则基于已核验的分组事实补充合计行
        has_total = any(
            f.get('group_key') is None
            or re.match(r'^(?:总|合计|总计|全表|all|total)', str(f.get('label') or ''), re.I)
            or re.search(r'(?:总和|总计|合计|总额)$', str(f.get('label') or ''))
            for f in visible
        )
        requires_total = bool(re.search(r'(?:总计|合计|总额|各组和总计|附总计|含总计|核对合计)', prompt))
        group_facts = [f for f in visible if f.get('group_key')]
        if requires_total and not has_total and len(group_facts) >= 2:
            by_unit = {}
            for gf in group_facts:
                u = gf.get('unit')
                try:
                    val = Decimal(str(gf.get('value', '')).replace(',', ''))
                    by_unit.setdefault(u, Decimal('0'))
                    by_unit[u] += val
                except Exception:
                    pass
            for u, tot_dec in by_unit.items():
                tot_lbl = '各组总计'
                parts.append(f"| **{text(tot_lbl)}** | **{quantity(str(tot_dec), u)}** |")
    checks = [c for r in receipts for c in r.data.get('checks', [])]
    if checks:
        parts.extend(['', '| 检查项 | 结果 | 差额 |', '|---|---|---:|'])
        for check in checks:
            parts.append(f"| {text(check['label'])} | {'一致' if check['passed'] else '需核查'} | "
                         f"{quantity(check['residual'], check['unit'])} |")
        parts.append('\n结果仅表示按所列口径比较是否一致；业务假设和差额原因仍需核查。')
    rules = [rule for r in receipts for rule in r.data.get('rules', [])]
    if rules:
        parts.extend(['', '| 数据检查 | 检查记录 | 需核查记录 |', '|---|---:|---:|'])
        for rule in rules:
            parts.append(f"| {text(rule['label'])} | {rule['evaluated_records']} | {rule['violation_count']} |")
        shown_cells = set()
        bullet_lines = []
        for rule in rules:
            if rule.get('violation_count', 0) > 0:
                examples = rule.get('examples', [])
                sample_strs = []
                for x in examples[:3]:
                    if x.get('cell'):
                        shown_cells.add(x['cell'])
                        sample_strs.append(f"`{x.get('cell', '')}` (值: `{x.get('value', '')}`)")
                more_str = f" 等共 {rule['violation_count']} 处" if rule['violation_count'] > len(sample_strs) else ""
                v_rows = rule.get('violation_rows') or []
                rows_note = f"；原表行号：{', '.join(str(r_no) for r_no in v_rows[:200])}" if v_rows else ""
                bullet_lines.append(f"- **{text(rule['label'])}**（{rule['violation_count']} 条）：{'、'.join(sample_strs)}{more_str}{rows_note}")
        for r in receipts:
            d = r.data
            req_fields = set()
            for rule in d.get('rules', []):
                cov = next((c for c in d.get('coverage', []) if c.get('id') == rule.get('table')), None)
                col = rule.get('column', '')
                bound = next((k for k, v in (cov or {}).get('headers', {}).items() if v == col), col.upper())
                req_fields.add((rule.get('table'), bound))
            for p in d.get('profiles', []):
                if p.get('table_duplicate_row_count') is not None:
                    dup_cnt = p['table_duplicate_row_count']
                    dup_rows = p.get('table_duplicate_rows') or []
                    dup_rows_str = f"（原表行号：{', '.join(str(x) for x in dup_rows[:200])}）" if dup_cnt > 0 and dup_rows else ""
                    bullet_lines.append(f"- **全表整行完全重复记录**：{dup_cnt} 条{dup_rows_str}")
                if req_fields and (p.get('table'), p.get('column')) not in req_fields:
                    continue
                if p.get('missing', 0) > 0 and p.get('missing_rows') and not any(
                    rl.get('kind') == 'not_empty' and (rl.get('column') == p.get('header') or rl.get('column') == p.get('column'))
                    for rl in d.get('rules', [])
                ):
                    bullet_lines.append(
                        f"- **{text(p.get('header') or p.get('column'))}缺失记录**（{p['missing']} 条）：原表行号 {', '.join(str(x) for x in p['missing_rows'][:200])}"
                    )
                outliers = [o for o in p.get('numeric', {}).get('outliers', []) if o.get('cell') not in shown_cells]
                if outliers:
                    o_strs = [f"`{o.get('cell', '')}` (值: `{o.get('value', '')}`)" for o in outliers[:3]]
                    bullet_lines.append(f"- **{text(p.get('header') or p.get('column'))}统计极值/离群值（3×IQR）**（{len(outliers)} 条）：{'、'.join(o_strs)}")
        if bullet_lines:
            parts.append('\n需核查记录具体位置与异常值：')
            parts.extend(bullet_lines)
        parts.append('\n以上按声明规则筛查，规则适用性尚需确认；不代表业务合规结论。')
    if not parts:
        parts.append('已完成所选范围的字段概况检查；缺失值、取值分布和位置见下方明细。')
    names = dict.fromkeys(Path(r.provenance['file_path']).name for r in receipts if (r.provenance or {}).get('file_path'))
    if names:
        parts.append('\n数据来源：' + '、'.join('《' + text(name) + '》' for name in names) + '。')
    return '\n'.join(parts)


def query_overview(receipts, contract):
    """Render the engine's final rows in their actual HAVING/ORDER/LIMIT order."""
    parts = []
    for receipt in receipts:
        data = receipt.data
        rows = data.get('rows', [])
        is_zero_rows = not rows or (
            len(rows) == 1 and all(str(v).strip() in ('0', '0.0') or v == 0 for v in rows[0].values())
            and any(k in ('total_records', 'count', 'matched_rows_count') for k in rows[0])
        )
        if is_zero_rows:
            if getattr(contract, 'entity_predicates', None):
                entity_str = '、'.join(contract.entity_predicates)
                parts.append(f'已在当前附件中查询，未找到【{entity_str}】的符合条件明细记录（没有符合条件的结果）。')
            else:
                parts.append('按所述筛选与分组条件执行后，没有符合条件的结果。')
            continue
        metrics = {m['id']: m.get('label', m['id']) for m in data.get('plan', {}).get('metrics', [])}
        units = {}
        for fact in data.get('facts', []):
            for mid in metrics:
                if fact.get('id') == mid or str(fact.get('id', '')).startswith(mid + '__'):
                    units[mid] = fact.get('unit')
        query_plan = data.get('plan', {})
        group_fields = [g if isinstance(g, str) else g.get('alias', g.get('field')) for g in (query_plan.get('group_by') or [])]
        if contract.group_dimension:
            group_fields.append(contract.group_dimension)

        def _col_label(col):
            label = (contract.group_dimension or '分组') if col == 'group_key' else metrics.get(col, col)
            unit = units.get(col)
            return label + (f'（{unit}）' if unit and unit != 'number' and unit not in label else '')

        raw_columns = list(rows[0])
        if 'group_key' in raw_columns and (any(gf in raw_columns for gf in group_fields) or any(c != 'group_key' and _col_label(c) == _col_label('group_key') for c in raw_columns)):
            columns = [c for c in raw_columns if c != 'group_key']
        else:
            columns = raw_columns
        labels = [_col_label(col) for col in columns]
        parts.extend(['按请求执行后的结果如下：', '',
                      '| ' + ' | '.join(text(c) for c in labels) + ' |',
                      '|' + '|'.join('---' for _ in columns) + '|'])
        parts.extend('| ' + ' | '.join(text('' if row.get(c) is None else row.get(c)) for c in columns) + ' |'
                     for row in rows)
        src_line = _format_facts_source_cells(data.get('facts', []))
        if src_line:
            parts.append(src_line)
        for cov in data.get('coverage', []):
            sel_rows = cov.get('selected_rows') or []
            in_cnt = cov.get('input_records', 0)
            if sel_rows and (cov.get('filters') or (in_cnt and len(sel_rows) < in_cnt)) and len(sel_rows) <= 200:
                parts.append(f"\n筛选匹配原表行号（共 {len(sel_rows)} 行）：{', '.join(str(x) for x in sel_rows)}。")
    return '\n'.join(parts)


def comparison_overview(receipts):
    parts = []; seen = set()
    for receipt in receipts:
        data = receipt.data; provenance = receipt.provenance or {}
        basis = data['basis']; unit = data.get('value_unit')
        visible_series = []
        for series in data['results']:
            matches = []
            for match in series['matches']:
                key = (provenance['workbook_id'], basis, data['rank_by'], data['extreme'],
                       tuple(sorted(match['source'].items())))
                if key not in seen:
                    seen.add(key); matches.append(match)
            if matches:
                visible_series.append({**series, 'matches': matches})
        if not visible_series:
            continue
        left, right, baseline = {
            'budget': ('实际', '预算', '预算'), 'target': ('实际', '目标', '目标'),
            'yoy': ('本期', '去年同期', '去年同期'), 'mom': ('本期', '上期', '上期'),
        }.get(basis, ('对比值', '基准值', '基准'))
        ranking = {'absolute_difference': '绝对差额', 'difference': '有符号差额',
                   'absolute_relative_difference': '绝对偏差率'}[data['rank_by']]
        extreme = '最大' if data['extreme'] == 'max' else '最小'
        parts.append(f'按{baseline}比较，以下分组的{ranking}{extreme}（并列结果全部保留）。')
        conclusions = []
        for series in visible_series:
            matches = series['matches']
            groups = '、'.join(text(match['group']) for match in matches)
            if not matches:
                continue
            # Tied rank values may have different signed deltas, so keep the
            # individual deltas in the table rather than generalizing a tie.
            tail = ''
            if len(matches) == 1:
                values = matches[0].get('exact', matches[0])
                tail = f"，差额为 **{quantity(values['difference'], unit)}**"
            conclusions.append(f"- **{text(series['label'])}**：{ranking}{extreme}的分组为 **{groups}**"
                               + ('（并列）' if len(matches) > 1 else '') + tail + '。')
        parts.extend(['', *dict.fromkeys(conclusions), ''])
        if unit:
            kind = '金额' if unit in {'元', '千元', '万元', '亿元'} else '数值'
            parts.append(f'{kind}单位：{text(unit)}。差额＝{left}－{right}；正数表示高于{baseline}，负数表示低于{baseline}。')
        else:
            parts.append(f'差额＝{left}－{right}；原件单位未声明，未进行单位换算。')
        parts.extend(['', f'| 指标 | 分组 | {left} | {right} | 差额 | 偏差率 |',
                      '|---|---|---:|---:|---:|---:|'])
        for series in visible_series:
            for match in series['matches']:
                values = match.get('exact', match)
                relative = values['relative_difference']
                rate = (number(Decimal(str(relative)) * 100, signed=True) + '%'
                        if relative is not None else '不适用（基准为零）')
                parts.append(f"| {text(series['label'])} | {text(match['group'])} | {number(values['left'])} | "
                             f"{number(values['right'])} | {number(values['difference'], signed=True)} | {rate} |")
        parts.append(f'\n已比较所选范围内的 {data["scope"]["row_count"]} 个分组。偏差率＝差额÷基准绝对值。')
    return '\n'.join(parts)


def render_unverified_guidance(state, prompt="", failed_detail=""):
    """生成当数据缺失或无法计算时的明确原因说明与用户输入引导。"""
    missing_metrics = state.get("missing_metrics", [])
    issues = state.get("issues", [])

    reasons = []
    guidances = []

    if missing_metrics:
        unverified = [m for m in missing_metrics if m.get('execution_evidence_exists')]
        uncalc = [m for m in missing_metrics if m.get('source_column_exists')
                  and not m.get('execution_evidence_exists')]
        gen_miss = [m for m in missing_metrics if m.get('source_column_exists') is False
                    and not m.get('execution_evidence_exists')]
        unknown = [m for m in missing_metrics if m.get('source_column_exists') is None
                   and not m.get('execution_evidence_exists')]
        if unverified:
            names = '、'.join(f"【{m['name']}】" for m in unverified)
            reasons.append(f"本轮已有 {names} 的计算结果，但这些结果尚未通过来源或口径核验。")
        if uncalc:
            names = '、'.join(f"【{m['name']}】" for m in uncalc)
            source_cols = '、'.join(f"【{c}】" for m in uncalc for c in m.get('matched_source_columns', []))
            reasons.append(f"表格中已存在对应列（{source_cols}），但本轮分析计划尚未执行对 {names} 的聚合计算。")
            guidances.append(f"本轮执行尚未完成对 {names} 的聚合计算，可重新提交分析请求以生成汇总事实。")
        if gen_miss:
            names = '、'.join(f"【{m['name']}】" for m in gen_miss)
            reasons.append(f"表格中缺少计算 {names} 所需的原始列或对应数据。")
            guidances.append(f"请补充提供包含 {names} 对应原始列的工作表，或告知具体的计算口径与公式。")
        if unknown:
            names = '、'.join(f"【{m['name']}】" for m in unknown)
            reasons.append(f"本轮尚未核实 {names} 的来源字段，不能据此认定原件缺列。")
            guidances.append('应先核实实际工作表和表头，修正执行计划；无需修改原件或重复授权。')

    for issue in issues:
        code = issue.get("code")
        msg = issue.get("message", "")
        if code == "comparison_windows_missing":
            reasons.append("您提出了对比变化或分析趋势的需求，但当前数据范围缺少可对比的其他期间数据。")
            guidances.append("请补充其他期间（如去年同期、上月或不同季度）的数据区域或说明对比基准。")
        elif code == "execution_evidence_missing":
            reasons.append("本次还没有取得可核验的计算结果，暂不能判断是否缺少业务数据。")
            available_sheets = state.get('available_sheets', [])
            if len(available_sheets) == 1:
                reasons.append(f"当前工作表为【{available_sheets[0]}】。")
            elif available_sheets:
                reasons.append('已有工作表：' + '、'.join(available_sheets) + '。')
            guidances.append("可以重试本次分析；系统需要先完成工作表与字段核对。")
        elif code == "grouping_incomplete":
            reasons.append("本次尚未完成您要求的各分组统计。")
            guidances.append("可以重试分组统计；现有数据不会被当作完整分组结果。")
        elif code == 'unsolicited_filter_applied':
            reasons.append("当前执行包含了未经请求的过滤条件，导致核算口径偏离。")
            guidances.append("建议重试并移除不必要的行过滤条件。")
        elif code == 'audit_checks_incomplete':
            reasons.append(msg or "本次尚未完整执行您要求的多项合规检查规则。")
            guidances.append("建议继续执行剩余检查项，或分步针对未完成的异常规则发起核对。")
        elif code in ('group_filter_not_applied', 'ordering_not_applied', 'ranking_limit_not_applied',
                      'query_stages_disconnected', 'row_filter_not_applied', 'group_filter_boolean_incomplete',
                      'distinct_not_applied', 'ordering_incomplete'):
            reasons.append("本次尚未完整执行您要求的筛选、排序或结果数量限制。")
            guidances.append("可以重试本次查询；无需修改原表或提供工具参数。")
        elif code == 'clarification_first_required':
            reasons.append('您要求先确认定义，本轮尚未完成口径确认。')
            guidances.append('请说明希望采用的定义；确认后再继续计算。')
        elif code not in ("required_metrics_missing", "comparison_windows_missing", "execution_evidence_missing") and msg:
            reasons.append(msg)

    if failed_detail:
        reasons.append(failed_detail.strip())

    if not reasons:
        reasons.append("当前数据不满足任务完整计算与核验的必要条件。")
    if not guidances:
        guidances.append("可以重试本次分析；如果涉及业务定义，也可以说明希望采用的口径。")

    parts = ["本次分析尚未通过执行证据核验。\n", "### 分析未完成说明", "", "**无法完成计算的原因：**"]
    for r in dict.fromkeys(reasons):
        parts.append(f"- {r}")

    parts.append("\n**下一步处理建议：**")
    for idx, g in enumerate(dict.fromkeys(guidances), 1):
        parts.append(f"{idx}. {g}")

    parts.append("\n尚未验证的项目不会被列为完成。")
    return "\n".join(parts)
