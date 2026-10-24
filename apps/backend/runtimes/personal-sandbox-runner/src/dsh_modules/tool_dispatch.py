"""Tool dispatch, availability enforcement and execution receipts."""

import os
import re
import json
from contextlib import nullcontext
from typing import List, Dict, Any, Optional
from .telemetry import TelemetryStats, extract_dsh_markers, strip_dsh_markers
from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .tool_result import ToolResult, TextToolOutput
from .comparison_evidence import validate_execution_output
from .action_protocol import has_explicit_reminder_intent, has_explicit_reminder_time
from .analysis_semantics import analysis_domain_scope

def normalize_tool_name(raw_name: Any) -> str:
    """Normalizes a tool name by stripping namespace prefixes (e.g. functions.x, default_api:x) and lowercasing."""
    cleaned = re.sub(r'^[a-zA-Z0-9_\-]+[:.]', '', str(raw_name or "unknown").strip()).lower()
    if cleaned == "search_web":
        return "web_search"
    return cleaned or "unknown"


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
    Returns True if a send_file tool was executed and succeeded, False otherwise.
    """
    is_file_sent = False
    if last_user_prompt:
        os.environ["DSH_LAST_USER_PROMPT"] = str(last_user_prompt)

    allowed_canonical = (
        {normalize_tool_name(n) for n in allowed_tool_names}
        if allowed_tool_names is not None else None
    )

    for tc in structured_calls:
        fn = tc.get("function", {})
        t_name = fn.get("name", "unknown")
        canonical_name = normalize_tool_name(t_name)
        t_args_raw = fn.get("arguments", "{}")
        t_id = tc.get("id") or f"call_{round_idx}_{len(telemetry.tool_calls_detail) + 1}"

        # 1. Parse and validate JSON object arguments strictly before tool execution
        args_invalid_reason: Optional[str] = None
        t_params: Dict[str, Any] = {}
        if isinstance(t_args_raw, str):
            raw_stripped = t_args_raw.strip()
            if not raw_stripped:
                t_params = {}
            else:
                try:
                    parsed_args = json.loads(raw_stripped)
                    if isinstance(parsed_args, dict):
                        t_params = parsed_args
                    else:
                        args_invalid_reason = f"工具参数必须为 JSON 对象 (object)，实际收到 {type(parsed_args).__name__}"
                except Exception as exc:
                    args_invalid_reason = f"工具参数 JSON 解析失败: {exc}"
        elif isinstance(t_args_raw, dict):
            t_params = t_args_raw
        elif t_args_raw is None:
            t_params = {}
        else:
            args_invalid_reason = f"工具参数必须为 JSON 对象 (object)，实际收到 {type(t_args_raw).__name__}"

        # 2. Advertising a capability is not enforcement. Reject unavailable calls first.
        if allowed_canonical is not None and canonical_name not in allowed_canonical:
            rejected = ToolResult.error("tool_not_available",
                f"本轮未提供工具 {t_name}。请选择已提供的工具：{', '.join(allowed_tool_names or [])}。")
            telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status="blocked")
            if execution_evidence is not None:
                execution_evidence.append(rejected)
                telemetry.record_execution_result(rejected)
            messages.append({"role": "tool", "tool_call_id": t_id,
                             "name": t_name, "content": rejected.to_json()})
            continue

        if args_invalid_reason is not None:
            rejected = ToolResult.error(
                "invalid_arguments",
                f"工具 {canonical_name} 调用参数无效（{args_invalid_reason}）。请传入合法的 JSON 对象参数后重试。"
            )
            telemetry.record_tool_call(tool_name=canonical_name, params={}, status="error")
            if execution_evidence is not None:
                execution_evidence.append(rejected)
                telemetry.record_execution_result(rejected)
            messages.append({
                "role": "tool",
                "tool_call_id": t_id,
                "name": t_name,
                "content": rejected.to_json()
            })
            continue

        raw_preview = (
            t_params.get("__search_query") or
            t_params.get("query") or
            t_params.get("cmd") or
            t_params.get("city") or
            str(t_params)
        )
        clean_param = preview_fn(raw_preview, max_chars=policy.param_preview_chars)
        print(f"⚡ [Harness Tool Call] 正在调用工具: {canonical_name}({clean_param})...", flush=True)

        if is_guide_intent and canonical_name in ("bash", "cmd", "terminal", "sh", "exec"):
            cmd_str = str(t_params.get("cmd") or t_params.get("command") or "").strip().lower()
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
                telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status="blocked")
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
        mutating_reminder_tools = create_reminder_tools | {
            "update_reminder", "update_reminders", "modify_reminder", "edit_reminder", "change_reminder",
            "delete_reminder", "delete_reminders", "remove_reminder", "remove_reminders",
            "cancel_reminder", "cancel_reminders", "clear_reminder",
        }
        if canonical_name in mutating_reminder_tools:
            if not has_explicit_reminder_intent(last_user_prompt):
                print(f"🛡️ [Harness Safety Guard] 绝对阻断未授权的副作用提醒工具调用: {canonical_name}", flush=True)
                tool_res = (
                    "【系统安全拦截】：用户当前提问并非设置或管理提醒的明确意图。沙箱严禁在未获明确授权时执行副作用提醒工具！"
                    "请直接向用户回复正文内容，不要调用提醒工具。"
                )
                telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status="blocked")
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": tool_res
                })
                continue
            if canonical_name in create_reminder_tools and not has_explicit_reminder_time(last_user_prompt):
                print(f"🛡️ [Harness Safety Guard] 阻断缺少用户时间依据的提醒创建: {canonical_name}", flush=True)
                telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status="blocked")
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": "【系统安全拦截】：用户没有提供提醒时间或周期。请只追问必要时间，不得猜测并创建提醒。"
                })
                continue

        call_sig = f"{canonical_name}:{json.dumps(t_params, sort_keys=True, ensure_ascii=False)}"
        err_call_sig = f"err:{call_sig}"
        is_idempotent_read = canonical_name in (
            "read_skill", "read_workspace_file", "weather",
            "web_search", "fetch_page", "scan_knowledge", "read_file", "inspect_spreadsheet_structure",
            "aggregate_spreadsheet"
        )
        success_count = executed_calls_history.count(call_sig)
        error_count = executed_calls_history.count(err_call_sig)
        should_intercept = (
            (success_count >= 1 or error_count >= 2)
            if is_idempotent_read
            else ((success_count + error_count) >= 2)
        )
        status = "blocked"
        if should_intercept:
            print(f"⚠️ [Harness Loop Intercept] 工具 [{canonical_name}] 已重复调用，主动阻断死循环", flush=True)
            tool_res = f"【系统提示】检测到该工具 ({canonical_name}) 已调用过且参数完全一致。结果已在上方历史中，请立即停止重复调用，直接根据现有信息继续执行或给出最终回答。"
            status = "loop_intercepted"
            telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status=status)
        else:
            try:
                domain_scope = (analysis_domain_scope(last_user_prompt) if canonical_name in {
                    'analyze_spreadsheet', 'aggregate_spreadsheet',
                    'check_spreadsheet_equations', 'validate_spreadsheet_rows'} else nullcontext())
                with domain_scope:
                    tool_res = execute_fn(canonical_name, t_params, deadline=deadline)
                tool_res = validate_execution_output(last_user_prompt, tool_res)
                status = "error" if error_fn(tool_res) else "success"
                executed_calls_history.append(call_sig if status == "success" else err_call_sig)
                telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status=status)
            except Exception:
                executed_calls_history.append(err_call_sig)
                telemetry.record_tool_call(tool_name=canonical_name, params=t_params, status="error")
                raise

        print(f"✓ 工具 [{canonical_name}] 执行完成", flush=True)
        evidence = getattr(tool_res, "tool_result", None)
        if not isinstance(evidence, ToolResult) and status in ("success", "error"):
            from .tool_result import adapt_tool_output
            evidence = adapt_tool_output(tool_res)
        if isinstance(evidence, ToolResult) and evidence.provenance is None:
            evidence.provenance = {"tool": canonical_name, "round": round_idx}
        if execution_evidence is not None and isinstance(evidence, ToolResult):
            execution_evidence.append(evidence)
            telemetry.record_execution_result(evidence)

        if status == "success" and isinstance(evidence, ToolResult) and isinstance(evidence.data, dict):
            if evidence.data.get("kind") == "spreadsheet_analysis":
                try:
                    from .spreadsheet_update.tools import harvest_analytical_facts
                    harvest_analytical_facts(evidence.data, provenance=evidence.provenance)
                    tool_res = TextToolOutput(str(tool_res) + "\n统计结果 ID：" + evidence.data["evidence_id"], evidence)
                except Exception as ex:
                    print(f"⚠️ [harvest_analytical_facts] Warning: {ex}", flush=True)

        for m, _, _ in extract_dsh_markers(tool_res, "OUTBOUND_FILE"):
            outbound_files.append(m.strip())

        if outbound_reminders is not None:
            for tag in ("REMINDER_CREATE", "REMINDER_UPDATE", "REMINDER_DELETE"):
                for m, _, _ in extract_dsh_markers(tool_res, tag):
                    outbound_reminders.append(m.strip())

        if (
            canonical_name in (
                "send_file", "send_file_to_user", "send_workspace_file", "send_to_user",
                "send_to_wechat", "send_document", "deliver_file", "push_file"
            )
            and status == "success"
        ):
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
