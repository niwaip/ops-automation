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


def analysis_overview(receipts, prompt):
    facts = []; seen = set(); parts = []
    for receipt in receipts:
        for fact in receipt.data.get('facts', []):
            key = fact_identity(fact, receipt.data, receipt.provenance)
            if key not in seen:
                seen.add(key); facts.append(fact)
    metrics = build_analysis_contract(prompt).metrics
    def matches(fact, metric):
        if fact.get('metric_id') and metric.semantic_id:
            return fact['metric_id'] == metric.semantic_id
        return any(re.search(alias, fact['label']) for alias in metric.aliases)
    requested = [fact for fact in facts if any(matches(fact, metric) for metric in metrics)]
    visible = requested or facts
    if visible:
        parts.extend(['核算结果如下。金额与比例的单位分别标注；展示数值已四舍五入。', '',
                      '| 指标 | 结果 |', '|---|---:|'])
        for fact in visible:
            parts.append(f"| {text(fact['label'])} | {quantity(fact['value'], fact['unit'])} |")
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
        has_violations = any(r.get('violation_count', 0) > 0 for r in rules)
        if has_violations:
            parts.append('\n需核查记录具体位置与异常值：')
            for rule in rules:
                if rule.get('violation_count', 0) > 0:
                    examples = rule.get('examples', [])
                    sample_strs = [f"`{x.get('cell', '')}` (值: `{x.get('value', '')}`)" for x in examples[:3] if x.get('cell')]
                    more_str = f" 等共 {rule['violation_count']} 处" if rule['violation_count'] > len(sample_strs) else ""
                    parts.append(f"- **{text(rule['label'])}**（{rule['violation_count']} 条）：{'、'.join(sample_strs)}{more_str}")
        parts.append('\n以上按声明规则筛查，规则适用性尚需确认；不代表业务合规结论。')
    if not parts:
        parts.append('已完成所选范围的字段概况检查；缺失值、取值分布和位置见下方明细。')
    names = dict.fromkeys(Path(r.provenance['file_path']).name for r in receipts)
    parts.append('\n数据来源：' + '、'.join('《' + text(name) + '》' for name in names) + '。')
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
        metric_names = "、".join(f"【{m.get('name', m.get('metric_id', ''))}】" for m in missing_metrics)
        reasons.append(f"表格中缺少计算 {metric_names} 所需的原始列或对应数据。")
        guidances.append(f"请补充提供包含 {metric_names} 对应原始列的工作表，或告知具体的计算口径与公式。")

    for issue in issues:
        code = issue.get("code")
        msg = issue.get("message", "")
        if code == "comparison_windows_missing":
            reasons.append("您提出了对比变化或分析趋势的需求，但当前数据范围缺少可对比的其他期间数据。")
            guidances.append("请补充其他期间（如去年同期、上月或不同季度）的数据区域或说明对比基准。")
        elif code == "execution_evidence_missing":
            reasons.append("未能在表格中识别或定位到符合分析要求的有效数据区域。")
            guidances.append("请明确指定分析所需的工作表（Sheet）名称以及数据所在的大致行列范围。")
        elif code not in ("required_metrics_missing", "comparison_windows_missing", "execution_evidence_missing") and msg:
            reasons.append(msg)

    if failed_detail:
        reasons.append(failed_detail.strip())

    if not reasons:
        reasons.append("当前数据不满足任务完整计算与核验的必要条件。")
    if not guidances:
        guidances.append("您可以补充更详细的业务说明、计算公式或上传完整的数据表格以继续分析。")

    parts = ["本次分析尚未通过执行证据核验。\n", "### 分析未完成说明", "", "**无法完成计算的原因：**"]
    for r in dict.fromkeys(reasons):
        parts.append(f"- {r}")

    parts.append("\n**建议您补充以下信息以继续：**")
    for idx, g in enumerate(dict.fromkeys(guidances), 1):
        parts.append(f"{idx}. {g}")

    parts.append("\n尚未验证的项目不会被列为完成。")
    return "\n".join(parts)
