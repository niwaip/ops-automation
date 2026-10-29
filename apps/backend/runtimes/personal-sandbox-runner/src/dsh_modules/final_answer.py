"""Final response presentation, artifact recovery and delivery validation.

The loop injects runtime adapters so this module never imports agent_loop.
"""
from dataclasses import dataclass
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .runtime_policy import RuntimePolicy
from .telemetry import TelemetryStats
from .tool_result import ToolResult
from .llm import clean_output, parse_tool_calls, is_promising_action, detect_unexecuted_script_leak
from .action_protocol import is_internal_plan_output
from .skill_router import is_text_only_request
from .analysis_contract import build_analysis_contract
from .analysis_validation import validate_reply_against_contract, build_contract_termination_warning
from .sampling_guard import sampling_feedback
from .workbook_delivery_recalc import recalculate_generated_workbooks as _recalculate_generated_workbooks
from .agent_loop_helpers import (
    ACTION_FILLER_KEYWORDS, TRIVIAL_STATUS_WORDS, is_unclosed_or_truncated_html, is_explicit_code_request,
    auto_heal_unexecuted_file_writes, detect_unexecuted_tool_argument_leak, _build_fallback_report,
)
from .artifact_discovery import (
    discover_physical_artifacts,
    has_all_expected_artifacts,
    has_verified_published_receipt,
    is_valid_regular_file,
)
from .image_link_sanitizer import sanitize_and_repair_markdown_images

logger = logging.getLogger(__name__)


@dataclass
class AnswerState:
    """Dynamic evaluation snapshot of the agent's current output."""
    has_valid_html: bool
    is_hollow_claim: bool
    is_filler: bool
    has_internal_plan: bool
    has_raw_dsml: bool
    has_raw_tool: bool
    needs_summary: bool


def evaluate_answer_state(text: str, has_physical_artifact: bool) -> AnswerState:
    """Evaluates the semantic and structural readiness of an agent response."""
    cleaned = (text or "").strip()
    has_valid_html = ("```html" in cleaned.lower()) and not is_unclosed_or_truncated_html(cleaned)
    has_internal_plan = is_internal_plan_output(cleaned)
    has_raw_dsml = bool(re.search(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}', cleaned))
    has_raw_tool = bool(re.search(r'<(?:tool_call|tool_calls)', cleaned))

    is_hollow = (
        not has_physical_artifact and
        not has_valid_html and
        len(cleaned) < 220 and
        bool(re.search(
            r'(?:文件|代码|报告|文档|演示文稿|ppt|pdf|表格)?已(?:成功)?(?:生成|写入|保存|导出|落盘)|'
            r'请查看(?:下方)?(?:下载)?卡片|<div\s+download-card',
            cleaned, re.I
        ))
    )

    is_trivial_status = (
        len(cleaned) < 40 and cleaned.lower().strip().strip(".!。！") in TRIVIAL_STATUS_WORDS
    )

    is_filler = (
        len(cleaned) < 120 and
        (any(kw in cleaned for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(cleaned) or is_hollow or is_trivial_status)
    )

    needs_summary = (
        not cleaned or is_filler or has_raw_dsml or has_raw_tool or has_internal_plan
    )

    return AnswerState(
        has_valid_html=has_valid_html,
        is_hollow_claim=is_hollow,
        is_filler=is_filler,
        has_internal_plan=has_internal_plan,
        has_raw_dsml=has_raw_dsml,
        has_raw_tool=has_raw_tool,
        needs_summary=needs_summary,
    )


def finalize_agent_text(
    reply_text: str,
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    deadline: Optional[float],
    is_guide_intent: bool,
    executed_calls_history: List[str],
    was_token_truncated: bool,
    telemetry: TelemetryStats,
    last_user_prompt: str = "",
    expected_deliverables: Optional[List[str]] = None,
    execution_evidence: Optional[List[ToolResult]] = None,
    turn_start_time: Optional[float] = None,
    *,
    call_model,
    workspace_dir: str,
    max_agent_rounds: int,
    max_spreadsheet_rounds: int,
) -> Tuple[str, List[str]]:
    """Finalizes agent text, requesting forced summary if needed and applying fallback reports."""
    has_pending_tool_calls = bool(parse_tool_calls(reply_text, is_guide=is_guide_intent))
    final_text = clean_output(reply_text, is_guide=is_guide_intent)
    from .spreadsheet_update.presentation import render_published_update
    published_summary = render_published_update(execution_evidence, workspace_dir)

    healed_files: List[str] = []

    # 1. Discover physical artifacts with strict file verification
    artifacts = discover_physical_artifacts(
        workspace_dir,
        expected_deliverables=expected_deliverables,
        turn_start_time=turn_start_time
    )
    has_physical_artifact = bool(artifacts)

    # 2. Evaluate state dynamically
    state = evaluate_answer_state(final_text, has_physical_artifact)

    # 3. Ground with published update summary or nudge model for missing content
    if published_summary:
        if state.needs_summary or has_pending_tool_calls:
            final_text = published_summary
        else:
            if "|" in final_text or any(kw in final_text for kw in ("回填结果", "预测值", "金额 (K)", "金额(K)")):
                intro_match = re.split(r'\n\s*(?:#|\||---)', final_text, maxsplit=1)
                intro = intro_match[0].strip() if intro_match else ""
                if intro and len(intro) < 300 and "|" not in intro:
                    final_text = f"{intro}\n\n{published_summary}"
                else:
                    final_text = published_summary
            elif published_summary not in final_text:
                final_text = f"{final_text.strip()}\n\n{published_summary}"
        state = evaluate_answer_state(final_text, has_physical_artifact)
    elif state.needs_summary or has_pending_tool_calls:
        messages.append({"role": "assistant", "content": reply_text or None})
        if state.is_hollow_claim:
            nudge_prompt = (
                "【双通道完整交付要求】：你已完成交付物生成，但当前聊天回复仅包含简短的文件生成通知/下载卡片提示，缺失核心正文内容。"
                "根据平台双通道交付原则，聊天对话中必须向用户呈现完整、清晰、结构化的核心成果与总结要点（例如天气明细、报告核心结论与结构化摘要）。"
                "请直接在当前回复中输出详尽的 Markdown 正文回答，严禁仅回复'已生成/请看卡片'等空话！"
            )
        else:
            nudge_prompt = "工具调用轮次已结束。请根据目前已探索和收集到的所有信息与仓库内容，直接给出深入、结构完整、详尽的最终中文回答（严禁输出中间过渡垫话或未执行的工具标签）。"
        messages.append({"role": "user", "content": nudge_prompt})
        try:
            from .summary_context import build_summary_messages
            forced_res = call_model(
                build_summary_messages(last_user_prompt, messages, execution_evidence),
                model,
                max_tokens=1200,
                stream_deltas=False,
                purpose="tool_loop",
                timeout=policy.single_request_timeout,
                deadline=deadline,
                policy=policy
            )
            telemetry.record_llm_response(forced_res, is_first_round=False, purpose="final_summary")
            forced_reply = forced_res.get("content", "") if isinstance(forced_res, dict) else str(forced_res)
            forced_clean = clean_output(forced_reply, is_guide=is_guide_intent) or forced_reply.strip()

            # Dynamic re-evaluation of forced response: avoids stale state overriding valid short answers
            forced_state = evaluate_answer_state(forced_clean, has_physical_artifact)
            if forced_clean and not forced_state.is_filler and not forced_state.has_internal_plan:
                final_text = forced_clean
                state = forced_state
            else:
                final_text = ""
                state = evaluate_answer_state("", has_physical_artifact)
        except TimeoutError:
            raise
        except Exception:
            final_text = ""
            state = evaluate_answer_state("", has_physical_artifact)

    # 4. Fallback handling when still empty or filler
    if not final_text or state.is_filler or state.has_internal_plan:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")

        p_lower = (last_user_prompt or "").lower()
        user_cmd = p_lower
        if "用户指令：" in user_cmd:
            user_cmd = user_cmd.split("用户指令：")[-1].strip()
        elif "用户指令:" in user_cmd:
            user_cmd = user_cmd.split("用户指令:")[-1].strip()
        else:
            user_cmd = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:[^\n]+\n?', '', user_cmd).strip()

        names_non_web_format = bool(
            re.search(r'(?:pptx?|slides?|幻灯片|演示文稿|pdf|docx?|word|xlsx?|excel)', user_cmd, re.I)
        )
        has_non_html_deliverable = bool(
            expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables)
        )
        html_cues = ["html", "网页", "单页", "大屏", "看板"]
        has_html_req = (
            not names_non_web_format
            and not has_non_html_deliverable
            and (
                any(cue in user_cmd for cue in html_cues)
                or ("报告" in user_cmd and any(cue in user_cmd for cue in ["单页", "一页", "html", "网页"]))
            )
        )
        if has_html_req:
            try:
                from .html_report_fallback import materialize_html_report_fallback, is_plausible_html_file
                fallback_path = materialize_html_report_fallback(
                    prompt=last_user_prompt,
                    history=messages,
                    workspace_dir=workspace_dir,
                    notice="本单页报告由系统基于会话中有效内容恢复生成，支持交互预览与全屏查看。"
                )
                if fallback_path and Path(fallback_path).exists() and is_plausible_html_file(Path(fallback_path)):
                    file_content = Path(fallback_path).read_text(encoding="utf-8")
                    final_text = (
                        "✨ **单页 HTML 报告已由系统基于会话内容自动整理生成！**\n"
                        f"- **输出文件**：`/workspace/{Path(fallback_path).name}`\n"
                        "- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。\n\n"
                        f"```html\n{file_content}\n```"
                    )
                    healed_files.append(fallback_path)
                    state = evaluate_answer_state(final_text, has_physical_artifact=True)
            except Exception as e:
                print(f"⚠️ [Harness Agent Loop] 自动编译单页 HTML 失败: {e}")

        if not final_text or state.is_filler or state.has_internal_plan:
            if has_physical_artifact:
                final_text = (
                    "✅ **目标交付物已生成就绪！**\n\n"
                    "目标文件已生成并保存至工作区，您可以通过卡片下载或查看。"
                )
                state = evaluate_answer_state(final_text, has_physical_artifact=True)
            else:
                inf_cause = "model_empty_final" if executed_calls_history else "model_budget_exhausted"
                final_text = published_summary or _build_fallback_report(
                    messages,
                    executed_calls_history,
                    cause=inf_cause,
                    pending_items=[f"生成目标交付物 ({', '.join(expected_deliverables)})"] if expected_deliverables else None
                )
                state = evaluate_answer_state(final_text, has_physical_artifact)

    # 5. Token truncation suffix
    if was_token_truncated and "```html" not in final_text and not is_unclosed_or_truncated_html(final_text):
        truncation_suffix = (
            "\n\n---\n"
            "⚠️ **输出截断提醒（已达到模型单次 Token 上限）**\n"
            "- **状态说明**：上游模型输出达到最大长度限制提前结束。\n"
            "- **💡 通用建议**：如需获取后续完整内容，请直接回复「**继续**」，模型将从中断处接力输出。若需长篇内容，也可在提问中指定分段或分章节输出。"
        )
        if "输出截断提醒" not in final_text:
            final_text += truncation_suffix

    # 6. Auto-heal unexecuted file writes & refresh artifact/state
    if not is_guide_intent and not is_text_only_request(last_user_prompt) and not is_explicit_code_request(last_user_prompt):
        final_text, extra_healed = auto_heal_unexecuted_file_writes(final_text, workspace_dir)
        healed_files.extend(extra_healed)
        if extra_healed:
            artifacts = discover_physical_artifacts(
                workspace_dir,
                expected_deliverables=expected_deliverables,
                turn_start_time=turn_start_time
            )
            has_physical_artifact = bool(artifacts)
            state = evaluate_answer_state(final_text, has_physical_artifact)
            sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
            sys.stdout.write(f"<<<DSH_DELTA:{json.dumps(final_text, ensure_ascii=False)}>>>\n")
            sys.stdout.flush()
        elif not state.has_valid_html and (detect_unexecuted_script_leak(final_text) or detect_unexecuted_tool_argument_leak(final_text)):
            print("⚠️ [Harness Script Leak Guard] 检测到模型输出了未执行的脚本或参数回显且未能自愈，触发安全兜底...", flush=True)
            final_text = published_summary or _build_fallback_report(
                messages,
                executed_calls_history,
                cause="model_empty_final",
                trigger_evidence="模型输出了未执行的代码脚本或参数片段，自动执行自愈未通过",
                retry_advice="可直接回复「请重新生成该文件」或重新发送请求重试。"
            )
            state = evaluate_answer_state(final_text, has_physical_artifact)

    # 7. Sampling guard feedback
    feedback = sampling_feedback(final_text, last_user_prompt, messages, telemetry, execution_evidence, is_guide_intent)
    if feedback:
        final_text += "\n\n⚠️ **【数据覆盖度与真实性提示】**\n当前分析基于局部切片或抽样数据。\n" + feedback

    # 8. Check workbook mutation guidance if needed
    is_update_req = False
    has_update_deliverable = False
    if not is_guide_intent and last_user_prompt:
        from .intent_contract import is_modify_intent_requested
        from .task_intent import is_spreadsheet_mutation_requested
        is_update_req = (
            is_modify_intent_requested(last_user_prompt)
            or is_spreadsheet_mutation_requested(last_user_prompt)
        )
        if is_update_req:
            ws_path = Path(workspace_dir)
            if ws_path.exists():
                min_mtime = (turn_start_time - 2.0) if turn_start_time is not None else 0.0
                for f in ws_path.iterdir():
                    if f.is_file() and f.suffix.lower() in ('.xlsx', '.xlsm') and f.stat().st_size > 0 and f.stat().st_mtime >= min_mtime:
                        if not f.name.startswith(('~$', 'sample', 'test', 'temp', 'tmp')):
                            from .workbook_delivery import deliverable_is_valid
                            if deliverable_is_valid(f):
                                has_update_deliverable = True
                                break
            if not has_update_deliverable:
                is_avoidance = bool(re.search(
                    r'(?:无法自动建立.*绑定|手动完成.*快照|直接用于手动更新|移动或复制.*创建副本|建议您直接在原文件|手动回填需确保)',
                    final_text
                ))
                if is_avoidance:
                    guidance_block = (
                        "\n\n---\n"
                        "### 📁 目标列确认与执行引导\n"
                        "当前已完成源数据事实统计。由于目标工作簿中可能存在多列预测或需确认具体回填位置，为确保数据回填 100% 准确：\n"
                        "💡 **请告知明确的目标列**（例如：直接回复「填入 C 列」或指定目标列号），我将立即为您执行工作表复制、数据写入与公式重算物理交付。"
                    )
                    clean_core = re.split(r'###\s*📁\s*物理文件交付|建议您直接在原文件', final_text)[0].strip()
                    final_text = clean_core + guidance_block

    # 9. Headless workbook recalculation BEFORE contract validation (so cached values are present)
    t_recalc_start = time.time()
    _recalculate_generated_workbooks(workspace_dir, turn_start_time=turn_start_time)
    recalc_ms = (time.time() - t_recalc_start) * 1000

    # 10. Reconcile delivery numbers BEFORE metric contract validation
    t_recon_start = time.time()
    try:
        from .delivery_reconciliation import reconcile_delivery_presentation
        final_text = reconcile_delivery_presentation(
            final_text,
            workspace_dir,
            messages=messages,
            prompt=last_user_prompt,
            turn_start_time=turn_start_time,
            execution_evidence=execution_evidence
        )
    except Exception as e:
        logger.warning("Delivery reconciliation error: %s", e)
    recon_ms = (time.time() - t_recon_start) * 1000

    if recalc_ms > 200 or recon_ms > 200:
        logger.info("Finalization overhead: recalc=%.1fms, reconciliation=%.1fms", recalc_ms, recon_ms)

    # 11. Metric contract audit: strictly separates file existence, calculation completeness and text validity
    if not is_guide_intent and last_user_prompt:
        contract = build_analysis_contract(last_user_prompt)
        if contract.has_metrics:
            audit_ceiling = (
                max_spreadsheet_rounds
                if not expected_deliverables
                else max_agent_rounds
            )
            val_result = validate_reply_against_contract(
                contract=contract,
                reply_text=final_text or "",
                round_idx=audit_ceiling,
                max_rounds=audit_ceiling,
                messages=messages,
                execution_evidence=execution_evidence
            )
            llm_calls = getattr(telemetry, "llm_invocations", 0) if telemetry else 0
            is_budget_exhausted = bool(llm_calls >= audit_ceiling)
            if not val_result.is_pass:
                # Rigorous verified publication exemption:
                # Only exempt if update was published via formal workflow,
                # or execution evidence has a verified on-disk published receipt.
                # A generic HTML string or unrelated random file NEVER suppresses a metric failure!
                has_verified_published = bool(
                    (is_update_req and has_update_deliverable and published_summary)
                    or has_verified_published_receipt(execution_evidence, workspace_dir)
                )
                if not has_verified_published:
                    contract_warning = build_contract_termination_warning(
                        contract=contract,
                        val_result=val_result,
                        messages=messages,
                        telemetry=telemetry,
                        is_budget_exhausted=is_budget_exhausted
                    )
                    if val_result.comparison_error and execution_evidence is not None:
                        # Soft notice if substantive text is present
                        if final_text and len(final_text.strip()) > 30 and "【指标核算未完成声明】" not in final_text:
                            final_text = final_text.strip() + f"\n\n---\n💡 **提示**：本结论由模型直接解读与呈现，未完全通过结构化列比对回执（{val_result.comparison_error}）。"
                        else:
                            final_text = "本次比较结论尚未通过执行证据核验。" + contract_warning
                    elif "【指标核算未完成声明】" not in final_text:
                        final_text += contract_warning

    # 12. Sanitize and repair markdown image links (fixes blob URLs, relative paths and missing files)
    final_text = sanitize_and_repair_markdown_images(final_text, workspace_dir, turn_start_time=turn_start_time)

    # 13. Retrieval answer recovery pass
    from .retrieval_answer_recovery import ensure_retrieval_answer
    final_text = ensure_retrieval_answer(
        final_text, prompt=last_user_prompt, messages=messages,
        evidence=execution_evidence or [], telemetry=telemetry,
        model=model, policy=policy, deadline=deadline, call_model=call_model,
        token_truncated=was_token_truncated,
    )
    return final_text, healed_files
