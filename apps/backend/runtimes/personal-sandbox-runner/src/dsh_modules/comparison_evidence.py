"""Validate column-comparison claims against current-turn, unabridged execution evidence."""

import hashlib
import re
from decimal import Decimal
from pathlib import Path
from .tool_result import ToolResult, TextToolOutput
from .analysis_contract import build_analysis_contract
from .spreadsheet_units import AMOUNT_UNIT_FACTORS


def _contains_metric(metric, text):
    return any(re.search(p, text, re.I) for p in [re.escape(metric.name)] + metric.aliases)


def _contains_number(text, value, allow_absolute=False, percentage=False, value_unit=None):
    text = text.replace("−", "-").replace("，", ",")
    text = re.sub(r"\d+\s*[年月]", "", text)
    for match in re.finditer(r"(?<![\d.])([+-]?\d[\d,]*(?:\.\d+)?)[*_\s]*(%|亿元|万元|千元|元)?", text):
        if (match.group(2) == "%") != percentage:
            continue
        raw = match.group(1).replace(",", "")
        candidate = Decimal(raw)
        scale = Decimal(AMOUNT_UNIT_FACTORS.get(match.group(2), 1)) / Decimal(AMOUNT_UNIT_FACTORS[value_unit]) if value_unit and match.group(2) in AMOUNT_UNIT_FACTORS else Decimal(1)
        candidate *= scale
        expected = Decimal(str(value)) * (100 if percentage else 1)
        tolerance = Decimal("0.5") * Decimal(10) ** (-len(raw.partition(".")[2])) * scale
        if abs(candidate-expected) <= tolerance or (allow_absolute and abs(abs(candidate)-abs(expected)) <= tolerance):
            return True
    return False


def comparison_plan_error(contract, result):
    """Reject mismatched tool plans immediately, before the model interprets values."""
    if (not result.is_success or not isinstance(result.data, dict)
            or result.data.get("kind") != "column_comparison" or contract.comparison != "variance"):
        return None
    data = result.data
    rank = {"absolute": "absolute_difference", "signed": "difference", "rate": "absolute_relative_difference"}.get(contract.ranking)
    if (data.get("rank_by") != rank
            or data.get("extreme") != ("min" if contract.operation == "argmin" else "max")):
        return f"列比较计划与任务排序不一致：需要 rank_by={rank}，操作={contract.operation}。不能自行改成另一种比率或排序。"
    if contract.comparison_basis and data.get("basis") != contract.comparison_basis:
        return "列比较计划改变了用户明确指定的基准：" + contract.comparison_basis
    for series in data.get("results", []):
        identity = " ".join(series.get("left_headers", []))
        if contract.comparison_basis == "cross_metric":
            identity += " " + " ".join(series.get("right_headers", []))
        relevant = [metric for metric in contract.metrics if _contains_metric(metric, identity)]
        if not relevant:
            return "列比较计划包含未能由来源表头确认的请求指标。"
        if contract.comparison_basis != "cross_metric":
            baseline = " ".join(series.get("right_headers", []))
            if any(other.name != metric.name and _contains_metric(other, baseline)
                   for metric in relevant for other in contract.metrics):
                return "列比较基准包含另一个被请求指标；不能把跨指标相减作为同指标偏差。"
    covered = []
    for metric in contract.metrics:
        found = False
        for series in data.get("results", []):
            identity = " ".join(series.get("left_headers", []))
            if contract.comparison_basis == "cross_metric":
                identity += " " + " ".join(series.get("right_headers", []))
            if not _contains_metric(metric, identity):
                continue
            if contract.comparison_basis != "cross_metric":
                baseline = " ".join(series.get("right_headers", []))
                if any(other.name != metric.name and _contains_metric(other, baseline) for other in contract.metrics):
                    continue
            found = True
            break
        if found:
            covered.append(metric.name)
    if not covered:
        return ("本次列对未覆盖请求指标的有效比较。用户没有明确指定跨指标相减时，"
                "不能把另一个被请求指标作为它的基准。请回到真实表头确认同指标的预算/目标/上期等基准。")
    # One invocation may cover a subset. Final validation aggregates current-turn
    # evidence and requires every requested metric; do not reject valid partial work.
    return None


def validate_execution_output(prompt, output):
    """Generic dispatcher adapter; preserve legacy and non-comparison tool outputs."""
    result = getattr(output, "tool_result", None)
    if not isinstance(result, ToolResult):
        return output
    error = comparison_plan_error(build_analysis_contract(prompt or ""), result)
    if not error:
        return output
    columns = [{k: s.get(k) for k in ("label", "left_headers", "right_headers")} for s in result.data.get("results", [])]
    rejected = ToolResult.error("comparison_plan_mismatch", error,
                               data={"observed_columns": columns, "requested_plan": result.data.get('plan',{})}, provenance=result.provenance)
    return TextToolOutput(rejected.to_json(), rejected)


def comparison_evidence_error(contract, reply, evidence):
    """Return a reason when a stated comparison extreme lacks matching execution proof.

    None evidence retains the legacy validator API; the running agent always supplies
    a current-turn list. Saved chat text and model-generated JSON are never proof.
    Business interpretation remains the model's responsibility; supplied parameters,
    numeric computation, declared coverage and answer consistency are checked here.
    """
    if (evidence is None or contract.operation not in ("argmax", "argmin")
            or contract.comparison != "variance"):
        return None
    expected_rank = {"absolute": "absolute_difference", "signed": "difference", "rate": "absolute_relative_difference"}[contract.ranking]
    candidates = []
    for result in evidence:
        if not result.is_success or not isinstance(result.data, dict) or result.data.get("kind") != "column_comparison":
            continue
        data, provenance = result.data, result.provenance or {}
        if comparison_plan_error(contract, result):
            continue
        if data.get("extreme") != ("max" if contract.operation == "argmax" else "min") or data.get("rank_by") != expected_rank:
            continue
        if contract.comparison_basis and data.get("basis") != contract.comparison_basis:
            continue
        try:
            if hashlib.sha256(Path(provenance["file_path"]).read_bytes()).hexdigest() != provenance.get("workbook_id"):
                continue
        except (OSError, KeyError):
            continue
        candidates.extend({**series, "basis": data.get("basis"), "value_unit": data.get("value_unit")} for series in data.get("results", []))
    if not candidates:
        return "缺少本轮成功执行、与请求口径及排序一致的列比较证据；历史回复、数字或年份不能替代核算。"
    missing = []
    for metric in contract.metrics:
        matched = False
        for series in candidates:
            identity = " ".join(series.get("left_headers", []))
            if contract.comparison_basis == "cross_metric":
                identity += " " + " ".join(series.get("right_headers", []))
            if not _contains_metric(metric, identity):
                continue
            if series.get("basis") == "budget" and not any("预算" in h or "目标" in h or "计划" in h for h in series.get("right_headers", [])):
                continue
            # Use the model-specified label to associate narrative/table rows, while
            # using physical source headers above to verify the metric's identity.
            segments = [s for s in re.split(r"[。\n；;]", reply or "")
                        if _contains_metric(metric, s) or series.get("label", "\0") in s]
            # A Markdown section can put the metric in its heading and the
            # group/value on separate lines. Keep that section's identity scoped.
            for section in re.split(r"\n(?=#{1,6}\s)", reply or ""):
                heading = section.split("\n", 1)[0]
                if (re.match(r"#{1,6}\s", heading) and _contains_metric(metric, heading)
                        and not any(other.name != metric.name and _contains_metric(other, heading)
                                    for other in contract.metrics)):
                    segments.append(section)
            unit = series.get("value_unit")
            if unit and contract.ranking != "rate":
                if not re.search(r"亿元|万元|千元|(?<![千亿万])元", reply or ""):
                    return f"回复未说明来源金额单位【{unit}】，不能省略单位后发布数值。"
                for match in series.get("matches", []):
                    for segment in segments:
                        if match["group"] not in segment:
                            continue
                        for quantity in re.finditer(r"[+-]?\d[\d,]*(?:\.\d+)?[*_\s]*(?:亿元|万元|千元|元)", segment):
                            text = quantity.group(0)
                            for value in (match["left"], match["right"], match["difference"]):
                                if (_contains_number(text, value, allow_absolute=True)
                                        and not _contains_number(text, value, allow_absolute=True, value_unit=unit)):
                                    return f"回复金额单位或换算与来源【{unit}】不一致：{text}。"
            checks = []
            for match in series.get("matches", []):
                value = match["relative_difference"] if contract.ranking == "rate" else match["difference"]
                checks.append(any(match["group"] in segment and _contains_number(
                    segment, value, allow_absolute=contract.ranking == "absolute", percentage=contract.ranking == "rate",
                    value_unit=unit)
                                  for segment in segments))
            if checks and all(checks):
                matched = True
                break
        if not matched:
            missing.append(metric.name)
    if missing:
        return "回复的指标、极值分组或偏差数值与本轮来源证据不一致：" + "、".join(missing)
    return None
