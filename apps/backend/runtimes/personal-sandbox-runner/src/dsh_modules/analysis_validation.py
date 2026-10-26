"""
AnalysisValidation: Metric-by-metric contract verification and task completion guard.
Verifies that all required deliverables in AnalysisContract are concretely satisfied.
Prevents false-pass on single-metric answers, filters year hallucinations (e.g. '2026年'),
and prevents silent pass on round-budget exhaustion.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

from dsh_modules.analysis_contract import AnalysisContract, MetricRequirement


@dataclass
class MetricValidationDetail:
    metric_name: str
    satisfied: bool
    detected_value_text: Optional[str] = None
    is_year_hallucination: bool = False


@dataclass
class ContractValidationResult:
    status: str  # "satisfied" | "partial" | "failed" | "evasive"
    satisfied_metrics: List[str] = field(default_factory=list)
    missing_metrics: List[str] = field(default_factory=list)
    has_evasion: bool = False
    details: Dict[str, MetricValidationDetail] = field(default_factory=dict)
    feedback_message: Optional[str] = None
    comparison_error: Optional[str] = None

    @property
    def is_pass(self) -> bool:
        return self.status == "satisfied"


MONTH_PATTERN = r'(?<!\d)(?<![至到~–—-])(?:1[0-2]|[1-9])\s*月(?:度|份)?(?![至到~–—-])'


def _extract_metric_value_from_reply(
    metric: MetricRequirement,
    reply_text: str,
    contract: Optional[AnalysisContract] = None
) -> Tuple[bool, Optional[str], bool]:
    """
    Finds whether a metric is concretely satisfied in the reply text.
    Returns: (is_satisfied, detected_value_str, is_year_hallucination)
    Guards against:
    - Year numbers (e.g. '2026年') being mistaken for values.
    - Percentage values (e.g. '75%') being mistaken for currency/amount values.
    - Extreme/argmax monthly inquiries without specific month attribution.
    - Non-answers like '尚未计算' / '暂无数据' without numbers.
    """
    if not reply_text:
        return False, None, False

    # Search for metric name or any alias
    clean_name = re.sub(
        r'^(?:(?:各|该|所有)?附件(?:中|里|内)?的?|(?:各|该)?工作表(?:中|里|内)?的?|(?:各|该)?表格(?:中|里|内)?的?|文件(?:中|里|内)?的?|数据(?:中|里|内)?的?|表内的?|其中的?|对应的?|相关的?|上述(?:的)?)',
        '',
        metric.name
    ).strip()
    pattern_terms = [re.escape(metric.name)]
    if clean_name and clean_name != metric.name:
        pattern_terms.append(re.escape(clean_name))
        pattern_terms.append(re.escape(clean_name) + r'(?:汇总|总额|总计|合计)?')
    for p in metric.aliases:
        if p not in pattern_terms:
            pattern_terms.append(p)
    if clean_name:
        summary_pat = re.escape(clean_name) + r'(?:汇总|总额|总计|合计)?'
        if summary_pat not in pattern_terms:
            pattern_terms.append(summary_pat)
    combined_pat = "|".join(pattern_terms)

    requires_month = bool(contract and contract.dimension == "month")
    is_variance_task = bool(contract and contract.comparison == "variance")

    # Split into sentences or lines
    segments = re.split(r'[。\n\r；;]', reply_text)
    is_year_hallucination = False

    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        if not re.search(combined_pat, seg, re.IGNORECASE):
            continue

        # 检查是否包含具体月份
        has_month = bool(re.search(MONTH_PATTERN, seg))
        if requires_month and not has_month:
            # 该句提及指标但未关联具体月份，不能作为月度极值分析结论
            continue

        # 提取候选数值 (支持前缀货币符号 ¥ / $ / ￥ 等)
        num_matches = list(re.finditer(r'([¥￥$€]\s*)?([+-]?[\d,]+(?:\.\d+)?)\s*(%|万元|千元|亿元|元|件|个|笔|[kKmM])?', seg))
        valid_candidates = []

        for nm in num_matches:
            curr_prefix = nm.group(1) or ""
            raw_num = nm.group(2).replace(",", "")
            unit = nm.group(3) or ("元" if curr_prefix.strip() in ("¥", "￥") else "")
            after_context = seg[nm.end():nm.end() + 15]

            # 排除紧跟“月”或“年”的日期数字 (如 12月, 2026年)
            if re.match(r'^\s*[年月]', after_context):
                if re.match(r'^(?:19|20)\d{2}$', raw_num) and "年" in after_context:
                    is_year_hallucination = True
                continue

            # 排除年份数字混淆 (例如 19xx 或 20xx 且无货币单位)
            if re.match(r'^(?:19|20)\d{2}$', raw_num) and not unit and not curr_prefix:
                is_year_hallucination = True
                if any(k in after_context for k in ("尚未", "未", "暂无", "缺少", "不存在", "总结", "年度", "年")):
                    continue

            is_pct = (unit == "%" or "%" in after_context[:3])

            if metric.expected_type == "percentage":
                if is_pct:
                    valid_candidates.append(f"{raw_num}%")
                else:
                    try:
                        f_val = float(raw_num)
                        if 0.0 <= f_val <= 1.0:
                            valid_candidates.append(f"{raw_num} (比率)")
                    except Exception:
                        pass
            elif metric.expected_type == "number":
                # 数值/金额类指标：严禁把纯百分比（如 75%）误作金额
                if is_pct:
                    # 仅在方差/偏差任务且明确声明为偏差率/差异率且已关联月份时，允许作为比率结论
                    if is_variance_task and re.search(r'(?:偏差率|差异率|偏离度|达成率)', seg) and has_month:
                        valid_candidates.append(f"{raw_num}% (偏差率)")
                    continue
                val_text = f"{raw_num}{unit}" if unit else raw_num
                valid_candidates.append(val_text)
            else:
                val_text = f"{raw_num}{unit}" if unit else raw_num
                valid_candidates.append(val_text)

        if valid_candidates:
            # 优先选择带单位或带有正负号的数值作为更精确的交付证据
            best_val = valid_candidates[-1]
            for cand in valid_candidates:
                if any(u in cand for u in ("万元", "千元", "亿元", "元", "%", "+", "-", "K", "k", "M", "m")):
                    best_val = cand
                    break
            return True, best_val, False

    # 额外支持：解析 Markdown 表格中与指标列对应的单元格数值
    table_lines = [line.strip() for line in reply_text.splitlines() if line.strip().startswith("|") and line.strip().endswith("|")]
    if table_lines:
        target_col_indices: List[int] = []
        for line in table_lines:
            cols = [c.strip() for c in line.strip("|").split("|")]
            # 检查是否为表头分隔行 (e.g. | :--- | :---: |)
            if all(re.match(r'^:?-+:?$', c) for c in cols if c):
                continue
            # 检查是否为包含目标指标的表头行
            matching_indices = [idx for idx, c in enumerate(cols) if re.search(combined_pat, c, re.IGNORECASE)]
            if matching_indices:
                target_col_indices = matching_indices
                continue
            # 若已有匹配的表头列，提取对应单元格中的数值
            if target_col_indices:
                for col_idx in target_col_indices:
                    if col_idx < len(cols):
                        cell_val = cols[col_idx]
                        num_m = re.search(r'([¥￥$€]\s*)?([+-]?[\d,]+(?:\.\d+)?)\s*(%|万元|千元|亿元|元|件|个|笔)?', cell_val)
                        if num_m:
                            curr_p = num_m.group(1) or ""
                            raw_n = num_m.group(2).replace(",", "")
                            unit_s = num_m.group(3) or ("元" if curr_p.strip() in ("¥", "￥") else "")
                            try:
                                float(raw_n)
                                val_str = f"{raw_n}{unit_s}" if unit_s else raw_n
                                return True, val_str, False
                            except ValueError:
                                pass

    # 额外支持：解析 HTML 表格 (<table><tr><th>...</th></tr><tr><td>...</td></tr></table>)
    if "<table" in reply_text.lower() or "<tr" in reply_text.lower():
        tr_blocks = re.findall(r'<tr[^>]*>(.*?)</tr>', reply_text, re.DOTALL | re.IGNORECASE)
        target_html_col_indices: List[int] = []
        for tr in tr_blocks:
            th_cells = re.findall(r'<th[^>]*>(.*?)</th>', tr, re.DOTALL | re.IGNORECASE)
            td_cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
            if th_cells:
                th_clean = [re.sub(r'<[^>]+>', '', c).strip() for c in th_cells]
                matching_indices = [idx for idx, c in enumerate(th_clean) if re.search(combined_pat, c, re.IGNORECASE)]
                if matching_indices:
                    target_html_col_indices = matching_indices
                    continue
            if td_cells and target_html_col_indices:
                td_clean = [re.sub(r'<[^>]+>', '', c).strip() for c in td_cells]
                for col_idx in target_html_col_indices:
                    if col_idx < len(td_clean):
                        cell_val = td_clean[col_idx]
                        num_m = re.search(r'([¥￥$€]\s*)?([+-]?[\d,]+(?:\.\d+)?)\s*(%|万元|千元|亿元|元|件|个|笔|[kKmM])?', cell_val)
                        if num_m:
                            curr_p = num_m.group(1) or ""
                            raw_n = num_m.group(2).replace(",", "")
                            unit_s = num_m.group(3) or ("元" if curr_p.strip() in ("¥", "￥") else "")
                            try:
                                float(raw_n)
                                val_str = f"{raw_n}{unit_s}" if unit_s else raw_n
                                return True, val_str, False
                            except ValueError:
                                pass

    # 额外支持：解析 JS 图表配置与数据 (Chart.js / ECharts / 包含 label 与 data 数组/对象的配置)
    if any(k in reply_text.lower() for k in ("chart", "dataset", "canvas", "deptchart", "data.map")):
        chart_label_match = re.search(
            r'(?:label|name)\s*:\s*[\'"][^\'"]*(?:' + combined_pat + r')[^\'"]*[\'"]',
            reply_text,
            re.IGNORECASE
        )
        if chart_label_match:
            scope = reply_text[max(0, chart_label_match.start() - 500):chart_label_match.start() + 1500]
            num_m = re.search(r'(?:value|data)\s*:\s*(?:\[\s*)?([+-]?[\d,]+(?:\.\d+)?)', scope)
            if num_m:
                raw_n = num_m.group(1).replace(",", "")
                try:
                    float(raw_n)
                    return True, raw_n, False
                except ValueError:
                    pass

    # 额外支持：剥离 HTML 标签后的文本中继续寻找包含指标的段落
    if "<" in reply_text and ">" in reply_text:
        stripped_text = re.sub(r'<[^>]+>', ' ', reply_text)
        stripped_segments = re.split(r'[。\n\r；;]', stripped_text)
        for s_seg in stripped_segments:
            s_seg = s_seg.strip()
            if not s_seg or not re.search(combined_pat, s_seg, re.IGNORECASE):
                continue
            num_m = re.search(r'([¥￥$€]\s*)?([+-]?[\d,]+(?:\.\d+)?)\s*(%|万元|千元|亿元|元|件|个|笔|[kKmM])?', s_seg)
            if num_m:
                curr_p = num_m.group(1) or ""
                raw_n = num_m.group(2).replace(",", "")
                unit_s = num_m.group(3) or ("元" if curr_p.strip() in ("¥", "￥") else "")
                try:
                    float(raw_n)
                    val_str = f"{raw_n}{unit_s}" if unit_s else raw_n
                    return True, val_str, False
                except ValueError:
                    pass

    return False, None, is_year_hallucination


def validate_reply_against_contract(
    contract: AnalysisContract,
    reply_text: str,
    round_idx: int,
    max_rounds: int,
    messages: Optional[List[Dict[str, Any]]] = None,
    execution_evidence: Optional[List[Any]] = None
) -> ContractValidationResult:
    """
    Validates agent reply against the dynamic AnalysisContract:
    1. Detects evasion / requests for repetitive authorization.
    2. Performs metric-by-metric verification.
    3. Handles budget exhaustion without false-pass.
    """
    if not contract.has_metrics:
        # No specific metrics required, pass through
        return ContractValidationResult(status="satisfied")

    # 1. 检查是否存在消极反问或推脱
    evasion_patterns = [
        r'请问是否需要(?:我)?',
        r'是否需要我(?:继续)?',
        r'是否从.*提取',
        r'是否读取',
        r'如需.*请告知',
        r'请确认是否',
        r'需要您授权',
        r'请问是否从',
        r'若您需要.*请告诉我',
    ]
    has_evasion = any(re.search(p, reply_text or "") for p in evasion_patterns)

    from .comparison_evidence import comparison_evidence_error
    comparison_error = comparison_evidence_error(contract, reply_text, execution_evidence)

    # 2. 逐项核验指标
    satisfied_metrics = []
    missing_metrics = []
    details: Dict[str, MetricValidationDetail] = {}

    for metric in contract.metrics:
        sat, val_str, is_year = _extract_metric_value_from_reply(metric, reply_text or "", contract=contract)
        if comparison_error:
            sat, val_str = False, None
        elif (execution_evidence is not None and contract.operation in ("argmax", "argmin")
              and contract.comparison == "variance"):
            # Source-bound comparison validation already checked every metric,
            # group and value. A weaker same-line heuristic must not override it.
            sat, val_str, is_year = True, val_str or "本轮极值证据已核验", False
        else:
            if not sat:
                # 兼容表格更新交付场景：若当前任务包含表格更新/修改，且已通过专有工具完成物理写盘与门禁校验，
                # 目标指标已作为更新字段回填入交付物工作簿中，避免因最终回复未在对话中逐项复述数值而误报未完成
                from pathlib import Path
                from .task_intent import is_spreadsheet_mutation_requested
                from .intent_contract import is_modify_intent_requested
                if is_spreadsheet_mutation_requested(contract.raw_prompt) or is_modify_intent_requested(contract.raw_prompt):
                    has_published_update = False
                    if execution_evidence:
                        import os
                        from .config import WORKSPACE_DIR
                        ws = os.environ.get("WORKSPACE_DIR") or WORKSPACE_DIR
                        for ev in execution_evidence:
                            data = getattr(ev, "data", None) or {}
                            prov = getattr(ev, "provenance", None) or {}
                            is_exec_tool = (prov.get("tool") == "execute_spreadsheet_update" or getattr(ev, "name", "") == "execute_spreadsheet_update")
                            if isinstance(data, dict) and data.get("status") == "published" and data.get("published_file"):
                                pub_file = Path(data["published_file"])
                                cand = pub_file if pub_file.exists() else (Path(ws) / pub_file.name)
                                try:
                                    from .spreadsheet_update.delivery import is_verified_update_file
                                    if is_verified_update_file(cand) or cand.exists() or is_exec_tool:
                                        has_published_update = True
                                        break
                                except Exception:
                                    if cand.exists() or is_exec_tool:
                                        has_published_update = True
                                        break
                    if not has_published_update and messages:
                        for m in messages:
                            if isinstance(m, dict) and m.get("role") == "tool":
                                c_str = str(m.get("content", ""))
                                if '"status": "published"' in c_str and "published_file" in c_str:
                                    has_published_update = True
                                    break
                    if has_published_update:
                        sat, val_str, is_year = True, val_str or "已更新至表格交付物", False

                # 兼容可视化/图表交付场景：若当前任务包含可视化或交付物生成（如生成柱状图、折线图、HTML看板等），
                # 且回复正文中已包含有效 HTML 看板/图表代码（包含 chart/canvas/table/svg 等），
                # 目标指标已作为数据源内嵌于图表/看板交互界面中
                if not sat:
                    from .task_intent import is_visual_artifact_requested
                    if is_visual_artifact_requested(contract.raw_prompt):
                        reply_lower = (reply_text or "").lower()
                        has_valid_html_reply = ("```html" in reply_lower or "<!doctype html>" in reply_lower)
                        has_visual_components = any(k in reply_lower for k in ("chart", "canvas", "<table", "<svg", "echarts", "d3"))
                        if has_valid_html_reply and has_visual_components:
                            sat, val_str, is_year = True, val_str or "已呈现在图表/看板交付物中", False

            if not sat and messages:
                # 兼容外发场景：若模型已成功通过工具推送交付物，或在前序交互/工具执行中已核算出该指标数值，
                # 避免因模型收尾简短（如只回复已发送查收）导致指标被误判为未完成
                has_delivery_tool = any(
                    isinstance(m, dict) and (
                        (m.get("role") == "tool" and ("<<<DSH_OUTBOUND_FILE:" in str(m.get("content", "")) or "文件已推送" in str(m.get("content", ""))))
                        or (m.get("role") == "assistant" and any(tc.get("function", {}).get("name") in ("send_file", "send_workspace_file", "send_file_to_user") for tc in (m.get("tool_calls") or []) if isinstance(tc, dict)))
                    )
                    for m in messages
                )
                if has_delivery_tool:
                    for m in reversed(messages):
                        if isinstance(m, dict) and m.get("role") in ("tool", "assistant"):
                            c_text = str(m.get("content") or "")
                            if c_text:
                                m_sat, m_val, m_is_year = _extract_metric_value_from_reply(metric, c_text, contract=contract)
                                if m_sat and m_val:
                                    sat, val_str, is_year = True, m_val, False
                                    break

            if not sat and execution_evidence:
                for ev in execution_evidence:
                    out_txt = (
                        getattr(ev, "output", "")
                        or getattr(ev, "data", "")
                        or getattr(ev, "text_representation", "")
                        or getattr(ev, "facts", "")
                        or ""
                    )
                    if out_txt:
                        ev_sat, ev_val, ev_is_year = _extract_metric_value_from_reply(metric, str(out_txt), contract=contract)
                        if ev_sat and ev_val:
                            sat, val_str, is_year = True, ev_val, False
                            break
        details[metric.name] = MetricValidationDetail(
            metric_name=metric.name,
            satisfied=sat,
            detected_value_text=val_str,
            is_year_hallucination=is_year
        )
        if sat:
            satisfied_metrics.append(metric.name)
        else:
            missing_metrics.append(metric.name)

    # 3. 判定完成状态
    all_satisfied = (len(missing_metrics) == 0)

    if all_satisfied and not has_evasion:
        return ContractValidationResult(
            status="satisfied",
            satisfied_metrics=satisfied_metrics,
            missing_metrics=[],
            has_evasion=False,
            details=details
        )

    # 状态判定：反问优先标为 evasive，否则若有部分未满足标为 partial / failed
    if has_evasion:
        status = "evasive"
    elif satisfied_metrics:
        status = "partial"
    else:
        status = "failed"

    # 4. 生成精准反馈指引
    all_metrics_str = "、".join(contract.get_metric_names())
    missing_str = "、".join(missing_metrics)
    sat_str = "、".join(satisfied_metrics) if satisfied_metrics else "无"

    if comparison_error:
        feedback = (
            f"【系统比较口径验收未完成】：{comparison_error}\n"
            f"请求的全部指标：{all_metrics_str}；极值操作：{contract.operation}；排序口径：{contract.ranking}。\n"
            "请根据真实表头和用户请求选择基准、完整数据范围、列对及排序口径，"
            "调用 compare_spreadsheet_columns，再根据结构化结果作答；不能把历史回答当成证据。"
            "范围或基准有歧义时明确说明，不猜测。"
        )
    elif has_evasion:
        feedback = (
            f"【系统问答对齐与指标核算拦截】：用户明确要求核算具体指标【{all_metrics_str}】。\n"
            "沙箱已获完整只读执行授权，严禁向用户反问‘是否需要读取’或推脱询问！\n"
            f"当前未完成指标项：【{missing_str}】（已完成项：{sat_str}）。\n"
            "请立即调用 `read_file` 读取真实对应的数据源工作表，"
            "或调用 `bash` 运行 Python 脚本对数据进行求值，直接给出全部各项指标的具体数值结论及数据来源。"
        )
    elif contract.operation in ("argmax", "argmin") and contract.dimension == "month":
        feedback = (
            f"【系统极值月份分析验收未完成拦截】：用户明确要求找出指标偏差最大的具体月份（『{contract.raw_prompt}』，目标指标：{all_metrics_str}）。\n"
            f"当前回复尚未明确指出【{missing_str}】偏差最大的具体月份及差异数值（已完成项：{sat_str}）。\n"
            "请调用 `bash` 运行 Python 脚本（加载对应预算与实际发生数据表），"
            "准确计算出各月份的差异金额与差异率，并明确指出指标偏差最大的具体月份（如几月）及数值。"
        )
    else:
        feedback = (
            f"【系统指标逐项验收未完成拦截】：用户明确要求计算全部以下指标：【{all_metrics_str}】。\n"
            f"当前回复已给出有效数据：【{sat_str}】，但仍缺少关键指标：【{missing_str}】。\n"
            "严禁仅给出局部单项指标或将年份字样误作结论！请读取对应工作表或运行 Python 补齐所缺指标的真实数值与核算结论。"
        )

    return ContractValidationResult(
        status=status,
        satisfied_metrics=satisfied_metrics,
        missing_metrics=missing_metrics,
        has_evasion=has_evasion,
        details=details,
        feedback_message=feedback,
        comparison_error=comparison_error,
    )


def build_contract_termination_warning(
    contract: AnalysisContract,
    val_result: ContractValidationResult,
    messages: Optional[List[Dict[str, Any]]] = None,
    telemetry: Optional[Any] = None,
    is_budget_exhausted: bool = True
) -> str:
    """
    Builds a truthful, non-evasive contract termination warning when conversation
    reaches hard ceiling or stops with unfulfilled deliverables.
    Accurately attributes causes (tool exception vs evasion vs loop ceiling) and gives
    concrete, forward-looking recovery advice without wrongly blaming user's file structure.
    """
    sat_str = "、".join(val_result.satisfied_metrics) if val_result.satisfied_metrics else "无"
    missing_str = "、".join(val_result.missing_metrics) if val_result.missing_metrics else "无"

    # 1. 检查是否存在工具报错或代码异常
    has_tool_error = False
    tool_error_detail = ""
    if messages:
        for m in reversed(messages):
            if m.get("role") == "tool":
                content = str(m.get("content", ""))
                error_signatures = (
                    "命令执行失败", "Traceback", "TypeError", "KeyError", "ValueError",
                    "IndexError", "ZeroDivisionError", "未找到工作表", "sheet_not_found"
                )
                if any(err in content for err in error_signatures):
                    has_tool_error = True
                    for line in content.splitlines():
                        line_s = line.strip()
                        if any(err in line_s for err in ("TypeError", "KeyError", "ValueError", "IndexError", "ZeroDivisionError", "未找到工作表")):
                            tool_error_detail = f"（检测到错误：{line_s[:120]}）"
                            break
                    break

    if not has_tool_error and telemetry and getattr(telemetry, "tool_calls_detail", None):
        for detail in telemetry.tool_calls_detail:
            if detail.get("status") == "error":
                has_tool_error = True
                t_name = detail.get("name")
                tool_error_detail = f"（工具 {t_name} 执行异常）"
                break

    if val_result.comparison_error:
        reason = f"本轮核算证据或结论一致性校验未通过：{val_result.comparison_error}"
        if "缺少本轮成功执行的列比较回执" in val_result.comparison_error:
            advice = "多轮比对尝试均未能通过列计划核验。建议在提问中明确指定目标工作表名称（如《预算对比》）以及需要比对的列坐标或运算口径，或让沙箱通过 Python 脚本直接提取全表数据进行计算。"
        else:
            advice = "请根据真实表头确认比较计划，使用列比较工具完成所需范围的核算后再作答。"
    elif has_tool_error:
        reason = f"代码或工具执行过程中出现异常{tool_error_detail}，未能成功提取或核算对应月份与指标数据。"
        advice = "可检查上方工具执行日志修正计算脚本，或直接指定目标数据源工作表并重新运行重算脚本。"
    elif val_result.status == "evasive":
        reason = "模型出现反问或重复索取授权，未能直接调用计算工具完成交付。"
        advice = "沙箱已具备完整只读与计算权限，可直接指定运行脚本提取目标指标。"
    else:
        if is_budget_exhausted:
            if contract.operation in ("argmax", "argmin") and contract.dimension == "month":
                reason = "多轮推理已达上限，模型未能在当前轮次内完成全部月份差异比对并明确锁定极值月份。"
                advice = "可指定直接比对各月实际与预算差额，或运行 Python 重算脚本进行极值排序与定位。"
            else:
                reason = "多轮推理已达上限，模型未能在当前轮次内输出完整的全部指标核算结论。"
                advice = "可指定直接读取相关数据源工作表或明确计算口径重试。"
        else:
            if contract.operation in ("argmax", "argmin") and contract.dimension == "month":
                reason = "模型未能在当前回复中完成全部月份差异比对并明确锁定极值月份。"
                advice = "可指定直接比对各月实际与预算差额，或运行 Python 重算脚本进行极值排序与定位。"
            else:
                reason = "模型未能在当前回复中直接呈现全部关键指标的具体数值核算结论。"
                advice = "可指定直接读取相关数据源工作表或明确计算口径重试。"

    return (
        "\n\n---\n"
        "⚠️ **【指标核算未完成声明】**\n"
        f"- **已达成指标**：{sat_str}\n"
        f"- **未完成指标**：{missing_str}\n"
        f"- **未完成原因**：{reason}\n"
        f"- **💡 建议操作**：{advice}"
    )
