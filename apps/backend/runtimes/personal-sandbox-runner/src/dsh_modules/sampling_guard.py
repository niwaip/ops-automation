"""Sample coverage checks. Attempted calls never establish successful execution."""

import re

def _is_meaningful_computational_command(cmd: str) -> bool:
    """Checks whether a bash/python command represents meaningful computational execution (not trivial import/probe)."""
    if not cmd:
        return False
    cmd_lower = cmd.strip().lower()
    # 过滤单纯的 import 或版本探测或空指令
    trivial_patterns = [
        r'python[0-9.]*\s+-c\s+[\'"]import\s+[a-z0-9_]+[\'"]\s*$',
        r'python[0-9.]*\s+--version',
        r'which\s+',
        r'echo\s+',
    ]
    if any(re.search(p, cmd_lower) for p in trivial_patterns):
        return False
    # 包含实质计算/加载/汇总/脚本调用特征
    computational_indicators = [
        ".py", "recalc", "read_excel", "load_workbook", "read_csv",
        "groupby", "duplicated", "drop_duplicates", "sum(", "value_counts",
        "merge(", "pivot", "max(", "min(", "abs(", "filter(", "iter_rows",
        "sqlite3", "awk", "bc"
    ]
    has_indicator = any(ind in cmd_lower for ind in computational_indicators)
    runs_script = bool(re.search(r'python[0-9.]*\s+[^\s-]+\.py', cmd_lower))
    return has_indicator or runs_script


def sampling_feedback(reply_text,last_user_prompt,messages=None,telemetry=None,execution_evidence=None,is_guide_intent=False):
    # 10. 抽样/截断数据断言与虚假全量审查拦截 (Sampling Coverage & Verification Guard)
    audit_query_keywords = [
        "查重", "重复", "重复凭证", "重号", "核对", "稽核", "勾稽", "检验", "对账", "对表",
        "最大绝对偏差", "最大偏差", "偏差最大", "绝对偏差", "异常凭证", "舞弊",
        "缺失", "漏填", "空值", "未填", "缺失字段", "字段缺失", "极值", "异常值", "离群值",
        "断号", "跳号", "完整性", "唯一性", "合规检查", "合规性", "不一致", "错漏"
    ]
    is_audit_or_dedup_query = any(k in (last_user_prompt or "") for k in audit_query_keywords)
    if not is_guide_intent and is_audit_or_dedup_query:
        # 只检查当轮输入上下文（最后一条非系统注入用户消息及当轮工具输出），历史轮次不应污染当轮数据覆盖状态
        current_turn_texts = []
        if messages:
            for m in reversed(messages):
                c_str = str(m.get("content", ""))
                current_turn_texts.append(c_str)
                if m.get("role") == "user" and not c_str.startswith("【系统"):
                    break
        current_turn_text = "\n".join(current_turn_texts)

        # 检查当轮是否存在硬截断/抽样/切片标记
        hard_truncation_markers = [
            "工作表覆盖度提醒: 抽样/截断",
            "已展示前 30 行样本",
            "工作表覆盖度提醒: 抽样",
            "附件文本超过限制已截断",
            "Excel 表格截断提醒",
            "PDF 文档截断提醒",
            "内容已截断",
            "工具输出超过",
            "历史消息长度预算超出",
            "中间部分已自动省略",
            "mode=CATALOG",
            "状态: CATALOG_OVERVIEW",
            "目录概览模式: 已呈现表头",
            "mode=SLICED",
            "状态: SLICED",
            "提取模式: SLICED",
            "模式: SLICED",
            "切片区域:",
            "切片行号:",
            "recalc_status=partial",
            "recalc_status=failed",
            "recalc_status=unavailable",
        ]
        has_sampled_context = any(marker in current_turn_text for marker in hard_truncation_markers)

        # 若未命中硬截断，但存在工作表级抽样标记 (如 "状态: SAMPLED")
        if not has_sampled_context and "状态: SAMPLED" in current_turn_text:
            target_sheet_full = False
            for line in current_turn_text.splitlines():
                if "状态: FULL" in line:
                    m_sheet = re.search(r'-\s*([^\s(:]+)\s*\(.*状态:\s*FULL\)', line)
                    if m_sheet:
                        s_name = m_sheet.group(1).strip()
                        if s_name in (last_user_prompt or ""):
                            target_sheet_full = True
                            break
            if not target_sheet_full:
                has_sampled_context = True

        has_computational_tool = any(e.is_success and isinstance(e.data, dict)
                                     and e.data.get("kind") == "column_comparison"
                                     for e in (execution_evidence or []))
        if telemetry and getattr(telemetry, "tool_calls_detail", None):
            for detail in telemetry.tool_calls_detail:
                if detail.get("status") == "success":
                    t_name = detail.get("name")
                    t_params = detail.get("params", {})
                    if t_name == "bash":
                        cmd = str(t_params.get("cmd", ""))
                        if _is_meaningful_computational_command(cmd):
                            has_computational_tool = True
                            break
                    elif t_name in ("python", "eval"):
                        code = str(t_params.get("code", "") or t_params.get("cmd", ""))
                        if _is_meaningful_computational_command(code):
                            has_computational_tool = True
                            break

        if has_sampled_context and not has_computational_tool:
            claims_assertion = bool(re.search(
                r'(?:全面审查|逐笔核对|经核对|经查|发现存在|重复凭证|凭证号\s*V-|\bV-\d{4}-\d+|\bRow\s*\d+|\b第\s*\d+\s*行|'
                r'不存在重复|未发现重复|无重复|没有重复|不存在缺失|未发现缺失|无缺失|没有缺失|'
                r'偏差最大的是|最大绝对偏差为|最大偏差为|绝对偏差最大)',
                reply_text or ""
            ))
            if claims_assertion:
                print("⚡ [Harness Sampling Coverage Guard] 检测到模型在抽样/截断数据下未执行工具便断言核对/查重/审计结论，正在拦截引导使用 Python 进行全量统计...", flush=True)
                msg = (
                    f"【系统数据核验拦截】：用户提问涉及全量数据核对/查重/审计（『{last_user_prompt}』），"
                    "但当前表格数据包含抽样或截断，且沙箱尚未通过代码工具对全表数据进行有效统计与校验。\n"
                    "严禁在未读取全量数据的情况下凭空编造凭证号、行号或断言查重/缺失/偏差结论！\n"
                    "请调用本轮可用的只读计算工具加载原件，对声明范围进行精准查重、核对与聚合核算，"
                    "根据真实代码输出给出核验结论。"
                )
                return msg

    return None
