"""Tool dispatch, availability enforcement and execution receipts."""

import re
import json
from contextlib import nullcontext
from typing import List, Dict, Any, Optional
from .telemetry import TelemetryStats, extract_dsh_markers, strip_dsh_markers
from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .tool_result import ToolResult
from .comparison_evidence import validate_execution_output
from .action_protocol import has_explicit_reminder_intent, has_explicit_reminder_time
from .analysis_semantics import analysis_domain_scope

def dispatch_tool_calls(
    structured_calls: List[Dict[str, Any]],
    round_idx: int,
    messages: List[Dict[str, Any]],
    telemetry: TelemetryStats,
    policy: RuntimePolicy,
    executed_calls_history: List[str],
    outbound_files: List[str],
    deadline: Optional[float],
    is_guide_intent: bool,
    outbound_reminders: Optional[List[str]] = None,
    last_user_prompt: Optional[str] = None,
    execution_evidence: Optional[List[ToolResult]] = None,
    allowed_tool_names: Optional[List[str]] = None,
    execute_fn=None, error_fn=None, preview_fn=None
) -> bool:
    """
    Executes a round of structured tool calls with safety checks and appends tool responses to messages.
    Returns True if a send_file tool was executed, False otherwise.
    """
    is_file_sent = False
    for tc in structured_calls:
        fn = tc.get("function", {})
        t_name = fn.get("name", "unknown")
        t_args_raw = fn.get("arguments", "{}")

        if isinstance(t_args_raw, str):
            try:
                t_params = json.loads(t_args_raw)
            except Exception:
                t_params = {}
        elif isinstance(t_args_raw, dict):
            t_params = t_args_raw
        else:
            t_params = {}

        t_id = tc.get("id") or f"call_{round_idx}_{len(telemetry.tool_calls_detail) + 1}"

        # Advertising a capability is not enforcement. Reject unavailable calls
        # before executing anything, including calls recovered from plain text.
        requested_name = re.sub(r'^[a-zA-Z0-9_\-]+[:.]', '', t_name.strip()).lower()
        if allowed_tool_names is not None and requested_name not in allowed_tool_names:
            rejected = ToolResult.error("tool_not_available",
                f"本轮未提供工具 {t_name}。请选择已提供的工具：{', '.join(allowed_tool_names)}。")
            telemetry.record_tool_call(tool_name=t_name, params=t_params, status="blocked")
            if execution_evidence is not None:
                execution_evidence.append(rejected)
                telemetry.record_execution_result(rejected)
            messages.append({"role": "tool", "tool_call_id": t_id,
                             "name": t_name, "content": rejected.to_json()})
            continue

        raw_preview = (
            t_params.get("__search_query") or
            t_params.get("query") or
            t_params.get("cmd") or
            t_params.get("city") or
            str(t_params)
        )
        clean_param = preview_fn(raw_preview, max_chars=policy.param_preview_chars)
        print(f"⚡ [Harness Tool Call] 正在调用工具: {t_name}({clean_param})...", flush=True)

        if is_guide_intent and t_name == "bash":
            cmd_str = str(t_params.get("cmd", "")).strip().lower()
            is_mutative_install = (
                cmd_str.startswith("pip install") or
                cmd_str.startswith("pip3 install") or
                cmd_str.startswith("python -m pip install") or
                cmd_str.startswith("python3 -m pip install") or
                "apt-get install" in cmd_str or
                "apt install" in cmd_str or
                "-m venv" in cmd_str
            )
            if is_mutative_install:
                print(f"⚠️ [Harness Safety Intercept] 拦截在技术咨询模式下私自执行安装命令: {cmd_str}", flush=True)
                tool_res = (
                    "【系统安全拦截】：当前任务为技术咨询与安装/配置方法说明，用户并未授权在沙箱环境中实际执行安装变更。"
                    "请立即停止在终端运行安装命令，直接根据已知技术规范与标准流程向用户输出完整详尽的安装方法说明与示例代码！"
                )
                telemetry.record_tool_call(tool_name=t_name, params=t_params, status="blocked")
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": tool_res
                })
                continue

        mutating_reminder_tools = {
            "create_reminders", "create_reminder", "set_reminder", "set_reminders",
            "add_reminder", "add_reminders", "remind", "reminder",
            "update_reminder", "update_reminders", "delete_reminder", "delete_reminders"
        }
        if t_name in mutating_reminder_tools:
            if not has_explicit_reminder_intent(last_user_prompt):
                print(f"🛡️ [Harness Safety Guard] 绝对阻断未授权的副作用提醒工具调用: {t_name}", flush=True)
                tool_res = (
                    "【系统安全拦截】：用户当前提问并非设置或管理提醒的明确意图。沙箱严禁在未获明确授权时执行副作用提醒工具！"
                    "请直接向用户回复正文内容，不要调用提醒工具。"
                )
                telemetry.record_tool_call(tool_name=t_name, params=t_params, status="blocked")
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": tool_res
                })
                continue
            create_reminder_tools = {
                "create_reminders", "create_reminder", "set_reminder", "set_reminders",
                "add_reminder", "add_reminders", "remind", "reminder",
            }
            if t_name in create_reminder_tools and not has_explicit_reminder_time(last_user_prompt):
                print(f"🛡️ [Harness Safety Guard] 阻断缺少用户时间依据的提醒创建: {t_name}", flush=True)
                telemetry.record_tool_call(tool_name=t_name, params=t_params, status="blocked")
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": "【系统安全拦截】：用户没有提供提醒时间或周期。请只追问必要时间，不得猜测并创建提醒。"
                })
                continue

        call_sig = f"{t_name}:{json.dumps(t_params, sort_keys=True, ensure_ascii=False)}"
        is_idempotent_read = t_name in (
            "read_skill", "read_workspace_file", "weather",
            "web_search", "fetch_page", "scan_knowledge", "read_file", "inspect_spreadsheet_structure"
        )
        threshold = 1 if is_idempotent_read else 2
        if executed_calls_history.count(call_sig) >= threshold:
            print(f"⚠️ [Harness Loop Intercept] 工具 [{t_name}] 已重复调用，主动阻断死循环", flush=True)
            tool_res = f"【系统提示】检测到该工具 ({t_name}) 已调用过且参数完全一致。结果已在上方历史中，请立即停止重复调用，直接根据现有信息继续执行或给出最终回答。"
            telemetry.record_tool_call(tool_name=t_name, params=t_params, status="loop_intercepted")
        else:
            executed_calls_history.append(call_sig)
            try:
                domain_scope = (analysis_domain_scope(last_user_prompt) if requested_name in {
                    'analyze_spreadsheet', 'aggregate_spreadsheet',
                    'check_spreadsheet_equations', 'validate_spreadsheet_rows'} else nullcontext())
                with domain_scope:
                    tool_res = execute_fn(t_name, t_params, deadline=deadline)
                tool_res = validate_execution_output(last_user_prompt, tool_res)
                status = "error" if error_fn(tool_res) else "success"
                telemetry.record_tool_call(tool_name=t_name, params=t_params, status=status)
            except Exception:
                telemetry.record_tool_call(tool_name=t_name, params=t_params, status="error")
                raise

        print(f"✓ 工具 [{t_name}] 执行完成", flush=True)
        evidence = getattr(tool_res, "tool_result", None)
        if execution_evidence is not None and isinstance(evidence, ToolResult):
            execution_evidence.append(evidence)
            telemetry.record_execution_result(evidence)

        for m, _, _ in extract_dsh_markers(tool_res, "OUTBOUND_FILE"):
            outbound_files.append(m.strip())

        if outbound_reminders is not None:
            for tag in ("REMINDER_CREATE", "REMINDER_UPDATE", "REMINDER_DELETE"):
                for m, _, _ in extract_dsh_markers(tool_res, tag):
                    outbound_reminders.append(m.strip())

        if t_name.lower() in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat"]:
            is_file_sent = True

        clipped_tool_res = ContextBudget.clip_tool_result(tool_res, max_chars=policy.max_tool_result_chars)
        clean_tool_res = strip_dsh_markers(clipped_tool_res, ["REMINDER_CREATE", "REMINDER_UPDATE", "REMINDER_DELETE"]).strip()
        if not clean_tool_res:
            clean_tool_res = "（工具执行完成，无控制台输出）"
        messages.append({
            "role": "tool",
            "tool_call_id": t_id,
            "name": t_name,
            "content": clean_tool_res
        })

    return is_file_sent
