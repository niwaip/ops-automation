"""
Prompt assembly and system context generation for DeepSeek Harness (dsh).
Ensures clean separation between instructions, environment metadata, and tool protocols.
"""

import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from .context_budget import ContextBudget


def get_current_timestamp_str(tz_name: str = "Asia/Shanghai") -> str:
    """Returns localized formatted timestamp string."""
    tz = None
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = timezone(timedelta(hours=8))
    now_dt = datetime.now(tz)
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now_dt.weekday()]
    return f"{now_dt.strftime('%Y年%m月%d日 %H:%M:%S')} {weekday_str} ({tz_name})"


def build_skills_catalog(available_skills: Optional[list] = None) -> str:
    """Builds compact Level 1 available skills catalog for system prompt progressive disclosure."""
    if available_skills is None:
        try:
            from .skills import get_available_skills
            available_skills = get_available_skills()
        except Exception:
            available_skills = []
    if not available_skills:
        return ""
    lines = ["【Available Skills Catalog】(Use `read_skill(skill_name=\"...\")` to load details):"]
    for s in available_skills:
        s_id = s.get("id", "")
        desc = (s.get("description") or "").strip().replace("\n", " ")
        if len(desc) > 95:
            desc = desc[:92] + "..."
        lines.append(f"- {s_id}: {desc}")
    return "\n".join(lines) + "\n\n"


def build_system_prompt(
    workspace_dir: str,
    knowledge_dir: str,
    model_name: Optional[str] = None,
    model_display_name: Optional[str] = None,
    available_skills: Optional[list] = None
) -> str:
    """
    Builds clean, tool-agnostic system prompt with progressive disclosure of registered skills.
    Tools and function schemas are passed natively via the API tools parameter,
    never duplicated in text prompt to avoid protocol divergence.
    """
    identity_line = "You are an intelligent AI assistant operating directly inside the user's isolated Linux sandbox container (dsh harness).\n"
    effective_name = model_display_name or model_name
    is_uuid = bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', str(effective_name).strip(), re.I)) if effective_name else False

    if model_display_name and not is_uuid:
        identity_line += f"【Model Identity】: Your underlying model runtime and architecture is {model_display_name}. When asked who or what model you are, truthfully identify as {model_display_name} (never falsely claim to be DeepSeek unless your model is actually DeepSeek).\n\n"
    elif model_name and not is_uuid and model_name.lower() not in ["default", "deepseek-chat"]:
        identity_line += f"【Model Identity】: Your underlying model runtime is {model_name}. When asked who or what model you are, truthfully identify your model architecture and never falsely claim to be DeepSeek unless your model is actually DeepSeek.\n\n"
    elif is_uuid:
        identity_line += f"【Model Identity】: You are powered by the enterprise platform large language model service (endpoint binding: {effective_name}). When asked who or what model you are, truthfully acknowledge that you are powered by the platform's configured large language model and do not claim to be DeepSeek unless specifically based on DeepSeek.\n\n"
    else:
        identity_line += "【Model Identity】: Maintain your authentic identity and knowledge base; never misrepresent your model heritage.\n\n"

    return (
        identity_line +
        "【Environment Context】:\n"
        "- Container: Standard Linux Sandbox (User: sandbox, non-root)\n"
        f"- Workspace: {workspace_dir} (read-write current task workspace)\n"
        f"- Knowledge Space: {knowledge_dir} (read-write deliverables, documents, reports, custom skills)\n\n"
        "【Instructions】:\n"
        "1. For basic greetings and polite dialogue without actionable requests (e.g. '你好', '你是谁'), respond directly and politely in Markdown without invoking tools.\n"
        "2. Action-Driven Execution (【动作驱动原则】):\n"
        "   - Whenever the user prompt involves action verbs such as 【查看、检查、检索、查阅、排查、查一下、搜索、验证、测试、分析、执行、生成】:\n"
        "     You MUST actively invoke native tools (web_search, fetch_page, bash, read_file, scan_knowledge, etc.) to investigate real data or execute actions.\n"
        "   - Zero Deflection Rule: NEVER output passive cop-outs such as '请提供具体的链接或说明', '请提供更多上下文', or falsely claim an entity '实际上并不存在' without having verified via search tools. You have full access to `web_search` and `bash`—proactively search and verify first!\n"
        "   - Sandbox Self-Inspection: You are operating directly inside the DeepSeek Harness (dsh) Linux container. If the user asks to inspect, check, or diagnose DeepSeek Harness, dsh, or the sandbox environment, proactively run `bash` (e.g. `dsh doctor`, `dsh --help`, `ls /workspace`) to inspect the real environment.\n"
        "3. Save deliverables and persistent documents to the knowledge space (/knowledge) when requested.\n"
        "4. Output clean, beautifully structured, accurate Chinese Markdown. Never leave raw XML tags or unparsed function artifacts in the final answer.\n"
        "5. When creating or developing web pages, HTML games, dashboards, or prototypes, ALWAYS include the complete standalone HTML code in a single ```html ... ``` block in your final response (even if you write files to workspace). This enables the frontend live interactive preview, fullscreen mode, and download card.\n"
        "6. When a user request matches any capability in 【Available Skills Catalog】, actively invoke `read_skill(skill_name=\"...\")` to load its specialized guide, templates, and execution scripts before proceeding.\n\n" +
        build_skills_catalog(available_skills)
    )


def is_context_dependent_action(prompt: str) -> bool:
    """
    Determines if user prompt is a follow-up action lacking an explicit independent topic,
    e.g. '生成一张ppt报告', '做个ppt', '导出为html', '把内容做成ppt', '整理成word', '做个总结'.
    """
    p = prompt.strip().lower()
    explicit_continuation = any(k in p for k in [
        "把内容", "基于上述", "根据上述", "按照上面", "把上面的", "把这个",
        "针对上述", "根据刚才", "把刚才", "把这个报告", "将上述", "将上述内容", "结合上述", "把这些"
    ])
    if explicit_continuation:
        return True

    gen_actions = [
        "生成", "做个", "做成", "制作", "创建", "导出", "整理", "排版",
        "总结", "转成", "转换", "输出", "写个", "出个"
    ]
    format_targets = [
        "ppt", "演示文稿", "幻灯片", "deck", "slides", "报告", "html", "网页",
        "word", "docx", "excel", "xlsx", "pdf", "图表", "卡片", "单页", "思维导图", "页面"
    ]

    has_gen = any(g in p for g in gen_actions)
    has_target = any(t in p for t in format_targets)

    if has_gen and has_target:
        cleaned = p
        strip_words = [
            "请", "帮我", "给我", "麻烦", "生成", "一张", "一份", "一个", "做个", "做成",
            "制作", "创建", "导出为", "导出", "整理成", "整理", "排版成", "排版", "总结一下",
            "总结", "转成", "转换成", "输出为", "输出", "写个", "出个", "ppt", "演示文稿",
            "幻灯片", "deck", "slides", "报告", "html", "网页", "word", "docx",
            "excel", "xlsx", "pdf", "页面", "好看的", "精美的", "漂亮的"
        ]
        for w in strip_words:
            cleaned = cleaned.replace(w, "")
        cleaned = cleaned.strip()
        if len(cleaned) <= 4:
            return True

    return False


def extract_recent_history_topic(existing_history: Optional[List[dict]]) -> tuple[Optional[str], Optional[str]]:
    """
    Extracts the most recent user query and assistant response snippet from history
    to anchor follow-up prompts without an explicit topic.
    Returns: (last_user_query, last_assistant_snippet)
    """
    if not existing_history:
        return None, None

    last_user_query = None
    last_assistant_snippet = None

    for h in reversed(existing_history):
        if not isinstance(h, dict):
            continue
        role = h.get("role")
        content = str(h.get("content") or "").strip()
        if not content:
            continue
        if role == "assistant" and not last_assistant_snippet:
            clean_c = re.sub(r'```html[\s\S]*?```', '[HTML演示文稿/页面代码]', content)
            clean_c = re.sub(r'<[^>]+>', '', clean_c).strip()
            first_line = clean_c.split("\n")[0].strip()
            last_assistant_snippet = first_line[:120] if len(first_line) > 10 else clean_c[:160]
        elif role == "user" and not last_user_query:
            clean_u = content
            if "用户指令：" in clean_u:
                clean_u = clean_u.split("用户指令：")[-1].strip()
            if "[User Request]:" in clean_u:
                clean_u = clean_u.split("[User Request]:")[-1].split("\n\n")[0].strip()
            last_user_query = clean_u[:100]

        if last_user_query and last_assistant_snippet:
            break

    return last_user_query, last_assistant_snippet


def build_user_turn(
    prompt: str,
    session_files: Optional[List[str]] = None,
    file_context: str = "",
    knowledge_context: str = "",
    skill_context: str = "",
    search_context: str = "",
    is_send_intent: bool = False,
    is_search_intent: bool = False,
    is_ppt_intent: bool = False,
    is_design_intent: bool = False,
    is_docx_intent: bool = False,
    is_office_intent: bool = False,
    is_research_intent: bool = False,
    is_inspect_intent: bool = False,
    existing_history: Optional[List[dict]] = None,
    max_skill_chars: int = 1500,
    timestamp_str: Optional[str] = None
) -> str:
    """
    Assembles user prompt and scoped environmental contexts into a coherent user message.
    Dynamic timestamp is placed at the end to maximize KV Cache prefix matching.
    """
    user_parts = [f"[User Request]:\n{prompt}"]

    if is_inspect_intent:
        user_parts.append(
            "【行动执行指引 (Action Directive)】:\n"
            "- 检测到用户发出了明确的【查看 / 检查 / 检索 / 排查 / 查一下】动作指令。\n"
            "- 严禁停留在空泛对话或口头向用户索要链接/更多上下文；\n"
            "- 必须主动调用对应工具展开行动：若涉及技术资料/开源方案/安装部署，立刻调用 `web_search` 或执行检索；若涉及沙箱环境/命令/系统状态，立刻调用 `bash` 或相关工具进行真实探测与验证！"
        )

    if session_files:
        user_parts.append(
            f"[Session Attachments]: 当前会话有效附件为: {', '.join(session_files)}。"
            "除此列表以外的工作区文件为沙箱历史遗留或系统环境文件，绝不是本次会话的附件。"
        )
    elif any(k in prompt.lower() for k in ["附件", "上传", "文件清单", "刚传的", "上传的文件", "附件是什么"]):
        user_parts.append(
            "[Session Attachments]: 当前会话用户未上传任何附件。"
            "若用户询问“附件是什么”或查询当前上传的文件，请直接明确告知当前会话未上传附件，切勿调用 bash 或工具扫描工作区历史遗留文件。"
        )

    if file_context.strip():
        user_parts.append(file_context.strip())

    if knowledge_context.strip():
        user_parts.append(f"[Mounted Personal Knowledge Base]:\n{knowledge_context.strip()}")

    if skill_context.strip():
        clipped_skill = ContextBudget.clip_skill(skill_context, max_chars=max_skill_chars)
        user_parts.append(
            f"[Loaded Design Skill & Style Guide]:\n{clipped_skill}\n\n"
            "【注意与主题隔离要求】：当前设计规范已为你成功加载就绪。请注意：规范中出现的示例（如 AI 发布会、开源设计平台、商业路演等）仅作为视觉风格、栅格布局与排版美学参考，绝不是本次生成任务的内容主题！本次生成的实际内容必须严格遵循用户的具体指令或当前会话历史上下文。"
        )

    # 检查是否为多轮会话的承接/交付物转化请求（如上一轮查了天气/分析了数据，本轮简短要求“生成一张ppt报告”）
    if existing_history and is_context_dependent_action(prompt):
        last_u, last_a = extract_recent_history_topic(existing_history)
        if last_u or last_a:
            context_summary = []
            if last_u:
                context_summary.append(f"前序用户问题：【{last_u}】")
            if last_a:
                context_summary.append(f"前序内容概要：【{last_a}】")

            user_parts.append(
                "【多轮会话上下文继承硬性要求 (Context Continuity Directive)】:\n"
                f"- 检测到用户当前指令（'{prompt}'）缺少独立主题实体，属于多轮会话的承接/转换动作。\n"
                f"- 本次交付物的唯一合法核心主题必须严格继承自上方前序对话（{ '，'.join(context_summary) }）。\n"
                "- 【硬性要求】：你必须完全以历史会话中刚刚讨论并给出的实质内容与真实数据为核心主题（将上一轮对话中的具体事实、数据、表格或结论结构化转换为演示文稿/文档内容），严禁脱离历史对话凭空捏造无关的科技/商业/AI主题！\n"
                "- 【版式转换指引】：若前序内容包含表格或列表数据（如每日天气预报、数值指标），请使用演示文稿中的数据卡片（Stat Cards）、多列栅格（Grid）或时间线流程（Pipeline/Timeline）进行美化呈现，绝不能因为版式美化而丢弃或篡改用户的真实数据主题！"
            )

    # 检查是否为上一轮 HTML / 游戏产物的后续迭代修改（如“没有音效”、“加个悔棋”等）
    has_recent_html_in_history = False
    if existing_history:
        for h in reversed(existing_history[-4:]):
            if isinstance(h, dict) and h.get("role") == "assistant":
                c = str(h.get("content", "")).lower()
                if "```html" in c or "交互式页面" in c or "index.html" in c or "gomoku" in c or "canvas" in c:
                    has_recent_html_in_history = True
                    break

    is_iteration = has_recent_html_in_history and any(
        k in prompt.lower() for k in ["音效", "声音", "音乐", "修改", "改一下", "调整", "重新", "优化", "加个", "没有", "样式", "速度", "颜色", "按钮", "重开", "悔棋", "对战", "规则", "再加", "继续", "完善", "bug", "报错"]
    )

    if is_ppt_intent:
        user_parts.append(
            "【HTML 演示文稿 / 报告生成要求】:\n"
            "- 请直接基于当前会话讨论的实质内容与数据（或附件主题），设计并输出精炼、高保真的现代化单文件 HTML 演示文稿 / 报告（4-6 页核心幻灯片，基于极简杂志/电子墨水风格，内嵌完整 CSS 与左右翻页交互）。\n"
            "- 若当前会话讨论的是天气、指标、业务总结等具体场景，请将该场景的真实数据结构化分配至各幻灯片页（如：封面页、总览/趋势页、逐项明细/关键卡片页、总结与出行/行动建议页），严禁脱离该主题！\n"
            "- 请直接在回复中输出唯一的完整 ```html ... ``` 代码块，系统将自动落盘并导出为 presentation.html，且前端支持在线全屏预览与下载。切勿在回复中指导用户手动复制代码或在本地新建文件。"
        )
    elif is_iteration:
        user_parts.append(
            "【交互式网页 / 游戏迭代修改要求】:\n"
            "- 检测到用户正在对上一轮生成的网页/游戏成果提出功能完善或缺陷改进要求（如补齐音效、完善规则、优化交互等）。\n"
            "- 请直接基于已有设计进行升级开发：对于音效，优先采用纯前端 Web Audio API 动态合成声音（如吃食物提示音、GameOver 提示音，无需外部音频文件）；\n"
            "- 必须在最终回复中直接输出包含修改后完整代码的唯一 ```html ... ``` 代码块，系统前端将自动挂载实时预览与下载卡片。"
        )
    elif is_design_intent or any(k in prompt.lower() for k in ["五子棋", "游戏", "小游戏", "html游戏", "canvas", "前端应用", "交互页面", "web应用", "网页游戏"]):
        user_parts.append(
            "【交互式网页 / 游戏开发要求】:\n"
            "- 请直接设计并输出高保真、纯前端自包含的单文件交互应用/游戏（内嵌完整 CSS 与 JS 逻辑，支持鼠标悬停、点击与移动端触控）。\n"
            "- 请务必在最终回复中输出包含完整代码的 ```html ... ``` 代码块，系统前端将自动挂载实时交互式预览组件、全屏操作与下载卡片。切勿只在终端写文件而不在最终回复中输出 html 代码块。"
        )

    effective_is_docx = is_docx_intent or any(
        k in prompt.lower() for k in ["批注", "添加批注", "加批注", "审阅", "审查", "合同审阅", "合同审查", "修订留痕", "word批注"]
    )
    if effective_is_docx:
        user_parts.append(
            "【Word/合同审阅与批注硬性执行要求】:\n"
            "- 沙箱预置了高精度 Word 批注与修订脚本 `/opt/dsh/skills/docx/scripts/add_comment.py`（基于原生 OpenXML 注入，支持自动拆分 text run 与精准锚定）。\n"
            "- 当用户要求审阅/审查文档、提出修改建议或添加批注时，【你必须调用 bash 工具在 Linux 终端执行相应的脚本命令（如 `python /opt/dsh/skills/docx/scripts/add_comment.py <输入文件> --target \"定位词\" --comment \"批注内容\" -o <输出文件>`）实际完成文件批注并落盘保存新文件（例如 `/workspace/xxx_批注版.docx`）】！\n"
            "- 若需保存至个人空间或知识库，请在生成后执行命令复制到 `/knowledge/`（如 `cp <新文件> /knowledge/`）。\n"
            "- 【严禁只在最终文字回复中口头声称已修改/已保存，但实际未调用任何工具执行落盘！】系统与用户需要看到真实生成落盘的文件。"
        )

    if is_send_intent:
        user_parts.append("[Delivery Intent]: 检测到用户要求通过即时通讯通道接收文件。请使用 `send_file` 工具将对应文件推送给用户。")

    if is_research_intent:
        user_parts.append(
            "【多源深度调研与事实溯源硬性规范 (Research Grounding)】:\n"
            "- 检测到深度调研、竞品对比、技术选型或最新动态探索意图。\n"
            "- 实体提炼准则：调用搜索或执行工具前，【务必剥除代词（如'关于他'、'关于它'）、口语祈使词与尾部时间词】，提炼出干净的实体关键词（如将 '调研关于他qwen 3.8 27b 最近30天的' 提炼为 'qwen 3.8 27b'），坚决避免口语虚词导致搜索引擎召回严重漂移。\n"
            "- 优先调用 `web_search(query='...', freshness='month')`（按近30天时间窗检索）或在终端执行 `python3 /opt/dsh/skills/research/scripts/deep_research.py \"<干净实体关键词>\" --days 30 --html /workspace/调研简报.html` 获取 Web、GitHub 与技术社区真实评价与动态。\n"
            "- 严格基于近 30 天最新信息，坚决剔除陈旧过时方案。每个关键结论必须附带事实依据与 Markdown 超链接引述；摘录 1-2 条社区代表性用户的高赞原声金句（Quotes），杜绝空洞的主观泛谈。"
        )

    if search_context.strip():
        user_parts.append(f"[Live Retrieved Information]:\n{search_context.strip()}")
    elif is_search_intent:
        user_parts.append("[Search Status]: 初步检索未获得足够数据。请主动调用工具（如 weather, web_search, 或 bash 执行终端命令）自主获取最新数据解答用户。")

    ts = timestamp_str or get_current_timestamp_str()
    user_parts.append(f"---\n[Current System Timestamp]: {ts}")

    return "\n\n".join(user_parts)
