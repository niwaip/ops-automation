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
    r"^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)\s*[。.;；]?\s*$"
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
    try:
        expression = ast.parse(source.strip(), mode="eval").body
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

    return {"name": tool_name, "params": params}


def is_internal_plan_output(text: str) -> bool:
    """Detects planning traces that must not be promoted to a user-visible final answer."""
    if not text or not text.strip():
        return False
    stripped = text.strip()
    standalone_action = _parse_function_call_expression(stripped)
    if standalone_action and standalone_action["name"] == "write_markdown":
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


def recover_text_tool_calls(text: str, round_idx: int = 0) -> List[Dict[str, Any]]:
    """
    Converts safe function-like calls inside an explicit plan into OpenAI tool-call envelopes.

    Plain prose is never executed, and mutating tools are excluded from recovery.
    """
    # Some smaller models emit one complete tool expression as assistant content instead
    # of using the native tool_calls field. The dedicated Markdown writer is safe to
    # recover because its parser only accepts a basename under /workspace and literal text.
    standalone = _parse_function_call_expression((text or "").strip())
    if standalone and standalone["name"] == "write_markdown":
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

    if not is_internal_plan_output(text):
        return []

    recovered: List[Dict[str, Any]] = []
    for line_idx, line in enumerate(text.splitlines()):
        parsed = _parse_function_call_line(line)
        if not parsed:
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
