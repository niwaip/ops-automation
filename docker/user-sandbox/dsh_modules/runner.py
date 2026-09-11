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
from .tools import scan_personal_knowledge, perform_web_search, read_workspace_file, execute_tool
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

    # 扩展的实时意图嗅探 (Web 搜索)
    search_keywords = [
        "搜索", "新闻", "最新", "热点", "热搜", "今天", "查", "查看",
        "榜", "天气", "行情", "search", "news", "trending", "trend",
        "b站", "bilibili", "微博", "知乎", "热度", "最高", "排行",
        "最火", "热门", "推荐", "推荐下", "插件", "谁", "哪些", "多少", "评测",
        "现在", "目前"
    ]
    is_search_intent = args.web_search or any(k in prompt for k in search_keywords)

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

    # 扩展的 PPT / 前端原型设计 / PDF / Excel / Word / 内部沟通 / 文档协作意图嗅探
    ppt_keywords = ["ppt", "slides", "幻灯片", "演示文稿", "deck", "汇报", "讲义"]
    design_keywords = ["设计", "前端", "原型", "landing", "saas", "dashboard", "看板", "ui", "页面", "品味", "审美"]
    pdf_keywords = ["pdf", "导出pdf", "生成pdf", "转成pdf", "转pdf", "doc转pdf", "docx转pdf"]
    xlsx_keywords = ["xlsx", "excel", "表格", "做个表", "报表", "生成excel", "导出excel", "csv转excel", "整理数据"]
    docx_keywords = ["docx", "word", "合同", "生成word", "导出word", "word文档"]
    comms_keywords = ["周报", "月报", "3p", "故障通报", "复盘报告", "系统维护", "发布公告", "维护通知", "内部通告"]
    coauthor_keywords = ["技术方案", "prd", "需求文档", "设计方案", "起草提案", "决策文档", "架构方案"]

    skill_context = ""
    is_ppt_intent = any(k in prompt.lower() for k in ppt_keywords)
    is_design_intent = any(k in prompt.lower() for k in design_keywords)
    is_pdf_intent = any(k in prompt.lower() for k in pdf_keywords)
    is_xlsx_intent = any(k in prompt.lower() for k in xlsx_keywords)
    is_docx_intent = any(k in prompt.lower() for k in docx_keywords)
    is_comms_intent = any(k in prompt.lower() for k in comms_keywords)
    is_coauthor_intent = any(k in prompt.lower() for k in coauthor_keywords)

    # 上下文短确认探测 (用户回复 "1" 或 "生成" 且上轮涉及 PDF 制作)
    if not is_pdf_intent and prompt.strip() in ["1", "1.", "一是", "第一个", "确认", "生成", "导出"]:
        for h in reversed(existing_history[-4:]):
            if not isinstance(h, dict):
                continue
            c = str(h.get("content", "")).lower()
            if any(k in c for k in ["pdf", "导出", "生成文档", "fpdf", "notosans"]):
                is_pdf_intent = True
                break

    if is_ppt_intent:
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
        "- Container: Standard Linux Sandbox\n"
        "- User: sandbox (UID: 1001, non-root, immutable core system)\n"
        "- Mode: personal (Work-related enterprise workflows are strictly isolated)\n"
        f"- Workspace: {WORKSPACE_DIR} (read-write current task workspace)\n"
        f"- Knowledge Space: {KNOWLEDGE_DIR} (read-write personal space for long-term deliverables, documents, reports, and custom skills)\n"
        f"- Custom Skills: {CUSTOM_SKILL_DIR} (user-defined skills created with skill-creator)\n"
        f"- Certified Skills & Templates: {SKILL_DIR} (read-only system design systems & productivity engines)\n\n"
        "【Available Tools in Sandbox】:\n"
        "You have direct access to execute the following tools within the sandbox when you need fresh data, computation, or verification:\n"
        "1. `weather`: Query real-time weather and 3-day forecast for any city.\n"
        "   Call format: <tool_call>{\"name\": \"weather\", \"arguments\": {\"city\": \"城市名\"}}</tool_call>\n"
        "2. `web_search`: Search the live web for up-to-date information, news, trending topics (powered by modsearch).\n"
        "   Call format: <tool_call>{\"name\": \"web_search\", \"arguments\": {\"query\": \"搜索关键词\"}}</tool_call>\n"
        "3. `fetch_page`: Read and extract content from any live webpage or URL as clean Markdown/text (e.g. GitHub Trending, HackerNews, blogs, news, documentation).\n"
        "   Call format: <tool_call>{\"name\": \"fetch_page\", \"arguments\": {\"url\": \"https://...\"}}</tool_call>\n"
        "4. `read_file`: Read and parse any file in /workspace or /knowledge (natively supports Office .docx Word documents, .xlsx Excel sheets, .pdf, .txt, .md, .json, .csv, code files).\n"
        "   Call format: <tool_call>{\"name\": \"read_file\", \"arguments\": {\"file_path\": \"文件名或路径\"}}</tool_call>\n"
        "5. `bash`: Execute shell commands inside Linux sandbox /workspace (e.g. curl, python3, jq, cat, ls, find, sed, awk).\n"
        "   Call format: <tool_call>{\"name\": \"bash\", \"arguments\": {\"cmd\": \"shell命令\"}}</tool_call> or ```bash\n命令\n```\n"
        "6. `scan_knowledge`: Scan the user's personal knowledge base (/knowledge) for reference materials, saved documents, and custom skills.\n"
        "   Call format: <tool_call>{\"name\": \"scan_knowledge\", \"arguments\": {}}</tool_call>\n"
        "7. `read_skill`: Read professional design, PPT presentation, and productivity templates (/knowledge/skills or /opt/dsh/skills).\n"
        "   Available system skills: `xlsx` (Excel spreadsheet creation with formulas & styles), `docx` (Word document & contract processing), `pdf` (offline PDF document/report generation), `internal-comms` (3P updates, post-mortems, maintenance notices), `doc-coauthoring` (collaborative technical spec & PRD workflow), `skill-creator` (develop new custom skills), `theme-factory` (design themes & color palettes), `guizang-ppt` (magazine-style HTML slides), `html-ppt`, `frontend-design`, `dashboard`, `saas-landing`, `web-prototype`, `taste-skill`, `pptx`, `slides`, plus any custom skills in /knowledge/skills.\n"
        "   Call format: <tool_call>{\"name\": \"read_skill\", \"arguments\": {\"skill_name\": \"guizang-ppt\"}}</tool_call>\n\n"
        "【Personal Space & Custom Skills Instructions】:\n"
        "- Saving Deliverables to Personal Space: /knowledge is fully read-write and persistent across sandbox restarts. When the user asks to save documents, reports, summaries, or artifacts to '个人空间' (Personal Space), write them directly to /knowledge/ (e.g. `/knowledge/系统运维报告书.docx` or `/knowledge/outputs/...`). Do NOT say that /knowledge is read-only.\n"
        "- Custom Skills: When developing custom skills using `skill-creator`, save them into `/knowledge/skills/<skill-name>/SKILL.md` (and optional scripts/templates in the same folder). dsh will automatically detect and load them via `read_skill`!\n\n"
        "【Autonomous Problem Solving & Design Instructions】:\n"
        "1. Deliverable Creation: When asked to create PPT, slides, dashboard, landing page, UI, or code, DO NOT invoke search or shell tools unless live external facts are specifically requested. Use the loaded design rules and DIRECTLY write the full working code!\n"
        "2. Real-time Accuracy: When asked for live news, real-time weather, or today's trends, refer to [Current System Timestamp] and autonomously invoke `weather` or `web_search`.\n"
        "3. Tool Call Protocol: When invoking a tool, output strictly: <tool_call>{\"name\": \"...\", \"arguments\": {...}}</tool_call>. CRITICAL: If you plan or promise to perform an action (e.g. '我换用关键词搜索...', '重新查询...', '接下来我来获取...'), you MUST output the <tool_call> tag in the SAME response! NEVER output conversational filler or empty action promises without the tool call tag. Ensure valid JSON syntax with properly escaped strings and closed curly braces `}}`.\n"
        "4. Deliverable Format: ONLY when the user explicitly requests PPT, slides, dashboard, landing page, UI, or HTML artifacts, generate single-file HTML/CSS/JS (inside ```html ``` code block). For normal questions (such as weather, Q&A, facts, data queries), answer directly in clean Markdown without generating unrequested HTML or artifacts.\n"
        "5. Direct & Proportional Response: Answer what the user asked directly and concisely. Do NOT proactively offer or generate unrequested HTML cards, files, or extra deliverables unless explicitly asked.\n"
        "6. Final Output: Output clean, beautifully structured, accurate Chinese Markdown. Never leave raw XML or tool_call tags in the final answer."
    )

    user_parts = [f"[User Request]:\n{prompt}"]

    # 自动探测并注入用户在 prompt 中提及的工作区附加文件内容（如 docx, xlsx, txt 等）
    file_context = ""
    if os.path.exists(WORKSPACE_DIR):
        for item in sorted(Path(WORKSPACE_DIR).iterdir()):
            if item.is_file() and not item.name.startswith("."):
                if item.name in prompt or (len(item.stem) >= 3 and item.stem in prompt):
                    extracted = read_workspace_file(item.name)
                    if extracted and not extracted.startswith("文件未找到"):
                        file_context += f"\n\n[Attached File Content - {item.name}]:\n{extracted[:15000]}"
    if file_context:
        user_parts.append(file_context.strip())

    if knowledge_context:
        user_parts.append(f"[Mounted Personal Knowledge Base]:\n{knowledge_context}")
    if skill_context:
        user_parts.append(
            f"[Loaded Design Skill & Style Guide]:\n{skill_context[:3500]}\n\n"
            "【注意】：当前设计规范已为你成功加载就绪，你无需再调用任何工具。请直接根据以上规范生成高质量、美观单文件 HTML 幻灯片代码（保存在 ```html ``` 代码块中）。"
        )
    if search_context:
        user_parts.append(f"[Live Retrieved Information]:\n{search_context}")
    elif is_search_intent:
        user_parts.append("[Search Status]: 初步检索未获得足够数据。请主动调用工具（如 weather, web_search, 或 bash 执行终端命令）自主获取最新数据解答用户。")
    # 注意：根据 Prompt Caching (KV Cache) 前缀匹配原理，动态系统时间必须置于当前轮次提示词的末尾，确保前缀全局命中缓存！
    user_parts.append(f"---\n[Current System Timestamp]: {now_str}")
    current_turn_text = "\n\n".join(user_parts)
    messages = [{"role": "system", "content": system_prompt}]

    # 注入该会话的历史对话记录（最多取最近 10 条）
    for h in existing_history[-10:]:
        if not isinstance(h, dict):
            continue
        role = h.get("role")
        content = h.get("content")
        if role in ["user", "assistant"] and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": current_turn_text})

    try:
        reply = call_model_proxy(messages, args.model or "deepseek-chat")

        # 智能自主 ReAct 工具调用循环 (设计任务最多 1 轮以确保快速产出，研究分析任务支持最多 5 轮)
        max_rounds = 1 if (is_ppt_intent or is_design_intent) else 5
        for round_idx in range(max_rounds):
            tool_calls = parse_tool_calls(reply)
            if not tool_calls:
                # 检查回复是否是模型“打算继续行动/换关键词重试”的口头承诺垫话（遗漏了 tool_call 标签）
                if is_promising_action(reply) and round_idx < max_rounds - 1:
                    print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具标签，正在提醒模型执行工具...")
                    messages.append({"role": "assistant", "content": reply})
                    messages.append({
                        "role": "user",
                        "content": (
                            "你刚才提出了具体的后续行动方案（例如换用关键词搜索），但尚未输出工具调用标签！\n"
                            "请不要只输出口头承诺，请立刻输出具体的 <tool_call>{\"name\": \"web_search\", \"arguments\": {\"query\": \"具体关键词\"}}</tool_call> "
                            "或其它对应工具标签来执行该操作！"
                        )
                    })
                    reply = call_model_proxy(messages, args.model or "deepseek-chat")
                    continue
                break

            t = tool_calls[0]
            t_name = t["name"]
            t_params = t["params"]
            param_preview = (
                t_params.get("__search_query") or
                t_params.get("query") or
                t_params.get("cmd") or
                str(t_params)
            )

            clean_param = re.sub(r'\s+', ' ', param_preview).strip()
            if len(clean_param) > 80:
                clean_param = clean_param[:80] + "..."
            print(f"⚡ [Harness Tool Call] 正在调用工具: {t_name}({clean_param})...")
            tool_res = execute_tool(t_name, t_params)
            print("✓ 工具执行完成，正在分析并综合归纳...")

            messages.append({"role": "assistant", "content": reply})
            next_tip = "请继续推进并输出最终成果（制作PPT/网页请提供完整HTML代码）。"
            if (is_ppt_intent or is_design_intent) and round_idx >= 1:
                next_tip = "参考材料已完备。请立刻根据设计规范生成完整可运行的 HTML 代码（置于 ```html 代码块中）并详细说明。"
            messages.append({
                "role": "user",
                "content": f"[Tool Execution Result - {t_name}]:\n{tool_res}\n\n{next_tip}"
            })

            reply = call_model_proxy(messages, args.model or "deepseek-chat")

        # 检查是否仍有未执行的工具调用请求（达到 max_rounds 退出循环时）
        has_pending_tool_calls = bool(parse_tool_calls(reply))
        final_text = clean_output(reply)

        # 检查是否仅留下了过渡性前导垫话（如“让我深入探索克隆下来的仓库内容...”或“我换用更精确的关键词搜索...”）
        action_filler_keywords = [
            "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
            "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合"
        ]
        is_transitional_filler = (
            len(final_text) < 120 and
            (any(kw in final_text for kw in action_filler_keywords) or is_promising_action(reply))
        )

        # 如果模型仍试图调用工具、内容为空或仅有过渡性短句，强制请求输出最终总结
        if has_pending_tool_calls or not final_text or is_transitional_filler:
            messages.append({"role": "assistant", "content": reply})
            messages.append({
                "role": "user",
                "content": "工具调用轮次已结束。请根据目前已探索和收集到的所有信息与仓库内容，直接给出深入、结构完整、详尽的最终中文回答（严禁输出中间过渡垫话或未执行的工具标签）。"
            })
            try:
                forced_reply = call_model_proxy(messages, args.model or "deepseek-chat")
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
