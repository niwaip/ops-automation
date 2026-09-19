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


def build_system_prompt(
    workspace_dir: str,
    knowledge_dir: str,
    model_name: Optional[str] = None,
    model_display_name: Optional[str] = None
) -> str:
    """
    Builds clean, tool-agnostic system prompt.
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
        "1. For simple questions and normal dialogue, answer directly and concisely in Markdown without invoking any tools.\n"
        "2. When asked for real-time facts, current weather, web search, file analysis, or code execution, autonomously invoke the appropriate native tools.\n"
        "3. Save deliverables and persistent documents to the knowledge space (/knowledge) when requested.\n"
        "4. Output clean, beautifully structured, accurate Chinese Markdown. Never leave raw XML tags or unparsed function artifacts in the final answer."
    )


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
    max_skill_chars: int = 1500,
    timestamp_str: Optional[str] = None
) -> str:
    """
    Assembles user prompt and scoped environmental contexts into a coherent user message.
    Dynamic timestamp is placed at the end to maximize KV Cache prefix matching.
    """
    user_parts = [f"[User Request]:\n{prompt}"]

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

    if file_context.strip():
        user_parts.append(file_context.strip())

    if knowledge_context.strip():
        user_parts.append(f"[Mounted Personal Knowledge Base]:\n{knowledge_context.strip()}")

    if skill_context.strip():
        clipped_skill = ContextBudget.clip_skill(skill_context, max_chars=max_skill_chars)
        user_parts.append(
            f"[Loaded Design Skill & Style Guide]:\n{clipped_skill}\n\n"
            "【注意】：当前设计规范已为你成功加载就绪，你无需再重复调用 read_skill 工具。请直接根据以上规范生成高质量设计与代码。"
        )

    if is_ppt_intent:
        user_parts.append(
            "【HTML 演示文稿生成要求】:\n"
            "- 请直接基于当前会话与附件主题，设计并输出精炼、高保真的现代化单文件 HTML 演示文稿（4-6 页核心幻灯片，基于极简杂志/电子墨水风格，内嵌完整 CSS 与左右翻页交互）。\n"
            "- 请直接在回复中输出唯一的完整 ```html ... ``` 代码块，系统将自动落盘并导出为 presentation.html，无需调用 bash 安装外部库。"
        )

    if is_send_intent:
        user_parts.append("[Delivery Intent]: 检测到用户要求通过即时通讯通道接收文件。请使用 `send_file` 工具将对应文件推送给用户。")

    if search_context.strip():
        user_parts.append(f"[Live Retrieved Information]:\n{search_context.strip()}")
    elif is_search_intent:
        user_parts.append("[Search Status]: 初步检索未获得足够数据。请主动调用工具（如 weather, web_search, 或 bash 执行终端命令）自主获取最新数据解答用户。")

    ts = timestamp_str or get_current_timestamp_str()
    user_parts.append(f"---\n[Current System Timestamp]: {ts}")

    return "\n\n".join(user_parts)
