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
from typing import Optional, Tuple, List

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, print_banner
from .tools import scan_personal_knowledge, perform_web_search, read_workspace_file
from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .prompt_builder import build_system_prompt, build_user_turn
from .skill_router import SkillRouter
from .agent_loop import run_agent_loop
from .artifact_exporter import ArtifactExporter
from .telemetry import TelemetryStats


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

    task_deadline = time.monotonic() + policy.total_task_timeout
    session_id = getattr(args, "session_id", None)
    history_file, existing_history = load_session_history(session_id)

    # 1. 意图与技能解析 (精确规则 + Slash 命令)
    allow_research = bool(getattr(args, "research", False))
    skill_res = SkillRouter.route(prompt, existing_history, allow_research=allow_research)
    knowledge_context = scan_personal_knowledge() if skill_res.is_knowledge_intent else ""

    # 2. 联网前置检索
    is_search_intent = bool(args.web_search) or prompt.strip().startswith("/search ") or skill_res.is_search_intent
    search_context = ""
    if is_search_intent:
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded before pre-search")
        search_prompt = SkillRouter.resolve_contextual_query(prompt, existing_history)
        if search_prompt != prompt:
            print(f"🔍 [Harness Web Search] 正在检索实时数据: '{search_prompt}' (根据上下文消歧指代: '{prompt}')...", flush=True)
        else:
            print(f"🔍 [Harness Web Search] 正在检索实时数据: '{prompt}'...", flush=True)
        search_context = perform_web_search(search_prompt, deadline=task_deadline)
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded during pre-search")
        if search_context:
            print("✓ 实时数据检索成功，已注入分析上下文。", flush=True)

    # 3. 提取当前会话附件内容
    session_files = resolve_session_attachments(args, session_id)
    file_context = ""
    for fname in session_files:
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded before attachment extraction")
        fpath = Path(WORKSPACE_DIR) / fname
        if fpath.exists() and fpath.is_file():
            extracted = read_workspace_file(fname, deadline=task_deadline)
            if extracted and not extracted.startswith("文件未找到"):
                clipped = ContextBudget.clip_attachment(extracted, policy.max_attachment_chars)
                file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"

    # 4. 组装 System Prompt 与 User Turn (保持前缀稳定以命中 Prompt Caching)
    model_name = getattr(args, "model", None) or os.environ.get("DSH_MODEL") or None
    raw_display_name = getattr(args, "model_display_name", None) or os.environ.get("DSH_MODEL_DISPLAY_NAME") or None
    model_display_name = resolve_model_display_name(model_name, raw_display_name)
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

    try:
        loop_res = run_agent_loop(
            messages,
            model_name,
            policy,
            max_rounds,
            deadline=task_deadline,
            is_guide_intent=skill_res.is_guide_intent,
            turn_start_time=overall_start_time,
            expected_deliverables=skill_res.deliverables,
            is_generate_intent=skill_res.is_generate_intent,
            is_inspect_intent=skill_res.is_inspect_intent
        )

        # 6. 产物导出与落盘 (HTML/PPT 及各种文档交付物)
        final_text, _ = ArtifactExporter.export_html(
            loop_res.final_text,
            skill_res.is_ppt_intent,
            WORKSPACE_DIR,
            turn_start_time=overall_start_time,
            is_design_intent=skill_res.is_design_intent,
            prompt=prompt
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
                    json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        # 8. 协议标记与结果序列化
        elapsed_ms = (time.time() - overall_start_time) * 1000
        loop_res.telemetry.set_wall_clock_duration(elapsed_ms)
        outbound_set = list(loop_res.outbound_files)
        for item in detected_deliverables:
            payload = json.dumps({"filePath": item["filePath"], "fileName": item["fileName"]}, ensure_ascii=False)
            if payload not in outbound_set and not any(item["fileName"] in existing for existing in outbound_set):
                outbound_set.append(payload)
        TelemetryStats.emit_outbound_files(outbound_set)
        loop_res.telemetry.emit_metrics_event()
        TelemetryStats.emit_final_output(final_text)

    except TimeoutError as e:
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
        print(f"\n❌ [DeepSeek Harness 异常]: 大模型代理调用失败 ({e.code}): {err_detail}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ [DeepSeek Harness 异常]: 执行异常: {e}")
        sys.exit(1)


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
