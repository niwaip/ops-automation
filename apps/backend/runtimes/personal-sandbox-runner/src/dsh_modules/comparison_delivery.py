"""Compile comparison receipts into answers; model prose is never a numeric input."""

import hashlib
from pathlib import Path
from decimal import Decimal

from .comparison_evidence import comparison_evidence_error, comparison_plan_error
from .spreadsheet_analysis_evidence import escape, format_value
from .report_presentation import comparison_overview, with_sources


COMPARISON_DELIVERY_INSTRUCTIONS = """
【Comparison Evidence Delivery】
按实际来源确定列对、基准、分组、范围及排序，调用compare_spreadsheet_columns。
工具返回成功回执后，程序呈现已核验极值和并列结果；不要手工追加数字、排名或原因。
结构不足时读取指定工作表；失败时修正具体参数。历史答案不构成本轮证据。
"""


def compile_comparison_response(contract, evidence):
    parts = []; seen = set(); successful = []
    for receipt in evidence:
        data = receipt.data
        if not receipt.is_success or not isinstance(data, dict) or data.get("kind") != "column_comparison":
            continue
        error = comparison_plan_error(contract, receipt)
        if error:
            return None, error
        provenance = receipt.provenance or {}
        try:
            if hashlib.sha256(Path(provenance["file_path"]).read_bytes()).hexdigest() != provenance["workbook_id"]:
                return None, "原件已变化，本轮比较证据失效。"
        except (OSError, KeyError):
            return None, "比较来源或哈希凭据不可用。"
        scope = data["scope"]
        if not scope["groups"] or scope["row_count"] != len(scope["groups"]):
            return None, "声明范围的分组覆盖不完整。"
        if scope.get("expected_groups") is not None and not scope.get("coverage_verified"):
            return None, "声明的预期分组尚未通过覆盖核验。"
        successful.append(receipt)
        unit = data.get("value_unit") or "原件未声明或无法唯一确认，未换算"
        rank = {"absolute_difference": "绝对差额", "difference": "有符号差额",
                "absolute_relative_difference": "绝对相对差额"}[data["rank_by"]]
        parts.append(f"来源：{escape(Path(provenance['file_path']).name)}，{escape(provenance['sheet'])}!{scope['data_range']}；"
                     f"处理声明范围内{scope['row_count']}个分组。证据 `{data.get('evidence_id', provenance['workbook_id'][:16])}`。")
        parts.append(f"比较基准：{escape(data['basis'])}；按{rank}取{'最大' if data['extreme']=='max' else '最小'}值，保留并列。"
                     f"差额＝左值－基准；相对差额＝差额/abs(基准)。来源单位：{escape(unit)}。")
        parts.extend(["", "| 指标 | 分组 | 左值 | 基准 | 差额 | 绝对差额 | 相对差额 | 排序值 | 来源坐标 |",
                      "|---|---|---:|---:|---:|---:|---:|---:|---|"])
        for series in data["results"]:
            for match in series["matches"]:
                key = (provenance["workbook_id"], data["basis"], data["rank_by"], data["extreme"],
                       tuple(sorted(match["source"].items())))
                if key in seen:
                    continue
                seen.add(key)
                values = match.get("exact", match)
                relative = values["relative_difference"]
                rate = format_value(Decimal(str(relative))*100)+"%" if relative is not None else "未定义（基准为零）"
                score = (format_value(Decimal(match['score'])*100)+"%"
                         if data['rank_by']=='absolute_relative_difference' else format_value(match['score']))
                parts.append(f"| {escape(series['label'])} | {escape(match['group'])} | {format_value(values['left'])} | "
                             f"{format_value(values['right'])} | {format_value(values['difference'])} | "
                             f"{format_value(abs(Decimal(str(values['difference']))))} | {rate} | {score} | "
                             f"{escape(', '.join(match['source'].values()))} |")
    if not successful:
        return None, "缺少本轮成功执行的列比较回执。"
    rendered = "\n".join(parts)
    error = comparison_evidence_error(contract, rendered, successful)
    if error:
        return None,error
    main = comparison_overview(successful)
    error = comparison_evidence_error(contract, main, successful)
    if error:
        return None,error
    last_success=max(i for i,r in enumerate(evidence) if r in successful)
    pending=[r for r in evidence[last_success+1:] if r.is_error]
    if pending:
        main+='\n\n后续计划未执行成功，以下项目未列为完成：\n'
        main+='\n'.join(f'- {escape(r.error_code)}：{escape(r.error_message)}。' for r in pending)
    return with_sources(main, rendered, successful),None
