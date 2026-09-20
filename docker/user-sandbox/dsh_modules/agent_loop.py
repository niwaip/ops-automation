"""
ReAct multi-turn agent execution loop for DeepSeek Harness (dsh).
Coordinates structured OpenAI tool calls, parallel tool dispatch, Nudge nudging,
and legacy format fallbacks.
"""

import re
import json
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .telemetry import TelemetryStats
from .tools import execute_tool, SANDBOX_TOOLS, get_sandbox_tools
from .llm import call_model_proxy, parse_tool_calls, clean_output, is_promising_action
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR


CLAIM_PATTERNS = [
    "已生成", "已经生成", "生成了", "输出了", "输出文件", "保存到", "已保存", "已经保存",
    "保存至", "输出为", "保存在", "写入了", "创建了", "落盘至", "生成完毕", "导出为",
    "导出了", "已导出", "保存路径", "文件已生成", "文档已生成"
]

DELIVERABLE_EXTS = {
    ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf",
    ".html", ".csv", ".json", ".py", ".sh", ".txt", ".png", ".jpg"
}


def detect_missing_claimed_artifacts(text: str) -> List[str]:
    """
    Detects if the model claimed in text to have generated or outputted deliverable files
    that do not physically exist on disk in WORKSPACE_DIR or KNOWLEDGE_DIR.
    """
    if not text:
        return []

    if not any(k in text for k in CLAIM_PATTERNS):
        return []

    fn_pattern = r'(?:《|【|“|"|\'|`|\/workspace\/|\/knowledge\/)?([a-zA-Z0-9_\-\u4e00-\u9fa5 ]+\.(?:docx?|xlsx?|pptx?|pdf|html|csv|json|py|sh|txt|png|jpg))(?:》|】|”|"|\'|`|\b)?'
    found_names = re.findall(fn_pattern, text)
    if not found_names:
        return []

    missing: List[str] = []
    has_inline_html = "```html" in text.lower()

    for name in found_names:
        clean_name = name.strip()
        if not clean_name:
            continue
        ext = Path(clean_name).suffix.lower()
        if ext not in DELIVERABLE_EXTS:
            continue
        if has_inline_html and clean_name in ["index.html", "presentation.html"]:
            continue

        ws_file = Path(WORKSPACE_DIR) / clean_name
        kn_file = Path(KNOWLEDGE_DIR) / clean_name

        exists_and_nonempty = (
            (ws_file.exists() and ws_file.is_file() and ws_file.stat().st_size > 0) or
            (kn_file.exists() and kn_file.is_file() and kn_file.stat().st_size > 0)
        )
        if not exists_and_nonempty and clean_name not in missing:
            missing.append(clean_name)

    return missing


def detect_passive_deflection(text: str) -> bool:
    """
    Detects if the model passively asked the user for URLs/context or made lazy brush-offs
    instead of autonomously using web_search or bash to investigate.
    """
    if not text:
        return False
    deflection_patterns = [
        r"请(?:您)?提供(?:更多|更详细|具体)?(?:的)?(?:链接|说明|上下文|信息)",
        r"(?:如果|若)(?:你|您)指的是某个具体(?:的)?(?:开源项目|仓库|项目|工具)",
        r"请(?:给出|发一下|提供)(?:具体)?(?:的)?(?:链接|网址|url)",
        r"无法确定(?:具体)?指(?:的)?是哪",
        r"请补充更多(?:的)?(?:上下文|信息|背景)",
        r"请告知更多上下文",
    ]
    return any(re.search(p, text) for p in deflection_patterns)


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
    deadline: Optional[float] = None,
    is_guide_intent: bool = False
) -> AgentLoopResult:
    """
    Executes the multi-turn ReAct tool calling loop up to max_rounds.
    """
    active_tools = tools if tools is not None else get_sandbox_tools()
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
            legacy_calls = parse_tool_calls(reply_text, is_guide=is_guide_intent)
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
            missing_artifacts = detect_missing_claimed_artifacts(reply_text)
            if missing_artifacts and round_idx < max_rounds - 1:
                print(f"⚡ [Harness Artifact Assertion Guard] 检测到模型声称生成了文件 {missing_artifacts}，但物理文件并不存在，正在强制拦截并引导执行工具落盘...", flush=True)
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({
                    "role": "user",
                    "content": f"【系统产物物理断言拦截】：你在回复中声称已生成或输出了文件 {', '.join(missing_artifacts)}，但沙箱物理文件系统检查发现该文件并不存在！请立刻调用 bash 或相应工具实际执行代码或脚本生成该文件并落盘保存到工作区 (/workspace/)，严禁只在文本回复中口头声称！"
                })
                continue

            # 在知识咨询与教程模式下，模型直接输出回答即为最佳结果，严禁强行推动执行工具
            if not is_guide_intent and is_promising_action(reply_text) and round_idx < max_rounds - 1:
                print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...", flush=True)
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({
                    "role": "user",
                    "content": "你刚才提出了具体的行动方案，请立刻使用对应的工具函数执行该操作，不要仅输出口头承诺！"
                })
                continue

            if not is_guide_intent and detect_passive_deflection(reply_text) and round_idx < max_rounds - 1:
                print("⚡ [Harness Anti-Deflection Guard] 检测到模型在技术查阅任务中消极推诿向用户索要链接/上下文，正在强制拦截并引导调用工具执行...", flush=True)
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({
                    "role": "user",
                    "content": "【系统行动指令拦截】：沙箱配备了完整的联网检索（web_search）与系统终端（bash）工具。严禁向用户索取链接或推诿要求更多上下文！请立即调用 web_search 搜索该技术项目、关键词或官方资料，或调用 bash 探测沙箱环境！"
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

            # 安全红线拦截：若当前为技术咨询/教程模式，严禁私自在终端执行环境安装与系统变更
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
                    messages.append({
                        "role": "tool",
                        "tool_call_id": t_id,
                        "name": t_name,
                        "content": tool_res
                    })
                    continue

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
    has_pending_tool_calls = bool(parse_tool_calls(reply_text, is_guide=is_guide_intent))
    final_text = clean_output(reply_text, is_guide=is_guide_intent)

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
            final_text = clean_output(forced_reply, is_guide=is_guide_intent) or forced_reply.strip()
        except TimeoutError:
            raise
        except Exception:
            pass

    if not final_text:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")
        if executed_calls_history:
            tool_names = ", ".join(sorted(set(executed_calls_history)))
            data_clues = []
            for msg in reversed(messages):
                if msg.get("role") == "tool" and msg.get("content"):
                    c_str = str(msg["content"]).strip()
                    if c_str and not c_str.startswith("未识别"):
                        for line in c_str.split("\n"):
                            clean_l = line.strip()
                            if clean_l and not clean_l.startswith("【") and len(clean_l) > 6:
                                data_clues.append(clean_l)
                                if len(data_clues) >= 4:
                                    break
                    if data_clues:
                        break
            clues_block = ("\n\n【沙箱已检索到的参考数据线索】:\n" + "\n".join(f"- {c}" for c in data_clues)) if data_clues else ""
            final_text = (
                f"⚠️ 沙箱已成功调用工具（{tool_names}）采集到相关数据，但在进行智能归纳时，"
                f"上游推理模型连接中断或未返回最终文本。{clues_block}\n\n"
                "💡 建议：可尝试重新提问，或在设置中切换为更稳定的模型重试。"
            )
        else:
            final_text = "⚠️ 沙箱运行正常，但上游模型未返回有效回复内容（可能网络连接超时或上游服务异常）。建议重新发送或切换模型重试。"

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        telemetry=telemetry,
        messages=messages
    )
