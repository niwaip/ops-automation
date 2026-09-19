"""
ReAct multi-turn agent execution loop for DeepSeek Harness (dsh).
Coordinates structured OpenAI tool calls, parallel tool dispatch, Nudge nudging,
and legacy format fallbacks.
"""

import re
import json
import time
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .telemetry import TelemetryStats
from .tools import execute_tool, SANDBOX_TOOLS
from .llm import call_model_proxy, parse_tool_calls, clean_output, is_promising_action


@dataclass
class AgentLoopResult:
    """Outcome of the multi-turn agent loop."""
    final_text: str = ""
    outbound_files: List[str] = field(default_factory=list)
    telemetry: TelemetryStats = field(default_factory=TelemetryStats)
    messages: List[Dict[str, Any]] = field(default_factory=list)


# 常见模型过渡性前导垫话特征词
ACTION_FILLER_KEYWORDS = [
    "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
    "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合"
]


def sanitize_preview(param_preview: Any, max_chars: int = 80) -> str:
    """Sanitizes sensitive tokens/passwords and limits preview string length."""
    if not param_preview:
        return ""
    text = re.sub(r'\s+', ' ', str(param_preview)).strip()
    text = re.sub(r'(?i)(sk-[a-zA-Z0-9_-]{8})[a-zA-Z0-9_-]+', r'\1****', text)
    text = re.sub(r'(?i)(bearer\s+)[a-zA-Z0-9_.\-]{8,}', r'\1****', text)
    text = re.sub(r'(?i)(password|secret|token|api_key|apikey)\s*[:=]\s*["\']?[^"\'\s,]+["\']?', r'\1=****', text)
    if len(text) > max_chars:
        text = text[:max_chars] + "..."
    return text


def run_agent_loop(
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    max_rounds: int,
    tools: Optional[List[Dict[str, Any]]] = None,
    deadline: Optional[float] = None
) -> AgentLoopResult:
    """
    Executes the multi-turn ReAct tool calling loop up to max_rounds.
    """
    active_tools = tools if tools is not None else SANDBOX_TOOLS
    telemetry = TelemetryStats()
    outbound_files: List[str] = []
    executed_calls_history: List[str] = []
    reply_text = ""

    for round_idx in range(max_rounds):
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                print(f"⚠️ [Harness Timeout] 总任务执行已达到硬截止时间 ({policy.total_task_timeout}s)，立即终止", flush=True)
                raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")
        llm_res = call_model_proxy(
            messages,
            model,
            tools=active_tools,
            timeout=policy.single_request_timeout,
            deadline=deadline
        )
        reply_text = llm_res.get("content", "") if isinstance(llm_res, dict) else str(llm_res)
        structured_calls = list(llm_res.get("tool_calls", [])) if isinstance(llm_res, dict) else []

        telemetry.record_llm_response(llm_res, is_first_round=(round_idx == 0))

        # 混合兼容降级：若 structured_calls 为空但模型文本中含有 XML/DSML tool_call 标签
        if not structured_calls and reply_text:
            legacy_calls = parse_tool_calls(reply_text)
            if legacy_calls:
                for i, lc in enumerate(legacy_calls):
                    structured_calls.append({
                        "id": f"call_legacy_{round_idx}_{i}",
                        "type": "function",
                        "function": {
                            "name": lc["name"],
                            "arguments": json.dumps(lc.get("params", {}), ensure_ascii=False)
                        }
                    })

        # 若当轮无任何工具调用
        if not structured_calls:
            if is_promising_action(reply_text) and round_idx < max_rounds - 1:
                print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...", flush=True)
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({
                    "role": "user",
                    "content": "你刚才提出了具体的行动方案，请立刻使用对应的工具函数执行该操作，不要仅输出口头承诺！"
                })
                continue
            break

        # 按照标准 OpenAI 规范记录助手消息（包含当轮所有 tool_calls）
        assistant_msg = {
            "role": "assistant",
            "content": reply_text or None,
            "tool_calls": structured_calls
        }
        messages.append(assistant_msg)

        # 支持多工具/并行工具执行：遍历当轮全部工具调用
        is_file_sent = False
        for tc in structured_calls:
            telemetry.record_tool_call()
            t_id = tc.get("id") or f"call_{round_idx}_{telemetry.tool_invocations}"
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

            # 参数脱敏与日志格式化
            raw_preview = (
                t_params.get("__search_query") or
                t_params.get("query") or
                t_params.get("cmd") or
                t_params.get("city") or
                str(t_params)
            )
            clean_param = sanitize_preview(raw_preview, max_chars=policy.param_preview_chars)
            print(f"⚡ [Harness Tool Call] 正在调用工具: {t_name}({clean_param})...", flush=True)

            # 死循环拦截：检测连续调用相同工具且参数完全一致
            call_sig = f"{t_name}:{json.dumps(t_params, sort_keys=True, ensure_ascii=False)}"
            is_idempotent_read = t_name in ("read_skill", "read_workspace_file", "weather")
            threshold = 1 if is_idempotent_read else 2
            if executed_calls_history.count(call_sig) >= threshold:
                print(f"⚠️ [Harness Loop Intercept] 工具 [{t_name}] 已重复调用，主动阻断死循环", flush=True)
                tool_res = f"【系统提示】检测到该工具 ({t_name}) 已调用过且参数完全一致。结果已在上方历史中，请立即停止重复调用，直接根据现有信息继续执行或给出最终回答。"
            else:
                executed_calls_history.append(call_sig)
                tool_res = execute_tool(t_name, t_params, deadline=deadline)

            print(f"✓ 工具 [{t_name}] 执行完成", flush=True)

            # 收集工具输出中的外发文件协议标记
            for m in re.findall(r'<<<DSH_OUTBOUND_FILE:(.*?)>>>', tool_res):
                outbound_files.append(m.strip())

            if t_name.lower() in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat"]:
                is_file_sent = True

            # 预算控制：截断超长工具输出，防止上下文爆满
            clipped_tool_res = ContextBudget.clip_tool_result(tool_res, max_chars=policy.max_tool_result_chars)

            # 按照标准 OpenAI Tool 规范回传
            messages.append({
                "role": "tool",
                "tool_call_id": t_id,
                "name": t_name,
                "content": clipped_tool_res
            })

        if is_file_sent:
            messages.append({
                "role": "user",
                "content": "文件已成功标记并推送至即时通讯通道。请直接回复用户，告知文件已发送，请其查收即可。无需再调用任何其他工具。"
            })
            final_step = call_model_proxy(
                messages,
                model,
                timeout=policy.single_request_timeout,
                deadline=deadline
            )
            telemetry.record_llm_response(final_step, is_first_round=False)
            reply_text = final_step.get("content", "") if isinstance(final_step, dict) else str(final_step)
            break

    # 检查是否仍有未执行的工具调用请求或过渡垫话
    has_pending_tool_calls = bool(parse_tool_calls(reply_text))
    final_text = clean_output(reply_text)

    is_transitional_filler = (
        len(final_text) < 120 and
        (any(kw in final_text for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(reply_text))
    )

    has_raw_dsml = bool(re.search(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}', reply_text))
    has_raw_tool = bool(re.search(r'<(?:tool_call|tool_calls)', reply_text))

    if has_pending_tool_calls or not final_text or is_transitional_filler or has_raw_dsml or has_raw_tool:
        messages.append({"role": "assistant", "content": reply_text or None})
        messages.append({
            "role": "user",
            "content": "工具调用轮次已结束。请根据目前已探索和收集到的所有信息与仓库内容，直接给出深入、结构完整、详尽的最终中文回答（严禁输出中间过渡垫话或未执行的工具标签）。"
        })
        try:
            forced_res = call_model_proxy(
                messages,
                model,
                timeout=policy.single_request_timeout,
                deadline=deadline
            )
            telemetry.record_llm_response(forced_res, is_first_round=False)
            forced_reply = forced_res.get("content", "") if isinstance(forced_res, dict) else str(forced_res)
            final_text = clean_output(forced_reply) or forced_reply.strip()
        except TimeoutError:
            raise
        except Exception:
            pass

    if not final_text:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")
        final_text = "已为您完成沙箱智能检索与数据分析，未获取到更多额外内容。"

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        telemetry=telemetry,
        messages=messages
    )
