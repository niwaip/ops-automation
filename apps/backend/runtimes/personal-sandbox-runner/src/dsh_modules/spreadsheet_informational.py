"""Execution and validation of informational spreadsheet reporting."""

import hashlib
import json
import os
from pathlib import Path
from .file_tools import resolve_sandboxed_path
from .tool_result import ToolResult, TextToolOutput
from .analysis_contract import build_analysis_contract


def execute_informational_spreadsheet(params, deadline=None):
    file_path = params.get("file_path", "")
    reason = str(params.get("reason", "")).strip()
    summary_focus = str(params.get("summary_focus", "")).strip()

    if not reason:
        result = ToolResult.error("invalid_parameters", "调用 report_informational_spreadsheet 必须提供明确的判定理由 (reason)")
        return TextToolOutput(result.render_text(), result)

    source, error = resolve_sandboxed_path(file_path)
    if error or source is None or not source.exists():
        result = ToolResult.error("source_unavailable", error or "原件不可用或文件不存在")
        return TextToolOutput(result.render_text(), result)

    attachments = [v.strip() for v in os.getenv("DSH_SESSION_ATTACHMENTS", "").split(",") if v.strip()]
    from .config import WORKSPACE_DIR
    allowed = {(Path(WORKSPACE_DIR) / name).resolve() for name in attachments}
    if allowed and source.resolve() not in allowed:
        result = ToolResult.error("source_outside_session_scope", "当前工具仅接受本轮附件原件")
        return TextToolOutput(result.render_text(), result)

    try:
        source_bytes = source.read_bytes()
        source_hash = hashlib.sha256(source_bytes).hexdigest()
    except OSError as e:
        result = ToolResult.error("source_read_failed", f"读取文件哈希失败: {e}")
        return TextToolOutput(result.render_text(), result)

    # 严格财务与计算拦截：若用户提问中包含明确计算指令或已知数值指标，禁止逃生
    last_prompt = os.getenv("DSH_LAST_USER_PROMPT", "")
    if last_prompt:
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
