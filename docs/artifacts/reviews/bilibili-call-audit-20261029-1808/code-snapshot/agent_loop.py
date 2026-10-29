"""
ReAct multi-turn agent execution loop for DeepSeek Harness (dsh).
Coordinates structured OpenAI tool calls, parallel tool dispatch, Nudge nudging,
and legacy format fallbacks.
"""

import re
import os
import json
import time
import sys
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .telemetry import TelemetryStats, extract_dsh_markers, strip_dsh_markers
from .tools import execute_tool, SANDBOX_TOOLS, get_sandbox_tools
from .llm import (
    call_model_proxy,
    parse_tool_calls,
    clean_output,
    is_promising_action,
    detect_unexecuted_script_leak
)
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR
from .action_protocol import (
    is_internal_plan_output,
    recover_text_tool_calls,
    has_explicit_reminder_intent,
    has_explicit_reminder_time,
    detect_retrieval_mismatch_disclaimer,
)
from .deliverable_contract import (
    materialize_requested_markdown,
    materialize_script_deliverable,
    materialize_pdf_from_markdown,
    materialize_config_or_code_deliverable,
    requests_markdown_artifact,
    unwrap_outer_markdown_fence,
)
from .skill_router import is_text_only_request, is_term_negated
from .analysis_contract import build_analysis_contract, build_analysis_plan_context, supports_column_comparison
from .comparison_delivery import compile_comparison_response, COMPARISON_DELIVERY_INSTRUCTIONS
from .analysis_semantics import domain_plan_context
from .analysis_validation import validate_reply_against_contract, build_contract_termination_warning
from .tool_result import ToolResult
from .comparison_evidence import validate_execution_output
from .tool_dispatch import dispatch_tool_calls
from .sampling_guard import sampling_feedback, _is_meaningful_computational_command
from .spreadsheet_analysis_schema import analysis_instructions_for, select_analysis_tools
from .analysis_turn import AnalysisTurn
from .agent_loop_helpers import (
    ACTION_FILLER_KEYWORDS,
    is_unclosed_or_truncated_html,
    is_explicit_code_request,
    auto_heal_unexecuted_file_writes,
    detect_passive_deflection,
    detect_unexecuted_tool_argument_leak,
    sanitize_preview,
    _extract_last_user_prompt,
    _build_fallback_report,
    find_invalid_new_workbooks,
    materialize_in_loop_deliverables,
    materialize_post_loop_deliverables,
)


MAX_AGENT_ROUNDS_HARD_CEILING = int(os.getenv("DSH_MAX_AGENT_ROUNDS_CEILING", "24"))
MAX_SPREADSHEET_ROUNDS_CEILING = int(os.getenv("DSH_MAX_SPREADSHEET_ROUNDS_CEILING", "8"))


def extract_filename_from_outbound(item: str) -> str:
    try:
        obj = json.loads(item)
        if isinstance(obj, dict) and "fileName" in obj:
            return obj["fileName"]
    except Exception:
        pass
    return Path(item).name


def detect_missing_claimed_artifacts(*args, **kwargs):
    from .deliverable_detection import detect_missing_claimed_artifacts as detect
    return detect(*args, **kwargs, workspace=WORKSPACE_DIR, knowledge=KNOWLEDGE_DIR)


def detect_missing_requested_deliverable(*args, **kwargs):
    from .deliverable_detection import detect_missing_requested_deliverable as detect
    return detect(*args, **kwargs, workspace=WORKSPACE_DIR)



@dataclass
class AgentLoopResult:
    """Outcome of the multi-turn agent loop."""
    final_text: str = ""
    outbound_files: List[str] = field(default_factory=list)
    outbound_reminders: List[str] = field(default_factory=list)
    telemetry: TelemetryStats = field(default_factory=TelemetryStats)
    messages: List[Dict[str, Any]] = field(default_factory=list)
    execution_evidence: List[ToolResult] = field(default_factory=list)


from .completion_evaluator import (
    CompletionDecision,
    evaluate_no_tool_turn,
    evaluate_tool_execution_turn,
)

# Canonical turn completion evaluator (aliased for backwards compatibility)
_check_no_tool_assertion_guard = evaluate_no_tool_turn


def _is_tool_error(tool_res: Any) -> bool:
    """Checks whether tool output represents an execution error or failure via ToolResult contract."""
    from dsh_modules.tool_result import is_tool_error
    return is_tool_error(tool_res)


def _dispatch_tool_calls(*args, **kwargs):
    return dispatch_tool_calls(*args, **kwargs, execute_fn=execute_tool,
                               error_fn=_is_tool_error, preview_fn=sanitize_preview)


from .workbook_delivery_recalc import recalculate_generated_workbooks as _recalculate_generated_workbooks


def _finalize_agent_text(*args, **kwargs) -> Tuple[str, List[str]]:
    """Compatibility entry point; final presentation lives outside the loop."""
    from .final_answer import finalize_agent_text
    return finalize_agent_text(
        *args, **kwargs, call_model=call_model_proxy, workspace_dir=WORKSPACE_DIR,
        max_agent_rounds=MAX_AGENT_ROUNDS_HARD_CEILING,
        max_spreadsheet_rounds=MAX_SPREADSHEET_ROUNDS_CEILING,
    )


def run_agent_loop(
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    max_rounds: int,
    tools: Optional[List[Dict[str, Any]]] = None,
    deadline: Optional[float] = None,
    is_guide_intent: bool = False,
    turn_start_time: Optional[float] = None,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    telemetry: Optional[TelemetryStats] = None,
    spreadsheet_analysis_required: bool = False,
    is_search_intent: bool = False,
    initial_execution_evidence: Optional[List[ToolResult]] = None,
    user_prompt: Optional[str] = None,
    user_declarations: Optional[Dict[str, Any]] = None,
    delivery_session_id: Optional[str] = None,
) -> AgentLoopResult:
    """Executes the multi-turn ReAct tool calling loop up to max_rounds."""
    active_tools = tools if tools is not None else get_sandbox_tools()
    managed_pdf = (any(t.get('function', {}).get('name') == 'render_pdf' for t in active_tools)
                   and not any(t.get('function', {}).get('name') == 'bash' for t in active_tools)
                   and not any(t.get('function', {}).get('name') == 'web_search' for t in active_tools))
    if managed_pdf:
        from .pdf_workflow import configure_pdf_tools
        active_tools = configure_pdf_tools(active_tools, user_prompt or next((m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'), ''))
    if telemetry is None:
        telemetry = TelemetryStats()
    outbound_files: List[str] = []
    outbound_reminders: List[str] = []
    executed_calls_history: List[str] = []
    reply_text = ""
    was_token_truncated = False
    start_ts = turn_start_time if turn_start_time is not None else time.time()
    from .spreadsheet_update.tools import reset_turn_results
    reset_turn_results()
    from .pdf_preview_tool import reset_pdf_renders
    reset_pdf_renders()
    from .user_declarations import bind_user_declarations
    declaration = bind_user_declarations(user_declarations)
    if declaration:
        telemetry.record_guard('user_unit_confirmation', 'accept', declaration)
    last_user_prompt = user_prompt if user_prompt is not None else _extract_last_user_prompt(messages)
    if managed_pdf:
        from .pdf_content_workflow import run_pdf_content_workflow
        from .config import SKILL_DIR
        text, files, evidence = run_pdf_content_workflow(last_user_prompt, model, policy,
            WORKSPACE_DIR, SKILL_DIR, deadline, telemetry, conversation_history=messages)
        return AgentLoopResult(final_text=text, outbound_files=files, telemetry=telemetry,
                               messages=messages, execution_evidence=evidence)
    analysis_turn=AnalysisTurn(last_user_prompt,model=model,deadline=deadline) if spreadsheet_analysis_required else None
    from .spreadsheet_chart_delivery import SpreadsheetChartDelivery, wants_standard_bar_chart, verified_chart_receipt
    from .spreadsheet_chart_workflow import (
        is_parameter_error, cross_check_with_scripts, salvage_chart_delivery, failure_presentation)
    chart_delivery = (SpreadsheetChartDelivery(WORKSPACE_DIR, delivery_session_id)
                      if analysis_turn and wants_standard_bar_chart(last_user_prompt) else None)
    comparison_contract = build_analysis_contract(last_user_prompt)
    comparison_required = (not is_generate_intent and not is_guide_intent
        and supports_column_comparison(comparison_contract)
        and any(t.get('function', {}).get('name') == 'compare_spreadsheet_columns' for t in active_tools))
    if comparison_required:
        messages.insert(0, {"role": "system", "content": COMPARISON_DELIVERY_INSTRUCTIONS})
    if comparison_contract.is_advisory_intent and not comparison_contract.is_explicit_calc:
        from .analysis_contract import build_advisory_guidance
        advisory_guidance = build_advisory_guidance(comparison_contract)
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = str(messages[0].get("content") or "") + advisory_guidance
        else:
            messages.insert(0, {"role": "system", "content": advisory_guidance})

    has_active_update_tools = any(
        (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
        for t in active_tools
    )
    from .intent_contract import is_modify_intent_requested
    from .task_intent import is_spreadsheet_mutation_requested
    from .spreadsheet_update.routing import is_custom_workbook_or_row_edit
    is_update_req = (
        (is_modify_intent_requested(last_user_prompt) or is_spreadsheet_mutation_requested(last_user_prompt))
        and not is_custom_workbook_or_row_edit(last_user_prompt)
    )

    # 仅当明确要求可视化（图表、大屏、看板、HTML）或独立生成文档物化时，才开启全量交付工具；
    # 纯文本分析报告（如“分析下半年盈利能力并形成简要报告”）保持在裁剪后的最小分析工具集，避免携带天气、提醒、发送等无关工具造成提示词膨胀
    visual_terms = ("图表", "柱状图", "折线图", "饼图", "散点图", "雷达图", "html", "看板", "大屏", "网页", "可视化", "绘图", "画图", "生成图")
    artifact_terms = ("word文档", "pdf文件", "ppt演示", "下载链接")
    # 仅检测真实用户指令部分，严禁将输入附件信封（如 .xlsx）当作输出交付物需求
    _target_prompt = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】:[^\n]+', '', last_user_prompt or '')
    has_visual_or_deliverable = bool(
        expected_deliverables
        or is_generate_intent
        or any(k in _target_prompt.lower() for k in visual_terms)
        or any(doc in _target_prompt.lower() for doc in artifact_terms)
        or bool(re.search(r'(?:生成|导出|输出|制作|做成|保存为|下载).*(?:\.xlsx|\.docx|\.pdf|\.pptx|word|excel|ppt|表|文档)', _target_prompt, re.I))
    )

    if is_update_req and has_active_update_tools and not is_guide_intent:
        from .spreadsheet_update.agent_protocol import select_update_tools, UPDATE_INSTRUCTIONS
        active_tools = select_update_tools(active_tools)
        messages.insert(0, {'role':'system', 'content':UPDATE_INSTRUCTIONS})
    elif spreadsheet_analysis_required:
        analysis_tools = select_analysis_tools(active_tools, last_user_prompt)
        if has_visual_or_deliverable:
            update_tool_names = {"plan_spreadsheet_update", "execute_spreadsheet_update", "get_spreadsheet_update_status", "read_skill"}
            retained_extras = [t for t in active_tools if t.get("function", {}).get("name") not in update_tool_names]
            active_tools = analysis_tools + [t for t in retained_extras if t not in analysis_tools]
        else:
            active_tools = analysis_tools
        messages[0]["content"] = str(messages[0].get("content") or "") + analysis_instructions_for(last_user_prompt) + domain_plan_context(last_user_prompt)
        # 标准柱状图由运行时托管渲染，不能再引导模型用 bash 生成交付文件（否则必然被拒收）。
        if has_visual_or_deliverable and not chart_delivery:
            visual_flow_guidance = (
                "\n\n【表格数据核算与可视化交付双阶段规范】\n"
                "当前任务既要求表格数据核算/过滤，又要求交付可视化图表/页面。你必须严格按以下双阶段执行：\n"
                "1. **计算阶段**：必须首先调用 `aggregate_spreadsheet`（支持 where/group_by/exclude_prefixes/not_starts_with 等条件过滤）或调用 `bash` 运行 Python 脚本加载原件精准核算，获取经过完整过滤与聚合后的真实数据；\n"
                "2. **呈现交付阶段**：使用经过工具核算得到的真实精确数据填充图表与明细，调用 `bash` 生成目标文件或以完整代码块交付。\n"
                "严禁在未调用任何计算工具的情况下跳过计算阶段直接手写数值或凭空臆测！\n"
            )
            messages[0]["content"] += visual_flow_guidance

    if chart_delivery:
        # This workflow owns rendering. A data-planning model cannot write into
        # the shared workspace or mistake a pre-existing HTML for its output.
        active_tools = [t for t in active_tools if t.get('function', {}).get('name') in
                        {'aggregate_spreadsheet', 'inspect_spreadsheet_structure'}]
        messages[0]['content'] += ('\n本轮标准柱状图由运行时在聚合证据通过后自动生成、验收并发布。'
                                   '请仅完成用户要求的筛选、分组和必要指标，不生成HTML或调用写文件工具。')

    requirements = build_analysis_plan_context(last_user_prompt) if is_inspect_intent and not is_guide_intent else ""
    if requirements:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = str(messages[0].get("content") or "") + requirements
        else:
            messages.insert(0, {"role": "system", "content": requirements})
    execution_evidence: List[ToolResult] = list(initial_execution_evidence or [])
    guard_nudges_count = 0
    force_tool_choice = False
    is_pure_spreadsheet_or_inspect = (
        not has_visual_or_deliverable
        and (
            (spreadsheet_analysis_required and not (is_update_req and has_active_update_tools))
            or comparison_required
            or (is_inspect_intent and not is_generate_intent and not expected_deliverables and not (is_update_req and has_active_update_tools))
        )
    )
    task_ceiling = MAX_SPREADSHEET_ROUNDS_CEILING if is_pure_spreadsheet_or_inspect else MAX_AGENT_ROUNDS_HARD_CEILING
    max_rounds = min(max_rounds, task_ceiling)
    initial_max_rounds = max_rounds

    round_idx = 0
    consecutive_tool_errors = 0
    consecutive_comparison_errors = 0
    consecutive_plan_syntax_errors = 0
    while round_idx < max_rounds:
        if round_idx > 0:
            if getattr(policy, "thinking", False):
                policy.thinking = False
                policy.reasoning_effort = None
            if active_tools:
                print(f"⏳ [Harness Agent] 正在结合前序采集证据进行深入推理与规划 (第 {round_idx + 1} 轮)...", flush=True)
            else:
                print(f"⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 {round_idx + 1} 轮)...", flush=True)
        if deadline is not None and deadline - time.monotonic() <= 0:
            print(f"⚠️ [Harness Timeout] 总任务执行已达到硬截止时间 ({policy.total_task_timeout}s)，立即终止", flush=True)
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")

        llm_res = call_model_proxy(
            messages,
            model,
            tools=active_tools,
            timeout=policy.single_request_timeout,
            deadline=deadline,
            policy=policy,
            stream_deltas=False if spreadsheet_analysis_required or comparison_required else None,
            # A spreadsheet model may ask a valid question before computing.
            # The evidence gate checks assertions after its choice; forcing a
            # tool call here would remove the right to clarify.
            tool_choice={'type': 'function', 'function': {'name': 'render_pdf'}} if managed_pdf else "required" if (
                (force_tool_choice and active_tools)
                or (active_tools and comparison_required and consecutive_comparison_errors < 2 and compile_comparison_response(comparison_contract, execution_evidence)[0] is None)
            ) else None,
            purpose="tool_loop"
        )
        reply_text = (llm_res.get("content") or "") if isinstance(llm_res, dict) else str(llm_res or "")
        structured_calls = list(llm_res.get("tool_calls") or []) if isinstance(llm_res, dict) else []

        telemetry.record_llm_response(llm_res, is_first_round=(round_idx == 0))
        if isinstance(llm_res, dict) and llm_res.get("finish_reason") == "length":
            was_token_truncated = True

        # 混合兼容降级：若 structured_calls 为空但模型文本中含有 XML/DSML tool_call 标签
        if not structured_calls and reply_text:
            legacy_calls = parse_tool_calls(reply_text, is_guide=is_guide_intent)
            if legacy_calls:
                has_reminder_intent = has_explicit_reminder_intent(last_user_prompt)
                for i, lc in enumerate(legacy_calls):
                    raw_c_name = str(lc.get("name", "")).strip()
                    c_name = re.sub(r'^[a-zA-Z0-9_\-]+[:.]', '', raw_c_name).lower()
                    if c_name == "search_web":
                        c_name = "web_search"
                    if c_name in (
                        "create_reminders", "create_reminder", "set_reminder", "set_reminders",
                        "add_reminder", "add_reminders", "remind", "reminder",
                        "update_reminders", "delete_reminders"
                    ):
                        if not has_reminder_intent:
                            print(f"⚠️ [Harness Security Guard] 过滤未授权的文本/旧协议提醒工具调用: {raw_c_name}", flush=True)
                            continue
                    structured_calls.append({
                        "id": f"call_legacy_{round_idx}_{i}",
                        "type": "function",
                        "function": {
                            "name": c_name or raw_c_name,
                            "arguments": json.dumps(lc.get("params", {}), ensure_ascii=False)
                        }
                    })

        # 小模型协议适配：恢复明确计划中的安全只读调用，以及参数受限的 Markdown 写入调用。
        # bash 等通用可变更工具不会通过此路径自动执行。
        if not structured_calls and reply_text:
            structured_calls = recover_text_tool_calls(
                reply_text,
                user_prompt=last_user_prompt,
                round_idx=round_idx,
            )
            if structured_calls:
                print(
                    "⚡ [Harness Protocol Recovery] 已将小模型文本动作转换为受控结构化工具调用...",
                    flush=True,
                )

        if structured_calls:
            force_tool_choice = False

        # 若当轮无任何工具调用
        if not structured_calls:
            if comparison_required and consecutive_comparison_errors < 2:
                compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
                telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
                if error and round_idx < task_ceiling - 1 and round_idx < initial_max_rounds + 2:
                    max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))
                    messages.append({'role':'assistant', 'content':reply_text})
                    messages.append({'role':'user', 'content':'【系统比较证据验收】：'+error+COMPARISON_DELIVERY_INSTRUCTIONS})
                    round_idx += 1
                    continue
                break
            # 独立表格更新完成门禁：凡任务明确要求更新工作簿/工作表并配备更新工具，必须具备更新执行回执
            from .intent_contract import is_modify_intent_requested
            from .task_intent import is_spreadsheet_mutation_requested
            is_update_req = (
                is_modify_intent_requested(last_user_prompt)
                or is_spreadsheet_mutation_requested(last_user_prompt)
            )
            has_update_tools = bool(
                active_tools and any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
                    for t in active_tools
                )
            )
            has_exec_update_tool = bool(
                active_tools and any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() == "execute_spreadsheet_update"
                    for t in active_tools
                )
            )
            if is_update_req and has_update_tools and not is_guide_intent:
                if not has_exec_update_tool:
                    # 只读规划/预览模式：当前环境未提供 execute_spreadsheet_update 写盘工具，允许生成计划并向用户呈现预览，严禁索要不可用工具触发死锁
                    pass
                else:
                    has_update_exec = any(
                        getattr(e, 'is_success', False)
                        and isinstance(getattr(e, 'data', None), dict)
                        and e.data.get('status') == 'published'
                        and e.data.get('published_file')
                        and (Path(e.data['published_file']).exists() or (Path(WORKSPACE_DIR) / Path(e.data['published_file']).name).exists())
                        for e in execution_evidence
                    )
                    if has_update_exec:
                        if telemetry:
                            telemetry.record_guard("spreadsheet_update_evidence", "accept", "published_verified")
                    else:
                        planned_ev = next(
                            (e for e in execution_evidence if getattr(e, 'is_success', False) and (
                                getattr(e, 'name', '') == 'plan_spreadsheet_update' or (getattr(e, 'provenance', None) or {}).get('tool') == 'plan_spreadsheet_update'
                            ) and isinstance(getattr(e, 'data', None), dict) and getattr(e, 'data', {}).get('plan_id')),
                            None
                        )
                        if planned_ev:
                            p_data = planned_ev.data
                            p_id = p_data.get('plan_id')
                            p_hash = p_data.get('plan_hash')
                            r_id = p_data.get('run_id')
                            update_err = (
                                f"检测到你已成功锁定更新计划 (Plan ID: {p_id})，但尚未执行物理写盘与公式重算！\n"
                                f"严禁在此停顿输出文字，目标文件尚未真正写入物理磁盘。请立即发起工具调用：\n"
                                f"`execute_spreadsheet_update(plan_id='{p_id}')`\n"
                                f"只有该工具执行成功后新表格才会真正落盘完成交付！"
                            )
                        else:
                            update_err = (
                                "检测到任务明确要求更新工作簿/工作表并回填数据，当前仅输出了分析文本，尚未完成物理写盘！"
                                "严禁在此停顿输出文字，必须立即调用工具完成物理写盘落盘：\n"
                                "- 方式一（专有工具，推荐）：直接调用 `plan_spreadsheet_update` 提交更新意图（如：target_file、period、section、target_kind、target_unit），计划锁定后紧接着调用 `execute_spreadsheet_update` 写盘；\n"
                                "只按工具返回的具体错误修正参数；目标不明确时说明需要的信息。\n"
                                "请立即发起工具调用执行写盘！"
                            )
                        telemetry.record_guard("spreadsheet_update_evidence", "reject", update_err)
                        if round_idx < task_ceiling - 1:
                            max_rounds = min(task_ceiling, max_rounds + 1)
                            force_tool_choice = True
                        messages.append({"role": "assistant", "content": reply_text})
                        messages.append({"role": "user", "content": f"【系统表格更新门禁拦截】：{update_err}"})
                        round_idx += 1
                        continue

            if spreadsheet_analysis_required and not has_visual_or_deliverable:
                if analysis_turn.is_clarification(execution_evidence, reply_text):
                    telemetry.record_guard("spreadsheet_evidence", "accept", "clarification_requested")
                    break
                response=analysis_turn.response(execution_evidence,reply_text)
                error=None if response else analysis_turn.feedback(execution_evidence)
                telemetry.record_guard("spreadsheet_evidence", "reject" if error else "accept", error)
                if error and round_idx < task_ceiling - 1 and round_idx < initial_max_rounds + 2:
                    max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))
                    messages.append({"role":"assistant","content":reply_text})
                    messages.append({"role":"user","content":error})
                    round_idx += 1
                    continue
                break
            from .pdf_preview_tool import has_registered_renders
            if has_registered_renders():
                from .pdf_preview_tool import pdf_review_feedback
                feedback = pdf_review_feedback()
                if feedback:
                    telemetry.record_guard('pdf_page_review', 'pending', feedback)
                    if round_idx < min(task_ceiling - 1, initial_max_rounds + 2):
                        messages.extend([{'role': 'assistant', 'content': reply_text},
                                         {'role': 'user', 'content': feedback}])
                        max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))
                        force_tool_choice = True
                        round_idx += 1
                        continue
                    reply_text = 'PDF 尚未完成本轮生成与逐页验收，无法交付最终文件。'
                    break
            script_execution_error = materialize_in_loop_deliverables(
                last_user_prompt=last_user_prompt,
                reply_text=reply_text,
                workspace_dir=WORKSPACE_DIR,
                start_ts=start_ts,
                expected_deliverables=expected_deliverables,
                outbound_files=outbound_files,
                executed_calls_history=executed_calls_history,
            )

            action, guard_msg, max_rounds = _check_no_tool_assertion_guard(
                reply_text=reply_text,
                last_user_prompt=last_user_prompt,
                round_idx=round_idx,
                max_rounds=max_rounds,
                start_ts=start_ts,
                is_guide_intent=is_guide_intent,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent,
                executed_calls_history=executed_calls_history,
                guard_nudges_count=guard_nudges_count,
                script_execution_error=script_execution_error,
                tools=active_tools,
                messages=messages,
                telemetry=telemetry,
                execution_evidence=execution_evidence,
                hard_ceiling=task_ceiling,
                is_search_intent=is_search_intent,
                consecutive_comparison_errors=consecutive_comparison_errors,
                model=model,
                deadline=deadline,
                workspace_dir=WORKSPACE_DIR,
            )
            if action == "continue":
                guard_nudges_count += 1
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({"role": "user", "content": guard_msg})
                round_idx += 1
                continue
            elif action == "break":
                break
            else:
                break

        # 记录助手消息
        cleaned_content = clean_output(reply_text, is_guide=is_guide_intent).strip() if reply_text else ""
        messages.append({
            "role": "assistant",
            "content": cleaned_content if cleaned_content else None,
            "tool_calls": structured_calls
        })

        # 工具调用属于沙箱内部流程，调用前重置任何未决的前端打字机内容
        sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
        sys.stdout.flush()

        # 执行工具调用
        is_file_sent = _dispatch_tool_calls(
            structured_calls=structured_calls,
            round_idx=round_idx,
            messages=messages,
            telemetry=telemetry,
            policy=policy,
            executed_calls_history=executed_calls_history,
            outbound_files=outbound_files,
            deadline=deadline,
            is_guide_intent=is_guide_intent,
            outbound_reminders=outbound_reminders,
            last_user_prompt=last_user_prompt,
            execution_evidence=execution_evidence,
            allowed_tool_names=[t.get("function", {}).get("name", t.get("name", ""))
                                for t in active_tools]
        )

        from .tool_failure_recovery import repeated_execution_failure
        repeated_failure = repeated_execution_failure(execution_evidence, artifact_task=bool(expected_deliverables or is_generate_intent))
        if repeated_failure:
            telemetry.record_guard('repeated_execution_failure', 'stop', repeated_failure)
            reply_text = '文件生成未完成：执行错误累计达到修复上限，已停止无效重试。'
            break
        from .pdf_preview_tool import has_registered_renders
        if managed_pdf or has_registered_renders():
            from .pdf_preview_tool import pdf_review_feedback, pdf_delivery_result, review_current_pdf_pages
            reviews = review_current_pdf_pages(WORKSPACE_DIR, deadline, telemetry, round_idx)
            execution_evidence.extend(reviews)
            if reviews and reviews[-1].is_error:
                messages.append({'role': 'user', 'content': '本轮 PDF 页面检查未通过，请一次修正以下各页问题后重新 render_pdf：' + '\n'.join(r.render_text() for r in reviews if r.is_error)})
            if pdf_review_feedback() is None:
                text, files = pdf_delivery_result()
                if files:
                    telemetry.record_guard('pdf_delivery', 'accept', 'all_current_pages_reviewed')
                    return AgentLoopResult(final_text=text, outbound_files=files, telemetry=telemetry,
                                           messages=messages, execution_evidence=execution_evidence)

        if execution_evidence and execution_evidence[-1].is_error:
            consecutive_tool_errors += 1
            last_err = execution_evidence[-1]
            last_tool = (last_err.provenance or {}).get("tool") or ""
            err_code = getattr(last_err, "error_code", "") or ""
            err_msg = getattr(last_err, "error_message", "") or ""
            is_plan_syntax_error = (
                err_code in ("invalid_analysis_plan", "invalid_query_plan", "invalid_plan_schema")
                or err_msg.startswith("plan：")
                or err_msg.startswith("plan:")
            )
            is_param_error = is_parameter_error(err_code)
            # 列比对流程依赖 consecutive_comparison_errors 计数退避，保持其原有语义。
            if last_tool in ("aggregate_spreadsheet", "analyze_spreadsheet", "check_spreadsheet_equations", "validate_spreadsheet_rows", "plan_spreadsheet_update", "inspect_spreadsheet_structure") and is_param_error:
                # 参数类错误（缺少/写错 file_path、工作表名等）：引擎可用，只需修正参数，不应退避到 bash。
                consecutive_plan_syntax_errors += 1
                if messages and messages[-1].get("role") == "tool":
                    param_fix_hint = "\n\n【系统指导】这是工具参数错误（如缺少 file_path、文件名或工作表名不匹配），专用计算引擎完全可用。请按错误提示补全参数后重新调用；file_path 使用 /workspace/<附件文件名>。"
                    if param_fix_hint not in messages[-1].get("content", ""):
                        messages[-1]["content"] = messages[-1].get("content", "") + param_fix_hint
                if consecutive_plan_syntax_errors >= 4 and not chart_delivery:
                    if not any((t.get("function", {}).get("name") or t.get("name", "")) == "bash" for t in active_tools):
                        active_tools.extend(get_sandbox_tools(allowed_names={"bash"}))
            elif last_tool in ("compare_spreadsheet_columns", "aggregate_spreadsheet", "analyze_spreadsheet", "check_spreadsheet_equations", "validate_spreadsheet_rows", "plan_spreadsheet_update"):
                if is_plan_syntax_error:
                    consecutive_plan_syntax_errors += 1
                    # 计划参数/语法校验失败，计算引擎本身未受限；引导模型修正计划参数继续使用原生工具
                    if messages and messages[-1].get("role") == "tool":
                        plan_fix_hint = "\n\n【系统指导】这是分析计划参数校验未通过（如度量定义冲突、条件语法或分组字段缺失），专用计算引擎完全可用。请仔细阅读上方错误提示，修正计划参数后继续调用专用工具计算。"
                        if plan_fix_hint not in messages[-1].get("content", ""):
                            messages[-1]["content"] = messages[-1].get("content", "") + plan_fix_hint
                    # 只有当连续计划语法错误达到 4 次以上真的无法自愈时，才允许放开退避
                    if consecutive_plan_syntax_errors >= 4 and not chart_delivery:
                        if not any((t.get("function", {}).get("name") or t.get("name", "")) == "bash" for t in active_tools):
                            active_tools.extend(get_sandbox_tools(allowed_names={"bash"}))
                else:
                    consecutive_comparison_errors += 1
                    # 图表托管模式只接受计算引擎回执，退避到 bash 只会产出必然被拒收的交付物。
                    if consecutive_comparison_errors >= 2 and not chart_delivery:
                        if not any((t.get("function", {}).get("name") or t.get("name", "")) == "bash" for t in active_tools):
                            active_tools.extend(get_sandbox_tools(allowed_names={"bash"}))
                        if messages and messages[-1].get("role") == "tool":
                            fallback_hint = "\n\n【系统指导】专用比对工具受限，请立即编写 Python 脚本提取数据进行计算（使用 bash 运行 python3 脚本），发挥沙箱的原生代码执行优势。"
                            if fallback_hint not in messages[-1].get("content", ""):
                                messages[-1]["content"] = messages[-1].get("content", "") + fallback_hint
        elif execution_evidence and execution_evidence[-1].is_success:
            consecutive_tool_errors = 0
            consecutive_plan_syntax_errors = 0
            last_tool = (execution_evidence[-1].provenance or {}).get("tool") or ""
            if last_tool in ("compare_spreadsheet_columns", "aggregate_spreadsheet", "analyze_spreadsheet", "check_spreadsheet_equations", "validate_spreadsheet_rows", "plan_spreadsheet_update"):
                consecutive_comparison_errors = 0

        max_consecutive_errors = int(os.getenv("DSH_MAX_CONSECUTIVE_TOOL_ERRORS", "8"))
        if consecutive_tool_errors >= max_consecutive_errors:
            print(f"⚠️ [Harness Stagnation Guard] 工具连续出现 {consecutive_tool_errors} 次执行错误且未能恢复，主动终止避免死循环", flush=True)
            break

        if execution_evidence:
            latest = execution_evidence[-1]
            if (isinstance(latest.data, dict) and latest.data.get('status') == 'needs_input'
                    and (latest.provenance or {}).get('tool') == 'plan_spreadsheet_update'):
                telemetry.record_guard('spreadsheet_update_binding', 'needs_input', latest.data['question'])
                return AgentLoopResult(final_text=latest.data['question'], telemetry=telemetry,
                                       messages=messages, execution_evidence=execution_evidence)

        from .spreadsheet_update.presentation import render_published_update
        published_update = render_published_update(execution_evidence, WORKSPACE_DIR)
        if published_update:
            # The native update already verified scope, formula caches and the
            # published hash. Its receipt owns the answer; no extra model round.
            telemetry.record_guard('spreadsheet_update_evidence', 'accept', 'published_verified')
            telemetry.record_guard('workbook_delivery', 'accept', 'verified_workbook_deliverable')
            telemetry.record_guard('answer_delivery', 'receipt_owned', 'published_update')
            return AgentLoopResult(final_text=published_update, outbound_files=outbound_files,
                outbound_reminders=outbound_reminders, telemetry=telemetry,
                messages=messages, execution_evidence=execution_evidence)

        if chart_delivery:
            chart_receipt = verified_chart_receipt(execution_evidence, last_user_prompt, model, deadline)
            if chart_receipt:
                if chart_delivery.publish(chart_receipt, last_user_prompt, telemetry):
                    chart_delivery.cross_check = cross_check_with_scripts(chart_delivery.dataset, execution_evidence)
                    telemetry.record_guard('chart_cross_check', chart_delivery.cross_check['status'], chart_delivery.cross_check)
                    return AgentLoopResult(final_text=chart_delivery.presentation(),
                        outbound_files=chart_delivery.outbound(), telemetry=telemetry,
                        messages=messages, execution_evidence=execution_evidence)
                break

        if analysis_turn:
            should_finish, transition_msg, max_rounds = evaluate_tool_execution_turn(
                analysis_turn=analysis_turn,
                execution_evidence=execution_evidence,
                active_tools=active_tools,
                deadline=deadline,
                telemetry=telemetry,
                has_visual_or_deliverable=has_visual_or_deliverable,
                outbound_files=outbound_files,
                reply_text=reply_text,
                round_idx=round_idx,
                max_rounds=max_rounds,
                task_ceiling=task_ceiling,
                last_user_prompt=last_user_prompt,
                expected_deliverables=expected_deliverables,
                start_ts=start_ts,
                workspace_dir=WORKSPACE_DIR,
            )
            if transition_msg:
                messages.append({'role': 'user', 'content': transition_msg})
                round_idx += 1
                continue
            if should_finish:
                if structured_calls:
                    reply_text = ""
                break
            max_rounds=analysis_turn.extend_repair_budget(
                execution_evidence,round_idx,max_rounds,task_ceiling,telemetry)
            messages.append({'role':'user','content':analysis_turn.feedback(execution_evidence)})

        # A weather lookup already returns current conditions plus forecast, and a successful
        # reminder mutation may not be repeated. Remove only these single-use capabilities
        # from later rounds. Search/read tools remain available because different arguments
        # can represent legitimate multi-step research.
        single_use_tools = {
            "weather",
            "create_reminders",
            "create_reminder",
            "update_reminder",
            "update_reminders",
            "delete_reminder",
            "delete_reminders",
        }
        executed_names = {
            call_sig.split(":", 1)[0]
            for call_sig in executed_calls_history
            if ":" in call_sig and not call_sig.startswith("err:")
        }
        exhausted = single_use_tools.intersection(executed_names)
        if exhausted:
            active_tools = [
                tool for tool in active_tools
                if tool.get("function", {}).get("name") not in exhausted
            ]

        if (spreadsheet_analysis_required or comparison_required or has_active_update_tools) and execution_evidence and execution_evidence[-1].is_error:
            if consecutive_tool_errors < 5:
                max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))

        # 动态推进预算：只要任务需要生成物理交付物且尚未落盘，或者工具调用成功推进了业务证据，
        # 且轮次临近上限时，动态追加执行轮次预算（最高至 task_ceiling），避免被固定硬轮次截断
        is_making_progress = bool(
            consecutive_tool_errors < 5 and (
                (has_active_update_tools and any(getattr(r, 'is_success', False) for r in (execution_evidence or [])))
                or (execution_evidence and execution_evidence[-1].is_success)
            )
        )
        if (expected_deliverables or is_generate_intent or is_making_progress) and round_idx >= max_rounds - 2 and round_idx < task_ceiling - 1:
            missing_deliv = detect_missing_requested_deliverable(
                last_user_prompt, start_ts,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent
            )
            has_update_pending = (has_active_update_tools and not any(
                r.is_success and getattr(r.data, 'get', lambda k: None)('published_file')
                for r in (execution_evidence or []) if isinstance(getattr(r, 'data', None), dict)
            ))
            if missing_deliv or has_update_pending or is_making_progress:
                max_rounds = min(task_ceiling, max(max_rounds, round_idx + 3))
                print(f"⚡ [Harness Dynamic Budget] 检测到任务持续推进中，动态追加执行轮次至 {max_rounds} (硬上限: {task_ceiling})...", flush=True)
                has_update_tools_active = any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
                    for t in active_tools
                )
                has_bash_active = any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("bash", "cmd", "terminal", "sh", "exec")
                    for t in active_tools
                )
                if has_update_tools_active and (missing_deliv in [".xlsx", ".xlsm"] or has_update_pending):
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，但目标交付物尚未生成落盘。请调用 `plan_spreadsheet_update` 规划并调用 `execute_spreadsheet_update` 执行落盘！"
                elif has_bash_active and missing_deliv:
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，但目标交付物 {missing_deliv} 尚未生成落盘。请立即停止零散查看或临时测试，通过 bash 运行最终 Python/处理脚本将完整数据与图表直接写入 /workspace/ 目标文件！"
                else:
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，请基于已有执行证据抓紧完成最终操作或给出明确结论。"
                if round_idx >= max_rounds - 2:
                    messages.append({
                        "role": "user",
                        "content": nudge_msg
                    })

        # 当前轮次已执行工具，重置 reply_text，防止内部工具前置垫话或执行脚本残留进入最终回复
        # 但在重置前，若当前轮次伴随工具调用输出了完整 HTML 代码块或未执行的脚本/命令，执行自愈落盘
        if reply_text and ("```html" in reply_text.lower() or "cat" in reply_text or "write_file" in reply_text):
            try:
                from .agent_loop_helpers import auto_heal_unexecuted_file_writes
                _, mid_healed = auto_heal_unexecuted_file_writes(reply_text, WORKSPACE_DIR)
                if mid_healed:
                    print(f"✨ [Harness Auto-Heal] 工具轮次中成功自愈落盘产物: {mid_healed}", flush=True)
                m_mid_html = re.search(r'```html\s*\n(<!DOCTYPE html[\s\S]*?</html>)\s*```', reply_text, re.I)
                if not m_mid_html:
                    m_mid_html = re.search(r'```html\s*\n(<html[\s\S]*?</html>)\s*```', reply_text, re.I)
                if m_mid_html:
                    h_code = m_mid_html.group(1).strip()
                    if len(h_code) > 150:
                        out_html = Path(WORKSPACE_DIR) / "index.html"
                        out_html.write_text(h_code, encoding="utf-8")
                        print(f"✨ [Harness Auto-Heal] 工具轮次中成功物化 HTML 代码块至工作区: {out_html}", flush=True)
            except Exception as e:
                print(f"⚠️ [Harness Auto-Heal] 工具轮次物化产物异常: {e}", flush=True)

        reply_text = ""

        if is_file_sent:
            messages.append({
                "role": "user",
                "content": "文件已成功标记并推送至即时通讯通道。请直接回复用户告知文件已发送，并简要概述核心结论或关键统计数值（无需再调用任何其他工具）。"
            })
            from .summary_context import build_summary_messages
            final_step = call_model_proxy(
                build_summary_messages(last_user_prompt, messages, execution_evidence),
                model,
                max_tokens=1200,
                stream_deltas=False,
                timeout=policy.single_request_timeout,
                deadline=deadline,
                purpose="tool_loop"
            )
            telemetry.record_llm_response(final_step, is_first_round=False, purpose="final_summary")
            reply_text = (final_step.get("content") or "") if isinstance(final_step, dict) else str(final_step or "")
            break

        round_idx += 1

    if chart_delivery:
        if salvage_chart_delivery(
                chart_delivery, messages=messages, tools=active_tools, prompt=last_user_prompt,
                evidence=execution_evidence, telemetry=telemetry, deadline=deadline, model=model,
                call_model=lambda msgs, salvage_tools: call_model_proxy(
                    msgs, model, tools=salvage_tools, timeout=policy.single_request_timeout, deadline=deadline,
                    policy=policy, stream_deltas=False, tool_choice="required", purpose="chart_salvage"),
                dispatch=lambda calls: _dispatch_tool_calls(
                    structured_calls=calls, round_idx=round_idx, messages=messages, telemetry=telemetry,
                    policy=policy, executed_calls_history=executed_calls_history, outbound_files=outbound_files,
                    deadline=deadline, is_guide_intent=is_guide_intent, outbound_reminders=outbound_reminders,
                    last_user_prompt=last_user_prompt, execution_evidence=execution_evidence,
                    allowed_tool_names=['aggregate_spreadsheet'])):
            return AgentLoopResult(final_text=chart_delivery.presentation(),
                                   outbound_files=chart_delivery.outbound(), telemetry=telemetry,
                                   messages=messages, execution_evidence=execution_evidence)
        if not chart_delivery.error:
            chart_delivery.fail('verified_chart_data_unavailable_within_budget', telemetry)
        allow_unverified = getattr(policy, "allow_unverified_chart_fallback", False) or (
            os.getenv("DSH_CHART_ALLOW_UNVERIFIED_FALLBACK", "").lower() in ("true", "1", "yes")
        )
        unverified_file = None
        unverified_outbound = []
        if allow_unverified:
            from .spreadsheet_chart_workflow import materialize_unverified_chart_fallback
            unverified_file, _ = materialize_unverified_chart_fallback(
                chart_delivery, Path(WORKSPACE_DIR), start_ts, telemetry
            )
            if unverified_file:
                unverified_outbound = [json.dumps({
                    'filePath': str(unverified_file),
                    'fileName': unverified_file.name,
                    'unverified': True
                })]
        return AgentLoopResult(final_text=failure_presentation(chart_delivery, execution_evidence, reply_text, unverified_file=unverified_file),
                               outbound_files=unverified_outbound,
                               telemetry=telemetry, messages=messages, execution_evidence=execution_evidence)

    compiled_comparison = None
    if comparison_required:
        if consecutive_comparison_errors >= 2 and reply_text and len(reply_text.strip()) > 10 and not detect_unexecuted_script_leak(reply_text):
            soft_tip = "\n\n---\n💡 **提示**：本结论由模型直接解读与呈现，未完全通过结构化列比对回执（专用比对工具连续校验受限，已自动退避至通用计算）。"
            compiled_comparison = reply_text.strip() + soft_tip
        else:
            compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
            telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
            if compiled:
                compiled_comparison = compiled
            else:
                # 降级处理：仅在模型实际进行了工具调用/证据探索后（有执行证据或工具调用历史），才执行软性角标降级；
                # 若模型完全未调用任何工具凭空口算（0工具调用），仍按规则拦截虚假口算。
                has_tool_execution = bool(executed_calls_history or execution_evidence)
                has_substantive_reply = bool(
                    has_tool_execution and reply_text and len(reply_text.strip()) > 10
                    and "指标核算未完成声明" not in reply_text
                    and not detect_unexecuted_script_leak(reply_text)
                )
                successful_receipts = [
                    r for r in (execution_evidence or [])
                    if getattr(r, "is_success", False) and getattr(r, "data", {}).get("kind") == "column_comparison"
                ]
                soft_tip = f"\n\n---\n💡 **提示**：本结论由模型直接解读与呈现，未完全通过结构化列比对回执（{error or '数据对齐存在轻微瑕疵'}）。"
                if has_substantive_reply:
                    compiled_comparison = reply_text.strip() + soft_tip
                elif successful_receipts:
                    from .report_presentation import comparison_overview
                    compiled_comparison = comparison_overview(successful_receipts) + soft_tip
                else:
                    from .analysis_validation import ContractValidationResult, build_contract_termination_warning
                    val_result = ContractValidationResult(
                        status="failed",
                        satisfied_metrics=[],
                        missing_metrics=[m.name for m in comparison_contract.metrics] if comparison_contract.metrics else [],
                        comparison_error=error
                    )
                    contract_warning = build_contract_termination_warning(
                        contract=comparison_contract,
                        val_result=val_result,
                        messages=messages,
                        telemetry=telemetry,
                        is_budget_exhausted=True
                    )
                    compiled_comparison = "本次比较结论尚未通过执行证据核验。" + contract_warning

    if spreadsheet_analysis_required:
        if not reply_text or len(reply_text.strip()) < 20:
            for m in reversed(messages):
                if m.get("role") == "assistant" and m.get("content"):
                    c = str(m["content"]).strip()
                    if len(c) > 30 and "本次分析尚未通过" not in c and not parse_tool_calls(c):
                        reply_text = c
                        break
        if (not reply_text or len(reply_text.strip()) < 20) and execution_evidence:
            try:
                turn_may_finish = analysis_turn.may_finish(execution_evidence, reply_text=reply_text)
            except TypeError:
                turn_may_finish = analysis_turn.may_finish(execution_evidence)
            if not turn_may_finish:
                has_external_calc = any(
                    getattr(r, 'is_success', False)
                    and (getattr(r, 'provenance', None) or {}).get('tool') in ('bash', 'sh', 'python')
                    and isinstance(r.data, str) and len(r.data.strip()) > 30
                    for r in execution_evidence
                )
                if has_external_calc and (deadline is None or deadline - time.monotonic() > 3):
                    try:
                        forced_nudge = [{"role": "user", "content": "工具调用轮次已结束。请根据前述工具与脚本的实际执行结果，直接向用户呈现完整、清晰、结构化的计算与分析结论。"}]
                        forced_res = call_model_proxy(
                            messages + forced_nudge,
                            model,
                            timeout=min(policy.single_request_timeout, 15),
                            deadline=deadline,
                            policy=policy,
                            purpose="synthesis"
                        )
                        telemetry.record_llm_response(forced_res, is_first_round=False)
                        f_text = (forced_res.get("content") or "") if isinstance(forced_res, dict) else str(forced_res or "")
                        if f_text and len(f_text.strip()) > 30:
                            reply_text = f_text.strip()
                    except Exception:
                        pass

    from .pdf_preview_tool import has_registered_renders
    if managed_pdf or has_registered_renders():
        from .pdf_preview_tool import pdf_delivery_result
        text, files = pdf_delivery_result()
        telemetry.record_guard('pdf_delivery', 'accept' if files else 'reject', 'managed_pdf_terminal')
        return AgentLoopResult(final_text=text, outbound_files=files, telemetry=telemetry,
                               messages=messages, execution_evidence=execution_evidence)

    final_text, healed_files = ((compiled_comparison, [])
        if comparison_required and compiled_comparison else (analysis_turn.render(execution_evidence,reply_text,telemetry,policy=policy,model=model,deadline=deadline), [])
        if (spreadsheet_analysis_required and not (has_visual_or_deliverable and (outbound_files or requests_markdown_artifact(last_user_prompt)))) else _finalize_agent_text(
        reply_text=reply_text,
        messages=messages,
        model=model,
        policy=policy,
        deadline=deadline,
        is_guide_intent=is_guide_intent,
        executed_calls_history=executed_calls_history,
        was_token_truncated=was_token_truncated,
        telemetry=telemetry,
        last_user_prompt=last_user_prompt,
        expected_deliverables=expected_deliverables,
        execution_evidence=execution_evidence,
        turn_start_time=start_ts
    ))
    if requests_markdown_artifact(last_user_prompt):
        final_text = unwrap_outer_markdown_fence(final_text)
    for hf in healed_files:
        if hf not in outbound_files:
            outbound_files.append(hf)

    outbound_files = materialize_post_loop_deliverables(
        last_user_prompt=last_user_prompt,
        final_text=final_text,
        workspace_dir=WORKSPACE_DIR,
        start_ts=start_ts,
        expected_deliverables=expected_deliverables,
        outbound_files=outbound_files,
    )

    # 交付前对本轮生成/导出的带公式 Excel 进行无头重算以补齐缓存值
    _recalculate_generated_workbooks(WORKSPACE_DIR, turn_start_time=start_ts)

    from .workbook_delivery import quarantine_invalid_deliverables
    final_text, outbound_files, rejected = quarantine_invalid_deliverables(
        WORKSPACE_DIR, start_ts, final_text, outbound_files)
    if rejected:
        telemetry.record_guard("workbook_delivery", "reject", rejected)
    else:
        from .deliverable_detection import is_new_deliverable
        ws_root = Path(WORKSPACE_DIR)
        has_valid_xlsx = any(
            extract_filename_from_outbound(f).lower().endswith((".xlsx", ".xlsm"))
            for f in outbound_files
        ) or (
            ws_root.is_dir() and any(
                p.suffix.lower() in (".xlsx", ".xlsm") and is_new_deliverable(p, start_ts)
                for p in ws_root.iterdir() if p.is_file() and not p.name.startswith(".")
            )
        )
        if has_valid_xlsx:
            telemetry.record_guard("workbook_delivery", "accept", "verified_workbook_deliverable")

    # 终态物理交付物断言：若用户要求了特定文件但全流程仍未生成任何外发物理文件（且非被 workbook_delivery 拦截的错误文件），进行明确诚信提示
    if not rejected and not is_text_only_request(last_user_prompt) and (expected_deliverables or is_generate_intent):
        missing_final = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
        )
        if missing_final:
            telemetry.record_guard("deliverable_contract", "reject", f"missing_physical_file_{missing_final}")
            has_planned_update = any(
                getattr(ev, "is_success", False)
                and isinstance(getattr(ev, "data", None), dict)
                and ev.data.get("status") == "planned"
                for ev in (execution_evidence or [])
            )
            already_disclosed = bool(re.search(
                r"尚未生成|未生成|未能生成|无法生成|未完成物理落盘|【重要提示：目标交付物尚未生成落盘】|【交付物落盘未完成提示】|⚠️",
                final_text or "",
            ))
            if has_planned_update:
                warning_notice = (
                    f"> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n"
                    f"> 本轮已完成前序数据核算与方案规划，但目标文件（`{missing_final}`）未在沙箱内完成物理落盘。\n"
                    f"> **下一步操作**：您可直接回复 **「继续执行更新并生成表格」** 立即完成文件生成与交付。\n\n---\n\n"
                )
                if not already_disclosed:
                    final_text = warning_notice + final_text
            elif not already_disclosed:
                warning_notice = (
                    f"> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n"
                    f"> 目标文件（`{missing_final}`）尚未在沙箱内完成物理落盘，请根据下方说明补充条件或重试生成。\n\n---\n\n"
                )
                final_text = warning_notice + final_text
        elif not missing_final and outbound_files and not has_valid_xlsx:
            telemetry.record_guard("deliverable_contract", "accept", "verified_deliverable_present")

    try:
        from .delivery_reconciliation import reconcile_delivery_presentation
        final_text = reconcile_delivery_presentation(
            final_text,
            WORKSPACE_DIR,
            messages=messages,
            prompt=last_user_prompt,
            turn_start_time=start_ts
        )
    except Exception as e:
        logger.warning("Delivery reconciliation error in agent loop: %s", e)

    # Final success claims must be checked even when intent routing or nudge budgets skipped guards.
    missing_claims = [] if (rejected and not outbound_files) else detect_missing_claimed_artifacts(
        final_text, is_generate_intent=True, turn_start_time=start_ts, verify_claims_only=True)
    if missing_claims:
        try:
            from .delivery_claim_judge import judge_delivery_claims
            verdict = judge_delivery_claims(
                prompt=last_user_prompt,
                reply_text=final_text,
                candidate_missing=missing_claims,
                workspace_dir=WORKSPACE_DIR,
                turn_start_time=start_ts,
                model=model,
                deadline=deadline
            )
            if verdict and not verdict.get("phantom_claim"):
                logger.info("DeliveryClaimJudge dismissed missing claims %s: %s", missing_claims, verdict.get("reason"))
                missing_claims = []
            elif verdict and isinstance(verdict.get("missing_items"), list):
                missing_claims = [str(x) for x in verdict["missing_items"] if x]
        except Exception as e:
            logger.warning("DeliveryClaimJudge error in terminal verification: %s", e)

    if missing_claims:
        telemetry.record_guard("artifact_delivery", "reject", {"missing_files": missing_claims})
        final_text = "本次文件生成未完成，以下文件尚未生成可用的交付版本：" + "、".join(
            f"`{name}`" for name in missing_claims) + "。当前无法提供这些文件的下载。"

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        outbound_reminders=outbound_reminders,
        telemetry=telemetry,
        messages=messages,
        execution_evidence=execution_evidence
    )
