"""
Agent orchestration loop, multi-turn ReAct execution, and CLI command runners.
"""

import os
import sys
import json
import re
import subprocess
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, CUSTOM_SKILL_DIR, SKILL_DIR, print_banner
from .skills import get_available_skills, read_skill
from .tools import scan_personal_knowledge, perform_web_search, read_workspace_file, execute_tool, SANDBOX_TOOLS
from .llm import call_model_proxy, parse_tool_calls, clean_output, is_promising_action


def cmd_run(args):
    prompt = " ".join(args.query) if isinstance(args.query, list) else str(args.query)
    if not prompt.strip():
        print("Error: query prompt is required.", file=sys.stderr)
        sys.exit(1)

    print_banner()

    # 仅在用户明确询问或关联个人知识空间时主动探测注入，避免一般查询产生提示词污染与过度解读
    knowledge_keywords = ["个人空间", "知识库", "知识空间", "我的文档", "保存的文件", "以前的", "历史文件", "knowledge"]
    is_knowledge_intent = any(k in prompt.lower() for k in knowledge_keywords)
    knowledge_context = scan_personal_knowledge() if is_knowledge_intent else ""

    # 仅当显式勾选了联网开关或用户以 /search 开头时触发前置搜索，其余查询由模型自主 ReAct 调用工具
    is_search_intent = bool(args.web_search) or prompt.strip().startswith("/search ")

    session_id = getattr(args, "session_id", None)
    history_file = None
    existing_history = []
    if session_id:
        clean_sid = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)
        sessions_dir = Path(WORKSPACE_DIR) / ".dsh" / "sessions"
        try:
            sessions_dir.mkdir(parents=True, exist_ok=True)
            history_file = sessions_dir / f"{clean_sid}.json"
            if history_file.exists():
                with open(history_file, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    if isinstance(loaded, list):
                        existing_history = [item for item in loaded if isinstance(item, dict)]
        except Exception:
            pass

    # 扩展的 PPT / 前端原型设计 / PDF / Excel / Word / 内部沟通 / 文档协作 / 图像生成意图嗅探
    ppt_keywords = ["ppt", "slides", "幻灯片", "演示文稿", "deck", "汇报", "讲义"]
    design_keywords = ["设计", "前端", "原型", "landing", "saas", "dashboard", "看板", "ui", "页面", "品味", "审美"]
    pdf_keywords = ["pdf", "导出pdf", "生成pdf", "转成pdf", "转pdf", "doc转pdf", "docx转pdf"]
    xlsx_keywords = ["xlsx", "excel", "表格", "做个表", "报表", "生成excel", "导出excel", "csv转excel", "整理数据"]
    docx_keywords = ["docx", "word", "合同", "生成word", "导出word", "word文档"]
    comms_keywords = ["周报", "月报", "3p", "故障通报", "复盘报告", "系统维护", "发布公告", "维护通知", "内部通告"]
    coauthor_keywords = ["技术方案", "prd", "需求文档", "设计方案", "起草提案", "决策文档", "架构方案"]
    send_keywords = ["通过微信发送", "发送微信", "发到微信", "发我微信", "微信发我", "微信发送", "发给我", "推送给我", "发送给用户", "发我一份", "发到我微信", "发送文件", "发文件"]
    image_keywords = ["画一张", "画图", "生成图片", "生图", "画个", "设计logo", "设计海报", "做个海报", "以图生图", "修改图片", "重绘", "换背景", "换成", "戴上", "画", "绘画", "插画", "绘制", "生成图", "文生图", "图生图", "image_gen"]

    skill_context = ""
    is_ppt_intent = any(k in prompt.lower() for k in ppt_keywords)
    is_design_intent = any(k in prompt.lower() for k in design_keywords)
    is_pdf_intent = any(k in prompt.lower() for k in pdf_keywords)
    is_xlsx_intent = any(k in prompt.lower() for k in xlsx_keywords)
    is_docx_intent = any(k in prompt.lower() for k in docx_keywords)
    is_comms_intent = any(k in prompt.lower() for k in comms_keywords)
    is_coauthor_intent = any(k in prompt.lower() for k in coauthor_keywords)
    is_send_intent = any(k in prompt.lower() for k in send_keywords)
    is_image_intent = any(k in prompt.lower() for k in image_keywords)

    # 上下文短确认探测 (用户回复 "1" 或 "生成" 且上轮涉及 PDF 制作)
    if not is_pdf_intent and prompt.strip() in ["1", "1.", "一是", "第一个", "确认", "生成", "导出"]:
        for h in reversed(existing_history[-4:]):
            if not isinstance(h, dict):
                continue
            c = str(h.get("content", "")).lower()
            if any(k in c for k in ["pdf", "导出", "生成文档", "fpdf", "notosans"]):
                is_pdf_intent = True
                break

    if is_image_intent:
        print("🎨 [Harness Skill Sniffer] 检测到图像创作/修图意图，正在加载图像创作规范 (image-gen)...")
        skill_context = read_skill("image-gen")
    elif is_ppt_intent:
        print("🎨 [Harness Skill Sniffer] 检测到 PPT / 演示文稿生成意图，正在加载设计引擎 (guizang-ppt)...")
        skill_context = read_skill("guizang-ppt")
    elif is_pdf_intent:
        print("📄 [Harness Skill Sniffer] 检测到 PDF 生成/导出意图，正在加载 PDF 制作规范 (pdf)...")
        skill_context = read_skill("pdf")
    elif is_xlsx_intent:
        print("📊 [Harness Skill Sniffer] 检测到 Excel 电子表格处理意图，正在加载表格规范 (xlsx)...")
        skill_context = read_skill("xlsx")
    elif is_docx_intent:
        print("📝 [Harness Skill Sniffer] 检测到 Word 文档/合同处理意图，正在加载文档规范 (docx)...")
        skill_context = read_skill("docx")
    elif is_comms_intent:
        print("📋 [Harness Skill Sniffer] 检测到内部沟通/汇报意图，正在加载企业沟通规范 (internal-comms)...")
        skill_context = read_skill("internal-comms")
    elif is_coauthor_intent:
        print("📑 [Harness Skill Sniffer] 检测到技术方案/PRD协作意图，正在加载文档共创工作流 (doc-coauthoring)...")
        skill_context = read_skill("doc-coauthoring")
    elif is_design_intent:
        matched_skill = "frontend-design"
        if "dashboard" in prompt.lower() or "看板" in prompt.lower():
            matched_skill = "dashboard"
        elif "landing" in prompt.lower() or "saas" in prompt.lower():
            matched_skill = "saas-landing"
        elif "原型" in prompt.lower() or "prototype" in prompt.lower():
            matched_skill = "web-prototype"
        print(f"🎨 [Harness Skill Sniffer] 检测到 UI / 前端设计意图，正在加载设计规则 ({matched_skill})...")
        skill_context = read_skill(matched_skill)

    # 自定义技能探测 (检测 /knowledge/skills 下的用户自定义技能)
    if not skill_context:
        for cs in get_available_skills():
            if cs.get("type") == "custom":
                c_id = cs["id"].lower()
                c_name = cs["name"].lower() if cs.get("name") else ""
                if c_id in prompt.lower() or (c_name and c_name in prompt.lower()):
                    print(f"✨ [Harness Skill Sniffer] 检测到自定义技能意图，正在加载用户技能 ({cs['id']})...")
                    skill_context = read_skill(cs["id"])
                    break

    search_context = ""
    if is_search_intent:
        print(f"🔍 [Harness Web Search] 正在检索实时数据: '{prompt}'...")
        search_context = perform_web_search(prompt)
        if search_context:
            print("✓ 实时数据检索成功，已注入分析上下文。")

    cst_tz = timezone(timedelta(hours=8))
    now_dt = datetime.now(cst_tz)
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    now_str = f"{now_dt.strftime('%Y年%m月%d日 %H:%M:%S')} {weekdays[now_dt.weekday()]} (Asia/Shanghai)"

    system_prompt = (
        "You are DeepSeek Harness (dsh), an autonomous intelligence agent running directly inside the user's isolated Linux sandbox container.\n\n"
        "【Environment Context】:\n"
        "- Container: Standard Linux Sandbox (User: sandbox, non-root)\n"
        f"- Workspace: {WORKSPACE_DIR} (read-write current task workspace)\n"
        f"- Knowledge Space: {KNOWLEDGE_DIR} (read-write deliverables, documents, reports, custom skills)\n\n"
        "【Available Tools in Sandbox】:\n"
        "You have direct access to execute the following tools within the sandbox when you need fresh data, computation, or verification:\n"
        "1. `weather`: Query real-time weather and 3-day forecast for any city.\n"
        "   Call format: <tool_call>{\"name\": \"weather\", \"arguments\": {\"city\": \"城市名\"}}</tool_call>\n"
        "2. `web_search`: Search the live web for up-to-date information, news, trending topics.\n"
        "   Call format: <tool_call>{\"name\": \"web_search\", \"arguments\": {\"query\": \"搜索关键词\"}}</tool_call>\n"
        "3. `fetch_page`: Read and extract content from any live webpage or URL as clean Markdown/text.\n"
        "   Call format: <tool_call>{\"name\": \"fetch_page\", \"arguments\": {\"url\": \"https://...\"}}</tool_call>\n"
        "4. `read_file`: Read and parse any file in /workspace or /knowledge (.docx, .xlsx, .pdf, .txt, .md, .json, .csv, code files).\n"
        "   Call format: <tool_call>{\"name\": \"read_file\", \"arguments\": {\"file_path\": \"文件名或路径\"}}</tool_call>\n"
        "5. `bash`: Execute shell commands inside Linux sandbox /workspace (e.g. curl, python3, jq, cat, ls, find, sed, awk).\n"
        "   Call format: <tool_call>{\"name\": \"bash\", \"arguments\": {\"cmd\": \"shell命令\"}}</tool_call>\n"
        "6. `scan_knowledge`: Scan the user's personal knowledge base (/knowledge) for reference materials, saved documents, and custom skills.\n"
        "   Call format: <tool_call>{\"name\": \"scan_knowledge\", \"arguments\": {}}</tool_call>\n"
        "7. `read_skill`: Read professional design, PPT presentation, and productivity templates (/opt/dsh/skills).\n"
        "   Call format: <tool_call>{\"name\": \"read_skill\", \"arguments\": {\"skill_name\": \"guizang-ppt\"}}</tool_call>\n"
        "8. `vision_inspect`: Inspect and analyze visual content from image files.\n"
        "   Call format: <tool_call>{\"name\": \"vision_inspect\", \"arguments\": {\"file_path\": \"图片文件名或路径\", \"prompt\": \"指令\"}}</tool_call>\n"
        "9. `image_gen`: Generate or edit images using the system model.\n"
        "   Call format: <tool_call>{\"name\": \"image_gen\", \"arguments\": {\"prompt\": \"详细生图提示词\", \"aspect_ratio\": \"16:9\", \"output_filename\": \"图片名.png\"}}</tool_call>\n"
        "10. `send_file`: Deliver/push any file from /workspace or /knowledge directly to the user's WeChat / chat client.\n"
        "   Call format: <tool_call>{\"name\": \"send_file\", \"arguments\": {\"file_path\": \"文件名或路径\", \"comment\": \"可选备注说明\"}}</tool_call>\n\n"
        "【Instructions】:\n"
        "1. For simple questions and normal dialogue, answer directly and concisely in Markdown without invoking any tools.\n"
        "2. When asked for real-time facts, current weather, or latest news, autonomously invoke `weather` or `web_search`.\n"
        "3. When invoking a tool, output strictly: <tool_call>{\"name\": \"...\", \"arguments\": {...}}</tool_call> with valid JSON syntax.\n"
        "4. Save deliverables to /knowledge/ directly when requested to save to personal space. Use `send_file` when asked to send to user/WeChat.\n"
        "5. Output clean, beautifully structured, accurate Chinese Markdown. Never leave raw XML or tool_call tags in the final answer."
    )

    # 1. 解析当前会话绑定的有效附件列表（会话作用域隔离，彻底杜绝工作区历史文件污染）
    session_files = []
    raw_files = getattr(args, "files", None)
    if raw_files:
        session_files = [f.strip() for f in str(raw_files).split(",") if f.strip()]
    elif session_id:
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

    user_parts = [f"[User Request]:\n{prompt}"]

    file_context = ""
    # 严格限定仅自动加载当前会话绑定的附件内容
    for fname in session_files:
        fpath = Path(WORKSPACE_DIR) / fname
        if fpath.exists() and fpath.is_file():
            extracted = read_workspace_file(fname)
            if extracted and not extracted.startswith("文件未找到"):
                clipped = extracted[:3500] + ("\n...[文件过长已截断]" if len(extracted) > 3500 else "")
                file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"

    # 如果用户在提示词中显式提及了特定工作区文件名（精确匹配完整文件名），按需作为参考文件加载
    if os.path.exists(WORKSPACE_DIR):
        for item in sorted(Path(WORKSPACE_DIR).iterdir()):
            if item.is_file() and not item.name.startswith(".") and item.name not in session_files:
                if item.name in prompt:
                    extracted = read_workspace_file(item.name)
                    if extracted and not extracted.startswith("文件未找到"):
                        clipped = extracted[:3500] + ("\n...[文件过长已截断]" if len(extracted) > 3500 else "")
                        file_context += f"\n\n[Referenced Workspace File - {item.name}]:\n{clipped}"

    if session_files:
        user_parts.append(
            f"[Session Attachments]: 当前会话有效附件为: {', '.join(session_files)}。"
            "除此列表以外的工作区文件为沙箱历史遗留或系统环境文件，绝不是本次会话的附件。"
        )
    else:
        user_parts.append(
            "[Session Attachments]: 当前会话用户未上传任何附件。"
            "若用户询问“附件是什么”或查询当前上传的文件，请直接明确告知当前会话未上传附件，切勿调用 bash 或工具扫描工作区历史遗留文件。"
        )
    if file_context:
        user_parts.append(file_context.strip())

    if knowledge_context:
        user_parts.append(f"[Mounted Personal Knowledge Base]:\n{knowledge_context}")
    if skill_context:
        user_parts.append(
            f"[Loaded Design Skill & Style Guide]:\n{skill_context[:1500]}\n\n"
            "【注意】：当前设计规范已为你成功加载就绪，你无需再调用任何工具。请直接根据以上规范生成高质量、美观单文件 HTML 幻灯片代码（保存在 ```html ``` 代码块中）。"
        )
    if is_send_intent:
        user_parts.append("[Delivery Intent]: 检测到用户要求通过即时通讯（微信）接收文件。沙箱已集成微信文件外发通道，请直接调用 `send_file` 工具将对应文件推送给用户，严禁声明无法发送！")
    if search_context:
        user_parts.append(f"[Live Retrieved Information]:\n{search_context}")
    elif is_search_intent:
        user_parts.append("[Search Status]: 初步检索未获得足够数据。请主动调用工具（如 weather, web_search, 或 bash 执行终端命令）自主获取最新数据解答用户。")
    # 注意：根据 Prompt Caching (KV Cache) 前缀匹配原理，动态系统时间必须置于当前轮次提示词的末尾，确保前缀全局命中缓存！
    user_parts.append(f"---\n[Current System Timestamp]: {now_str}")
    current_turn_text = "\n\n".join(user_parts)
    messages = [{"role": "system", "content": system_prompt}]

    # 注入该会话的历史对话记录（基于滑动窗口预算，总预算上限约 4000 字符 / 2500 Tokens）
    MAX_HISTORY_CHARS = 4000
    budgeted_history = []
    used_chars = 0
    dropped_count = 0
    for h in reversed(existing_history):
        if not isinstance(h, dict):
            continue
        role = h.get("role")
        content = h.get("content")
        if role in ["user", "assistant", "tool"] and content:
            content_str = str(content)
            if len(content_str) > 1000:
                content_str = content_str[:1000] + "...[内容已截断]"
            if used_chars + len(content_str) > MAX_HISTORY_CHARS:
                dropped_count += 1
                continue
            used_chars += len(content_str)
            item = {"role": role, "content": content_str}
            if role == "tool" and h.get("tool_call_id"):
                item["tool_call_id"] = h["tool_call_id"]
            if role == "assistant" and h.get("tool_calls"):
                item["tool_calls"] = h["tool_calls"]
            budgeted_history.insert(0, item)

    if dropped_count > 0:
        messages.append({"role": "system", "content": f"[系统提示：为确保高效响应，早期 {dropped_count} 条历史交互已自动精简归档]"})
    for bh in budgeted_history:
        messages.append(bh)

    messages.append({"role": "user", "content": current_turn_text})

    # 根据任务意图动态分配最大执行轮数，避免多轮空转耗时
    if is_ppt_intent or is_design_intent:
        max_rounds = 4
    elif any(w in prompt for w in ["天气", "气温", "几度", "预报", "几点", "日期", "时间", "汇率"]):
        max_rounds = 2
    elif is_search_intent:
        max_rounds = 3
    else:
        max_rounds = 3

    MAX_TOOL_RESULT_CHARS = 3000
    outbound_files_collected = []
    telemetry_stats = {
        "ttft_ms": 0,
        "total_ms": 0,
        "tool_invocations": 0,
        "tokens": {},
        "finish_reason": "stop"
    }
    reply_text = ""

    try:
        for round_idx in range(max_rounds):
            llm_res = call_model_proxy(messages, args.model or "deepseek-chat", tools=SANDBOX_TOOLS)
            reply_text = llm_res.get("content", "") if isinstance(llm_res, dict) else str(llm_res)
            structured_calls = list(llm_res.get("tool_calls", [])) if isinstance(llm_res, dict) else []

            if isinstance(llm_res, dict):
                telemetry_stats["total_ms"] += llm_res.get("total_ms", 0)
                if round_idx == 0:
                    telemetry_stats["ttft_ms"] = llm_res.get("ttft_ms", 0)
                if llm_res.get("usage"):
                    telemetry_stats["tokens"] = llm_res["usage"]
                telemetry_stats["finish_reason"] = llm_res.get("finish_reason", "stop")

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
                    print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...")
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

            # 支持多工具/并行工具执行：遍历当轮全部工具调用！
            is_file_sent = False
            for tc in structured_calls:
                telemetry_stats["tool_invocations"] += 1
                t_id = tc.get("id") or f"call_{round_idx}_{telemetry_stats['tool_invocations']}"
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

                param_preview = (
                    t_params.get("__search_query") or
                    t_params.get("query") or
                    t_params.get("cmd") or
                    t_params.get("city") or
                    str(t_params)
                )
                clean_param = re.sub(r'\s+', ' ', str(param_preview)).strip()
                if len(clean_param) > 80:
                    clean_param = clean_param[:80] + "..."
                print(f"⚡ [Harness Tool Call] 正在调用工具: {t_name}({clean_param})...")
                tool_res = execute_tool(t_name, t_params)
                print(f"✓ 工具 [{t_name}] 执行完成")

                for m in re.findall(r'<<<DSH_OUTBOUND_FILE:(.*?)>>>', tool_res):
                    outbound_files_collected.append(m.strip())

                if t_name.lower() in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat"]:
                    is_file_sent = True

                # 严格控制工具输出上限，杜绝单工具打爆上下文
                if len(tool_res) > MAX_TOOL_RESULT_CHARS:
                    tool_res = tool_res[:MAX_TOOL_RESULT_CHARS] + f"\n...[工具输出超过 {MAX_TOOL_RESULT_CHARS} 字符，已自动截断以保障模型效率]"

                # 按照标准 OpenAI Tool Specification 回传: role: tool, tool_call_id
                messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "name": t_name,
                    "content": tool_res
                })

            if is_file_sent:
                messages.append({
                    "role": "user",
                    "content": "文件已成功标记并推送至即时通讯通道。请直接回复用户，告知文件已通过微信发送，请其查收即可。无需再调用任何其他工具。"
                })
                final_step = call_model_proxy(messages, args.model or "deepseek-chat")
                reply_text = final_step.get("content", "") if isinstance(final_step, dict) else str(final_step)
                break

        # 检查是否仍有未执行的工具调用请求或残留
        has_pending_tool_calls = bool(parse_tool_calls(reply_text))
        final_text = clean_output(reply_text)

        # 检查是否仅留下了过渡性前导垫话
        action_filler_keywords = [
            "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
            "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合"
        ]
        is_transitional_filler = (
            len(final_text) < 120 and
            (any(kw in final_text for kw in action_filler_keywords) or is_promising_action(reply_text))
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
                forced_res = call_model_proxy(messages, args.model or "deepseek-chat")
                forced_reply = forced_res.get("content", "") if isinstance(forced_res, dict) else str(forced_res)
                final_text = clean_output(forced_reply) or forced_reply.strip()
            except Exception:
                pass

        if not final_text:
            final_text = "已为您完成沙箱智能检索与数据分析，未获取到更多额外内容。"

        # 自动将输出中的完整 HTML 导出至工作区
        if "```html" in final_text:
            if final_text.count("<!DOCTYPE html") > 1:
                idx = max(final_text.rfind("```html\n<!DOCTYPE html"), final_text.rfind("```html\r\n<!DOCTYPE html"))
                if idx > 0:
                    pfx = final_text[:final_text.find("```html")].strip()
                    final_text = (pfx + "\n\n" if pfx else "") + final_text[idx:]
            m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?</html>)\s*```', final_text, re.I)
            if not m_full:
                m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?)```', final_text, re.I)
            best_html = m_full[-1].strip() if m_full else None
            if best_html:
                out_name = "presentation.html" if is_ppt_intent else "index.html"
                out_path = Path(WORKSPACE_DIR) / out_name
                try:
                    with open(out_path, "w", encoding="utf-8") as f:
                        f.write(best_html)
                    print(f"✨ [Harness Export] 已将生成的作品完整写入工作区: {out_path}")
                    if is_ppt_intent and not final_text.startswith("✨"):
                        banner = (
                            "✨ **演示文稿已生成完毕！**\n"
                            f"- **输出文件**：`/workspace/{out_name}`\n"
                            "- **操作提示**：您可以在下方直接**交互预览**、**全屏播放**（支持键盘 ← → / 空格翻页、ESC 查看大纲），或点击**下载**保存本地播放。\n\n"
                        )
                        final_text = banner + final_text
                except Exception:
                    pass

        # 持久化当前轮次到会话历史文件
        if history_file:
            try:
                existing_history.append({"role": "user", "content": prompt})
                existing_history.append({"role": "assistant", "content": final_text})
                with open(history_file, "w", encoding="utf-8") as f:
                    json.dump(existing_history[-20:], f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        for m in outbound_files_collected:
            print(f"\n<<<DSH_OUTBOUND_FILE:{m}>>>")

        metrics_json = json.dumps({
            "ttftMs": telemetry_stats["ttft_ms"],
            "durationMs": round(telemetry_stats["total_ms"], 2),
            "toolCallsCount": telemetry_stats["tool_invocations"],
            "tokens": telemetry_stats["tokens"],
            "finishReason": telemetry_stats["finish_reason"]
        }, ensure_ascii=False)
        print(f"\n<<<DSH_METRICS:{metrics_json}>>>")

        print("\n<<<DSH_FINAL_OUTPUT>>>\n" + final_text)

    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        try:
            err_json = json.loads(err_msg)
            err_detail = err_json.get("message", err_msg)
        except Exception:
            err_detail = err_msg
        msg = f"\n❌ [DeepSeek Harness 异常]: 大模型代理调用失败 ({e.code}): {err_detail}"
        print(msg)
        sys.exit(1)
    except Exception as e:
        msg = f"\n❌ [DeepSeek Harness 异常]: 执行异常: {e}"
        print(msg)
        sys.exit(1)


def cmd_exec(args):
    cmd = " ".join(args.cmd) if isinstance(args.cmd, list) else str(args.cmd)
    if not cmd.strip():
        print("Error: command is required.", file=sys.stderr)
        sys.exit(1)

    print_banner()
    print(f"🚀 Executing shell command in {WORKSPACE_DIR}: {cmd}")
    proc = subprocess.run(cmd, shell=True, cwd=WORKSPACE_DIR, text=True, capture_output=False)
    sys.exit(proc.returncode)
