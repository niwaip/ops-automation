"""
Planning phase management for DeepSeek Harness (dsh).
Decouples Level 2 Thinking / Planning across:
1. Deliverable Artifact Architecture Planning (code/document generation)
2. Grounded Fact Retrieval Planning (temporal and dynamic factual queries)
"""

import json
import os
import re
import time
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .agent_loop import _is_tool_error
from .context_budget import ContextBudget
from .llm import call_model_proxy, clean_output, parse_tool_calls
from .runtime_policy import RuntimePolicy
from .telemetry import TelemetryStats
from .tools import execute_tool, get_sandbox_tools


def _dispatch_call_model_proxy(*args, **kwargs):
    runner_mod = sys.modules.get("dsh_modules.runner")
    if runner_mod and hasattr(runner_mod, "call_model_proxy"):
        return runner_mod.call_model_proxy(*args, **kwargs)
    return call_model_proxy(*args, **kwargs)


def _dispatch_execute_tool(*args, **kwargs):
    runner_mod = sys.modules.get("dsh_modules.runner")
    if runner_mod and hasattr(runner_mod, "execute_tool"):
        return runner_mod.execute_tool(*args, **kwargs)
    return execute_tool(*args, **kwargs)


def is_fast_path_task(prompt: str, skill_res: Any) -> bool:
    """Determines whether a task has a clear deterministic action path and should skip the separate planning phase.

    Industry pattern: Intent complexity tiering. For simple single-file modifications, direct
    extractions from uploaded files, or explicit single-deliverable script requests, skip the
    two-phase planning roundtrip and execute tools directly in the first turn.
    """
    p = (prompt or "").strip()
    if not p:
        return True

    # 1. 明确的字段修改/局部替换任务（如将 Word 预算由 30000 改为 36000，保持原版）
    replace_patterns = [
        r'(?:把|将|对).*(?:预算|金额|数值|文本|内容|字段|时间|日期|人员).*(?:由|从).*(?:改|替换|变更|更新)为',
        r'(?:改|替换|更新).*(?:为|成).*保持(?:其余|原)',
        r'(?:仅|只)(?:修改|替换|改动|变更)',
    ]
    if any(re.search(pat, p) for pat in replace_patterns):
        return True

    # 2. 简单的单一输入文件提取并生成清单（如“只整理我上传的合成会议文字...生成CP_会议行动清单.md”）
    simple_extract_patterns = [
        r'^(?:只|仅)?(?:整理|提取|汇总|整理成|汇总成).*(?:清单|待办|记录|备忘)',
        r'(?:生成|输出).*清单.*(?:只用|严格基于|不补造)',
    ]
    if any(re.search(pat, p) for pat in simple_extract_patterns):
        if not any(kw in p for kw in ["架构", "方案设计", "深度分析", "商业计划", "多阶段规划"]):
            return True

    # 3. 明确指定了轻量脚本或配置交付物（如 .md, .sh, .py, .sql, Dockerfile, docker-compose）且无探索性要求的任务
    delivs = getattr(skill_res, "deliverables", None)
    if delivs and len(delivs) <= 2:
        def _get_ext(d: str) -> str:
            d_s = str(d).strip().lower()
            if d_s == "dockerfile":
                return "dockerfile"
            if d_s.startswith("."):
                return d_s
            ext = Path(d_s).suffix
            return ext if ext else f".{d_s}"

        exts = [_get_ext(d) for d in delivs if d]
        lightweight = {".md", ".sh", ".py", ".sql", ".yml", ".yaml", "dockerfile"}
        if exts and all(e in lightweight for e in exts):
            if not any(kw in p for kw in ["架构", "系统设计", "深度分析", "商业计划", "多阶段规划"]):
                return True

    return False


def is_fact_retrieval_planning_needed(
    prompt: str,
    skill_res: Any,
    has_web_search_permission: bool,
    session_files: Optional[List[str]] = None,
    search_context: str = "",
) -> bool:
    """Determines whether an open-domain informational query should enter the

    thinking planning phase to actively retrieve grounded external facts via web_search.
    """
    if not has_web_search_permission:
        return False
    if session_files:
        # 本地附件优先原则：有附件时优先本地分析，不进入开放域外部规划检索
        return False
    if search_context and search_context.strip():
        # 预检阶段已成功获取事实（如天气预报或极高置信度热搜），无需重复规划检索
        return False
    if getattr(skill_res, "is_generate_intent", False) or getattr(skill_res, "requires_execution", False):
        # 交付物任务由已有的交付物规划器处理
        return False
    if getattr(skill_res, "is_guide_intent", False):
        return False

    p = (prompt or "").lower().strip()
    if not p:
        return False

    # 本地工作区/代码/文件检查模式不进入外部事实规划
    if any(loc in p for loc in ["工作区", "当前目录", "本地文件", "已上传", "沙箱目录"]):
        return False

    temporal_or_dynamic_cues = [
        "今天", "今日", "最新", "近期", "最近", "实时", "当前", "今年", "本周", "本月",
        "动态", "赛程", "赛事", "比赛", "热点", "热搜", "行情", "资讯", "新闻", "发布",
        "价格", "汇率", "票房", "排名", "名单", "日程", "开幕", "闭幕", "上映"
    ]
    query_action_cues = [
        "查一下", "搜索", "查下", "搜一下", "了解一下", "有哪些最新", "现在", "目前", "什么时候"
    ]

    has_temporal = any(cue in p for cue in temporal_or_dynamic_cues) or bool(re.search(r'\b20\d\d\b|\d{4}年', p))
    has_action = any(cue in p for cue in query_action_cues)
    is_search = getattr(skill_res, "is_search_intent", False) or getattr(skill_res, "is_research_intent", False)

    return bool(has_temporal or has_action or is_search)


def should_run_planning_phase(
    prompt: str,
    skill_res: Any,
    policy: RuntimePolicy,
    has_web_search_permission: bool = True,
    session_files: Optional[List[str]] = None,
    search_context: str = "",
) -> Tuple[bool, bool]:
    """Determines if the current task should execute the planning phase.

    Returns:
        (should_plan: bool, is_deliverable_task: bool)
    """
    if not getattr(policy, "thinking", False):
        return False, False

    is_deliverable_task = bool(
        getattr(skill_res, "is_generate_intent", False)
        or getattr(skill_res, "requires_execution", False)
    )

    if is_deliverable_task:
        return not is_fast_path_task(prompt, skill_res), True

    is_fact_needed = is_fact_retrieval_planning_needed(
        prompt=prompt,
        skill_res=skill_res,
        has_web_search_permission=has_web_search_permission,
        session_files=session_files,
        search_context=search_context,
    )
    return is_fact_needed, False


def build_deliverable_execution_instruction(skill_res: Any) -> str:
    """Builds appropriate execution instruction based on skill and deliverables."""
    delivs = getattr(skill_res, "deliverables", None) or []
    named_targets = [d for d in delivs if not d.startswith(".") and d.lower() != "dockerfile"]

    has_docx = any(d.lower().endswith(".docx") for d in delivs)
    has_xlsx = any(d.lower().endswith(".xlsx") for d in delivs)
    has_pdf = any(d.lower().endswith(".pdf") for d in delivs)
    has_pptx = getattr(skill_res, "skill_id", None) == "pptx" or any(d.lower().endswith(".pptx") for d in delivs)
    has_html_ppt = getattr(skill_res, "is_ppt_intent", False) and not has_pptx
    has_html = (getattr(skill_res, "is_design_intent", False) or any(d.lower().endswith(".html") for d in delivs)) and not has_html_ppt
    has_md = any(d.lower().endswith(".md") for d in delivs)

    active_formats = [f for f, has in [
        ("docx", has_docx), ("xlsx", has_xlsx), ("pdf", has_pdf),
        ("pptx", has_pptx), ("html_ppt", has_html_ppt), ("html", has_html), ("md", has_md)
    ] if has]

    if len(active_formats) > 1:
        methods = []
        if has_xlsx:
            xlsx_files = [f for f in named_targets if f.lower().endswith(".xlsx")]
            fn_desc = f"/workspace/{xlsx_files[0]}" if xlsx_files else "/workspace/<文件名>.xlsx"
            methods.append(f"- Excel 表格：调用 `bash` 工具运行 Python 脚本（使用 openpyxl 库创建并排版，保存至 `{fn_desc}`）")
        if has_docx:
            docx_files = [f for f in named_targets if f.lower().endswith(".docx")]
            fn_desc = f"/workspace/{docx_files[0]}" if docx_files else "/workspace/<文件名>.docx"
            methods.append(f"- Word 文档：调用 `bash` 工具运行 Python 脚本（使用 python-docx 库创建并排版，保存至 `{fn_desc}`）")
        if has_pdf:
            pdf_files = [f for f in named_targets if f.lower().endswith(".pdf")]
            fn_desc = f"/workspace/{pdf_files[0]}" if pdf_files else "/workspace/<文件名>.pdf"
            methods.append(f"- PDF 文档：调用 `write_markdown` 或运行脚本生成目标 PDF 保存至 `{fn_desc}`")
        if has_pptx:
            pptx_files = [f for f in named_targets if f.lower().endswith(".pptx")]
            fn_desc = f"/workspace/{pptx_files[0]}" if pptx_files else "/workspace/<文件名>.pptx"
            methods.append(f"- 原生 PPTX 演示文稿：调用 `bash` 工具运行 Python 脚本（使用 python-pptx 库生成，保存至 `{fn_desc}`）")
        if has_html_ppt:
            methods.append("- HTML 交互演示文稿：输出完整的 ```html\n<!DOCTYPE html>...``` 代码块写入 `/workspace/presentation.html`")
        if has_html:
            methods.append("- HTML 网页/单页报告：输出完整的 ```html\n<!DOCTYPE html>...``` 代码块写入 `/workspace/index.html`")
        if has_md:
            md_files = [f for f in named_targets if f.lower().endswith(".md")]
            fn_desc = f"/workspace/{md_files[0]}" if md_files else "/workspace/<文件名>.md"
            methods.append(f"- Markdown 文件：调用 `write_markdown` 工具保存至 `{fn_desc}`")

        targets_str = "、".join(named_targets) if named_targets else "所有指定格式产物"
        methods_str = "\n".join(methods)
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施多目标材料落盘。\n"
            f"本次任务需完整交付以下材料：{targets_str}\n"
            f"落盘方式：\n{methods_str}\n"
            "⚠️ 严禁仅输出口头文字！必须逐项调用工具完成全部目标材料的物理文件落盘！"
        )

    if getattr(skill_res, "is_docx_intent", False) or (
        getattr(skill_res, "deliverables", None) and any(ext.lower() == ".docx" for ext in skill_res.deliverables)
    ):
        target_fn = next((d for d in (skill_res.deliverables or []) if d.lower().endswith(".docx")), "<文件名>.docx")
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            f"落盘方式：调用 `bash` 工具运行 Python 脚本生成 `/workspace/{target_fn}`（使用 python-docx 库创建并排版，表格推荐 `table.style = 'Table Grid'`；若需 XML 操作请 `from docx.oxml import OxmlElement`，切勿调用不存在的 `doc.oxml`）。\n"
            "⚠️ 严禁仅输出‘已存在’、‘已保存’等口头文字而不提供代码或工具调用！必须实际调用 bash 工具执行 Python 脚本完成物理文件落盘！"
        )
    elif getattr(skill_res, "is_office_intent", False) and (
        getattr(skill_res, "deliverables", None) and any(ext.lower() == ".xlsx" for ext in skill_res.deliverables)
    ):
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            "落盘方式：调用 `bash` 工具运行 Python 脚本（使用 openpyxl 库创建并排版表格，保存至 `/workspace/<文件名>.xlsx`）。\n"
            "⚠️ 严禁仅输出口头文字！必须实际调用 bash 工具执行 Python 脚本完成物理文件落盘！"
        )
    elif getattr(skill_res, "deliverables", None) and any(ext.lower() == ".pdf" for ext in skill_res.deliverables):
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            "落盘方式：调用 `write_markdown` 或运行脚本生成目标 PDF 文件保存至 `/workspace/`。\n"
            "⚠️ 严禁仅输出口头文字！必须实际调用工具完成物理文件落盘！"
        )
    elif getattr(skill_res, "skill_id", None) == "pptx" or (
        getattr(skill_res, "deliverables", None) and any(ext.lower().endswith(".pptx") for ext in skill_res.deliverables)
    ):
        target_fn = next((d for d in skill_res.deliverables if d.lower().endswith(".pptx")), "presentation.pptx")
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            f"落盘方式：调用 `bash` 工具运行 Python 脚本（使用 python-pptx 库生成目标演示文稿并保存至 `/workspace/{target_fn}`）。\n"
            "⚠️ 严禁仅输出口头文字！必须实际调用 bash 工具执行 Python 脚本完成物理文件落盘！"
        )
    elif getattr(skill_res, "is_ppt_intent", False):
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            "落盘方式（任选其一，推荐方式 1）：\n"
            "1. 直接在回复中输出完整的 ```html\n<!DOCTYPE html>\n...完整可运行代码...\n``` 代码块（系统将自动写入 /workspace/presentation.html 并在前端展示交互预览与全屏组件，彻底免除 Shell 特殊字符转义风险）；\n"
            "2. 调用 `bash` 工具写入 `/workspace/presentation.html`。\n"
            "⚠️ 严禁仅输出‘已存在’、‘已保存’等口头文字而不提供代码或工具调用！必须提供完整代码！"
        )
    elif getattr(skill_res, "is_design_intent", False) or (
        getattr(skill_res, "deliverables", None) and any(ext.lower() == ".html" for ext in skill_res.deliverables)
    ):
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            "落盘方式（任选其一，推荐方式 1）：\n"
            "1. 直接在回复中输出完整的 ```html\n<!DOCTYPE html>\n...完整可运行代码...\n``` 代码块（系统将自动写入 /workspace/index.html 并在前端展示交互预览与全屏组件，彻底免除 Shell 特殊字符转义风险）；\n"
            "2. 调用 `bash` 工具（如 `cat << 'EOF' > /workspace/index.html`）写入目标文件（若使用 bash，请保持标准的单层 EOF，严禁使用 `$(cat ...)` 复杂嵌套子 Shell 语法）。\n"
            "⚠️ 严禁仅输出‘已存在’、‘已保存’等口头文字而不提供代码或工具调用！必须提供完整代码！"
        )
    else:
        target_ext = skill_res.deliverables[0] if getattr(skill_res, "deliverables", None) else ""
        return (
            "【执行与代码落盘阶段】：方案规划已完成。请严格按照上述规划方案实施落盘。\n"
            f"落盘方式：调用 `bash` 或对应写文件工具将文件保存至 `/workspace/` 路径下{f'（如 {target_ext} 交付物）' if target_ext else ''}。\n"
            "⚠️ 严禁仅输出‘已存在’、‘已保存’等口头文字而不提供代码或工具调用！必须完成物理文件落盘！"
        )


def run_planning_phase(
    prompt: str,
    messages: List[Dict[str, Any]],
    model_name: str,
    policy: RuntimePolicy,
    deadline: Optional[float] = None,
    has_web_search_permission: bool = True,
    telemetry: Optional[TelemetryStats] = None,
    is_deliverable_task: bool = True,
    session_files: Optional[List[str]] = None,
) -> Optional[str]:
    """Execute the thinking model in the planning phase to reason, architect, outline,

    or ground external facts through read-only web retrieval.
    Strictly prohibits any mutating tools (bash, write_file, patch_file, reminders, etc.).
    """
    planning_policy = RuntimePolicy(
        temperature=policy.temperature,
        model_socket_timeout=policy.model_socket_timeout,
        single_request_timeout=min(policy.single_request_timeout, 120),
        total_task_timeout=policy.total_task_timeout,
        thinking=True,
        reasoning_effort=policy.reasoning_effort or "medium",
    )
    has_attachment_context = bool(session_files) or bool(
        re.search(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】', prompt or "")
    )
    # 本地附件优先原则：有本地附件且未明确要求外部检索时，规划阶段禁用网络检索，防止模型外溢搜索通用趋势
    is_explicit_external_search = any(k in (prompt or "").lower() for k in ["全网", "网上", "外部", "竞品", "最新动态", "实时热点", "联网搜索"])
    enable_planning_search = has_web_search_permission and (not has_attachment_context or is_explicit_external_search)

    planning_tools = (
        get_sandbox_tools(allowed_names={"web_search", "fetch_page"})
        if enable_planning_search else None
    )

    if is_deliverable_task:
        if enable_planning_search:
            planning_instruction = (
                "【规划阶段任务】：请针对用户的需求与交付物目标进行深入思考与方案规划。\n"
                "1. 深入分析用户目标、页面/内容结构、排版与视觉设计规范。\n"
                "2. 若涉及外部开源项目、未知技术组件、最新库/API 或特定插件生态，你可以调用 `web_search` 与 `fetch_page` 检索一手技术事实与官方依据（本阶段仅开放只读网络检索，严禁且不支持写文件或执行命令工具）。\n"
                "3. 给出详细的实现与落盘规划（包括功能模块划分、代码逻辑与目标落盘文件路径，如根据用户交付需求规划目标文件 `/workspace/<文件名>.<扩展名>`）。\n"
                "4. 输出清晰详尽的规划方案。本阶段仅负责思考与架构规划，规划完成后系统将切换至执行与代码落盘阶段。"
            )
        else:
            planning_instruction = (
                "【规划阶段任务】：请针对用户的需求与交付物目标进行深入思考与方案规划。\n"
                "1. 深入分析用户目标，充分结合会话中已有的有效数据与附件内容，规划页面/内容结构、排版与视觉设计规范。\n"
                "2. 给出详细的实现与落盘规划（包括功能模块划分、数据呈现、核心卡片/表格与目标落盘文件路径，如 `/workspace/<文件名>.<扩展名>`）。\n"
                "3. 输出清晰详尽的规划方案。本阶段仅负责思考与架构规划，规划完成后系统将切换至执行与代码落盘阶段。"
            )
    else:
        planning_instruction = (
            "【事实调研与规划阶段任务】：请针对用户的咨询与事实调研需求进行深入思考与信息搜集规划。\n"
            "1. 明确用户问题中的关键要素（时效性、实体、具体诉求）。\n"
            "2. 若涉及当前日期、最新赛程、实时热点、外部技术组件或动态事实，你必须主动调用 `web_search` 与 `fetch_page` 检索第一手客观事实与实时数据（严禁在未尝试搜索前直接断言无法获取实时数据）。\n"
            "3. 梳理检索到的事实要点，提炼核心结论与结构化回复大纲（本阶段纯信息梳理，无需落盘任何物理文件）。\n"
            "4. 本阶段完成事实检索与规划后，系统将切换至最终回答呈现阶段。"
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
        phase_label = "交付方案与落盘架构" if is_deliverable_task else "事实调研与信息检索"
        print(f"🧠 [Harness Planning Phase] 开启思考模式：正在进行{phase_label}规划...", flush=True)

        while executed_search_count <= max_search_rounds:
            res = _dispatch_call_model_proxy(
                planning_messages,
                model_name,
                tools=planning_tools if executed_search_count < max_search_rounds else None,
                timeout=planning_policy.single_request_timeout,
                deadline=deadline,
                policy=planning_policy,
            )
            if telemetry:
                telemetry.record_llm_response(res, is_first_round=False)

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
                    print(f"✓ [Harness Planning Phase] {phase_label}规划完成，进入执行阶段。", flush=True)
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
                t_res = _dispatch_execute_tool(t_name, t_params, deadline=deadline)
                if telemetry:
                    is_err = _is_tool_error(t_res)
                    status = "error" if is_err else "success"
                    telemetry.record_tool_call(tool_name=t_name, params=t_params, status=status)
                clipped_res = ContextBudget.clip_tool_result(t_res, max_chars=4000)
                planning_messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": clipped_res
                })

            if is_deliverable_task:
                planning_messages.append({
                    "role": "user",
                    "content": "已获取上述检索数据。请结合上述真实事实，输出最终详尽的实施与架构落盘规划方案（本阶段无需再次调用工具）。"
                })
            else:
                planning_messages.append({
                    "role": "user",
                    "content": "已获取上述检索数据。请结合上述真实事实，总结提炼出核心事实依据与回答要点（本阶段无需再次调用工具，亦无需落盘文件）。"
                })

    except Exception as e:
        print(f"⚠️ [Harness Planning Phase] 规划阶段异常，降级直接进入执行阶段: {e}", flush=True)
    return None
