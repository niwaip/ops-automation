"""
ReAct multi-turn agent execution loop for DeepSeek Harness (dsh).
Coordinates structured OpenAI tool calls, parallel tool dispatch, Nudge nudging,
and legacy format fallbacks.
"""

import re
import json
import time
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .telemetry import TelemetryStats, extract_dsh_markers, strip_dsh_markers
from .tools import execute_tool, SANDBOX_TOOLS, get_sandbox_tools
from .llm import (
    call_model_proxy,
    parse_tool_calls,
    clean_output,
    is_promising_action,
    detect_unexecuted_script_leak
)
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR


CLAIM_PATTERNS = [
    "已生成", "已经生成", "生成了", "输出了", "输出文件", "保存到", "已保存", "已经保存",
    "保存至", "输出为", "保存在", "写入了", "创建了", "落盘至", "生成完毕", "导出为",
    "导出了", "已导出", "保存路径", "文件已生成", "文档已生成",
    "写入文件", "写入到", "写入至", "写入", "代码写入", "已更新", "更新了", "修复并保存", "修改并保存", "write_file"
]

DELIVERABLE_EXTS = {
    ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf",
    ".html", ".csv", ".json", ".py", ".sh", ".txt", ".png", ".jpg"
}


def is_unclosed_or_truncated_html(text: str) -> bool:
    """
    Detects whether text contains an unclosed or truncated ```html code block,
    e.g. missing closing ``` fence, or opened as full HTML document but abruptly cut off without </html>.
    """
    if not text or "```html" not in text:
        return False
    last_idx = text.rfind("```html")
    after_block = text[last_idx + 7:]
    # If there is no closing ``` fence
    if "```" not in after_block:
        return True
    # If there is a closing ``` fence, check if it was opened as a full HTML document (<!DOCTYPE html or <html)
    # but abruptly cut off before </html> or </body>
    lower_block = after_block.lower()
    if "<!doctype html" in lower_block or "<html" in lower_block:
        if "</html>" not in lower_block and "</body>" not in lower_block:
            return True
    return False


def detect_missing_claimed_artifacts(
    text: str,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False
) -> List[str]:
    """
    Detects if the model claimed in text to have generated or outputted deliverable files
    that do not physically exist on disk in WORKSPACE_DIR or KNOWLEDGE_DIR.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent).
    """
    if not text or (is_inspect_intent and not is_generate_intent):
        return []

    if not any(k in text for k in CLAIM_PATTERNS):
        return []

    # 提取被引号/书名号包裹的文件名（可包含空格）
    quoted_pattern = r'(?:《|【|“|"|\'|`)([^《》【】“”"\'`\n\r]+?\.(?:docx?|xlsx?|pptx?|pdf|html|csv|json|py|sh|txt|png|jpg))(?:》|】|”|"|\'|`)'
    # 提取未带引号的文件名（以路径或空白/标点分隔，不含空格）
    unquoted_pattern = r'(?:(?:/workspace/|/knowledge/)|(?:^|[\s，。！？；：\(\)\[\]（）]))([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:docx?|xlsx?|pptx?|pdf|html|csv|json|py|sh|txt|png|jpg))'

    found_names = re.findall(quoted_pattern, text) + re.findall(unquoted_pattern, text)
    if not found_names:
        return []

    missing: List[str] = []
    has_inline_html = ("```html" in text.lower()) and not is_unclosed_or_truncated_html(text)

    for name in found_names:
        clean_name = name.strip()
        if not clean_name:
            continue
        clean_name = re.sub(r'^(?:/workspace/|workspace/|/knowledge/|knowledge/)', '', clean_name)
        for pfx in sorted(CLAIM_PATTERNS, key=len, reverse=True):
            if clean_name.startswith(pfx):
                clean_name = clean_name[len(pfx):].strip()
        clean_name = re.sub(r'^[：:到至为在\s]+', '', clean_name).strip()
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


def detect_missing_requested_deliverable(
    user_prompt: str,
    turn_start_time: float,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False
) -> Optional[str]:
    """
    Detects if the expected deliverable (from skill contract or prompt) was not created in WORKSPACE_DIR.
    Prioritizes explicit contract deliverables from the active skill.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent).
    """
    if is_inspect_intent and not is_generate_intent:
        return None

    ws_path = Path(WORKSPACE_DIR)

    # 1. 契约驱动优先：若技能已明确声明产物交付契约 (如 ['.pdf'], ['.docx'], ['.xlsx'], ['.html'])
    if expected_deliverables:
        for req_ext in expected_deliverables:
            norm_ext = req_ext if req_ext.startswith(".") else f".{req_ext}"
            found = False
            if ws_path.exists():
                try:
                    for p in ws_path.iterdir():
                        if p.is_file() and p.suffix.lower() == norm_ext.lower() and p.stat().st_size > 0:
                            if p.stat().st_mtime >= turn_start_time - 2.0:
                                found = True
                                break
                except Exception:
                    pass
            if not found:
                return norm_ext
        return None

    # 2. 兜底回退：无契约声明时，根据提示词探测期望产物后缀（必须有明确的生成/导出谓词，不能仅因出现名词就判定为生成）
    if not user_prompt:
        return None
    lower = user_prompt.lower()

    req_ext = None
    if any(k in lower for k in ["生成pdf", "导出pdf", "转为pdf", "转成pdf", "生成一页的pdf", "生成一份pdf", "制作pdf", "导出为pdf", "做个pdf"]):
        req_ext = ".pdf"
    elif any(k in lower for k in ["生成excel", "导出excel", "做成excel", "制作excel", "做个excel", "导出xlsx", "生成xlsx", "做个表", "生成表格"]):
        req_ext = ".xlsx"
    elif any(k in lower for k in ["生成word", "导出word", "做成word", "制作word", "做个word", "导出docx", "生成docx"]):
        req_ext = ".docx"
    elif (
        any(k in lower for k in ["生成html", "导出html", "做成html", "制作html", "html报告", "生成网页", "做个网页", "生成单页", "网页游戏", "html游戏", "五子棋", "贪吃蛇", "原型", "看板", "大屏"]) or
        (any(v in lower for v in ["生成", "做个", "做成", "制作", "创建", "输出", "开发"]) and any(n in lower for n in ["网页", "单页", "html", "游戏", "页面"]))
    ):
        req_ext = ".html"

    if not req_ext:
        return None

    # 检查工作区是否存在该类型的新文件 (mtime >= turn_start_time - 2.0)
    if not ws_path.exists():
        return req_ext

    try:
        for p in ws_path.iterdir():
            if p.is_file() and p.suffix.lower() == req_ext and p.stat().st_size > 0:
                if p.stat().st_mtime >= turn_start_time - 2.0:
                    return None
    except Exception:
        pass

    return req_ext


def is_explicit_code_request(prompt: str) -> bool:
    """
    Detects whether user prompt explicitly asked to view, display, or explain code/scripts in chat.
    If the user's intent is to create, run, fix, modify, or save files/deliverables,
    it returns False even if the word '代码' or '脚本' is mentioned.
    """
    if not prompt:
        return False
    lower = prompt.lower().strip()

    # 显式查看/展示代码意图词（支持中间夹带修饰词，如“给我看下生成pdf的python代码”）
    view_code_regex = r'(?:查看|看下|看一下|看看|给我看|显示|展示|输出|给出|提供|写出)\s*(?:一下|下)?\s*(?:[a-zA-Z0-9_\-\u4e00-\u9fa5\s]{0,20}?)(?:代码|源码|源代码|脚本|code)'
    has_view_code = bool(re.search(view_code_regex, lower, re.I))

    static_view_patterns = [
        "查看代码", "看下代码", "看一下代码", "显示代码", "展示代码", "输出代码",
        "给出代码", "提供代码", "写出代码", "给我代码", "给下代码", "给我看代码",
        "查看源码", "看下源码", "看一下源码", "给出源码", "提供源码", "输出源码",
        "代码怎么写", "脚本怎么写", "示例代码", "代码示例", "代码结构", "代码长什么样",
        "show code", "give code", "view code", "display code", "source code",
        "code snippet", "show me code", "print code"
    ]
    if not has_view_code and not any(p in lower for p in static_view_patterns):
        return False

    # 若包含动作性动词或故障排查（如修改、修复、运行、写入、报错、出错了、停了），则属于操作任务而非单纯展示代码
    action_override_patterns = [
        "修改代码", "改一下代码", "把代码改了", "改下代码", "修复代码", "修一下代码",
        "更新代码", "优化代码", "重构代码", "运行代码", "执行代码", "保存代码",
        "代码写入", "写入代码", "代码报错", "代码出错了", "代码运行失败", "代码停了"
    ]
    if any(a in lower for a in action_override_patterns):
        if not any(k in lower for k in ["看一下代码", "看下代码", "查看代码", "给我看"]):
            return False

    return True




def auto_heal_unexecuted_file_writes(text: str, workspace_dir: str) -> Tuple[str, List[str]]:
    """
    Self-heals unexecuted file-writing commands (e.g. write_file, cat > << 'EOF')
    by extracting content and writing directly to the target file in workspace_dir,
    and stripping the leaked shell command blocks from the user-facing output.
    Returns: (cleaned_text, list_of_written_file_paths)
    """
    if not text:
        return text, []

    written_files: List[str] = []
    cleaned_text = text

    heredoc_patterns = [
        # write_file << 'EOF' /workspace/index.html ... EOF
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s+[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n([\s\S]*?)(?:\n\1|\Z)',
        # cat > /workspace/index.html << 'EOF' ... EOF
        r'(?:write_file|cat)\s+>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*\n([\s\S]*?)(?:\n\2|\Z)',
        # cat << 'EOF' > /workspace/index.html ... EOF
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n([\s\S]*?)(?:\n\1|\Z)'
    ]

    # 1. 优先扫描并自愈代码块中的写入命令
    block_pattern = r'(```[a-zA-Z0-9_\-]*\s*\n([\s\S]*?)```)'
    for full_block, block_content in list(re.findall(block_pattern, cleaned_text)):
        for hp in heredoc_patterns:
            hm = re.search(hp, block_content)
            if hm:
                groups = hm.groups()
                if len(groups) == 3:
                    if groups[0].startswith('/workspace/') or '.' in groups[0]:
                        target_path, eof_marker, content = groups[0], groups[1], groups[2]
                    elif groups[1].startswith('/workspace/') or '.' in groups[1]:
                        eof_marker, target_path, content = groups[0], groups[1], groups[2]
                    else:
                        target_path, eof_marker, content = groups[1], groups[0], groups[2]

                    clean_filename = Path(target_path).name
                    dest_file = Path(workspace_dir) / clean_filename
                    try:
                        with open(dest_file, "w", encoding="utf-8") as f:
                            f.write(content.strip())
                        written_files.append(str(dest_file))
                        print(f"✨ [Harness Auto-Heal] 成功自愈落盘泄漏命令产物: {dest_file}")
                        replacement = f"✨ 已成功生成并保存文件：`/workspace/{clean_filename}`"
                        cleaned_text = cleaned_text.replace(full_block, replacement)
                    except Exception as e:
                        print(f"⚠️ [Harness Auto-Heal] 写入自愈产物异常: {e}")
                    break

    # 2. 检查未被代码块包裹的裸写入命令
    for hp in heredoc_patterns:
        for hm in list(re.finditer(hp, cleaned_text)):
            groups = hm.groups()
            if len(groups) == 3:
                if groups[0].startswith('/workspace/') or '.' in groups[0]:
                    target_path, eof_marker, content = groups[0], groups[1], groups[2]
                elif groups[1].startswith('/workspace/') or '.' in groups[1]:
                    eof_marker, target_path, content = groups[0], groups[1], groups[2]
                else:
                    target_path, eof_marker, content = groups[1], groups[0], groups[2]

                clean_filename = Path(target_path).name
                dest_file = Path(workspace_dir) / clean_filename
                if str(dest_file) not in written_files:
                    try:
                        with open(dest_file, "w", encoding="utf-8") as f:
                            f.write(content.strip())
                        written_files.append(str(dest_file))
                        print(f"✨ [Harness Auto-Heal] 成功自愈落盘裸命令产物: {dest_file}")
                        replacement = f"✨ 已成功生成并保存文件：`/workspace/{clean_filename}`"
                        cleaned_text = cleaned_text.replace(hm.group(0), replacement)
                    except Exception as e:
                        print(f"⚠️ [Harness Auto-Heal] 写入自愈产物异常: {e}")

    return cleaned_text, written_files


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
    outbound_reminders: List[str] = field(default_factory=list)
    telemetry: TelemetryStats = field(default_factory=TelemetryStats)
    messages: List[Dict[str, Any]] = field(default_factory=list)


# 常见模型过渡性前导垫话特征词
ACTION_FILLER_KEYWORDS = [
    "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
    "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合",
    "我需要获取", "让我尝试", "再次获取", "我需要查询", "还需要获取"
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


def _extract_last_user_prompt(messages: List[Dict[str, Any]]) -> str:
    """Extracts the innermost user request prompt from message history."""
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                m_req = re.search(r'\[User Request\]:\s*\n([\s\S]*?)(?:\n\n\[|$)', content)
                return m_req.group(1).strip() if m_req else content
            return ""
    return ""


def _check_no_tool_assertion_guard(
    reply_text: str,
    last_user_prompt: str,
    round_idx: int,
    max_rounds: int,
    start_ts: float,
    is_guide_intent: bool,
    expected_deliverables: Optional[List[str]],
    is_generate_intent: bool,
    is_inspect_intent: bool
) -> Tuple[str, Optional[str], int]:
    """
    Evaluates assertion guards when model returns text without tool calls.
    Returns: (action, guard_user_message, new_max_rounds)
      action: "continue" (add message and continue loop), "break" (stop loop), or "pass" (allow completion)
    """
    # 1. 产物声称物理断言
    if is_generate_intent or (not is_inspect_intent and not is_guide_intent):
        missing = detect_missing_claimed_artifacts(
            reply_text,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent
        )
        if missing and (round_idx < max_rounds - 1 or max_rounds < 6):
            if round_idx >= max_rounds - 1:
                max_rounds = min(6, max_rounds + 2)
            print(f"⚡ [Harness Artifact Assertion Guard] 检测到模型声称生成了文件 {missing}，但物理文件并不存在，正在强制拦截并引导执行工具落盘...", flush=True)
            msg = f"【系统产物物理断言拦截】：你在回复中声称已生成或输出了文件 {', '.join(missing)}，但沙箱物理文件系统检查发现该文件并不存在！请立刻调用 bash 或相应工具实际执行代码或脚本生成该文件并落盘保存到工作区 (/workspace/)，严禁只在文本回复中口头声称！"
            return "continue", msg, max_rounds

    # 2. HTML 代码截断拦截
    if is_unclosed_or_truncated_html(reply_text):
        print("⚠️ [Harness HTML Truncation Guard] 检测到输出的 HTML 代码达到上限被截断，立即停止并由导出器安全闭合与明确告警...", flush=True)
        return "break", None, max_rounds

    # 3. 物理交付物闭环校验
    if is_generate_intent or (not is_inspect_intent and not is_guide_intent):
        missing_deliverable = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent
        )
        if not is_guide_intent and missing_deliverable and (round_idx < max_rounds - 1 or max_rounds < 6):
            if round_idx >= max_rounds - 1:
                max_rounds = min(6, max_rounds + 2)
            print(f"⚡ [Harness Deliverable Assertion Guard] 检测到用户要求生成 {missing_deliverable} 交付物但沙箱尚未生成，正在强制拦截并引导执行工具落盘...", flush=True)
            msg = (
                f"【系统交付物断言拦截】：用户明确要求生成并输出 {missing_deliverable} 文件，当前回复仅提供了文本说明，"
                f"沙箱工作区 (/workspace/) 中尚未生成任何 {missing_deliverable} 物理文件！"
                f"请立即调用 bash 工具执行 Python 脚本（使用对应预装库如 fpdf2/python-docx/openpyxl），"
                f"将上述内容生成并落盘保存到 /workspace/ 路径下，然后再向用户汇报完成！"
            )
            return "continue", msg, max_rounds

    # 4. 行动垫话拦截
    if not is_guide_intent and is_promising_action(reply_text) and (round_idx < max_rounds - 1 or max_rounds < 6):
        if round_idx >= max_rounds - 1:
            max_rounds = min(6, max_rounds + 2)
        print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...", flush=True)
        msg = "你刚才提出了具体的行动方案，请立刻使用对应的工具函数（如 bash 或 web_search）实际执行该操作，不要仅输出口头承诺！"
        return "continue", msg, max_rounds

    # 5. 消极推诿拦截
    if not is_guide_intent and detect_passive_deflection(reply_text) and (round_idx < max_rounds - 1 or max_rounds < 6):
        if round_idx >= max_rounds - 1:
            max_rounds = min(6, max_rounds + 2)
        print("⚡ [Harness Anti-Deflection Guard] 检测到模型在技术查阅任务中消极推诿向用户索要链接/上下文，正在强制拦截并引导调用工具执行...", flush=True)
        msg = "【系统行动指令拦截】：沙箱配备了完整的联网检索（web_search）与系统终端（bash）工具。严禁向用户索取链接或推诿要求更多上下文！请立即调用 web_search 搜索该技术项目、关键词或官方资料，或调用 bash 探测沙箱环境！"
        return "continue", msg, max_rounds

    # 6. 未执行脚本泄漏拦截
    if not is_guide_intent and not is_explicit_code_request(last_user_prompt) and detect_unexecuted_script_leak(reply_text) and (round_idx < max_rounds - 1 or max_rounds < 6):
        if round_idx >= max_rounds - 1:
            max_rounds = min(6, max_rounds + 2)
        print("⚡ [Harness Code Output Guard] 检测到模型直接输出了未执行的代码脚本或文件写入命令，正在强制拦截并引导执行工具落盘...", flush=True)
        msg = (
            "【系统执行指令拦截】：检测到你直接向用户输出了未执行的代码脚本、长篇源码或伪工具写入命令（如 write_file/cat/代码块）！"
            "在当前沙箱环境中，除非用户明确要求查看代码，严禁直接向页面返回代码！"
            "你必须立即调用 bash 工具在 Linux 终端实际执行命令或运行脚本，将目标文件生成/修改并落盘保存到工作区（例如 /workspace/ 相应路径），"
            "然后再向用户汇报完成！"
        )
        return "continue", msg, max_rounds

    return "pass", None, max_rounds


def _dispatch_tool_calls(
    structured_calls: List[Dict[str, Any]],
    round_idx: int,
    messages: List[Dict[str, Any]],
    telemetry: TelemetryStats,
    policy: RuntimePolicy,
    executed_calls_history: List[str],
    outbound_files: List[str],
    deadline: Optional[float],
    is_guide_intent: bool,
    outbound_reminders: Optional[List[str]] = None
) -> bool:
    """
    Executes a round of structured tool calls with safety checks and appends tool responses to messages.
    Returns True if a send_file tool was executed, False otherwise.
    """
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

        raw_preview = (
            t_params.get("__search_query") or
            t_params.get("query") or
            t_params.get("cmd") or
            t_params.get("city") or
            str(t_params)
        )
        clean_param = sanitize_preview(raw_preview, max_chars=policy.param_preview_chars)
        print(f"⚡ [Harness Tool Call] 正在调用工具: {t_name}({clean_param})...", flush=True)

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

        for m, _, _ in extract_dsh_markers(tool_res, "OUTBOUND_FILE"):
            outbound_files.append(m.strip())

        if outbound_reminders is not None:
            for m, _, _ in extract_dsh_markers(tool_res, "REMINDER_CREATE"):
                outbound_reminders.append(m.strip())

        if t_name.lower() in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat"]:
            is_file_sent = True

        clipped_tool_res = ContextBudget.clip_tool_result(tool_res, max_chars=policy.max_tool_result_chars)
        clean_tool_res = strip_dsh_markers(clipped_tool_res, ["REMINDER_CREATE"]).strip()
        messages.append({
            "role": "tool",
            "tool_call_id": t_id,
            "name": t_name,
            "content": clean_tool_res
        })

    return is_file_sent


def _build_fallback_report(messages: List[Dict[str, Any]], executed_calls_history: List[str]) -> str:
    """Builds a diagnostic recovery report when model returns empty response or unexecuted filler."""
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
                            if len(data_clues) >= 6:
                                break
                if data_clues:
                    break
        clues_block = ("\n\n【沙箱已检索到的参考数据】:\n" + "\n".join(f"- {c}" for c in data_clues)) if data_clues else ""
        return (
            f"⚠️ 沙箱已成功调用工具（{tool_names}）采集到相关数据，但在进行智能归纳或生成交付物时，"
            f"上游推理模型连接中断或未返回最终交付文本。{clues_block}\n\n"
            "💡 建议：可尝试重新提问，或在设置中切换为更稳定的模型重试。"
        )
    return "⚠️ 沙箱运行正常，但上游模型未返回有效回复内容（可能网络连接超时或上游服务异常）。建议重新发送或切换模型重试。"


def _finalize_agent_text(
    reply_text: str,
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    deadline: Optional[float],
    is_guide_intent: bool,
    executed_calls_history: List[str],
    was_token_truncated: bool,
    telemetry: TelemetryStats,
    last_user_prompt: str = ""
) -> Tuple[str, List[str]]:
    """Finalizes agent text, requesting forced summary if needed and applying fallback reports."""
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
            forced_clean = clean_output(forced_reply, is_guide=is_guide_intent) or forced_reply.strip()
            is_still_filler = (
                len(forced_clean) < 120 and
                (any(kw in forced_clean for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(forced_reply))
            )
            if forced_clean and not is_still_filler:
                final_text = forced_clean
            elif is_transitional_filler:
                final_text = ""
        except TimeoutError:
            raise
        except Exception:
            if is_transitional_filler:
                final_text = ""

    is_terminal_filler = (
        len(final_text) < 120 and
        (any(kw in final_text for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(final_text))
    )
    if not final_text or is_terminal_filler:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")
        final_text = _build_fallback_report(messages, executed_calls_history)

    if was_token_truncated and "```html" not in final_text and not is_unclosed_or_truncated_html(final_text):
        truncation_suffix = (
            "\n\n---\n"
            "⚠️ **输出截断提醒（已达到模型单次 Token 上限）**\n"
            "- **状态说明**：上游模型输出达到最大长度限制提前结束。\n"
            "- **💡 通用建议**：如需获取后续完整内容，请直接回复「**继续**」，模型将从中断处接力输出。若需长篇内容，也可在提问中指定分段或分章节输出。"
        )
        if "输出截断提醒" not in final_text:
            final_text += truncation_suffix

    healed_files: List[str] = []
    if not is_guide_intent and not is_explicit_code_request(last_user_prompt):
        final_text, healed_files = auto_heal_unexecuted_file_writes(final_text, WORKSPACE_DIR)
        if healed_files:
            sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
            sys.stdout.write(f"<<<DSH_DELTA:{json.dumps(final_text, ensure_ascii=False)}>>>\n")
            sys.stdout.flush()

    return final_text, healed_files


def run_agent_loop(
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    max_rounds: int,
    tools: Optional[List[Dict[str, Any]]] = None,
    deadline: Optional[float] = None,
    is_guide_intent: bool = False,
    turn_start_time: Optional[float] = None,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False
) -> AgentLoopResult:
    """Executes the multi-turn ReAct tool calling loop up to max_rounds."""
    active_tools = tools if tools is not None else get_sandbox_tools()
    telemetry = TelemetryStats()
    outbound_files: List[str] = []
    outbound_reminders: List[str] = []
    executed_calls_history: List[str] = []
    reply_text = ""
    was_token_truncated = False
    start_ts = turn_start_time if turn_start_time is not None else time.time()
    last_user_prompt = _extract_last_user_prompt(messages)

    round_idx = 0
    while round_idx < max_rounds:
        if round_idx > 0:
            print(f"⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 {round_idx + 1} 轮)...", flush=True)
        if deadline is not None and deadline - time.monotonic() <= 0:
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
        if isinstance(llm_res, dict) and llm_res.get("finish_reason") == "length":
            was_token_truncated = True

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
            action, guard_msg, max_rounds = _check_no_tool_assertion_guard(
                reply_text=reply_text,
                last_user_prompt=last_user_prompt,
                round_idx=round_idx,
                max_rounds=max_rounds,
                start_ts=start_ts,
                is_guide_intent=is_guide_intent,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent
            )
            if action == "continue":
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({"role": "user", "content": guard_msg})
                round_idx += 1
                continue
            elif action == "break":
                break
            else:
                break

        # 记录助手消息
        cleaned_content = clean_output(reply_text, is_guide=is_guide_intent).strip() if reply_text else ""
        messages.append({
            "role": "assistant",
            "content": cleaned_content if cleaned_content else None,
            "tool_calls": structured_calls
        })

        # 工具调用属于沙箱内部流程，调用前重置任何未决的前端打字机内容
        sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
        sys.stdout.flush()

        # 执行工具调用
        is_file_sent = _dispatch_tool_calls(
            structured_calls=structured_calls,
            round_idx=round_idx,
            messages=messages,
            telemetry=telemetry,
            policy=policy,
            executed_calls_history=executed_calls_history,
            outbound_files=outbound_files,
            deadline=deadline,
            is_guide_intent=is_guide_intent,
            outbound_reminders=outbound_reminders
        )

        # 当前轮次已执行工具，重置 reply_text，防止内部工具前置垫话或执行脚本残留进入最终回复
        reply_text = ""

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

        round_idx += 1

    final_text, healed_files = _finalize_agent_text(
        reply_text=reply_text,
        messages=messages,
        model=model,
        policy=policy,
        deadline=deadline,
        is_guide_intent=is_guide_intent,
        executed_calls_history=executed_calls_history,
        was_token_truncated=was_token_truncated,
        telemetry=telemetry,
        last_user_prompt=last_user_prompt
    )
    for hf in healed_files:
        if hf not in outbound_files:
            outbound_files.append(hf)

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        outbound_reminders=outbound_reminders,
        telemetry=telemetry,
        messages=messages
    )
