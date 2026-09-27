"""Protocol adapters for model outputs that describe actions without native tool calls."""

import ast
import json
import re
from typing import Any, Dict, List, Optional


# Recovery is intentionally limited to low-risk, schema-bound tools. Mutating tools such as
# bash are never promoted from plain text into executable actions.
RECOVERABLE_TEXT_TOOLS = {
    "web_search",
    "fetch_page",
    "weather",
    "read_file",
    "read_workspace_file",
    "scan_knowledge",
    "read_skill",
    "write_markdown",
    "create_reminders",
}

POSITIONAL_ARGUMENT_NAMES = {
    "web_search": "query",
    "fetch_page": "url",
    "weather": "city",
    "read_file": "file_path",
    "read_workspace_file": "file_path",
    "read_skill": "skill_name",
}

PLAN_HEADER_RE = re.compile(
    r"^\s*(?:new[_\s-]*plan|execution[_\s-]*plan|action[_\s-]*plan|计划|执行计划)\s*[:：]?",
    re.I,
)
FUNCTION_CALL_LINE_RE = re.compile(
    r"^\s*(?:[-*•]\s*)?(?:(?:tool_code|tool_call|call|action)\s*[:：]\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)\s*[。.;；]?\s*$",
    re.I
)


def _literal_value(node: ast.AST) -> Any:
    """Returns JSON-compatible literals only; executable expressions are rejected."""
    value = ast.literal_eval(node)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_literal_json_item(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _literal_json_item(item) for key, item in value.items()}
    raise ValueError("unsupported action argument")


def _literal_json_item(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_literal_json_item(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _literal_json_item(item) for key, item in value.items()}
    raise ValueError("unsupported nested action argument")


def _parse_function_call_line(line: str) -> Optional[Dict[str, Any]]:
    match = FUNCTION_CALL_LINE_RE.match(line)
    if not match:
        return None

    tool_name = match.group(1).strip()
    if tool_name not in RECOVERABLE_TEXT_TOOLS:
        return None

    return _parse_function_call_expression(f"{tool_name}({match.group(2)})")


def _parse_function_call_expression(source: str) -> Optional[Dict[str, Any]]:
    """Parses one complete, literal-only function expression, including multiline calls."""
    cleaned_source = (source or "").strip().strip("`").strip()
    m_tag = re.search(r'<(?:tool_code|tool_call|invoke)[^>]*>([\s\S]*?)(?:</(?:tool_code|tool_call|invoke)>|$)', cleaned_source, re.I)
    if m_tag:
        cleaned_source = m_tag.group(1).strip()
    cleaned_source = re.sub(r'^(?:tool_code|tool_call|call|action)\s*[:：]\s*', '', cleaned_source, flags=re.I).strip()
    if cleaned_source.startswith("[") and cleaned_source.endswith("]") and not cleaned_source.startswith("[{"):
        cleaned_source = cleaned_source[1:-1].strip()
    try:
        expression = ast.parse(cleaned_source, mode="eval").body
    except SyntaxError:
        return None
    if not isinstance(expression, ast.Call) or not isinstance(expression.func, ast.Name):
        return None
    tool_name = expression.func.id
    if tool_name not in RECOVERABLE_TEXT_TOOLS:
        return None

    params: Dict[str, Any] = {}
    if expression.args:
        positional_name = POSITIONAL_ARGUMENT_NAMES.get(tool_name)
        if not positional_name or len(expression.args) != 1:
            return None
        try:
            params[positional_name] = _literal_value(expression.args[0])
        except (ValueError, TypeError, SyntaxError):
            return None

    for keyword in expression.keywords:
        if keyword.arg is None or keyword.arg in params:
            return None
        try:
            params[keyword.arg] = _literal_value(keyword.value)
        except (ValueError, TypeError, SyntaxError):
            return None

    if tool_name == "web_search":
        query = str(params.get("query", "")).strip()
        if not query:
            return None
        params["query"] = query
        freshness = params.get("freshness")
        if freshness is not None and freshness not in {"day", "week", "month", "year"}:
            return None
    elif tool_name == "fetch_page" and not str(params.get("url", "")).strip():
        return None
    elif tool_name == "weather" and not str(params.get("city", "")).strip():
        return None
    elif tool_name == "write_markdown":
        if expression.args:
            return None
        allowed_keys = {"file_path", "path", "filename", "content", "markdown", "text"}
        if not set(params).issubset(allowed_keys):
            return None
        file_name = str(
            params.get("file_path") or params.get("path") or params.get("filename") or ""
        ).strip()
        content = str(params.get("content") or params.get("markdown") or params.get("text") or "")
        if not re.fullmatch(r"(?:/workspace/)?[a-zA-Z0-9_\-\u4e00-\u9fa5]+\.md", file_name, re.I):
            return None
        if not content.strip():
            return None

    elif tool_name == "create_reminders":
        if "reminders" not in params or not isinstance(params["reminders"], list) or not params["reminders"]:
            return None

    return {"name": tool_name, "params": params}


def is_internal_plan_output(text: str) -> bool:
    """Detects planning traces that must not be promoted to a user-visible final answer."""
    if not text or not text.strip():
        return False
    stripped = text.strip()
    standalone_action = _parse_function_call_expression(stripped)
    if standalone_action and standalone_action["name"] in ("write_markdown", "create_reminders"):
        return True
    if PLAN_HEADER_RE.search(stripped):
        return True

    planning_language = bool(
        re.search(
            r"(?:\bStep\s*1\b|\bI\s+(?:will|need to|shall)\b|"
            r"(?:我将|我需要|接下来|第一步).{0,40}(?:搜索|检索|调用|执行|写入|保存))",
            stripped,
            re.I | re.S,
        )
    )
    has_function_call = any(
        _parse_function_call_line(line) is not None for line in stripped.splitlines()
    )
    return planning_language and has_function_call


REMINDER_TIME_RE = re.compile(
    r'(?:\d+\s*(?:点|时|分|秒|号|日|周|天|月|年)|\d{1,2}[:：]\d{1,2}|'
    r'明天|后天|大后天|下周|今晚|明早|今早|早上|中午|下午|晚上|半小时|一小时|'
    r'\d+\s*(?:小时|分钟|天)后|工作日|每天|每周|每月|准时|到点|'
    r'tomorrow|tonight|daily|weekly|monthly|\d{1,2}(?::\d{2})?\s*(?:am|pm))',
    re.I,
)


def has_explicit_reminder_time(user_prompt: Optional[str]) -> bool:
    """Returns true only when the user's own instruction includes a reminder time/frequency."""
    if not user_prompt:
        return False
    clean = re.sub(r'[“”"\'`][\s\S]*?[“”"\'`]', ' ', user_prompt)
    return bool(REMINDER_TIME_RE.search(clean))


def has_explicit_reminder_intent(user_prompt: Optional[str]) -> bool:
    """
    Checks whether the user explicitly requested a reminder action in the current turn.
    Protects against promotional recovery of reminder JSON or text from external web pages or files.
    Requires clear imperative directive to set/manage reminders, and strictly rejects
    consumption/inquiry/summarization requests (e.g. "总结这篇关于日程提醒产品的网页").
    """
    if not user_prompt:
        return False
    clean = user_prompt.strip()

    # Summarization/explanation requests and quoted/external instructions are data, not authorization.
    if re.search(r'(?:只|仅|请)?(?:总结|概括|解释|分析|翻译|复述).{0,16}(?:网页|文章|内容|文本|这句|这段|下面|以下|引号|指令)', clean):
        return False
    if re.search(r'(?:网页|文章|附件|邮件|文本|内容).{0,20}(?:写着|包含|提到|要求).{0,30}(?:提醒|闹钟|待办)', clean):
        return False

    # Explicit negation always wins over reminder-like words later in the sentence.
    if re.search(r'(?:不要|别|无需|不用|禁止).{0,8}(?:(?:创建|设置|执行|新增|添加).{0,4})?(?:提醒|闹钟|待办|日程)', clean):
        if not re.search(r'(?:但是|改在|重新|重新设置|新建|创建).{0,6}(?:提醒|闹钟)', clean):
            return False

    # Remove quoted examples before detecting commands such as “提醒我”.
    command_text = re.sub(r'[“”"\'`][\s\S]*?[“”"\'`]', ' ', clean)

    # 2. 强指令谓词匹配：用户明确要求助手为自己创建、设置、建立提醒/待办/闹钟
    has_imperative_directive = bool(
        re.search(
            r'(?:帮我|请|给我|麻烦)?(?:设置|创建|建个|定个|加个|添加|设个|设一下|定一下|新增|安排|建立)(?:[一1张个条份项次])?(?:定时)?(?:提醒|闹钟|待办|日程)',
            command_text,
            re.I
        ) or re.search(
            r'(?:到点|准时|定时|记得|届时)?(?:提醒我|叫我|通知我|叫醒我)',
            command_text,
            re.I
        ) or re.search(
            r'(?:设置|建|定|加|新增).{0,4}(?:闹钟|提醒|待办)',
            command_text,
            re.I
        ) or re.search(
            r'(?:每[天周月]|工作日|\d+[:：点时分秒号日周天月年后]+|明天|后天|明早|今晚|今早|早上|中午|下午|晚上|半小时后|\d+\s*小时后|\d+\s*分钟后).{0,12}(?:提醒我|叫我|通知我|叫醒我|设提醒|定闹钟|(?:开会|会议|日程|比赛|事项|待办)?提醒)',
            command_text,
            re.I
        ) or re.search(
            r'\b(?:remind\s+me|set\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|schedule\s+(?:a\s+)?reminder|set\s+(?:an\s+)?alarm|wake\s+me\s+up)\b',
            command_text,
            re.I
        )
    )

    if has_imperative_directive:
        return True

    # 3. 消费性/信息检索性提问（如“总结这篇关于日程提醒产品的网页”、“搜索提醒相关的开源项目”），严禁提升为提醒指令
    if re.search(r'(?:总结|概括|分析|调研|盘点|对比|了解|介绍|什么是|为何|为什么|搜索|查找|检索|查一下|找一下|有哪些|推荐|测评|评价|新闻|文章|网页|链接|内容)', clean):
        return False

    # 4. 其他普通文本严格判定为无提醒意图
    return False


def recover_text_tool_calls(
    text: str,
    user_prompt: Optional[str] = None,
    round_idx: int = 0
) -> List[Dict[str, Any]]:
    """
    Converts safe function-like calls inside an explicit plan into OpenAI tool-call envelopes.

    Plain prose is never executed, and mutating tools are excluded from recovery.
    Side-effecting tools like create_reminders require explicit user reminder intent.
    """
    has_reminder_intent = (
        has_explicit_reminder_intent(user_prompt)
        and has_explicit_reminder_time(user_prompt)
    )

    # Some smaller models emit one complete tool expression as assistant content instead
    # of using the native tool_calls field.
    standalone = _parse_function_call_expression((text or "").strip())
    if standalone and standalone["name"] in (
        "write_markdown", "create_reminders", "weather", "web_search",
        "fetch_page", "read_file", "read_skill", "scan_knowledge"
    ):
        if standalone["name"] != "create_reminders" or has_reminder_intent:
            return [
                {
                    "id": f"call_recovered_{round_idx}_standalone",
                    "type": "function",
                    "function": {
                        "name": standalone["name"],
                        "arguments": json.dumps(standalone["params"], ensure_ascii=False),
                    },
                }
            ]

    # Some models emit JSON arrays/objects with "call", "action", "function", or "tool_name", e.g. {"tool_name": "weather", "parameters": {...}}
    if any(k in (text or "") for k in ('"call"', '"action"', '"function"', '"tool"', '"tool_name"')):
        m_call = re.search(r'```(?:json)?\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*```', text or "")
        cand_str = m_call.group(1) if m_call else (text or "").strip()
        if not ((cand_str.startswith("[") and cand_str.endswith("]")) or (cand_str.startswith("{") and cand_str.endswith("}"))):
            cand_m = re.search(r'(\[[\s\S]*?\]|\{[\s\S]*?\})', text or "")
            if cand_m:
                cand_str = cand_m.group(1)
        if (cand_str.startswith("[") and cand_str.endswith("]")) or (cand_str.startswith("{") and cand_str.endswith("}")):
            try:
                p_val = json.loads(cand_str)
                items = p_val if isinstance(p_val, list) else [p_val]
                recovered_calls = []
                for item_idx, item in enumerate(items):
                    if isinstance(item, dict):
                        raw_name = str(item.get("call") or item.get("action") or item.get("function") or item.get("tool_name") or item.get("tool") or item.get("name") or "").strip()
                        clean_name = re.sub(r'^[a-zA-Z0-9_\-]+[:.]', '', raw_name).lower()
                        if clean_name == "search_web":
                            clean_name = "web_search"
                        if clean_name in ("web_search", "weather", "fetch_page", "read_file", "read_skill", "scan_knowledge", "write_markdown", "create_reminders"):
                            if clean_name == "create_reminders" and not has_reminder_intent:
                                continue
                            if "arguments" in item and isinstance(item["arguments"], dict):
                                c_args = item["arguments"]
                            elif "parameters" in item and isinstance(item["parameters"], dict):
                                c_args = item["parameters"]
                            elif "params" in item and isinstance(item["params"], dict):
                                c_args = item["params"]
                            else:
                                c_args = {k: v for k, v in item.items() if k not in ("call", "action", "function", "tool", "tool_name", "name", "type", "id")}
                            if clean_name == "create_reminders" and "reminders" not in c_args:
                                c_args = {"reminders": [c_args]}
                            recovered_calls.append({
                                "id": f"call_recovered_{round_idx}_call_{item_idx}",
                                "type": "function",
                                "function": {
                                    "name": clean_name,
                                    "arguments": json.dumps(c_args, ensure_ascii=False),
                                },
                            })
                if recovered_calls:
                    return recovered_calls
            except Exception:
                pass

    # Some smaller models emit JSON payloads like {"filename": "xxx.md", "content": "..."}
    if "filename" in (text or "") or "file_path" in (text or ""):
        m_json = re.search(r'```(?:json)?\s*(\{\s*[\s\S]*?"file(?:name|_path)"[\s\S]*?\})\s*```', text or "")
        cand_str = m_json.group(1) if m_json else (text or "").strip()
        if cand_str.startswith("{") and cand_str.endswith("}"):
            try:
                p_dict = json.loads(cand_str)
                if isinstance(p_dict, dict) and ("filename" in p_dict or "file_path" in p_dict) and ("content" in p_dict or "markdown" in p_dict or "text" in p_dict):
                    fname = str(p_dict.get("filename") or p_dict.get("file_path") or "").strip()
                    content = str(p_dict.get("content") or p_dict.get("markdown") or p_dict.get("text") or "")
                    if re.fullmatch(r"(?:/workspace/)?[a-zA-Z0-9_\-\u4e00-\u9fa5]+\.md", fname, re.I) and content.strip():
                        return [
                            {
                                "id": f"call_recovered_{round_idx}_standalone_json",
                                "type": "function",
                                "function": {
                                    "name": "write_markdown",
                                    "arguments": json.dumps({"file_path": fname, "content": content}, ensure_ascii=False),
                                },
                            }
                        ]
            except Exception:
                pass

    # Some smaller models emit JSON payloads like [{"title": "...", "run_at": "..."}] or {"reminders": [...]}
    # Hard gate: Side-effecting reminder creation is NEVER recovered unless user explicitly requested a reminder.
    if has_reminder_intent and any(k in (text or "") for k in ("reminders", "run_at", "scheduled_time")):
        m_json = re.search(r'```(?:json)?\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*```', text or "")
        cand_str = m_json.group(1) if m_json else (text or "").strip()
        if (cand_str.startswith("[") and cand_str.endswith("]")) or (cand_str.startswith("{") and cand_str.endswith("}")):
            try:
                p_val = json.loads(cand_str)
                if isinstance(p_val, list) and p_val and isinstance(p_val[0], dict):
                    first_item = p_val[0]
                    if any(k in first_item for k in ("run_at", "runAt", "scheduled_time", "time")):
                        return [
                            {
                                "id": f"call_recovered_{round_idx}_standalone_reminder_list",
                                "type": "function",
                                "function": {
                                    "name": "create_reminders",
                                    "arguments": json.dumps({"reminders": p_val}, ensure_ascii=False),
                                },
                            }
                        ]
                elif isinstance(p_val, dict) and "reminders" in p_val and isinstance(p_val["reminders"], list) and p_val["reminders"]:
                    return [
                        {
                            "id": f"call_recovered_{round_idx}_standalone_reminders_dict",
                            "type": "function",
                            "function": {
                                "name": "create_reminders",
                                "arguments": json.dumps(p_val, ensure_ascii=False),
                            },
                        }
                    ]
            except Exception:
                pass

    if not is_internal_plan_output(text):
        return []

    recovered: List[Dict[str, Any]] = []
    for line_idx, line in enumerate(text.splitlines()):
        parsed = _parse_function_call_line(line)
        if not parsed:
            continue
        if parsed["name"] == "create_reminders" and not has_reminder_intent:
            continue
        recovered.append(
            {
                "id": f"call_recovered_{round_idx}_{line_idx}",
                "type": "function",
                "function": {
                    "name": parsed["name"],
                    "arguments": json.dumps(parsed["params"], ensure_ascii=False),
                },
            }
        )
    return recovered
