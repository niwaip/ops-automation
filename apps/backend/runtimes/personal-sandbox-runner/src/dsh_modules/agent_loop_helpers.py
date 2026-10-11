"""
Text inspection, self-healing, preview sanitization, and fallback report helpers for agent_loop.
Extracted to keep agent_loop focused on multi-turn ReAct orchestration and assertion guards.
"""

import re
from pathlib import Path
from typing import List, Dict, Any, Tuple
from .llm import detect_unexecuted_script_leak


# 常见模型过渡性前导垫话特征词
ACTION_FILLER_KEYWORDS = [
    "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
    "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合",
    "我需要获取", "让我尝试", "再次获取", "我需要查询", "还需要获取"
]


def is_unclosed_or_truncated_html(text: str) -> bool:
    """
    Detects whether text contains an unclosed or truncated ```html code block,
    e.g. missing closing ``` fence, or opened as full HTML document but abruptly cut off without </html>.
    """
    if not text or "```html" not in text:
        return False
    last_idx = text.rfind("```html")
    after_block = text[last_idx + 7:]
    if "```" not in after_block:
        return True
    lower_block = after_block.lower()
    if "<!doctype html" in lower_block or "<html" in lower_block:
        if "</html>" not in lower_block and "</body>" not in lower_block:
            return True
    return False


def is_explicit_code_request(prompt: str) -> bool:
    """
    Detects whether user prompt explicitly asked to view, display, or explain code/scripts in chat.
    If the user's intent is to create, run, fix, modify, or save files/deliverables,
    it returns False even if the word '代码' or '脚本' is mentioned.
    """
    if not prompt:
        return False
    lower = prompt.lower().strip()

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
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s+[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n([\s\S]*?)(?:\n\1|\Z)',
        r'(?:write_file|cat)\s+>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*\n([\s\S]*?)(?:\n\2|\Z)',
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n([\s\S]*?)(?:\n\1|\Z)'
    ]

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
            if isinstance(content, list):
                text_parts = [
                    str(part.get("text") or "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                ]
                content = "\n".join(p for p in text_parts if p).strip()
            if isinstance(content, str):
                m_req = re.search(r'\[User Request\]:\s*\n([\s\S]*?)(?:\n\n(?:\[|【|---)|$)', content)
                if m_req:
                    return m_req.group(1).strip()
                m_cmd = re.search(r'(?:^|\n)用户指令[：:]\s*([^\n]+(?:\n[\s\S]*)?)$', content)
                if m_cmd:
                    return m_cmd.group(1).strip()
                if (
                    content.startswith("【执行与代码落盘阶段】")
                    or content.startswith("【系统产物物理断言拦截】")
                    or content.startswith("【系统交付物检查】")
                    or content.startswith("⚠️ 【强制执行守卫")
                    or content.startswith("工具调用轮次已结束")
                    or content.startswith("文件已成功标记")
                ):
                    continue
                return content
            return ""
    return ""


def _build_fallback_report(messages: List[Dict[str, Any]], executed_calls_history: List[str]) -> str:
    """Builds a diagnostic recovery report when model returns empty response or unexecuted filler."""
    if executed_calls_history:
        successful_tools = [
            (c.split(":", 1)[0] if ":" in c else c)
            for c in executed_calls_history
            if not c.startswith("err:")
        ]
        tool_names = ", ".join(sorted(set(successful_tools))) if successful_tools else ""
        if not tool_names:
            tool_names = "相关工具"
        data_clues = []
        for msg in reversed(messages):
            if msg.get("role") == "tool" and msg.get("content"):
                c_str = str(msg["content"]).strip()
                if not c_str or c_str.startswith("未识别") or c_str.startswith("[命令执行失败") or c_str.startswith("未提供工具"):
                    continue
                if "tool_not_available" in c_str or '"status": "error"' in c_str or '"code": "tool_not_available"' in c_str:
                    continue
                is_json_dict = False
                try:
                    import json
                    parsed = json.loads(c_str)
                    if isinstance(parsed, dict):
                        is_json_dict = True
                        if parsed.get("status") == "error" or parsed.get("error"):
                            continue
                        data_val = parsed.get("data")
                        if isinstance(data_val, list):
                            for item in data_val:
                                if isinstance(item, dict):
                                    title = item.get("title") or item.get("name") or ""
                                    snippet = item.get("snippet") or item.get("summary") or item.get("desc") or ""
                                    line_rep = f"{title}: {snippet}".strip(": ")
                                    if line_rep and len(line_rep) > 6:
                                        data_clues.append(line_rep[:150])
                                elif isinstance(item, str) and len(item.strip()) > 6:
                                    data_clues.append(item.strip()[:150])
                                if len(data_clues) >= 6:
                                    break
                        elif isinstance(data_val, str) and len(data_val.strip()) > 6:
                            for l in data_val.split("\n"):
                                clean_l = l.strip()
                                if clean_l and not clean_l.startswith("【") and len(clean_l) > 6:
                                    data_clues.append(clean_l[:150])
                                    if len(data_clues) >= 6:
                                        break
                except Exception:
                    pass

                if not is_json_dict:
                    for line in c_str.split("\n"):
                        clean_l = line.strip()
                        if clean_l and not clean_l.startswith("【") and len(clean_l) > 6:
                            if clean_l.startswith("{") or clean_l.startswith("}") or clean_l.startswith('"schema_version"'):
                                continue
                            data_clues.append(clean_l[:150])
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
    recent_plan = ""
    for msg in reversed(messages):
        if msg.get("role") == "assistant" and msg.get("content"):
            c = str(msg["content"]).strip()
            if (
                c
                and not c.startswith("⚠️")
                and not c.startswith("❌")
                and not detect_unexecuted_script_leak(c)
                and "chmod" not in c
                and "```bash" not in c
                and "```sh" not in c
            ):
                recent_plan = c
                break

    if recent_plan:
        summary_preview = recent_plan[:350].strip()
        return (
            "⚠️ 沙箱已完成方案分析规划，但在自动执行代码生成物理交付物时未成功创建目标文件。\n\n"
            f"【已规划的方案参考】:\n{summary_preview}...\n\n"
            "💡 建议：可直接回复「请使用 Python 脚本生成该文档并保存到 /workspace/」重试落盘。"
        )

    return "⚠️ 沙箱运行正常，但上游模型未返回有效回复内容（可能网络连接超时或上游服务异常）。建议重新发送或切换模型重试。"
