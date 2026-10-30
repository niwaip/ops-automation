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
from .file_tools import IMAGE_EXTENSIONS, prepare_multimodal_image_attachment
from .web_tools import enrich_search_context_with_pages
from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .prompt_builder import build_system_prompt, build_user_turn
from .skill_router import SkillRouter, is_text_only_request
from .agent_loop import run_agent_loop, _is_tool_error
from .artifact_exporter import ArtifactExporter
from .telemetry import TelemetryStats
from .pdf_workflow import is_template_pdf_task, PDF_EXECUTION_INSTRUCTION
from .comparison_context import build_comparison_source_context
from .spreadsheet_analysis_evidence import requires_spreadsheet_analysis, has_spreadsheet_analysis_input
from .spreadsheet_context import build_spreadsheet_source_context, STRUCTURE_TOOL_NAME
from .evidence_store import persist_turn_evidence, load_task_context


def _verify_and_restore_input_attachments(
    original_hashes: Dict[str, str],
    inputs_backup_dir: Path,
    workspace_dir: str
) -> None:
    """Verifies SHA-256 integrity of input attachments and automatically restores from backup if modified."""
    if not original_hashes or not inputs_backup_dir or not inputs_backup_dir.exists():
        return
    for fname, orig_h in original_hashes.items():
        fpath = Path(workspace_dir) / fname
        backup_p = inputs_backup_dir / fname
        if not backup_p.exists():
            continue
        try:
            import hashlib
            import shutil
            cur_bytes = fpath.read_bytes() if fpath.exists() else b""
            cur_h = hashlib.sha256(cur_bytes).hexdigest() if fpath.exists() else ""
            if cur_h != orig_h:
                shutil.copy2(backup_p, fpath)
                print(f"🛡️ [Harness Input Protection] 输入附件 ({fname}) 被工具或脚本篡改，已自动从只读备份恢复原件！", flush=True)
        except Exception as e:
            print(f"⚠️ [Harness Input Protection] 恢复输入附件异常 ({fname}): {e}", flush=True)
from .deliverable_contract import requests_markdown_artifact
from .html_report_fallback import materialize_html_report_fallback
from .llm import call_model_proxy, clean_output, parse_tool_calls


def _extract_filename(item: str) -> str:
    try:
        obj = json.loads(item)
        if isinstance(obj, dict) and "fileName" in obj:
            return obj["fileName"]
    except Exception:
        pass
    return Path(item).name


WEATHER_RE = re.compile(
    r'(?:天气|气象|天气预报|查天气|实时天气|降雨|降水|下雨|暴雨|大雨|阵雨|下雪|暴雪|气温|多云|晴天|阴天|'
    r'降温天气|大幅降温|寒潮降温|'
    r'\bweather\b|\bforecast\b|\bweather\s+forecast\b|\brain(?:ing|y)?\b|\bsnow(?:ing|y)?\b)',
    re.IGNORECASE,
)
REMINDER_RE = re.compile(r'(提醒|闹钟|待办|日程|remind\s+me|reminder|alarm)', re.I)


def is_weather_inquiry(prompt: str, skill_res: Any = None) -> bool:
    """Accurately distinguishes genuine weather inquiry intents from document formatting fields (e.g. '时间天气记录卡')."""
    if not prompt or not isinstance(prompt, str):
        return False
    lower = prompt.lower()
    from .skill_router import is_network_search_forbidden
    if is_network_search_forbidden(lower):
        return False
    # 消除文档模板、排版表头中的假阳性（如“时间天气、地点、有趣发现四项记录卡”、“表格列：天气状况”）
    if re.search(r'(?:字段|表头|列名|记录卡|栏目|项目)[：:\s]*.*(?:时间)?天气', prompt) or '时间天气' in prompt:
        return False
    # 如果是文档/代码/文件生成任务，且用户未显式要求查询或插入实时天气数据
    is_gen = getattr(skill_res, 'is_generate_intent', False) or getattr(skill_res, 'skill_id', None) in {'pdf', 'docx', 'xlsx', 'pptx'}
    has_explicit_weather_query = any(k in lower for k in ['查天气', '天气如何', '天气预报', '今天天气', '实时天气', '明天天气', '后天天气', '查看天气', '当前天气'])
    if is_gen and not has_explicit_weather_query:
        return False
    # 真实的天气查询句式匹配
    weather_query_patterns = [
        r'(?:查|查看|查询|告诉我|看下|搜下|了解|关注).*(?:天气|气温|预报|下雨|降水|降雪)',
        r'(?:今天|明天|后天|本周|当前|实时|近期|周末).*(?:天气|气温|下雨|下雪|晴天|阴天|气象)',
        r'(?:天气|气温|气象预报|天气预报).*(?:怎么样|如何|好不好|多少度|冷不冷|热不热|预测)',
        r'(?:会|会否|是否|有没有).*(?:下雨|下雪|降温|降水)',
        r'\bweather\b.*\b(?:in|at|for|today|tomorrow)\b',
    ]
    return any(re.search(pat, prompt, re.I) for pat in weather_query_patterns) or bool(WEATHER_RE.search(prompt) and not is_gen)


from .planning_phase import (
    is_fast_path_task,
    should_run_planning_phase,
    run_planning_phase,
    build_deliverable_execution_instruction,
)
from .intent_contract import is_modify_intent_requested, is_network_search_forbidden

_run_planning_phase = run_planning_phase



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
    if is_network_search_forbidden(prompt):
        has_web_search_permission = False
    from .pdf_workflow import is_retrieval_pdf_task
    if is_retrieval_pdf_task(skill_res):
        allowed = {'render_pdf', 'read_file', 'inspect_pdf_page'}
        if has_web_search_permission:
            allowed.update({'web_search', 'fetch_page'})
        if getattr(skill_res, 'is_send_intent', False):
            allowed.add('send_file')
        return get_sandbox_tools(allowed_names=allowed)
    if is_template_pdf_task(prompt, skill_res):
        allowed = {'render_pdf', 'read_file', 'inspect_pdf_page'}
        if getattr(skill_res, 'is_send_intent', False):
            allowed.add('send_file')
        return get_sandbox_tools(allowed_names=allowed)
    from .docx_workflow import is_retrieval_docx_task, is_template_docx_task
    if is_retrieval_docx_task(skill_res):
        allowed = {'render_docx', 'read_file'}
        if has_web_search_permission:
            allowed.update({'web_search', 'fetch_page'})
        if getattr(skill_res, 'is_send_intent', False):
            allowed.add('send_file')
        return get_sandbox_tools(allowed_names=allowed)
    if is_template_docx_task(prompt, skill_res):
        allowed = {'render_docx', 'read_file'}
        if getattr(skill_res, 'is_send_intent', False):
            allowed.add('send_file')
        return get_sandbox_tools(allowed_names=allowed)

    is_modify = getattr(skill_res, "is_modify_intent", False) or is_modify_intent_requested(prompt)

    # 0. 表格更新任务契约与权限路由：
    # 严格遵循否定指令与只读优先原则：若属于咨询、方法指导或存在明确否定执行词汇，严禁暴露写执行工具
    from .skill_router import is_term_negated
    is_guide = getattr(skill_res, "is_guide_intent", False)
    has_negative_execution = (
        is_term_negated(prompt, "执行")
        or is_term_negated(prompt, "修改")
        or is_term_negated(prompt, "更新")
        or is_term_negated(prompt, "落盘")
        or is_term_negated(prompt, "覆盖")
        or is_term_negated(prompt, "写入")
    )
    from .analysis_contract import build_analysis_contract, supports_column_comparison
    contract = build_analysis_contract(prompt)
    is_advisory = contract.is_advisory_intent or contract.is_browse_or_summary

    from .spreadsheet_update.routing import is_workbook_update, is_custom_workbook_or_row_edit
    admission = getattr(skill_res, 'admission', None) or {}
    is_custom_edit = is_custom_workbook_or_row_edit(prompt)
    is_update_task = is_workbook_update(prompt, admission) and not is_custom_edit
    if admission.get('task_mode') == 'consult':
        is_guide = True
    update_enabled = os.environ.get("DSH_SPREADSHEET_UPDATE_ENABLED", "true").lower() in ("1", "true", "yes")

    if (is_update_task or (is_modify and not is_custom_edit)) and has_spreadsheet_analysis_input(skill_res) and update_enabled:
        from .spreadsheet_analysis_schema import ANALYSIS_TOOL_NAMES
        if is_guide or has_negative_execution or (is_advisory and admission.get('task_mode') != 'execute' and not is_update_task):
            # 咨询/指导或否定执行模式：只允许无副作用的只读分析或规划预览，严禁开放 execute_spreadsheet_update
            update_read_allowed = {
                "read_file",
                "read_skill",
                "compare_spreadsheet_columns",
                STRUCTURE_TOOL_NAME,
                *ANALYSIS_TOOL_NAMES,
                "plan_spreadsheet_update",
                "get_spreadsheet_update_status",
            }
            if has_web_search_permission:
                update_read_allowed.update({"web_search", "fetch_page"})
            return get_sandbox_tools(allowed_names=update_read_allowed)
        else:
            # 明确授权的完整更新任务：执行宽松原则，开放受限更新工具面与受控 bash 环境，由后置校验严格保障公式与数据完整性
            update_exec_allowed = {
                "bash",
                "read_file",
                "read_skill",
                "compare_spreadsheet_columns",
                STRUCTURE_TOOL_NAME,
                *ANALYSIS_TOOL_NAMES,
                "plan_spreadsheet_update",
                "execute_spreadsheet_update",
                "get_spreadsheet_update_status",
            }
            if has_web_search_permission:
                update_exec_allowed.update({"web_search", "fetch_page"})
            if skill_res.is_send_intent:
                update_exec_allowed.add("send_file")
            return get_sandbox_tools(allowed_names=update_exec_allowed)

    if not is_modify and (has_spreadsheet_analysis_input(skill_res) and not skill_res.is_generate_intent
            and not skill_res.requires_execution and not getattr(skill_res,"is_guide_intent",False)):
        # A missing inspect keyword must not expose all mutative tools. The
        # attachment/skill selects a native read-only capability surface.
        from .spreadsheet_analysis_schema import ANALYSIS_TOOL_NAMES
        allowed = {"read_file", "compare_spreadsheet_columns",STRUCTURE_TOOL_NAME,*ANALYSIS_TOOL_NAMES}
        from .analysis_contract import build_analysis_contract, supports_column_comparison
        contract=build_analysis_contract(prompt)
        if supports_column_comparison(contract):
            allowed={'read_file','compare_spreadsheet_columns',STRUCTURE_TOOL_NAME}
        elif contract.is_catalog_only:
            allowed={'read_file'}
        elif contract.is_advisory_intent and not contract.is_explicit_calc:
            allowed={'read_file'}
        elif contract.is_browse_or_summary:
            allowed={'read_file', STRUCTURE_TOOL_NAME}
        if has_web_search_permission:
            allowed.update({"web_search", "fetch_page"})
        if skill_res.is_send_intent:
            allowed.add("send_file")
        return get_sandbox_tools(allowed_names=allowed)

    if not is_modify and skill_res.is_generate_intent and requests_markdown_artifact(prompt) and not skill_res.skill_id:
        allowed = {"write_markdown"}
        needs_read = (
            skill_res.is_knowledge_intent
            or skill_res.is_inspect_intent
            or any(k in prompt.lower() for k in ["读取", "查看", "参考", "基于", "分析文件", "read", "数据源", "根据上传", "基于原"])
        )
        if needs_read:
            allowed.add("read_file")
        needs_exec = (
            getattr(skill_res, "requires_execution", False)
            or any(k in prompt.lower() for k in ["python", "bash", "脚本", "运行", "执行", "统计", "计算", "代码", "分析", "核算", "测试", "查重", "对照", "核对"])
        )
        if needs_exec:
            allowed.add("bash")
        if has_web_search_permission:
            allowed.update({"web_search", "fetch_page"})
        if skill_res.is_knowledge_intent:
            allowed.add("scan_knowledge")
        if getattr(skill_res, "is_send_intent", False):
            allowed.add("send_file")
        return get_sandbox_tools(allowed_names=allowed)

    # 1. 纯查看/审阅/归纳/数据分析意图：限制在只读分析工具面，阻断 patch_file、write_markdown、create_reminders 等副作用写盘工具
    if not is_modify and skill_res.is_inspect_intent and not (skill_res.is_generate_intent or skill_res.requires_execution):
        allowed = {"read_file", "scan_knowledge", "vision_inspect"}
        # 对于表格/数据计算类技能（xlsx, python）或涉及表格审计/财务核算的提问，开放受控的 bash 计算验证环境（供运行 Python 统计与公式计算），但严禁落盘工具
        is_table_or_calc_context = (
            skill_res.skill_id in {"xlsx", "python"}
            or (skill_res.skill_id not in {"docx", "pdf"} and any(k in (prompt or "").lower() for k in [
                "excel", "xlsx", "csv", "表格", "工作表", "工作簿", "sheet", "单元格",
                "凭证", "明细", "财务", "核算", "勾稽", "试算", "查重", "对账", "报表"
            ]))
        )
        if is_table_or_calc_context:
            # 始终保留 bash 工具，以便在专用工具受限或多轮错误时可主动退避到 Python 沙箱计算
            allowed.update({"bash", "compare_spreadsheet_columns"})
        if has_web_search_permission:
            allowed.update({"web_search", "fetch_page"})
        if skill_res.is_send_intent:
            allowed.add("send_file")
        tools = get_sandbox_tools(allowed_names=allowed)
    # 2. 纯查阅/审阅/只读归纳任务：严格遵循最小特权原则，仅开放只读工具，严禁授予 bash
    elif not is_modify and skill_res.is_inspect_intent and not skill_res.is_generate_intent:
        allowed = {"web_search", "fetch_page"} if has_web_search_permission else set()
        if is_weather_inquiry(prompt, skill_res):
            allowed.add("weather")
        if REMINDER_RE.search(prompt):
            allowed.update({"create_reminders", "update_reminder", "delete_reminder"})
        if skill_res.is_knowledge_intent:
            allowed.update({"scan_knowledge", "read_file"})
        allowed.update({"read_file", "scan_knowledge", "vision_inspect"})
        if skill_res.is_send_intent:
            allowed.add("send_file")
        tools = get_sandbox_tools(allowed_names=allowed)
    # 3. 复杂生成、组合任务或明确需要物理落盘产物的技能，提供完整执行环境（bash、内置分析与文件工具，但排除专用于模板 Sheet 复制回填的 plan/execute_spreadsheet_update）
    elif not is_text_only_request(prompt) and (is_modify or is_custom_edit or skill_res.is_generate_intent or skill_res.requires_execution or (skill_res.skill_id and not skill_res.is_inspect_intent)):
        _update_only = {"plan_spreadsheet_update", "execute_spreadsheet_update", "get_spreadsheet_update_status"}
        tools = [
            t for t in get_sandbox_tools()
            if (t.get("function", {}).get("name") or t.get("name", "")) not in _update_only
        ]
    else:
        allowed = {"web_search", "fetch_page"} if has_web_search_permission else set()
        if is_weather_inquiry(prompt, skill_res):
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
    # 附件或本地文件专属保护：若本轮处于本地附件问答且无外网搜索/调研意图，剔除网络搜索工具，彻底阻断历史话题幻觉外逸
    has_attachment_context = bool(re.search(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】', prompt or "")) or any(k in (prompt or "").lower() for k in ["附件是什么", "这是什么", "上传的是什么", "附件内容", "这是啥"])
    if has_attachment_context and not is_search_intent and not getattr(skill_res, "is_research_intent", False):
        tools = [
            tool for tool in tools
            if tool.get("function", {}).get("name") not in {"web_search", "fetch_page"}
        ]
        # 确保只读文件工具必定存在
        existing_names = {tool.get("function", {}).get("name") for tool in tools}
        needed_inspect = {"read_file", "vision_inspect"} - existing_names
        if needed_inspect:
            more_tools = get_sandbox_tools(allowed_names=needed_inspect)
            tools.extend(more_tools)

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
    # 优先检查新版会话隔离目录 .sessions/<clean_sid>/attachments.json
    new_att_file = Path(WORKSPACE_DIR) / ".sessions" / clean_sid / "attachments.json"
    if new_att_file.exists():
        try:
            with open(new_att_file, "r", encoding="utf-8") as f:
                loaded_att = json.load(f)
                if isinstance(loaded_att, list):
                    for item in loaded_att:
                        if isinstance(item, str) and item.strip():
                            session_files.append(item.strip())
                        elif isinstance(item, dict) and "fileName" in item:
                            session_files.append(str(item["fileName"]).strip())
        except Exception:
            pass

    if not session_files:
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

    task_deadline = time.monotonic() + policy.total_task_timeout if policy.total_task_timeout > 0 else None
    session_id = getattr(args, "session_id", None)
    history_file, existing_history = load_session_history(session_id)

    # 1. 意图与技能解析 (精确规则 + Slash 命令)
    allow_research = bool(getattr(args, "research", False))
    session_files = resolve_session_attachments(args, session_id)
    from .preflight_probe import probe_session_attachments
    attachment_probe = probe_session_attachments(session_files, prompt=prompt)
    if attachment_probe.get("primary_domain") == "finance_fpna":
        os.environ["DSH_PROBED_DOMAIN"] = "finance"
    elif attachment_probe.get("primary_domain") == "timesheet_wbs":
        os.environ["DSH_PROBED_DOMAIN"] = "timesheet"
    else:
        os.environ.pop("DSH_PROBED_DOMAIN", None)

    telemetry = TelemetryStats()
    telemetry.bind_journal(history_file)
    if attachment_probe.get("summary"):
        telemetry.record_guard("preflight_probe", "inspected", attachment_probe["summary"])

    skill_res = SkillRouter.route(prompt, existing_history, allow_research=allow_research, files=session_files,
                                  load_skill_context=False)
    from .skill_admission import admit_skill, emit_admission_stop, AdmissionClarification, AdmissionUnavailable, general_route
    from .docx_workflow import is_template_docx_task, DOCX_EXECUTION_INSTRUCTION
    template_candidate = skill_res if not session_files and (is_template_pdf_task(prompt, skill_res) or is_template_docx_task(prompt, skill_res)) else None
    try:
        skill_res = admit_skill(prompt, existing_history, session_files, skill_res,
            getattr(args, 'model', None) or os.environ.get('DSH_MODEL'), policy, telemetry, task_deadline,
            attachment_probe=attachment_probe)
    except AdmissionClarification as error:
        emit_admission_stop(error, prompt, history_file, existing_history, telemetry)
        return
    except AdmissionUnavailable as error:
        telemetry.record_guard('skill_admission', 'owned_template_fallback' if template_candidate else 'fallback_to_general', str(error)[:300])
        print('🛡️ 使用受控文档排版模板继续执行' if template_candidate else f'⚠️ [Skill Admission] 技能准入复核未通过 ({error})，已降级为通用能力执行')
        skill_res = template_candidate or general_route(prompt, existing_history, session_files, error.task_contract)
    except ValueError as error:
        emit_admission_stop(error, prompt, history_file, existing_history, telemetry)
        return
    template_pdf = is_template_pdf_task(prompt, skill_res)
    if template_pdf:
        # The managed renderer replaces CLI/code examples; do not let examples
        # compete with the user's actual page outline during a repair.
        skill_res.skill_context = PDF_EXECUTION_INSTRUCTION
        telemetry.record_guard('pdf_template', 'direct_execution', 'owned_renderer')
    template_docx = is_template_docx_task(prompt, skill_res)
    if template_docx:
        skill_res.skill_context = DOCX_EXECUTION_INSTRUCTION
        telemetry.record_guard('docx_template', 'direct_execution', 'owned_renderer')
    from .personal_skill_workflow import try_run_personal_workflow
    if try_run_personal_workflow(skill_res, session_files, prompt, history_file,
                                 existing_history, overall_start_time, task_deadline,
                                 model=getattr(args, 'model', None) or os.environ.get('DSH_MODEL'), policy=policy,
                                 present=True, telemetry=telemetry):
        return
    knowledge_context = scan_personal_knowledge() if skill_res.is_knowledge_intent else ""


    # 2. 联网前置检索
    # args.web_search 仅表示沙箱具备联网检索工具能力，绝不能将所有普通对话/生成需求直接断定为纯检索任务！
    # 只有当用户显式要求搜索（如以 /search 起始）或语义路由命中真实外部资讯检索意图（is_search_intent）时，才执行前置联网检索
    forbidden_network = is_network_search_forbidden(prompt)
    has_web_search_permission = bool(args.web_search) and not forbidden_network
    is_weather_intent = is_weather_inquiry(prompt, skill_res) and not forbidden_network and not template_pdf
    is_search_intent = (
        not forbidden_network
        and (
            prompt.strip().startswith("/search ")
            or skill_res.is_search_intent
            or is_weather_intent
        )
    )
    # 严格遵循外部检索谨慎性原则：
    # 物理文档/报表生成任务（如制作 word/excel/ppt/markdown）在未显式要求检索时，绝不执行前置盲搜！
    # 避免将包含业务规范、表格列名的整段长需求投递给搜索引擎。
    is_doc_task_without_search_cue = (
        (skill_res.is_generate_intent or (skill_res.skill_id in {"docx", "xlsx", "pdf", "pptx", "html-ppt", "guizang-ppt"}))
        and not prompt.strip().startswith("/search ")
        and not is_weather_intent
        and not any(k in prompt for k in ["联网", "搜索", "全网查询", "最新动态", "实时数据"])
    )
    if is_doc_task_without_search_cue:
        is_search_intent = False
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
            page_deadline = min(task_deadline, time.monotonic() + 5.0) if task_deadline is not None else (time.monotonic() + 5.0)
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
    if model_name:
        os.environ["DSH_MODEL"] = str(model_name)
    raw_display_name = getattr(args, "model_display_name", None) or os.environ.get("DSH_MODEL_DISPLAY_NAME") or None
    model_display_name = resolve_model_display_name(model_name, raw_display_name)

    # 3. 提取当前会话附件内容并建立只读保护快照
    os.environ["DSH_SESSION_ATTACHMENTS"] = ",".join(session_files or [])

    original_hashes: Dict[str, str] = {}
    inputs_backup_dir = Path(WORKSPACE_DIR) / ".dsh" / "inputs_backup"
    try:
        inputs_backup_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    file_context = ""
    failed_attachment_diagnostics: Dict[str, str] = {}
    attachment_diagnostic_evidence = []
    multimodal_image_parts: List[Dict[str, Any]] = []
    multimodal_image_names: List[str] = []
    for fname in session_files:
        if task_deadline is not None and time.monotonic() >= task_deadline:
            raise TimeoutError("Task total execution deadline exceeded before attachment extraction")
        fpath = Path(WORKSPACE_DIR) / fname
        if fpath.exists() and fpath.is_file():
            try:
                import hashlib
                import shutil
                f_bytes = fpath.read_bytes()
                curr_h = hashlib.sha256(f_bytes).hexdigest()
                original_hashes[fname] = curr_h
                backup_p = inputs_backup_dir / fname
                need_backup = True
                if backup_p.exists():
                    try:
                        backup_h = hashlib.sha256(backup_p.read_bytes()).hexdigest()
                        if backup_h == curr_h:
                            need_backup = False
                    except Exception:
                        pass
                if need_backup:
                    shutil.copy2(fpath, backup_p)
            except Exception:
                pass
            if fpath.suffix.lower() in IMAGE_EXTENSIONS:
                # 图片附件不做模型预处理，仅做毫秒级本地完整性/加密预检，通过后直接挂载至多模态消息交由主模型处理
                img_part, img_diag_err = prepare_multimodal_image_attachment(str(fpath))
                from .tool_result import ToolResult
                if img_diag_err:
                    clipped = ContextBudget.clip_attachment(img_diag_err, policy.max_attachment_chars)
                    file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"
                    failed_attachment_diagnostics[fname] = img_diag_err.strip()
                    attachment_diagnostic_evidence.append(
                        ToolResult.error(
                            "attachment_unreadable",
                            img_diag_err.strip(),
                            provenance={"file_path": str(fpath), "file_name": fname}
                        )
                    )
                elif img_part:
                    multimodal_image_parts.append(img_part)
                    multimodal_image_names.append(fname)
                    file_context += (
                        f"\n\n[Attached Image - {fname}]:\n"
                        f"【图片附件 ({fname}) 已作为多模态视觉输入直接挂载至当前消息，请直接观察图片内容回答用户问题，无需再调用 vision_inspect 或 read_file 工具】"
                    )
                    attachment_diagnostic_evidence.append(
                        ToolResult.success(
                            data={"tool": "multimodal_image_input", "file_name": fname, "evidence_id": f"img:{fname}"},
                            text=f"Multimodal image attached: {fname}",
                            provenance={"tool": "multimodal_image_input", "file_path": str(fpath), "file_name": fname}
                        )
                    )
                continue
            is_verbatim_reply = bool(re.search(r'(?:^|[\n\r]|用户指令[：:])\s*(?:仅回复|只回复|仅输出|只需回复|只回答)\b', prompt))
            if is_verbatim_reply:
                continue
            comparison_context = build_comparison_source_context(fpath, prompt, deadline=task_deadline)
            # A usable schema keeps full numeric rows on the tool path. No
            # eager all-sheet extraction/recalculation is needed for planning.
            if fpath.suffix.lower() in (".xlsx", ".xlsm"):
                extracted = comparison_context or build_spreadsheet_source_context(fpath, deadline=task_deadline, prompt=prompt)
            else:
                extracted = comparison_context or read_workspace_file(
                    fname, deadline=task_deadline, model_name=model_name, prompt=prompt)
            if extracted and not extracted.startswith("文件未找到"):
                clipped = ContextBudget.clip_attachment(extracted, policy.max_attachment_chars)
                file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"
                if any(k in extracted for k in (
                    "【文件受企业安全加密保护无法解析】",
                    "【图片文件损坏或格式无效无法解析】",
                    "【图片格式异常或损坏】",
                )):
                    failed_attachment_diagnostics[fname] = extracted.strip()
                    from .tool_result import ToolResult
                    attachment_diagnostic_evidence.append(
                        ToolResult.error(
                            "attachment_unreadable",
                            extracted.strip(),
                            provenance={"file_path": str(fpath), "file_name": fname}
                        )
                    )

    active_tools = select_active_tools(prompt, skill_res, is_search_intent, has_web_search_permission)
    if (
        multimodal_image_names
        and set(session_files) == set(multimodal_image_names)
        and not skill_res.is_generate_intent
        and not skill_res.requires_execution
        and not skill_res.is_send_intent
        and not is_search_intent
    ):
        redundant_for_direct_vision = {"vision_inspect", "read_file"}
        if not skill_res.is_knowledge_intent:
            redundant_for_direct_vision.add("scan_knowledge")
        active_tools = [
            t for t in active_tools
            if t.get("function", {}).get("name") not in redundant_for_direct_vision
        ]
    spreadsheet_analysis_needed = requires_spreadsheet_analysis(prompt, skill_res)
    if spreadsheet_analysis_needed:
        from .spreadsheet_analysis_schema import select_analysis_tools
        update_tool_names = {"plan_spreadsheet_update", "execute_spreadsheet_update", "get_spreadsheet_update_status", "read_skill"}
        has_update_tools = any(t.get("function", {}).get("name") in update_tool_names for t in active_tools)
        if not has_update_tools:
            analysis_tools = select_analysis_tools(active_tools, prompt)
            has_visual_need = any(k in prompt.lower() for k in ("柱状图", "折线图", "饼图", "散点图", "雷达图", "图表", "可视化", "画图", "绘图", "html", "png", "看板", "大屏", "网页", "report", "报告"))
            has_visual_or_deliverable = bool(
                getattr(skill_res, "deliverables", None)
                or getattr(skill_res, "is_generate_intent", False)
                or has_visual_need
            )
            if has_visual_or_deliverable:
                retained_extras = [t for t in active_tools if t.get("function", {}).get("name") not in update_tool_names]
                active_tools = analysis_tools + [t for t in retained_extras if t not in analysis_tools]
            else:
                active_tools = analysis_tools
    is_standalone_instruction = (getattr(skill_res, "admission", None) or {}).get("instruction_relation") == "standalone"
    task_context = load_task_context(history_file, original_hashes) if (spreadsheet_analysis_needed and not is_standalone_instruction) else ""
    # 4. 组装 System Prompt 与 User Turn (保持前缀稳定以命中 Prompt Caching)
    system_prompt = build_system_prompt(
        WORKSPACE_DIR,
        KNOWLEDGE_DIR,
        model_name=model_name,
        model_display_name=model_display_name,
        skill_context=ContextBudget.clip_skill(skill_res.skill_context, max_chars=policy.max_skill_chars)
    )
    messages = [{"role": "system", "content": system_prompt}]
    from .skill_admission import execution_contract_context
    admission_context = execution_contract_context(skill_res.admission)
    if admission_context:
        messages.append({'role': 'system', 'content': admission_context})

    budgeted_history, dropped_count = ContextBudget.budget_history(
        existing_history, policy.max_history_chars, policy.max_single_history_chars
    )
    if dropped_count > 0:
        messages.append({"role": "system", "content": f"[系统提示：为确保高效响应，早期 {dropped_count} 条历史交互因长度预算超出自动省略]"})
    messages.extend(budgeted_history)
    if task_context:
        messages.append({'role': 'system', 'content': task_context})

    from .prompt_builder import get_current_timestamp_str
    user_turn_text = build_user_turn(
        prompt=prompt,
        session_files=session_files,
        file_context=file_context,
        knowledge_context=knowledge_context,
        skill_context="",
        search_context=search_context,
        is_send_intent=skill_res.is_send_intent,
        is_search_intent=is_search_intent,
        is_ppt_intent=skill_res.is_ppt_intent,
        is_design_intent=skill_res.is_design_intent,
        is_docx_intent=skill_res.is_docx_intent,
        is_office_intent=skill_res.is_office_intent,
        is_research_intent=skill_res.is_research_intent,
        is_inspect_intent=(skill_res.is_inspect_intent and not is_search_intent and not is_weather_intent),
        is_generate_intent=skill_res.is_generate_intent,
        is_guide_intent=skill_res.is_guide_intent,
        existing_history=existing_history,
        max_skill_chars=policy.max_skill_chars,
        timestamp_str=get_current_timestamp_str(policy.timezone),
        available_tool_names=[t['function']['name'] for t in active_tools]
    )
    user_message_content: Any = (
        [{"type": "text", "text": user_turn_text}, *multimodal_image_parts]
        if multimodal_image_parts
        else user_turn_text
    )
    messages.append({"role": "user", "content": user_message_content})

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

    # 5. 思考模式调度：规划阶段（开启思考与架构设计） -> 执行与工具调用阶段（关闭思考）
    retrieval_evidence = []
    if search_context:
        from .tool_result import adapt_tool_output
        receipt = adapt_tool_output(search_context)
        receipt.provenance = {"tool": "web_search", "phase": "prefetch"}
        retrieval_evidence.append(receipt)
        telemetry.record_tool_call("web_search", {"query": search_prompt}, receipt.status)
        telemetry.record_execution_result(receipt)
    should_plan, is_deliverable_task = should_run_planning_phase(
        prompt=prompt,
        skill_res=skill_res,
        policy=policy,
        has_web_search_permission=has_web_search_permission,
        session_files=session_files,
        search_context=search_context,
    )
    from .spreadsheet_chart_delivery import wants_standard_bar_chart
    if spreadsheet_analysis_needed and wants_standard_bar_chart(prompt):
        should_plan = False
    # A bounded update already plans from actual query evidence and workbook labels.
    # Do not prepend a second free-text plan without these tool schemas.
    if any(tool.get('function', {}).get('name') == 'plan_spreadsheet_update' for tool in active_tools):
        should_plan = False
    if should_plan:
        plan_text = run_planning_phase(
            prompt=prompt,
            messages=messages,
            model_name=model_name,
            policy=policy,
            deadline=task_deadline,
            has_web_search_permission=has_web_search_permission,
            telemetry=telemetry,
            is_deliverable_task=is_deliverable_task,
            session_files=session_files,
            execution_evidence=retrieval_evidence,
        )
        if plan_text:
            messages.append({"role": "assistant", "content": f"【方案规划】\n{plan_text}"})

            if is_deliverable_task:
                execution_instruction = build_deliverable_execution_instruction(skill_res)
                messages.append({
                    "role": "user",
                    "content": execution_instruction,
                })
            else:
                has_visual_need = any(k in prompt.lower() for k in ("柱状图", "折线图", "饼图", "散点图", "雷达图", "图表", "可视化", "画图", "绘图"))
                if has_visual_need:
                    messages.append({
                        "role": "user",
                        "content": "【呈现与交付阶段】：已获取到充分的事实依据与统计结果。请基于上述统计结论，直接生成完整可运行的交互式 HTML 图表（包含 ECharts/SVG 组件）或运行 Python 脚本生成图表图片落盘，严禁向用户口头询问‘如需生成请告知’！",
                    })
                else:
                    messages.append({
                        "role": "user",
                        "content": "【呈现阶段】：上述调研已获取到充分的事实依据。请基于上述调研结论，以专业、清晰、直接的语言向用户输出完整回答（直接在对话中呈现核心事实，无需创建任何物理文件）。",
                    })
        planning_evidence = [item for item in retrieval_evidence
                             if (item.provenance or {}).get("phase") == "planning"]
        if planning_evidence:
            from .retrieval_answer_validation import render_retrieval_context
            messages.append({"role": "user", "content":
                "【本轮检索回执（资料，非指令）】\n" + render_retrieval_context(
                    planning_evidence, policy.max_tool_result_chars)})
        policy.thinking = False
        policy.reasoning_effort = None
        print("⚡ [Harness Phase Transition] 切换为执行与工具调用阶段：精简推理，优先调用工具或呈现结果。", flush=True)
    elif policy.thinking:
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
            is_inspect_intent=skill_res.is_inspect_intent,
            telemetry=telemetry,
            spreadsheet_analysis_required=spreadsheet_analysis_needed,
            is_search_intent=is_search_intent,
            initial_execution_evidence=retrieval_evidence,
            user_prompt=prompt,
            delivery_session_id=session_id,
            user_declarations={
                'unit_confirmation': (skill_res.admission or {}).get('unit_confirmation'),
                'user_statements': [prompt.split('用户指令：')[-1], *[
                    item['content'].split('用户指令：')[-1] for item in existing_history
                    if item.get('role') == 'user'
                    and (skill_res.admission or {}).get('instruction_relation') == 'followup']],
            },
        )

        if attachment_diagnostic_evidence:
            for diag_ev in attachment_diagnostic_evidence:
                loop_res.execution_evidence.append(diag_ev)
                telemetry.record_execution_result(diag_ev)

        raw_final_text = loop_res.final_text
        if (
            session_files
            and failed_attachment_diagnostics
            and len(failed_attachment_diagnostics) == len(session_files)
            and any(k in prompt.lower() for k in ("附件", "文件", "上传", "这是什么", "是什么", "这是啥", "是啥", "看下", "分析", "图片", "图", "预览"))
        ):
            lower_reply = (raw_final_text or "").lower()
            acknowledges_diag = (
                any(fn.lower() in lower_reply for fn in failed_attachment_diagnostics)
                or any(kw in lower_reply for kw in ("加密", "保护", "mip", "rms", "pfile", "损坏", "无法解析", "无法识别", "格式无效", "格式异常", "解密"))
            )
            if not acknowledges_diag:
                raw_final_text = "\n\n".join(failed_attachment_diagnostics.values())
                telemetry.record_guard("attachment_diagnostic", "reject", "model_ignored_unreadable_attachment")
            else:
                telemetry.record_guard("attachment_diagnostic", "accept", "acknowledged_unreadable_attachment")

        # 6. 产物导出与落盘 (HTML/PPT 及各种文档交付物)
        t_export_start = time.time()
        from .spreadsheet_chart_delivery import managed_chart_export
        from .pdf_preview_tool import managed_pdf_export
        if managed_chart_export(loop_res.telemetry) or managed_pdf_export(loop_res.telemetry):
            # Published files already passed run-scoped acceptance. Do not scan or
            # recompile them into shared index.html, including on failed delivery.
            final_text, exported_html_files, detected_deliverables = raw_final_text, [], []
        else:
            final_text, exported_html_files = ArtifactExporter.export_html(
                raw_final_text,
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
                turn_start_time=overall_start_time,
                session_files=session_files,
                expected_deliverables=skill_res.deliverables if skill_res else None,
                prompt=prompt
            )

        # Shell and legacy exporters must pass the same PDF publication gate.
        from .pdf_external_delivery import enforce_external_pdf_delivery
        from .config import SKILL_DIR
        if enforce_external_pdf_delivery(loop_res, WORKSPACE_DIR, SKILL_DIR,
                overall_start_time, prompt, task_deadline, session_files):
            final_text, exported_html_files, detected_deliverables = loop_res.final_text, [], []

        # 7. 会话历史持久化
        t_persist_start = time.time()
        if history_file:
            try:
                existing_history.append({"role": "user", "content": prompt})
                existing_history.append({"role": "assistant", "content": final_text})
                if loop_res.execution_evidence or telemetry.guard_decisions:
                    existing_history[-1]['verification'] = persist_turn_evidence(
                        history_file, original_hashes, prompt, loop_res.execution_evidence, telemetry.guard_decisions)
                with open(history_file, "w", encoding="utf-8") as f:
                    json.dump(existing_history[-policy.recent_history_save_count:], f, ensure_ascii=False, indent=2, default=str)
            except Exception as exc:
                print(f'⚠️ [Harness Evidence Persistence] 会话或证据保存失败：{type(exc).__name__}', file=sys.stderr)

        t_post_end = time.time()
        export_ms = (t_persist_start - t_export_start) * 1000
        persist_ms = (t_post_end - t_persist_start) * 1000
        if export_ms > 200 or persist_ms > 200:
            print(f"⏱️ [Harness Post-Processing] Export: {export_ms:.1f}ms, Persistence: {persist_ms:.1f}ms", flush=True)

        # 8. 协议标记与结果序列化
        elapsed_ms = (time.time() - overall_start_time) * 1000
        loop_res.telemetry.set_wall_clock_duration(elapsed_ms)
        outbound_set = list(loop_res.outbound_files)
        for exp_f in (exported_html_files or []):
            payload = json.dumps({"filePath": exp_f, "fileName": Path(exp_f).name}, ensure_ascii=False)
            if payload not in outbound_set and not any(_extract_filename(existing).lower() == Path(exp_f).name.lower() for existing in outbound_set):
                outbound_set.append(payload)
        for item in detected_deliverables:
            payload = json.dumps({"filePath": item["filePath"], "fileName": item["fileName"]}, ensure_ascii=False)
            if payload not in outbound_set and not any(_extract_filename(existing).lower() == item["fileName"].lower() for existing in outbound_set):
                outbound_set.append(payload)

        # 语义净化：若存在二进制文档或技术文件，且用户未显式要求 markdown，排除多余中间草稿 md
        user_wants_md = prompt and bool(re.search(r"(?:\.md\b|\bmarkdown\b|md\s*文件)", prompt, re.I))
        has_primary_non_md = any(
            not _extract_filename(f).lower().endswith(".md") for f in outbound_set
        )
        if has_primary_non_md and not user_wants_md:
            outbound_set = [
                f for f in outbound_set
                if not (
                    _extract_filename(f).lower().endswith((".py.md", ".sh.md", ".sql.md"))
                    or _extract_filename(f).lower() in ("result.md", "script.md")
                )
            ]

        TelemetryStats.emit_outbound_files(outbound_set)
        if getattr(loop_res, "outbound_reminders", None):
            TelemetryStats.emit_outbound_reminders(loop_res.outbound_reminders)
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

        is_auth_error = e.code in (401, 403) or any(
            k in str(err_detail).lower() for k in ("invalid token", "api key", "unauthorized", "authentication", "forbidden")
        )

        if is_auth_error:
            print(f"\n❌ [DeepSeek Harness 鉴权失败]: 上游大模型鉴权失败 ({e.code}): {err_detail}", file=sys.stderr)
            sys.exit(1)

        print(f"\n❌ [DeepSeek Harness 异常]: 大模型代理调用失败 ({e.code}): {err_detail}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        raw_error = str(e)
        is_auth = any(
            k in raw_error.lower() for k in ("invalid token", "check your api key", "unauthorized", "forbidden")
        )
        if is_auth:
            print(f"\n❌ [DeepSeek Harness 鉴权失败]: 上游大模型鉴权异常: {raw_error}", file=sys.stderr)
            sys.exit(1)

        if re.search(r'(?:\baborted\b|timeout|timed out|socket hang up|econnreset)', raw_error, re.I):
            print(f"\n❌ [DeepSeek Harness 超时]: 模型响应超时或连接中断: {raw_error}", file=sys.stderr)
            sys.exit(124)
        else:
            import traceback
            traceback.print_exc()
            print(f"\n❌ [DeepSeek Harness 异常]: 执行异常: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        _verify_and_restore_input_attachments(original_hashes, inputs_backup_dir, WORKSPACE_DIR)


def is_context_relevant_to_query(query: str, context: str) -> bool:
    """Verifies whether the retrieved search context actually corresponds to the user's prompt."""
    if not query or not context:
        return False
    cleaned = re.sub(
        r'^(帮我|请|给我|带我|麻烦|协助)?\s*(查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research)\s*',
        '',
        query,
        flags=re.I
    ).strip()
    cleaned = re.sub(r'[，。！？\?!\.,;；\s]+', '', cleaned)
    if not cleaned:
        return True

    # 1. 英文与数字词提取
    en_words = [w.lower() for w in re.findall(r'[a-zA-Z0-9_\-\.]{3,}', query)]
    context_lower = context.lower()
    for w in en_words:
        if w in context_lower:
            return True

    # 2. 中文 2-gram / 3-gram 关键词提取
    cjk_blocks = re.findall(r'[\u4e00-\u9fff]+', cleaned)
    cjk_grams = []
    for b in cjk_blocks:
        if len(b) <= 3:
            cjk_grams.append(b)
        else:
            for i in range(len(b) - 1):
                cjk_grams.append(b[i:i+2])

    if not cjk_grams:
        return True

    # 计算命中率
    matches = sum(1 for g in cjk_grams if g in context)
    return matches > 0 and (matches / len(cjk_grams)) >= 0.25


def _emit_tool_result_recovery(messages, prompt, existing_history, history_file, policy):
    """Recover and directly present already-executed tool results when upstream model disconnects."""
    if not messages or not isinstance(messages, list):
        return False
    tool_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "tool" and m.get("content")]
    if not tool_messages:
        return False

    # 1. 优先挽救天气执行结果（仅当用户查询属于气象意图时挽救，防止错配回复）
    weather_tools = [
        m for m in tool_messages
        if "气象" in str(m.get("content", "")) or "weather" in str(m.get("name", "")).lower()
    ]
    if weather_tools and is_weather_inquiry(prompt):
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

    # 2. 挽救网页检索结果（校验与当前查询相关性）
    search_tools = [
        m for m in tool_messages
        if "web_search" in str(m.get("name", "")).lower() or "【多查询联网检索" in str(m.get("content", ""))
    ]
    if search_tools:
        search_content = str(search_tools[-1].get("content", "")).strip()
        if is_context_relevant_to_query(prompt, search_content):
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
    failure_reason="network_disconnect",
    error_detail=None,
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

    if failure_reason == "auth_failed":
        detail_txt = f"（{error_detail}）" if error_detail else ""
        explanation = f"⚠️ 联网检索已成功完成，但上游模型鉴权失败{detail_txt}，未能调用模型生成总结。系统直接为您提取并呈现检索内容："
    elif failure_reason == "timeout":
        explanation = "⚠️ 联网检索已经完成，但指定模型响应超时。系统已直接为您提取并呈现检索内容："
    elif failure_reason == "upstream_error":
        detail_txt = f"（{error_detail}）" if error_detail else ""
        explanation = f"⚠️ 联网检索已经完成，但上游模型调用异常{detail_txt}。系统已直接为您提取并呈现检索内容："
    elif model_failed:
        explanation = "联网检索已经完成，但指定模型在整理结果时连接中断。为避免脱离证据编造，下面直接返回检索到的内容："
    else:
        explanation = "这是强时效的插件/生态查询。为避免小模型补写未经证实的插件名、版本或安装命令，直接返回可核验来源："

    header_title = "## 联网检索结果（可核验来源）" if items else "## 联网检索数据记录"

    lines = [
        header_title,
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
        if search_context and search_context.strip():
            lines.append("（检索已完成，未提取到结构化网页跳转链接，以下为检索获取的原始数据）\n")
            lines.append(search_context.strip())
        else:
            lines.extend(["检索已完成，但未能提取可引用链接。请重试本次查询。"])

    disclaimer = (
        "社区目录或 Discussions 中的内容不代表官方背书。"
        if is_harness_query
        else "请以各平台实时来源页面为准。"
    )
    lines.extend([
        "",
        f"> 说明：以上是检索证据的直接交付，不包含模型记忆补写；{disclaimer}",
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
