"""Execution and validation of informational spreadsheet reporting."""

import hashlib
import json
import os
import re
from pathlib import Path
from .file_tools import resolve_sandboxed_path
from .tool_result import ToolResult, TextToolOutput
from .analysis_contract import build_analysis_contract
from .spreadsheet_context import resolve_session_attachment


def execute_informational_spreadsheet(params, deadline=None):
    file_path = params.get("file_path", "")
    reason = str(params.get("reason", "")).strip()
    summary_focus = str(params.get("summary_focus", "")).strip()

    if not reason:
        result = ToolResult.error("invalid_parameters", "调用 report_informational_spreadsheet 必须提供明确的判定理由 (reason)")
        return TextToolOutput(result.render_text(), result)

    source, err_res = resolve_session_attachment(file_path, "说明报告工具")
    if err_res:
        return TextToolOutput(err_res.render_text(), err_res)

    try:
        source_bytes = source.read_bytes()
        source_hash = hashlib.sha256(source_bytes).hexdigest()
    except OSError as e:
        result = ToolResult.error("source_read_failed", f"读取文件哈希失败: {e}")
        return TextToolOutput(result.render_text(), result)

    # 严格财务与计算拦截：若用户提问中包含明确计算指令且无客观数据缺口，禁止偷懒逃生
    last_prompt = os.getenv("DSH_LAST_USER_PROMPT", "")
    is_missing_data = bool(re.search(r'(?:缺少|未包含|未找到|缺失|无对应|没有.*列|无.*列|无法计算|数据不足|信息不全|需补充|请补充|缺口|无.*字段)', reason))
    prompt_allows_clarify = bool(re.search(r'(?:缺失.*先告诉我|数据.*缺失.*告知|先确认|先说明|若.*缺失|缺失.*补充)', last_prompt or ""))
    if last_prompt and not (is_missing_data or prompt_allows_clarify):
        contract = build_analysis_contract(last_prompt)
        if contract.is_explicit_calc or (contract.metrics and any(m.semantic_id for m in contract.metrics)):
            result = ToolResult.error(
                "escape_rejected",
                "当前任务包含明确的数值计算或指标核算需求，禁止降级为纯文本归纳。必须使用 aggregate_spreadsheet 或 check_spreadsheet_equations 完成计算。",
                provenance={"file_path": str(source), "workbook_id": source_hash}
            )
            return TextToolOutput(result.render_text(), result)

    data = {
        "kind": "informational_spreadsheet",
        "file_path": str(source),
        "workbook_id": source_hash,
        "reason": reason,
        "summary_focus": summary_focus,
        "is_informational": True,
        "clarification_missing_data": is_missing_data or prompt_allows_clarify,
    }
    provenance = {
        "file_path": str(source),
        "workbook_id": source_hash,
    }
    output_msg = (
        f"【已确认信息类表格】：文件 {source.name} 属于非计算/状态信息类表格，已解除计算指标强制核验。\n"
        f"判定理由：{reason}\n"
        f"请直接向用户呈现完整、详尽的内容归纳与分析说明。"
    )
    res = ToolResult.success(data=data, provenance=provenance, text=output_msg)
    return TextToolOutput(output_msg, res)
