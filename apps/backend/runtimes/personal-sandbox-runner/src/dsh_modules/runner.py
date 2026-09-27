"""
Agent orchestration loop, CLI entrypoint, and session lifecycle runner for DeepSeek Harness (dsh).
"""

import os
import sys
import json
import re
import time
import subprocess
import urllib.error
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, print_banner
from .tools import scan_personal_knowledge, perform_multi_web_search, read_workspace_file, get_sandbox_tools, execute_tool
from .web_tools import enrich_search_context_with_pages
from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .prompt_builder import build_system_prompt, build_user_turn
from .skill_router import SkillRouter
from .agent_loop import run_agent_loop
from .artifact_exporter import ArtifactExporter
from .telemetry import TelemetryStats
from .deliverable_contract import requests_markdown_artifact
from .html_report_fallback import materialize_html_report_fallback
from .llm import call_model_proxy, clean_output, parse_tool_calls



WEATHER_RE = re.compile(
    r'(天气|气象|气温|温度|下雨|降雨|暴雨|晴天|预报|几度|转晴|多云|'
    r'\bweather\b|\bforecast\b|\btemperature\b|\brain(?:ing|y)?\b|\bsnow(?:ing|y)?\b)',
    re.IGNORECASE,
)
REMINDER_RE = re.compile(r'(提醒|闹钟|待办|日程|remind\s+me|reminder|alarm)', re.I)


def _run_planning_phase(
    prompt: str,
    messages: List[Dict[str, Any]],
    model_name: str,
    policy: RuntimePolicy,
    deadline: Optional[float] = None,
    has_web_search_permission: bool = True,
) -> Optional[str]:
    """Execute the thinking model in the planning phase to reason, architect, and outline.
    Only allows read-only web retrieval tools (web_search, fetch_page) to ground external facts,
    strictly prohibiting any mutating tools (bash, write_file, patch_file, reminders, etc.).
    """
    planning_policy = RuntimePolicy(
        temperature=policy.temperature,
        model_socket_timeout=policy.model_socket_timeout,
        single_request_timeout=min(policy.single_request_timeout, 120),
        total_task_timeout=policy.total_task_timeout,
        thinking=True,
        reasoning_effort=policy.reasoning_effort or "medium",
    )
    planning_tools = (
        get_sandbox_tools(allowed_names={"web_search", "fetch_page"})
        if has_web_search_permission else None
    )

    planning_instruction = (
        "【规划阶段任务】：请针对用户的需求与交付物目标进行深入思考与方案规划。\n"
        "1. 深入分析用户目标、页面/内容结构、排版与视觉设计规范。\n"
        "2. 若涉及外部开源项目、未知技术组件、最新库/API 或特定插件生态，你可以调用 `web_search` 与 `fetch_page` 检索一手技术事实与官方依据（本阶段仅开放只读网络检索，严禁且不支持写文件或执行命令工具）。\n"
        "3. 给出详细的实现与落盘规划（包括功能模块划分、代码逻辑与目标落盘文件路径，如 `/workspace/index.html`）。\n"
        "4. 输出清晰详尽的规划方案。本阶段仅负责思考与架构规划，规划完成后系统将切换至执行与代码落盘阶段。"
    )

    planning_messages = [
        *messages,
        {
            "role": "user",
            "content": planning_instruction,
        },
    ]

    max_search_rounds = 2
    executed_search_count = 0

    try:
        print("🧠 [Harness Planning Phase] 开启思考模式：正在规划任务方案与实现架构...", flush=True)

        while executed_search_count <= max_search_rounds:
            res = call_model_proxy(
                planning_messages,
                model_name,
                tools=planning_tools if executed_search_count < max_search_rounds else None,
                timeout=planning_policy.single_request_timeout,
                deadline=deadline,
                policy=planning_policy,
            )

            res_text = res.get("content", "") if isinstance(res, dict) else str(res or "")
            raw_tool_calls = res.get("tool_calls", []) if isinstance(res, dict) else []

            # 过滤只允许规划阶段工具
            allowed_calls = []
            if raw_tool_calls:
                for tc in raw_tool_calls:
                    fn_name = tc.get("function", {}).get("name", "").lower()
                    if fn_name in {"web_search", "fetch_page"}:
                        allowed_calls.append(tc)

            if not allowed_calls and res_text:
                # 兼容文本形式的 tool_calls
                text_calls = parse_tool_calls(res_text)
                for tc in text_calls:
                    fn_name = tc.get("name", "").lower()
                    if fn_name in {"web_search", "fetch_page"}:
                        allowed_calls.append({
                            "id": tc.get("id") or f"plan_call_{int(time.time()*1000)}",
                            "type": "function",
                            "function": {
                                "name": tc.get("name"),
                                "arguments": json.dumps(tc.get("parameters", {}))
                            }
                        })

            # 如果没有发起工具调用，或者已达到最大搜索轮次，说明规划思考完成
            if not allowed_calls or executed_search_count >= max_search_rounds:
                clean_plan = clean_output(res_text).strip()
                if clean_plan:
                    print("✓ [Harness Planning Phase] 任务规划完成，进入执行与工具调用阶段。", flush=True)
                    return clean_plan
                break

            # 执行规划期只读搜索工具
            executed_search_count += 1
            call_names = [c["function"]["name"] for c in allowed_calls]
            print(f"🔍 [Harness Planning Search] 规划期检索外部事实 (轮次 {executed_search_count}/{max_search_rounds}): {call_names}", flush=True)

            planning_messages.append({
                "role": "assistant",
                "content": res_text or None,
                "tool_calls": allowed_calls
            })

            for tc in allowed_calls:
                t_id = tc.get("id") or f"plan_call_{int(time.time()*1000)}"
                fn = tc.get("function", {})
                t_name = fn.get("name")
                t_args_raw = fn.get("arguments", "{}")
                try:
                    t_params = json.loads(t_args_raw) if isinstance(t_args_raw, str) else (t_args_raw or {})
                except Exception:
                    t_params = {}

                print(f"-> 规划期检索调用: {t_name}({t_params})", flush=True)
                t_res = execute_tool(t_name, t_params, deadline=deadline)
                clipped_res = ContextBudget.clip_tool_result(t_res, max_chars=4000)
                planning_messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": clipped_res
                })

            planning_messages.append({
                "role": "user",
                "content": "已获取上述检索数据。请结合上述真实事实，输出最终详尽的实施与架构落盘规划方案（本阶段无需再次调用工具）。"
            })

    except Exception as e:
        print(f"⚠️ [Harness Planning Phase] 规划阶段异常，降级直接进入执行阶段: {e}", flush=True)
    return None



def select_active_tools(
    prompt: str,
    skill_res,
    is_search_intent: bool,
    has_web_search_permission: bool,
) -> list:
    """Selects a small stable tool surface plus intent-scoped capabilities.

    Read-only web tools remain visible whenever web access is enabled. Intent
    detection may eagerly fetch obvious live information, but it must never be
    the capability gate: new sites and unfamiliar wording should still work.
    """
    if requests_markdown_artifact(prompt) and not skill_res.skill_id:
        allowed = {"write_markdown"}
        if has_web_search_permission:
            allowed.update({"web_search", "fetch_page"})
        if skill_res.is_knowledge_intent or skill_res.is_inspect_intent:
            allowed.update({"scan_knowledge", "read_file"})
        return get_sandbox_tools(allowed_names=allowed)

    # 1. 纯查看/审阅/归纳意图：无论是否匹配技能，均限制在只读工具面，严禁开放 bash、write_file、patch_file 等写盘工具
    if skill_res.is_inspect_intent and not (skill_res.is_generate_intent or skill_res.requires_execution):
        allowed = {"read_file", "scan_knowledge", "vision_inspect"}
        if has_web_search_permission:
            allowed.update({"web_search", "fetch_page"})
        if skill_res.is_send_intent:
            allowed.add("send_file")
        tools = get_sandbox_tools(allowed_names=allowed)
    # 2. 复杂生成、明确需要物理落盘产物的技能，提供完整执行环境（bash、文件与技能工具）
    elif skill_res.is_generate_intent or skill_res.requires_execution or (skill_res.skill_id and not skill_res.is_inspect_intent):
        tools = get_sandbox_tools()
    else:
        allowed = {"web_search", "fetch_page"} if has_web_search_permission else set()
        if WEATHER_RE.search(prompt):
            allowed.add("weather")
        if REMINDER_RE.search(prompt):
            allowed.update({"create_reminders", "update_reminder", "delete_reminder"})
        if requests_markdown_artifact(prompt):
            allowed.add("write_markdown")
        if skill_res.is_knowledge_intent:
            allowed.update({"scan_knowledge", "read_file"})
        if skill_res.is_inspect_intent:
            allowed.update({"read_file", "scan_knowledge", "vision_inspect"})
        if skill_res.is_send_intent:
            allowed.add("send_file")
        tools = get_sandbox_tools(allowed_names=allowed) if allowed else []

    if not has_web_search_permission:
        tools = [
            tool for tool in tools
            if tool.get("function", {}).get("name") not in {"web_search", "fetch_page"}
        ]
    if skill_res.skill_id and getattr(skill_res, "skill_context", ""):
        # The router already injected this skill's contract into the prompt.
        # Keeping read_skill available invites small models to spend another
        # round rereading the same long document or switching formats.
        tools = [
            tool for tool in tools
            if tool.get("function", {}).get("name") != "read_skill"
        ]
    return tools


def load_session_history(session_id: str) -> tuple[Optional[Path], list]:
    """Loads session conversation history from workspace storage."""
    if not session_id:
        return None, []
    clean_sid = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)
    sessions_dir = Path(WORKSPACE_DIR) / ".dsh" / "sessions"
    try:
        sessions_dir.mkdir(parents=True, exist_ok=True)
        history_file = sessions_dir / f"{clean_sid}.json"
        if history_file.exists():
            with open(history_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    return history_file, [item for item in loaded if isinstance(item, dict)]
        return history_file, []
    except Exception:
        return None, []


def resolve_session_attachments(args, session_id: str) -> list[str]:
    """Resolves scoped files bound to the current session."""
    session_files = []
    raw_files = getattr(args, "files", None)
    if raw_files:
        return [f.strip() for f in str(raw_files).split(",") if f.strip()]
    if not session_id:
        return []

    clean_sid = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)
    att_file = Path(WORKSPACE_DIR) / ".dsh" / "sessions" / f"{clean_sid}.attachments.json"
    if att_file.exists():
        try:
            with open(att_file, "r", encoding="utf-8") as f:
                loaded_att = json.load(f)
                if isinstance(loaded_att, list):
                    for item in loaded_att:
                        if isinstance(item, str) and item.strip():
                            session_files.append(item.strip())
                        elif isinstance(item, dict) and "fileName" in item:
                            session_files.append(str(item["fileName"]).strip())
        except Exception:
            pass
    return session_files


def resolve_model_display_name(model_name: Optional[str], model_display_name: Optional[str]) -> Optional[str]:
    """Resolves human-readable model name if only an opaque UUID was provided."""
    if model_display_name and not bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', str(model_display_name).strip(), re.I)):
        return model_display_name
    target_uuid = model_name or model_display_name
    if target_uuid and bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', str(target_uuid).strip(), re.I)):
        try:
            from .config import DEFAULT_PROXY_URL, VIRTUAL_API_KEY
            req = urllib.request.Request(
                f"{DEFAULT_PROXY_URL.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {VIRTUAL_API_KEY}"}
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for m in data.get("data", []):
                    if m.get("id") == target_uuid and m.get("name"):
                        return m["name"]
        except Exception:
            pass
    return model_display_name


def cmd_run(args):
    """Main CLI runner for user queries, orchestrating policy, context, ReAct loop, and artifacts."""
    prompt = " ".join(args.query) if isinstance(args.query, list) else str(args.query)
    if not prompt.strip():
        print("Error: query prompt is required.", file=sys.stderr)
        sys.exit(1)

    print_banner()
    overall_start_time = time.time()
    policy = RuntimePolicy.from_env()
    cli_timeout = getattr(args, "timeout", None)
    if cli_timeout and isinstance(cli_timeout, int) and cli_timeout > 0:
        policy.total_task_timeout = cli_timeout
        policy.timeout_seconds = cli_timeout
        policy.single_request_timeout = min(cli_timeout, 240)

    cli_thinking = getattr(args, "thinking", None)
    if cli_thinking is not None:
        policy.thinking = bool(cli_thinking)
    cli_effort = getattr(args, "reasoning_effort", None)
    if cli_effort:
        policy.reasoning_effort = str(cli_effort)

    task_deadline = time.monotonic() + policy.total_task_timeout
    session_id = getattr(args, "session_id", None)
    history_file, existing_history = load_session_history(session_id)

    # 1. 意图与技能解析 (精确规则 + Slash 命令)
    allow_research = bool(getattr(args, "research", False))
    skill_res = SkillRouter.route(prompt, existing_history, allow_research=allow_research)
    knowledge_context = scan_personal_knowledge() if skill_res.is_knowledge_intent else ""


    # 2. 联网前置检索
    # args.web_search 仅表示沙箱具备联网检索工具能力，绝不能将所有普通对话/生成需求直接断定为纯检索任务！
    # 只有当用户显式要求搜索（如以 /search 起始）或语义路由命中真实外部资讯检索意图（is_search_intent）时，才执行前置联网检索
    has_web_search_permission = bool(args.web_search)
    is_weather_intent = bool(WEATHER_RE.search(prompt))
    is_search_intent = (
        prompt.strip().startswith("/search ")
        or skill_res.is_search_intent
        or is_weather_intent
    )
    search_context = ""
    if is_search_intent and has_web_search_permission:
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded before pre-search")
        search_prompt = SkillRouter.resolve_contextual_query(prompt, existing_history)
        if search_prompt != prompt:
            print(f"🔍 [Harness Web Search] 正在检索实时数据: '{search_prompt}' (根据上下文消歧指代: '{prompt}')...", flush=True)
        else:
            print(f"🔍 [Harness Web Search] 正在检索实时数据: '{prompt}'...", flush=True)
        search_context = perform_multi_web_search(search_prompt, deadline=task_deadline)
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded during pre-search")
        if search_context:
            print("✓ 实时数据检索成功，已注入分析上下文。", flush=True)
            # 若检索到包含高价值外部页面，抓取页面正文以提供真实事实依据
            page_deadline = min(task_deadline, time.monotonic() + 10.0) if task_deadline is not None else (time.monotonic() + 10.0)
            original_search_context = search_context
            try:
                enriched = enrich_search_context_with_pages(
                    search_context,
                    max_pages=2,
                    max_chars_per_page=2_500,
                    deadline=page_deadline,
                )
                if enriched and enriched != original_search_context:
                    search_context = enriched
                    print("✓ 已抓取高价值页面正文，将基于原文整理。", flush=True)
            except Exception:
                search_context = original_search_context

    model_name = getattr(args, "model", None) or os.environ.get("DSH_MODEL") or None
    raw_display_name = getattr(args, "model_display_name", None) or os.environ.get("DSH_MODEL_DISPLAY_NAME") or None
    model_display_name = resolve_model_display_name(model_name, raw_display_name)

    # 3. 提取当前会话附件内容
    session_files = resolve_session_attachments(args, session_id)
    file_context = ""
    for fname in session_files:
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded before attachment extraction")
        fpath = Path(WORKSPACE_DIR) / fname
        if fpath.exists() and fpath.is_file():
            extracted = read_workspace_file(fname, deadline=task_deadline, model_name=model_name)
            if extracted and not extracted.startswith("文件未找到"):
                clipped = ContextBudget.clip_attachment(extracted, policy.max_attachment_chars)
                file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"

    # 4. 组装 System Prompt 与 User Turn (保持前缀稳定以命中 Prompt Caching)
    system_prompt = build_system_prompt(
        WORKSPACE_DIR,
        KNOWLEDGE_DIR,
        model_name=model_name,
        model_display_name=model_display_name
    )
    messages = [{"role": "system", "content": system_prompt}]

    budgeted_history, dropped_count = ContextBudget.budget_history(
        existing_history, policy.max_history_chars, policy.max_single_history_chars
    )
    if dropped_count > 0:
        messages.append({"role": "system", "content": f"[系统提示：为确保高效响应，早期 {dropped_count} 条历史交互已自动精简归档]"})
    messages.extend(budgeted_history)

    from .prompt_builder import get_current_timestamp_str
    user_turn_text = build_user_turn(
        prompt=prompt,
        session_files=session_files,
        file_context=file_context,
        knowledge_context=knowledge_context,
        skill_context=skill_res.skill_context,
        search_context=search_context,
        is_send_intent=skill_res.is_send_intent,
        is_search_intent=is_search_intent,
        is_ppt_intent=skill_res.is_ppt_intent,
        is_design_intent=skill_res.is_design_intent,
        is_docx_intent=skill_res.is_docx_intent,
        is_office_intent=skill_res.is_office_intent,
        is_research_intent=skill_res.is_research_intent,
        is_inspect_intent=skill_res.is_inspect_intent,
        is_generate_intent=skill_res.is_generate_intent,
        is_guide_intent=skill_res.is_guide_intent,
        existing_history=existing_history,
        max_skill_chars=policy.max_skill_chars,
        timestamp_str=get_current_timestamp_str(policy.timezone)
    )
    messages.append({"role": "user", "content": user_turn_text})

    # 5. 执行 ReAct 代理循环
    max_rounds = policy.determine_max_rounds(
        prompt,
        is_design_or_ppt=(skill_res.is_ppt_intent or skill_res.is_design_intent),
        is_search=is_search_intent,
        is_guide=skill_res.is_guide_intent,
        is_office=skill_res.is_office_intent,
        skill_res=skill_res,
        deliverables=skill_res.deliverables,
        requires_execution=skill_res.requires_execution,
        default_rounds=skill_res.default_rounds,
        is_generate_intent=skill_res.is_generate_intent,
        is_inspect_intent=skill_res.is_inspect_intent
    )

    active_tools = select_active_tools(
        prompt,
        skill_res,
        is_search_intent,
        has_web_search_permission,
    )

    # 5. 思考模式调度：规划阶段（开启思考与架构设计） -> 执行与工具调用阶段（关闭思考）
    is_deliverable_task = skill_res.is_generate_intent or skill_res.requires_execution
    if policy.thinking and is_deliverable_task:
        plan_text = _run_planning_phase(
            prompt,
            messages,
            model_name,
            policy,
            deadline=task_deadline,
            has_web_search_permission=has_web_search_permission,
        )
        if plan_text:
            messages.append({"role": "assistant", "content": f"【方案规划】\n{plan_text}"})
            messages.append({
                "role": "user",
                "content": (
                    "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
                    "落盘方式（任选其一，推荐方式 2）：\n"
                    "1. 调用 `bash` 工具（如 `cat << 'EOF' > /workspace/index.html`）写入目标文件；\n"
                    "2. 直接在回复中输出完整的 ```html\n<!DOCTYPE html>\n...完整可运行代码...\n``` 代码块（系统将自动写入 /workspace/index.html 并在前端展示交互预览与全屏组件）。\n"
                    "⚠️ 严禁仅输出‘已存在’、‘已保存’等口头文字而不提供代码或工具调用！必须提供完整代码！"
                ),
            })
        policy.thinking = False
        policy.reasoning_effort = None
        print("⚡ [Harness Phase Transition] 切换为执行与工具调用阶段：精简推理，优先调用工具落盘。", flush=True)
    elif is_deliverable_task and policy.thinking:
        policy.thinking = False
        policy.reasoning_effort = None

    try:
        loop_res = run_agent_loop(
            messages,
            model_name,
            policy,
            max_rounds,
            tools=active_tools,
            deadline=task_deadline,
            is_guide_intent=skill_res.is_guide_intent,
            turn_start_time=overall_start_time,
            expected_deliverables=skill_res.deliverables,
            is_generate_intent=skill_res.is_generate_intent,
            is_inspect_intent=skill_res.is_inspect_intent
        )

        # 6. 产物导出与落盘 (HTML/PPT 及各种文档交付物)
        final_text, exported_html_files = ArtifactExporter.export_html(
            loop_res.final_text,
            skill_res.is_ppt_intent,
            WORKSPACE_DIR,
            turn_start_time=overall_start_time,
            is_design_intent=skill_res.is_design_intent,
            prompt=prompt,
            history=existing_history
        )

        detected_deliverables = ArtifactExporter.export_deliverables(
            WORKSPACE_DIR,
            final_text,
            turn_start_time=overall_start_time
        )

        # 7. 会话历史持久化
        if history_file:
            try:
                existing_history.append({"role": "user", "content": prompt})
                existing_history.append({"role": "assistant", "content": final_text})
                with open(history_file, "w", encoding="utf-8") as f:
                    json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2, default=str)
            except Exception:
                pass

        # 8. 协议标记与结果序列化
        elapsed_ms = (time.time() - overall_start_time) * 1000
        loop_res.telemetry.set_wall_clock_duration(elapsed_ms)
        outbound_set = list(loop_res.outbound_files)
        for exp_f in (exported_html_files or []):
            payload = json.dumps({"filePath": exp_f, "fileName": Path(exp_f).name}, ensure_ascii=False)
            if payload not in outbound_set and not any(Path(exp_f).name in existing for existing in outbound_set):
                outbound_set.append(payload)
        for item in detected_deliverables:
            payload = json.dumps({"filePath": item["filePath"], "fileName": item["fileName"]}, ensure_ascii=False)
            if payload not in outbound_set and not any(item["fileName"] in existing for existing in outbound_set):
                outbound_set.append(payload)
        TelemetryStats.emit_outbound_files(outbound_set)
        if getattr(loop_res, "outbound_reminders", None):
            TelemetryStats.emit_outbound_reminders(loop_res.outbound_reminders)
        loop_res.telemetry.emit_metrics_event()
        TelemetryStats.emit_final_output(final_text)

    except TimeoutError as e:
        if search_context:
            _emit_search_evidence_fallback(prompt, search_context, existing_history, history_file, policy)
            return
        if _emit_html_report_recovery(prompt, skill_res, existing_history, history_file, policy):
            return
        print(f"\n❌ [DeepSeek Harness 超时]: 任务执行超时: {e}", file=sys.stderr)
        sys.exit(124)
    except urllib.error.HTTPError as e:
        try:
            if hasattr(e, "read") and callable(e.read):
                raw = e.read()
                err_msg = raw.decode("utf-8", errors="ignore") if isinstance(raw, (bytes, bytearray)) else str(raw)
            else:
                err_msg = str(getattr(e, "msg", None) or getattr(e, "reason", None) or e)
        except Exception:
            err_msg = str(e)
        try:
            err_json = json.loads(err_msg)
            err_detail = err_json.get("message", err_msg)
        except Exception:
            err_detail = err_msg
        if search_context:
            _emit_search_evidence_fallback(prompt, search_context, existing_history, history_file, policy)
            return
        if _emit_tool_result_recovery(messages, prompt, existing_history, history_file, policy):
            return
        print(f"\n❌ [DeepSeek Harness 异常]: 大模型代理调用失败 ({e.code}): {err_detail}")
        sys.exit(1)
    except Exception as e:
        raw_error = str(e)
        if search_context:
            _emit_search_evidence_fallback(prompt, search_context, existing_history, history_file, policy)
            return
        if _emit_html_report_recovery(prompt, skill_res, existing_history, history_file, policy):
            return
        if _emit_tool_result_recovery(messages, prompt, existing_history, history_file, policy):
            return
        if re.search(r'(?:\baborted\b|timeout|timed out|socket hang up|econnreset)', raw_error, re.I):
            print("\n❌ [DeepSeek Harness 超时]: 模型响应超时或连接中断，本次任务未完成且未生成可用产物。请重试。")
        else:
            print(f"\n❌ [DeepSeek Harness 异常]: 执行异常: {e}")
        sys.exit(1)


def _emit_tool_result_recovery(messages, prompt, existing_history, history_file, policy):
    """Recover and directly present already-executed tool results when upstream model disconnects."""
    if not messages or not isinstance(messages, list):
        return False
    tool_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "tool" and m.get("content")]
    if not tool_messages:
        return False

    # 1. 优先挽救天气执行结果
    weather_tools = [
        m for m in tool_messages
        if "气象" in str(m.get("content", "")) or "weather" in str(m.get("name", "")).lower()
    ]
    if weather_tools:
        weather_content = str(weather_tools[-1].get("content", "")).strip()
        final_text = (
            "## 实时天气与气象预报\n\n"
            "气象数据已成功获取。上游大模型在整理排版阶段连接中断，系统已直接为您提取并呈现权威气象结果：\n\n"
            f"{weather_content}"
        )
        if history_file:
            try:
                existing_history.append({"role": "user", "content": prompt})
                existing_history.append({"role": "assistant", "content": final_text})
                with open(history_file, "w", encoding="utf-8") as f:
                    json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2, default=str)
            except Exception:
                pass
        TelemetryStats.emit_final_output(final_text)
        return True

    # 2. 挽救网页检索结果
    search_tools = [
        m for m in tool_messages
        if "web_search" in str(m.get("name", "")).lower() or "【多查询联网检索" in str(m.get("content", ""))
    ]
    if search_tools:
        search_content = str(search_tools[-1].get("content", "")).strip()
        _emit_search_evidence_fallback(prompt, search_content, existing_history, history_file, policy, model_failed=True)
        return True

    return False


def _emit_html_report_recovery(prompt, skill_res, existing_history, history_file, policy):
    """Recover an HTML deliverable from existing grounded session content."""
    if not (skill_res.is_generate_intent and skill_res.is_design_intent):
        return False
    try:
        out_path = materialize_html_report_fallback(prompt, existing_history, WORKSPACE_DIR)
    except Exception:
        return False
    if not out_path:
        return False
    final_text = (
        "⚠️ 上游模型在写入阶段连接中断，系统已使用本会话中已有的有效内容恢复生成单页报告。\n\n"
        f"- **输出文件**：`{out_path}`\n"
        "- **数据说明**：未补写新的事实或数据，可直接预览或下载。"
    )
    try:
        content = Path(out_path).read_text(encoding="utf-8")
        if content:
            final_text += f"\n\n```html\n{content}\n```\n"
    except Exception:
        pass
    payload = json.dumps({"filePath": out_path, "fileName": Path(out_path).name}, ensure_ascii=False)
    TelemetryStats.emit_outbound_files([payload])
    if history_file:
        try:
            existing_history.append({"role": "user", "content": prompt})
            existing_history.append({"role": "assistant", "content": final_text})
            with open(history_file, "w", encoding="utf-8") as f:
                json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2, default=str)
        except Exception:
            pass
    TelemetryStats.emit_final_output(final_text)
    return True



def _emit_search_evidence_fallback(
    prompt,
    search_context,
    existing_history,
    history_file,
    policy,
    model_failed=True,
):
    """Deliver verified links when model synthesis fails after a successful search."""
    link_pattern = re.compile(r'(?:^|\n)(?:\d+\.\s*)?\[([^\]]+)\]\((https?://[^)]+)\)(?:[^\n]*)\n?\s*([^\n]*)')
    seen = set()
    items = []
    for title, url, snippet in link_pattern.findall(search_context or ""):
        key = url.rstrip('/').casefold()
        if key in seen:
            continue
        seen.add(key)
        clean_snippet = re.sub(r'\s+', ' ', snippet).strip()
        clean_snippet = re.sub(r'^[|#>*\-\s]+', '', clean_snippet)
        if re.search(r'README(?:\.i18n)?\.ya?ml|docs\(readme\)|ctx\.registry|ctx\.plugin', clean_snippet, re.I):
            clean_snippet = ''
        items.append((title.strip(), url.strip(), clean_snippet[:240]))

    official_repo = 'https://github.com/deepseek-ai/deepseek-harness'
    official_releases = f'{official_repo}/releases'
    item_urls = {item[1].rstrip('/').casefold() for item in items}
    is_harness_query = bool(re.search(r'(?:harness|deepseek|dsh)', f"{prompt} {search_context or ''}".casefold()))
    if is_harness_query and official_repo in item_urls and official_releases not in item_urls:
        items.append((
            'DeepSeek Harness Releases',
            official_releases,
            '官方版本与发布记录页面；请以该页面显示的实际发布内容为准。',
        ))

    def evidence_priority(item):
        url = item[1].rstrip('/').casefold()
        if is_harness_query:
            if url == official_repo:
                return (0, url)
            if url.startswith(official_releases):
                return (1, url)
            if url.startswith(official_repo):
                return (2, url)
        if any(auth in url for auth in ('/docs', 'docs.', 'developer.', '.gov', '.edu', '/releases')):
            return (2, url)
        if 'github.com' in url:
            return (3, url)
        return (4, url)

    items = sorted(items, key=evidence_priority)[:8]

    explanation = (
        "联网检索已经完成，但指定模型在整理结果时连接中断。为避免脱离证据编造，下面直接返回检索到的来源："
        if model_failed
        else "这是强时效的插件/生态查询。为避免小模型补写未经证实的插件名、版本或安装命令，直接返回可核验来源："
    )

    lines = [
        "## 联网检索结果（可核验来源）",
        "",
        explanation,
        "",
    ]
    for index, (title, url, snippet) in enumerate(items, 1):
        normalized_url = url.casefold()
        if is_harness_query and normalized_url.startswith(f'{official_repo}/discussions'):
            source_label = "官方站点·社区讨论"
        elif is_harness_query and normalized_url.startswith(official_repo):
            source_label = "官方"
        elif is_harness_query:
            source_label = "社区/第三方"
        elif any(auth in normalized_url for auth in ('docs.', 'developer.', '.gov', '.edu', 'github.com/orgs', 'wikipedia.org')):
            source_label = "权威来源"
        else:
            source_label = "参考来源"
        lines.append(f"{index}. **[{source_label}]** [{title}]({url})")
        if snippet:
            lines.append(f"   {snippet}")
    if not items:
        lines.extend(["检索已完成，但未能提取可引用链接。请重试本次查询。"])
    lines.extend([
        "",
        "> 说明：以上是检索证据的直接交付，不包含模型记忆补写；社区目录或 Discussions 中的内容不代表官方背书。",
    ])
    final_text = "\n".join(lines).strip()

    if history_file:
        try:
            existing_history.append({"role": "user", "content": prompt})
            existing_history.append({"role": "assistant", "content": final_text})
            with open(history_file, "w", encoding="utf-8") as f:
                json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2, default=str)
        except Exception:
            pass
    TelemetryStats.emit_final_output(final_text)


def cmd_exec(args):
    """Executes a shell command directly in the sandbox workspace."""
    cmd = " ".join(args.cmd) if isinstance(args.cmd, list) else str(args.cmd)
    if not cmd.strip():
        print("Error: command is required.", file=sys.stderr)
        sys.exit(1)

    print_banner()
    print(f"🚀 Executing shell command in {WORKSPACE_DIR}: {cmd}")
    proc = subprocess.run(cmd, shell=True, cwd=WORKSPACE_DIR, text=True, capture_output=False)
    sys.exit(proc.returncode)
