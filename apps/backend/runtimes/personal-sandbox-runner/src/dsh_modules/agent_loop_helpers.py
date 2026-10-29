"""
Text inspection, self-healing, preview sanitization, and fallback report helpers for agent_loop.
Extracted to keep agent_loop focused on multi-turn ReAct orchestration and assertion guards.
"""

import re
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from .llm import detect_unexecuted_script_leak

# 常见工具核心参数名集合（用于检测模型是否在文本输出中裸露吐出工具调用参数）
COMMON_TOOL_ARG_KEYS = {
    "query", "freshness", "url", "city", "command", "cmd",
    "file_path", "filename", "filepath", "search_query", "keywords",
    "keyword", "page_url", "site_url", "time_range", "time_window"
}


def detect_unexecuted_tool_argument_leak(text: str) -> bool:
    """
    Detects if the model mistakenly dumped bare tool-call parameters or raw JSON argument fragments
    (e.g. '"query": "...", "freshness": "month"' or '{"query": "..."}') directly into the text reply,
    without invoking the tool via native Function Calling protocol.
    """
    if not text:
        return False

    raw = text.strip()
    if not raw:
        return False

    # 1. 剥离外层 markdown 代码块
    m_block = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", raw, re.I)
    cleaned = m_block.group(1).strip() if m_block else raw

    # 2. 如果文本很长且包含 Markdown 标题或多个自然语言段落，通常不是裸参数碎片
    if len(cleaned) > 500 and ("\n#" in cleaned or ("\n\n" in cleaned and not cleaned.startswith("{"))):
        return False

    # 3. 检查模式 A：以常见参数 key 开头的键值对（例如: "query": "xxx", "freshness": "month"）
    key_prefix_match = re.match(
        r'^\s*["\']?([a-zA-Z_][a-zA-Z0-9_-]*)["\']?\s*:\s*',
        cleaned
    )
    if key_prefix_match:
        first_key = key_prefix_match.group(1).lower()
        if first_key in COMMON_TOOL_ARG_KEYS:
            cand = cleaned
            if not cand.startswith("{"):
                cand = "{" + cand
            if not cand.endswith("}"):
                cand = cand + "}"
            try:
                parsed = json.loads(cand)
                if isinstance(parsed, dict) and any(k.lower() in COMMON_TOOL_ARG_KEYS for k in parsed):
                    return True
            except Exception:
                pairs = re.findall(
                    r'["\']?([a-zA-Z_][a-zA-Z0-9_-]*)["\']?\s*:\s*(?:"[^"]*"|\'[^\']*\'|[0-9]+|true|false|null)',
                    cleaned,
                    re.I
                )
                if pairs and all(k.lower() in COMMON_TOOL_ARG_KEYS for k in pairs):
                    return True

    # 4. 检查模式 B：整体为 JSON 对象，但仅包含工具参数键，无工具包装和自然语言解答
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                meta_keys = {"tool", "tool_name", "action", "call", "function", "name"}
                if not any(k.lower() in meta_keys for k in parsed):
                    dict_keys = {str(k).lower() for k in parsed.keys()}
                    if dict_keys and dict_keys.issubset(COMMON_TOOL_ARG_KEYS.union({"limit", "timeout", "depth", "days"})):
                        if any(k in dict_keys for k in ("query", "url", "city", "command", "cmd", "file_path", "filename")):
                            return True
        except Exception:
            pass

    return False


# 常见模型过渡性前导垫话特征词
ACTION_FILLER_KEYWORDS = [
    "让我", "正在", "接下来", "探索", "获取", "抓取", "解析", "稍等", "深入", "克隆", "调用",
    "换用", "重新搜索", "继续搜索", "我来搜索", "我将搜索", "来搜索", "关键词组合",
    "我需要获取", "让我尝试", "再次获取", "我需要查询", "还需要获取"
]

# 常见极简英文/无意义状态词（防止模型或回退网关以简短垫话冒充有效答复）
TRIVIAL_STATUS_WORDS = {
    "task ready", "task completed", "task finished", "ready", "done", "finished",
    "completed", "all done", "here is the file", "file ready", "process finished",
    "ok", "success", "succeeded"
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
            else:
                py_save_match = re.search(
                    r'(?:save|\.to_csv|\.to_excel)\s*\(\s*[\'"](?:/workspace/|\./workspace/)?([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:pptx?|docx?|xlsx?|pdf|csv|json|html|png|jpg))[\'"]',
                    block_content
                )
                if py_save_match and ("import " in block_content or "from " in block_content):
                    clean_filename = py_save_match.group(1).strip()
                    dest_file = Path(workspace_dir) / clean_filename
                    if not dest_file.exists() or dest_file.stat().st_size == 0:
                        tmp_py = Path("/tmp") / f"_auto_heal_{clean_filename}.py"
                        try:
                            with open(tmp_py, "w", encoding="utf-8") as f:
                                f.write(block_content.strip())
                            import subprocess
                            proc = subprocess.run(["python3", str(tmp_py)], cwd=workspace_dir, capture_output=True, text=True, timeout=30)
                            if proc.returncode == 0 and dest_file.exists() and dest_file.stat().st_size > 0:
                                written_files.append(str(dest_file))
                                print(f"✨ [Harness Auto-Heal] 成功自愈执行未运行 Python 脚本生成产物: {dest_file}")
                                replacement = f"✨ 已成功生成并保存文件：`/workspace/{clean_filename}`"
                                cleaned_text = cleaned_text.replace(full_block, replacement)
                            else:
                                print(f"⚠️ [Harness Auto-Heal] Python 脚本自愈执行退出码 {proc.returncode}: {proc.stderr[:200]}")
                        except Exception as e:
                            print(f"⚠️ [Harness Auto-Heal] 执行自愈 Python 脚本异常: {e}")
                        finally:
                            if tmp_py.exists():
                                try:
                                    tmp_py.unlink()
                                except Exception:
                                    pass

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


def _build_fallback_report(
    messages: List[Dict[str, Any]],
    executed_calls_history: List[str],
    cause: Optional[str] = None,
    trigger_evidence: Optional[str] = None,
    completed_items: Optional[List[str]] = None,
    pending_items: Optional[List[str]] = None,
    retry_advice: Optional[str] = None,
) -> str:
    """Builds an evidence-grounded diagnostic recovery report.
    
    Strictly separates failure causes (user_cancel, deadline_exceeded, upstream_transport_error,
    model_empty_final, model_budget_exhausted, tool_error, artifact_missing, validation_failed)
    from spurious "upstream network error" assumptions.
    """
    successful_tools = [
        (c.split(":", 1)[0] if ":" in c else c)
        for c in (executed_calls_history or [])
        if not c.startswith("err:")
    ]
    tool_names = ", ".join(sorted(set(successful_tools))) if successful_tools else ""
    if not tool_names and executed_calls_history:
        tool_names = "相关工具"

    # 提取已检索到的数据线索
    data_clues = []
    for msg in reversed(messages or []):
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

    # 推理诊断原因与证据映射
    cause_key = (cause or "").lower()
    evidence_desc = trigger_evidence or ""

    if cause_key == "user_cancel":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但任务已由用户主动取消或终止。" if tool_names else "⚠️ 任务已由用户主动取消或终止。"
        advice = retry_advice or "如需继续，请重新发送请求。"
    elif cause_key == "deadline_exceeded":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但任务执行时间已达到硬超时上限 ({evidence_desc or '超时'})。" if tool_names else f"⚠️ 任务执行时间已达到系统设定的硬超时上限 ({evidence_desc or '超时'})。"
        advice = retry_advice or "建议拆分复杂任务或减少单次处理的文件规模重新提问。"
    elif cause_key == "upstream_transport_error":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但与上游模型通信时网络异常 ({evidence_desc or '连接中断'})。" if tool_names else f"⚠️ 上游模型通信网络异常 ({evidence_desc or '连接中断'})。"
        advice = retry_advice or "此为上游接口临时网络抖动，可稍后直接重试。"
    elif cause_key == "model_empty_final":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但上游模型在收尾汇总时未输出最终有效正文。" if tool_names else "⚠️ 沙箱运行正常，但上游模型未返回有效回复内容（收尾汇总时未输出最终有效正文）。"
        advice = retry_advice or "可直接回复「请重新生成」或「请根据上方信息输出最终回答」重试。"
    elif cause_key == "model_budget_exhausted":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但执行达到最大轮次预算上限 ({evidence_desc or '轮次耗尽'})，未能在单轮内完成所有步骤。" if tool_names else f"⚠️ 执行达到最大轮次预算上限 ({evidence_desc or '轮次耗尽'})，未能在单轮内完成所有步骤。"
        advice = retry_advice or "可直接发送「请重试」或提示模型直接输出最终交付成果。"
    elif cause_key == "artifact_missing":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但任务要求的目标交付物未在沙箱工作区落盘 ({evidence_desc or '目标文件缺失'})。" if tool_names else f"⚠️ 任务要求生成目标交付物，但在沙箱工作区中未检测到物理文件落盘 ({evidence_desc or '文件未生成'})。"
        advice = retry_advice or "可直接回复「请重新生成该文件」重试。"
    elif cause_key == "validation_failed":
        header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但产物未能通过数据一致性或结构安全校验门禁 ({evidence_desc or '校验未通过'})。" if tool_names else f"⚠️ 产物未能通过数据一致性或结构安全校验门禁 ({evidence_desc or '校验未通过'})。"
        advice = retry_advice or "请检查原始输入数据完整性后重试。"
    elif cause_key == "tool_error":
        # 区分预期规则门禁拦截 vs 工具崩溃故障
        is_rule_rejection = any(k in evidence_desc for k in ["规则", "门禁", "只接受输入原件", "降级", "结构工具", "只读"])
        if is_rule_rejection:
            header = f"⚠️ 沙箱已成功调用工具（{tool_names}），但后续操作触发规则门禁拦截 ({evidence_desc})。" if tool_names else f"⚠️ 操作触发规则门禁生效拦截 ({evidence_desc})。"
            advice = retry_advice or "此为系统安全与质量门禁正常拦截，并非工具崩溃；请按门禁要求提供合法输入。"
        else:
            header = f"⚠️ 沙箱已调用工具（{tool_names}），但执行过程中发生异常 ({evidence_desc or '执行出错'})。" if tool_names else f"⚠️ 沙箱工具执行过程中发生异常 ({evidence_desc or '执行出错'})。"
            advice = retry_advice or "请检查脚本逻辑或文件权限。"
    else:
        # 原因未确定场景：严禁擅自归咎为模型网络错误或推荐切换模型
        if tool_names:
            header = f"⚠️ 沙箱已成功调用工具（{tool_names}）采集到相关数据，但最终交付文本未完成输出（原因未确定）。"
            advice = retry_advice or "可直接回复「请继续整理并回答」重新获取内容。"
        else:
            recent_plan = ""
            for msg in reversed(messages or []):
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
                    "💡 建议：可直接回复「请重新生成该文档」或重新发送请求重试。"
                )
            header = "⚠️ 沙箱运行正常，但任务未完成最终交付（原因未确定）。"
            advice = retry_advice or "请细化具体要求后重新发送。"

    completed_part = f"\n- 已完成步骤：已成功调用 {tool_names}" if tool_names else ""
    if completed_items:
        completed_part += f"\n- 已完成产物：{', '.join(completed_items)}"
    pending_part = f"\n- 阻塞未完成项：{', '.join(pending_items)}" if pending_items else ""

    return (
        f"{header}"
        f"{completed_part}"
        f"{pending_part}"
        f"{clues_block}\n\n"
        f"💡 建议：{advice}"
    )


def find_invalid_new_workbooks(workspace_dir: str, turn_start_time: float) -> List[Tuple[str, List[str]]]:
    """Finds newly created .xlsx/.xlsm files in workspace_dir that failed formula or source-data validation."""
    from .file_tools import is_protected_session_file
    from .workbook_delivery import inspect_generated_workbook
    try:
        from .spreadsheet_update.delivery import validate_update_delivery
    except Exception:
        validate_update_delivery = None

    root = Path(workspace_dir)
    if not root.is_dir():
        return []
    invalid: List[Tuple[str, List[str]]] = []
    for path in sorted(root.iterdir()):
        if (
            path.is_symlink()
            or not path.is_file()
            or path.name.startswith(".")
            or path.suffix.lower() not in (".xlsx", ".xlsm")
            or path.stat().st_mtime < turn_start_time - 2
            or is_protected_session_file(path)
        ):
            continue
        if validate_update_delivery is not None:
            ok, issues = validate_update_delivery(path)
        else:
            res = inspect_generated_workbook(path)
            ok, issues = res["valid"], res["issues"]
        if not ok and issues:
            invalid.append((path.name, list(issues)))
    return invalid


def _extract_filename_from_outbound(item: str) -> str:
    try:
        obj = json.loads(item)
        if isinstance(obj, dict) and "fileName" in obj:
            return obj["fileName"]
    except Exception:
        pass
    return Path(item).name


def materialize_post_loop_deliverables(
    last_user_prompt: str,
    final_text: str,
    workspace_dir: str,
    start_ts: float,
    expected_deliverables: Optional[List[str]],
    outbound_files: List[str],
) -> List[str]:
    """Compiles declarative post-loop deliverables (Markdown, PDF, scripts, config files) and cleans intermediate drafts."""
    from .deliverable_contract import (
        materialize_requested_markdown,
        materialize_script_deliverable,
        materialize_pdf_from_markdown,
        materialize_config_or_code_deliverable,
    )
    from .skill_router import is_text_only_request

    markdown_path, created_now = materialize_requested_markdown(
        last_user_prompt,
        final_text,
        workspace_dir,
        turn_start_time=start_ts,
    )
    if markdown_path:
        outbound_payload = json.dumps(
            {"filePath": markdown_path, "fileName": Path(markdown_path).name},
            ensure_ascii=False,
        )
        if outbound_payload not in outbound_files:
            outbound_files.append(outbound_payload)
        if created_now:
            print(
                f"✨ [Harness Artifact Compiler] 已将最终正文编译为 Markdown 文件: {markdown_path}",
                flush=True,
            )

    if expected_deliverables and any(ext.lower() == ".pdf" for ext in expected_deliverables):
        pdf_path = materialize_pdf_from_markdown(
            prompt=last_user_prompt,
            workspace_dir=workspace_dir,
            turn_start_time=start_ts,
            expected_deliverables=expected_deliverables,
            final_text=final_text,
        )
        if pdf_path:
            outbound_payload = json.dumps(
                {"filePath": pdf_path, "fileName": Path(pdf_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)
            md_stem = Path(pdf_path).stem.lower()
            filtered_outbounds = []
            for item_str in outbound_files:
                try:
                    obj = json.loads(item_str)
                    fname = str(obj.get("fileName", "")).lower()
                    if fname.endswith(".md") and (fname == f"{md_stem}.md" or fname == "result.md" or fname == "report.md"):
                        continue
                except Exception:
                    pass
                filtered_outbounds.append(item_str)
            outbound_files = filtered_outbounds

    if expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables):
        script_artifact_path, _ = materialize_script_deliverable(
            reply_text=final_text,
            workspace_dir=workspace_dir,
            expected_deliverables=expected_deliverables,
            turn_start_time=start_ts,
        )
        if script_artifact_path:
            outbound_payload = json.dumps(
                {"filePath": script_artifact_path, "fileName": Path(script_artifact_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)

    if not is_text_only_request(last_user_prompt):
        tech_artifacts_final = materialize_config_or_code_deliverable(
            prompt=last_user_prompt,
            final_text=final_text,
            workspace_dir=workspace_dir,
            turn_start_time=start_ts,
        )
        for ta in tech_artifacts_final:
            outbound_payload = json.dumps(
                {"filePath": ta, "fileName": Path(ta).name},
                ensure_ascii=False,
            )
            ta_name = Path(ta).name.lower()
            if outbound_payload not in outbound_files and not any(_extract_filename_from_outbound(existing).lower() == ta_name for existing in outbound_files):
                outbound_files.append(outbound_payload)

        user_wants_md = bool(re.search(r"(?:\.md\b|\bmarkdown\b|md\s*文件)", last_user_prompt or "", re.I))
        has_primary_tech = any(
            _extract_filename_from_outbound(f).lower().endswith((".py", ".sh", ".sql", ".yml", ".yaml"))
            or _extract_filename_from_outbound(f).lower() == "dockerfile"
            for f in outbound_files
        )
        if has_primary_tech and not user_wants_md:
            cleaned_outbounds = []
            for item_str in outbound_files:
                fname = _extract_filename_from_outbound(item_str).lower()
                if fname.endswith((".py.md", ".sh.md", ".sql.md")) or (fname.endswith(".md") and fname in ("result.md", "script.md")):
                    continue
                cleaned_outbounds.append(item_str)
            outbound_files = cleaned_outbounds

    # 5. HTML / 图表 / 可视化交互单页物化与工作区落盘
    from .task_intent import is_visual_artifact_requested
    wants_html = (
        (expected_deliverables and any(ext.lower() in [".html", ".htm"] for ext in expected_deliverables))
        or is_visual_artifact_requested(last_user_prompt)
        or bool(re.search(r'(?:做成|制作|生成|导出|创建)[^，。\n]{0,8}(?:html|网页|单页|看板|大屏|页面|图表|柱状图|折线图|饼图)', (last_user_prompt or "").lower()))
    )
    if wants_html:
        from .artifact_exporter import ArtifactExporter
        if "```html" in (final_text or ""):
            _, exported_htmls = ArtifactExporter.export_html(
                final_text,
                is_ppt_intent=False,
                workspace_dir=workspace_dir,
                turn_start_time=start_ts,
                prompt=last_user_prompt,
            )
            for hpath in exported_htmls:
                outbound_payload = json.dumps(
                    {"filePath": hpath, "fileName": Path(hpath).name},
                    ensure_ascii=False,
                )
                if outbound_payload not in outbound_files and not any(_extract_filename_from_outbound(existing).lower() == Path(hpath).name.lower() for existing in outbound_files):
                    outbound_files.append(outbound_payload)

        # 检查工作区中本轮已生成的有效 HTML 文件
        ws_p = Path(workspace_dir)
        if ws_p.exists():
            cutoff = (start_ts - 2.0) if start_ts is not None else 0.0
            for item in ws_p.iterdir():
                if item.is_file() and item.suffix.lower() in (".html", ".htm") and item.stat().st_size > 0 and item.stat().st_mtime >= cutoff:
                    if not ArtifactExporter.is_temporary_file(item.name):
                        outbound_payload = json.dumps(
                            {"filePath": str(item), "fileName": item.name},
                            ensure_ascii=False,
                        )
                        if outbound_payload not in outbound_files and not any(_extract_filename_from_outbound(f).lower() == item.name.lower() for f in outbound_files):
                            outbound_files.append(outbound_payload)

    return outbound_files


def materialize_in_loop_deliverables(
    last_user_prompt: str,
    reply_text: str,
    workspace_dir: str,
    start_ts: float,
    expected_deliverables: Optional[List[str]],
    outbound_files: List[str],
    executed_calls_history: List[str],
) -> Optional[str]:
    """Compiles in-loop declarative deliverables (Markdown, script-generated Office/PDF, config files) and returns script_execution_error if any."""
    from .deliverable_contract import (
        materialize_requested_markdown,
        materialize_script_deliverable,
        materialize_pdf_from_markdown,
        materialize_config_or_code_deliverable,
    )
    from .skill_router import is_text_only_request

    markdown_path, created_now = materialize_requested_markdown(
        last_user_prompt,
        reply_text,
        workspace_dir,
        turn_start_time=start_ts,
    )
    if markdown_path:
        outbound_payload = json.dumps(
            {"filePath": markdown_path, "fileName": Path(markdown_path).name},
            ensure_ascii=False,
        )
        if outbound_payload not in outbound_files:
            outbound_files.append(outbound_payload)
        if created_now:
            print(
                f"✨ [Harness Artifact Compiler] 已将最终正文编译为 Markdown 文件: {markdown_path}",
                flush=True,
            )

    script_execution_error: Optional[str] = None
    if expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables):
        script_artifact_path, script_err = materialize_script_deliverable(
            reply_text=reply_text,
            workspace_dir=workspace_dir,
            expected_deliverables=expected_deliverables,
            turn_start_time=start_ts,
        )
        if script_artifact_path:
            outbound_payload = json.dumps(
                {"filePath": script_artifact_path, "fileName": Path(script_artifact_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)
            executed_calls_history.append("bash")
            print(
                f"✨ [Harness Deliverable Compiler] 检测到模型在正文中输出了生成脚本，已自动安全执行落盘: {script_artifact_path}",
                flush=True,
            )
        elif script_err:
            script_execution_error = script_err

    if expected_deliverables and any(ext.lower() == ".pdf" for ext in expected_deliverables):
        pdf_artifact_path = materialize_pdf_from_markdown(
            prompt=last_user_prompt,
            workspace_dir=workspace_dir,
            turn_start_time=start_ts,
            expected_deliverables=expected_deliverables,
            final_text=reply_text,
        )
        if pdf_artifact_path:
            outbound_payload = json.dumps(
                {"filePath": pdf_artifact_path, "fileName": Path(pdf_artifact_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)
            executed_calls_history.append("bash")

    if not is_text_only_request(last_user_prompt):
        tech_artifacts_mid = materialize_config_or_code_deliverable(
            prompt=last_user_prompt,
            final_text=reply_text,
            workspace_dir=workspace_dir,
            turn_start_time=start_ts,
        )
        for ta in tech_artifacts_mid:
            outbound_payload = json.dumps(
                {"filePath": ta, "fileName": Path(ta).name},
                ensure_ascii=False,
            )
            ta_name = Path(ta).name.lower()
            if outbound_payload not in outbound_files and not any(_extract_filename_from_outbound(existing).lower() == ta_name for existing in outbound_files):
                outbound_files.append(outbound_payload)

    # HTML / 图表 / 可视化交互单页物化
    from .task_intent import is_visual_artifact_requested
    wants_html_mid = (
        (expected_deliverables and any(ext.lower() in [".html", ".htm"] for ext in expected_deliverables))
        or is_visual_artifact_requested(last_user_prompt)
        or bool(re.search(r'(?:做成|制作|生成|导出|创建)[^，。\n]{0,8}(?:html|网页|单页|看板|大屏|页面|图表|柱状图|折线图|饼图)', (last_user_prompt or "").lower()))
    )
    if wants_html_mid and "```html" in (reply_text or ""):
        from .artifact_exporter import ArtifactExporter
        _, exported_htmls = ArtifactExporter.export_html(
            reply_text,
            is_ppt_intent=False,
            workspace_dir=workspace_dir,
            turn_start_time=start_ts,
            prompt=last_user_prompt,
        )
        for hpath in exported_htmls:
            outbound_payload = json.dumps(
                {"filePath": hpath, "fileName": Path(hpath).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files and not any(_extract_filename_from_outbound(existing).lower() == Path(hpath).name.lower() for existing in outbound_files):
                outbound_files.append(outbound_payload)

    return script_execution_error
