"""
LLM communications, tool call extraction and response cleanup for DeepSeek Harness.
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error
from typing import Any, Optional, List, Dict, Tuple
from .config import DEFAULT_PROXY_URL, VIRTUAL_API_KEY


TRANSIENT_STREAM_TOKENS = (
    "aborted", "socket hang up", "econnreset", "bad gateway", "timeout",
    "socket disconnected", "network", "connection reset", "disconnected",
    "tls", "stream failed", "client network socket disconnected"
)


def _is_transient_error(err_msg: str, status_code: Optional[int] = None) -> bool:
    """Checks if an HTTP or stream error is transient and safe to retry."""
    lower = (err_msg or "").lower()
    if status_code in (500, 502, 503, 504):
        return True
    return any(kw in lower for kw in TRANSIENT_STREAM_TOKENS)


def _apply_stream_retry_backoff(
    attempt: int,
    deadline: Optional[float],
    chunks: List[str],
    tool_call_deltas: dict
) -> None:
    """Handles backoff delay and client reset notification between streaming retries."""
    backoff = 1.5 * (attempt + 1)
    if deadline is not None and time.monotonic() + backoff >= deadline:
        raise TimeoutError("Task total execution deadline exceeded during retry")
    time.sleep(backoff)
    if chunks:
        sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
        sys.stdout.flush()
    chunks.clear()
    tool_call_deltas.clear()


def _format_structured_tool_calls(tool_call_deltas: dict) -> List[Dict[str, Any]]:
    """Converts accumulated SSE tool call deltas into standard OpenAI tool calls list."""
    structured = []
    if tool_call_deltas:
        for _, tc in sorted(tool_call_deltas.items()):
            structured.append({
                "id": tc["id"],
                "type": "function",
                "function": {
                    "name": tc["name"].strip(),
                    "arguments": tc["arguments"].strip() or "{}"
                }
            })
    return structured


def _process_sse_data(
    data_str: str,
    chunks: List[str],
    tool_call_deltas: dict,
    start_time: float,
    ttft_ms: Optional[float],
    stream_deltas: bool = True
) -> Tuple[Optional[str], Optional[dict], Optional[float]]:
    """Parses SSE JSON data and updates streaming tokens and tool call deltas."""
    finish_reason = None
    usage = None
    try:
        data_obj = json.loads(data_str)
        if "error" in data_obj:
            raise RuntimeError(data_obj["error"].get("message", "Model execution error"))
        if data_obj.get("usage"):
            usage = data_obj["usage"]
        choices = data_obj.get("choices")
        if not choices:
            return None, usage, ttft_ms
        choice = choices[0]
        if choice.get("finish_reason"):
            finish_reason = choice["finish_reason"]
        delta = choice.get("delta", {})
        chunk = delta.get("content", "")
        if chunk:
            if ttft_ms is None:
                ttft_ms = (time.time() - start_time) * 1000
            chunks.append(chunk)
            if stream_deltas:
                sys.stdout.write(f"<<<DSH_DELTA:{json.dumps(chunk, ensure_ascii=False)}>>>\n")
                sys.stdout.flush()
        t_calls = delta.get("tool_calls")
        if t_calls and isinstance(t_calls, list):
            if ttft_ms is None:
                ttft_ms = (time.time() - start_time) * 1000
            for tc in t_calls:
                idx = tc.get("index", 0)
                if idx not in tool_call_deltas:
                    tool_call_deltas[idx] = {
                        "id": tc.get("id") or f"call_{idx}_{int(time.time()*1000)}",
                        "type": "function",
                        "name": "",
                        "arguments": ""
                    }
                elif tc.get("id") and not tool_call_deltas[idx].get("id"):
                    tool_call_deltas[idx]["id"] = tc.get("id")
                fn = tc.get("function", {})
                if fn.get("name"):
                    tool_call_deltas[idx]["name"] += fn["name"]
                if fn.get("arguments"):
                    tool_call_deltas[idx]["arguments"] += fn["arguments"]
    except json.JSONDecodeError:
        pass
    return finish_reason, usage, ttft_ms


def detect_unexecuted_script_leak(text: str) -> bool:
    """
    Detects if the model directly dumped executable python/shell/HTML/script code
    or file-writing commands (e.g. write_file, cat >, heredocs) that should have been run in bash
    to create/modify physical workspace deliverables.
    """
    if not text:
        return False

    # 1. 检测文本中伪工具调用或 shell 写入命令（如 write_file << 'EOF' ..., cat > /workspace/...）
    heredoc_write_patterns = [
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s+[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)',
        r'(?:write_file|cat)\s+>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?',
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n([\s\S]*?)(?:\n\1|\Z)',
        r'echo\s+[\'"][\s\S]+?[\'"]\s*>>?\s*(?:/workspace/|[a-zA-Z0-9_\-\.]+\.(?:html|py|sh|json|csv|docx|xlsx|txt))',
        r'tee\s+(?:/workspace/|[a-zA-Z0-9_\-\.]+\.(?:html|py|sh|json|csv|docx|xlsx|txt))'
    ]
    for hp in heredoc_write_patterns:
        if re.search(hp, text, re.I):
            return True

    # 2. 检测所有 markdown 代码块中的文件持久化调用或完整应用
    blocks = re.findall(r'```([a-zA-Z0-9_\-]*)\s*\n([\s\S]*?)```', text)
    for lang, b in blocks:
        b_str = b.strip()
        lang_lower = lang.lower()
        # A: 文件写入或数据导出脚本
        if any(k in b_str for k in [
            ".output(", ".save(", "to_excel(", "to_csv(", "savefig(",
            "/workspace/", "fpdf", "openpyxl", "docx", "pptx",
            "write_file", "cat >", "cat <<", "Path('/workspace", "Path(\"/workspace"
        ]):
            return True
        # B: 包含完整 HTML 文档标签（<!DOCTYPE html 或 <html）的代码块
        if ("<!doctype html" in b_str.lower() or "<html" in b_str.lower()) and len(b_str) > 100:
            return True
        # C: Bash/Python 脚本且代码长度较长（超过 8 行且包含业务逻辑）
        if lang_lower in ["python", "py", "bash", "sh", "shell"] and len(b_str.splitlines()) > 8:
            return True

    return False


def call_model_proxy(
    messages: list,
    model: str = None,
    tools: list = None,
    timeout: int = None,
    deadline: float = None,
    temperature: float = None,
    max_tokens: int = None,
    policy: Any = None,
    stream_deltas: Optional[bool] = None
) -> dict:
    """Invokes the central model proxy through internal network streaming, returning structured response with metrics and native tool calls"""
    from .runtime_policy import RuntimePolicy
    active_policy = policy if policy is not None else RuntimePolicy.from_env()

    # 当传入 tools 列表时，属于 ReAct 工具调用轮次，默认抑制逐字流式打字机，防止模型工具内部调用指令或草稿代码泄漏到页面
    effective_stream_deltas = stream_deltas if stream_deltas is not None else (not bool(tools))

    api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
    effective_max_tokens = max_tokens if max_tokens is not None else active_policy.max_tokens
    effective_temp = temperature if temperature is not None else active_policy.temperature
    effective_socket_to = float(timeout) if timeout is not None else float(active_policy.model_socket_timeout)

    payload = {
        "messages": messages,
        "temperature": effective_temp,
        "max_tokens": effective_max_tokens,
        "stream": True
    }
    if model and model != "default":
        payload["model"] = model
    else:
        payload["model"] = "default"
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    req = urllib.request.Request(
        api_endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {VIRTUAL_API_KEY}"}
    )
    chunks = []
    tool_call_deltas = {}
    finish_reason = None
    usage = {}
    start_time = time.time()
    ttft_ms = None

    max_retries = active_policy.model_max_retries
    for attempt in range(max_retries + 1):
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Task total execution deadline exceeded")
            effective_timeout = max(1.0, min(effective_socket_to, remaining))
        else:
            effective_timeout = effective_socket_to

        try:
            with urllib.request.urlopen(req, timeout=effective_timeout) as response:
                for line in response:
                    if deadline is not None and time.monotonic() >= deadline:
                        raise TimeoutError("Task total execution deadline exceeded while receiving model stream")
                    l = line.decode("utf-8", errors="replace").strip()
                    if not l.startswith("data:"):
                        continue
                    d = l[5:].strip()
                    if d == "[DONE]":
                        break
                    fr, us, ttft_ms = _process_sse_data(
                        d, chunks, tool_call_deltas, start_time, ttft_ms, stream_deltas=effective_stream_deltas
                    )
                    if fr:
                        finish_reason = fr
                    if us:
                        usage = us
            break
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            if _is_transient_error(err_msg, e.code) and attempt < max_retries:
                _apply_stream_retry_backoff(attempt, deadline, chunks, tool_call_deltas)
                continue
            raise urllib.error.HTTPError(e.url, e.code, err_msg, e.hdrs, None)
        except (urllib.error.URLError, ConnectionResetError):
            if attempt < max_retries:
                _apply_stream_retry_backoff(attempt, deadline, chunks, tool_call_deltas)
                continue
            raise
        except RuntimeError as e:
            err_msg = str(e)
            if _is_transient_error(err_msg) and attempt < max_retries:
                _apply_stream_retry_backoff(attempt, deadline, chunks, tool_call_deltas)
                continue
            raise

    total_ms = (time.time() - start_time) * 1000
    res_text = "".join(chunks).strip()
    structured_calls = _format_structured_tool_calls(tool_call_deltas)

    # 识别当前轮次是否包含工具调用（结构化原生 tool_calls、裸 JSON 工具调用、Markdown 块工具调用或 DSML/XML 标签）
    has_tool_calls = (
        bool(structured_calls) or
        finish_reason == "tool_calls" or
        bool(extract_bare_json_tool_calls(res_text)) or
        bool(extract_markdown_tool_calls(res_text)) or
        "<tool_call>" in res_text or
        "|DSML|" in res_text
    )

    if has_tool_calls:
        # 工具调用属于沙箱内部执行过程，严禁在前端显示工具内部命令、前置垫话或执行草稿
        sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
        sys.stdout.flush()
    elif not effective_stream_deltas and res_text:
        # 无工具调用且此前因 tools 处于缓冲模式：
        # 若未发生未执行脚本泄漏，则视为向用户直接回复的最终文本，输出打字机流
        if not detect_unexecuted_script_leak(res_text):
            sys.stdout.write(f"<<<DSH_DELTA:{json.dumps(res_text, ensure_ascii=False)}>>>\n")
            sys.stdout.flush()

    return {
        "content": res_text,
        "tool_calls": structured_calls,
        "finish_reason": finish_reason or "stop",
        "usage": usage,
        "ttft_ms": round(ttft_ms if ttft_ms is not None else total_ms, 2),
        "total_ms": round(total_ms, 2)
    }


def extract_bare_json_tool_calls(text: str) -> list:
    """Extracts tool calls from bare JSON or markdown code blocks with string-aware bracket balancing and auto-healing"""
    tools = []
    pos = 0
    while pos < len(text):
        idx = text.find("{", pos)
        if idx == -1:
            break

        preview = text[idx:idx + 250]
        if not any(k in preview for k in ['"name"', '"tool"', '"action"', '"arguments"', '"parameters"']):
            pos = idx + 1
            continue

        in_string = False
        escape = False
        depth = 0
        end_idx = idx
        for i in range(idx, len(text)):
            c = text[i]
            if escape:
                escape = False
                continue
            if c == '\\':
                escape = True
                continue
            if c == '"':
                in_string = not in_string
                continue
            if not in_string:
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        end_idx = i + 1
                        break

        raw_match = text[idx:end_idx] if depth == 0 else text[idx:]
        parsed = None
        for fix in ["", "}", "}}"]:
            candidate = raw_match.strip() + fix
            try:
                parsed = json.loads(candidate)
                break
            except Exception:
                try:
                    parsed, _ = json.JSONDecoder(strict=False).raw_decode(candidate)
                    break
                except Exception:
                    pass

        if parsed and isinstance(parsed, dict):
            t_name = parsed.get("name") or parsed.get("tool") or parsed.get("action")
            t_params = (
                parsed.get("arguments")
                or parsed.get("parameters")
                or parsed.get("params")
                or parsed.get("action_input")
            )
            if t_name and isinstance(t_params, dict):
                tools.append({
                    "type": "bare_json",
                    "name": str(t_name),
                    "params": t_params,
                    "raw": raw_match,
                })
                pos = end_idx if depth == 0 else len(text)
                continue

        pos = idx + 1
    return tools


# 通用 XML 与 Markdown 标签式已知工具集合
XML_KNOWN_TOOLS = {
    'weather', 'web_search', 'fetch_page', 'read_file', 'patch_file',
    'bash', 'scan_knowledge', 'read_skill', 'send_file', 'vision_inspect', 'image_gen',
    'read_workspace_file', 'list_workspace_files', 'load_skill', 'use_skill', 'skill', 'get_skill',
    'create_reminders', 'create_reminder', 'set_reminder', 'set_reminders',
    'add_reminder', 'add_reminders', 'remind', 'reminder'
}


def extract_markdown_tool_calls(text: str) -> list:
    """
    Parses tool calls when the model emits markdown code blocks or backtick tool identifiers,
    such as:
    `create_reminders`
    ```json
    {
      "title": "去洗澡",
      "content": "去洗澡",
      "scheduled_time": "2026-09-25T21:35:00+08:00",
      "channel": "微信+站内"
    }
    ```
    or
    ```create_reminders
    { ... }
    ```
    """
    if not text or "```" not in text:
        return []

    tools = []
    known_tools = set(XML_KNOWN_TOOLS)
    try:
        from .tools import SANDBOX_TOOLS
        for t in SANDBOX_TOOLS:
            fn = t.get("function", {})
            if fn.get("name"):
                known_tools.add(fn["name"])
    except Exception:
        pass

    # 模式 1: 反引号或中文标识在 ``` 前面：`tool_name`\n```json\n{...}\n```
    p1 = r'(?:(?:调用|使用)?(?:工具|函数)?[:：\s]*[`"\'“]?([a-zA-Z0-9_\-]+)[`"\'”]?\s*[\n\r]+)```(?:json)?\s*\n?(\{[\s\S]*?\})\s*```'
    for m in re.finditer(p1, text, re.I):
        t_name = m.group(1).strip()
        body = m.group(2).strip()
        if t_name in known_tools:
            try:
                params = json.loads(body)
                if isinstance(params, dict):
                    tools.append({
                        "type": "markdown_code_block",
                        "name": t_name,
                        "params": params,
                        "raw": m.group(0)
                    })
            except Exception:
                pass

    # 模式 2: 代码块标签直接作为工具名：```create_reminders\n{...}\n``` 或 ```json:create_reminders\n{...}\n```
    p2 = r'```(?:json:|tool:|function:)?([a-zA-Z0-9_\-]+)\s*\n(\{[\s\S]*?\})\s*```'
    for m in re.finditer(p2, text, re.I):
        t_name = m.group(1).strip()
        body = m.group(2).strip()
        if t_name in known_tools and not any(t["raw"] == m.group(0) for t in tools):
            try:
                params = json.loads(body)
                if isinstance(params, dict):
                    tools.append({
                        "type": "markdown_code_block",
                        "name": t_name,
                        "params": params,
                        "raw": m.group(0)
                    })
            except Exception:
                pass

    return tools


XML_DEFAULT_PARAM_MAP = {
    'read_skill': 'skill_name',
    'load_skill': 'skill_name',
    'use_skill': 'skill_name',
    'get_skill': 'skill_name',
    'skill': 'skill_name',
    'bash': 'cmd',
    'web_search': 'query',
    'fetch_page': 'url',
    'weather': 'city',
    'read_file': 'path',
    'read_workspace_file': 'path',
    'patch_file': 'path',
    'send_file': 'file_path',
    'vision_inspect': 'image_path',
    'image_gen': 'prompt',
    'scan_knowledge': 'query',
}


def parse_xml_tool_calls(text: str) -> list:
    """
    通用 XML/标签式工具调用解析器：支持模型直接输出 XML 标签调用工具。
    兼容自闭合标签、属性传参、嵌套子标签以及直接文本主参数传递：
    例如：
    - <read_skill skill_name="web-prototype"/>
    - <bash cmd="ls -la"/>
    - <web_search query="最新进展"/>
    - <read_skill>web-prototype</read_skill>
    - <invoke name="read_skill" skill_name="pdf"/>
    - <invoke name="bash"><parameter name="cmd">pwd</parameter></invoke>
    """
    tools = []
    known_tools = set(XML_KNOWN_TOOLS)
    try:
        from .tools import SANDBOX_TOOLS
        for t in SANDBOX_TOOLS:
            fn = t.get("function", {})
            if fn.get("name"):
                known_tools.add(fn["name"])
    except Exception:
        pass

    tag_names = '|'.join(list(known_tools) + ['invoke', 'function', 'function_call'])
    pattern = rf'<(?P<tname>{tag_names})(?P<attrs>\s+[^>]*?)?(?:/>|>(?P<body>.*?)</(?P=tname)>)'
    for m in re.finditer(pattern, text, re.DOTALL):
        raw_tag = m.group(0)
        tname = m.group('tname')
        attrs = m.group('attrs') or ''
        body = (m.group('body') or '').strip()
        params = {}
        for am in re.finditer(r'([a-zA-Z0-9_-]+)=["\'](.*?)["\']', attrs):
            params[am.group(1)] = am.group(2)

        # 处理通用 <invoke name="tool_name" ...> 或 <function name="tool_name" ...>
        if tname in ('invoke', 'function', 'function_call'):
            tname = params.pop('name', '') or params.pop('tool', '')
            if not tname:
                continue

        # 解析 body 内参数
        if body:
            param_tags = list(re.finditer(r'<parameter\s+name=["\']([^"\']+)["\'][^>]*>(.*?)</parameter>', body, re.DOTALL))
            if param_tags:
                for pt in param_tags:
                    params[pt.group(1).strip()] = pt.group(2).strip()
            else:
                child_tags = list(re.finditer(r'<(?P<cname>[a-zA-Z0-9_-]+)>(?P<cval>.*?)</(?P=cname)>', body, re.DOTALL))
                if child_tags:
                    for ct in child_tags:
                        params[ct.group('cname').strip()] = ct.group('cval').strip()
                elif not params:
                    def_param = XML_DEFAULT_PARAM_MAP.get(tname, 'input')
                    params[def_param] = body

        if tname:
            tools.append({'type': 'xml', 'name': tname, 'params': params, 'raw': raw_tag})
    return tools


def parse_tool_calls(text: str, is_guide: bool = False) -> list:
    """Parses tool calls from DSML, tool_call XML tags, direct XML tags, or markdown code blocks"""
    tools = []
    # 1. 解析 DSML / DSML calls 格式 (支持单竖线 ｜/| 与双竖线 ｜｜/||，支持空格、calls 外层容器与 arguments JSON 展开)
    dsml_pattern = r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke name="(?P<name>[^"]+)"[^>]*>(?P<body>.*?)(?:</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke>|</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}>|$)'
    for m in re.finditer(dsml_pattern, text, re.DOTALL):
        params = {}
        for pm in re.finditer(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter name="(?P<pname>[^"]+)"[^>]*>(?P<pval>.*?)</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter>', m.group("body"), re.DOTALL):
            pname = pm.group("pname").strip()
            pval = pm.group("pval").strip()
            if pname in ["arguments", "parameters", "params"]:
                try:
                    parsed_args = json.loads(pval)
                    if isinstance(parsed_args, dict):
                        params.update(parsed_args)
                        continue
                except Exception:
                    pass
            params[pname] = pval
        tools.append({"type": "dsml", "name": m.group("name"), "params": params, "raw": m.group(0)})

    # 2. 解析通用 <tool_call> ... (支持以 </tool_call> 或 </｜DSML｜> 闭合，并具备 JSON 语法容错)
    tool_call_matches = re.finditer(
        r'<tool_call>(.*?)(?:</tool_call>|</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}(?:\s*invoke)?>|</tool_calls>|$)',
        text,
        re.DOTALL
    )
    for m in tool_call_matches:
        raw_body = m.group(1).strip()
        if not raw_body:
            continue
        try:
            parsed = json.loads(raw_body)
            args = parsed.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    pass
            tools.append({
                "type": "json",
                "name": parsed.get("name", ""),
                "params": args if isinstance(args, dict) else {},
                "raw": m.group(0)
            })
            continue
        except Exception:
            pass

        # 容错提取：当参数内包含未转义双引号、复杂换行或嵌套管道时
        try:
            name_m = re.search(r'"name":\s*"([^"]+)"', raw_body)
            t_name = name_m.group(1) if name_m else "bash"
            t_params = {}
            args_m = re.search(r'"arguments":\s*\{(.*)\}', raw_body, re.DOTALL)
            if args_m:
                inner = args_m.group(1).strip()
                try:
                    t_params = json.loads("{" + inner + "}")
                except Exception:
                    cmd_m = re.search(r'"(?:cmd|command)":\s*"(.*)"\s*$', inner, re.DOTALL)
                    query_m = re.search(r'"(?:query|__search_query|q)":\s*"(.*)"\s*$', inner, re.DOTALL)
                    if cmd_m:
                        t_params["cmd"] = cmd_m.group(1).strip()
                    elif query_m:
                        t_params["query"] = query_m.group(1).strip()
            if t_name and t_params:
                tools.append({"type": "json", "name": t_name, "params": t_params, "raw": m.group(0)})
        except Exception:
            pass

    # 3. 解析通用 XML / 标签式工具调用 (如 <read_skill skill_name="..."/>, <bash cmd="..."/>)
    if not tools:
        xml_tools = parse_xml_tool_calls(text)
        if xml_tools:
            tools.extend(xml_tools)

    # 4. 解析 Markdown 代码块式工具调用 (如 `create_reminders`\n```json\n{...}\n``` 或 ```create_reminders\n{...}\n```)
    if not tools:
        md_tools = extract_markdown_tool_calls(text)
        if md_tools:
            tools.extend(md_tools)

    # 5. 解析裸 JSON / Markdown JSON 代码块工具调用 (自愈兼容嵌套花括号、字符串转义与缺省闭合括号)
    if not tools:
        bare_tools = extract_bare_json_tool_calls(text)
        if bare_tools:
            tools.extend(bare_tools)

    # 严禁将普通 markdown ```bash 或 ```python 文本代码块自动推断升级为命令行执行
    # 防止不可信网页/文件注入 prompt 导致未授权命令执行。所有工具执行必须经由模型原生/结构化/显式标签调用。
    return tools


def clean_output(text: str, is_guide: bool = False) -> str:
    """Removes raw DSML, tool_call, bare tool JSON, and internal tags from final user output"""
    text = re.sub(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*(?:calls|tool_calls)>.*?</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*(?:calls|tool_calls)>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke[^>]*>.*?(?:</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke>|</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}>|$)', '', text, flags=re.DOTALL)
    text = re.sub(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[\s\S]*$', '', text)
    text = re.sub(r'<tool_call>.*?(?:</tool_call>|</[｜|]{1,2}\s*DSML\s*[｜|]{1,2}(?:\s*invoke)?>|</tool_calls>|$)', '', text, flags=re.DOTALL)

    xml_tools = parse_xml_tool_calls(text)
    for xt in xml_tools:
        raw_snippet = xt.get("raw")
        if raw_snippet and raw_snippet in text:
            text = text.replace(raw_snippet, "")

    md_tools = extract_markdown_tool_calls(text)
    for mt in md_tools:
        raw_snippet = mt.get("raw")
        if raw_snippet and raw_snippet in text:
            text = text.replace(raw_snippet, "")

    bare_tools = extract_bare_json_tool_calls(text)
    for bt in bare_tools:
        raw_snippet = bt.get("raw")
        if raw_snippet and raw_snippet in text:
            text = text.replace(raw_snippet, "")

    # 移除裸露的命令行执行管道遗留
    text = re.sub(r'curl\s+[^\n]+(?:\s*&&\s*python3\s*<<\s*[\'"]?EOF[\'"]?[\s\S]*?EOF)?', '', text, flags=re.DOTALL)

    # 移除如「页面已抓取成功，现在解析...」「我需要使用 bash 工具...」这类工具调用过程中的垫话与前置说明
    filler_pats = [
        r'^(?:页面|网页|数据)?已抓[取到成功]+[，,。]?\s*(?:现在|接下来|正在)?解析[^\n]*\s*$',
        r'^(?:正在|接下来|下面)?(?:调用|使用)[^\n]*工具[^\n]*\s*$',
        r'^(?:我需要|我将|让我|我先)?\s*使用\s*[a-zA-Z0-9_\-]+\s*工具[^\n]*\s*$',
        r'^(?:我来|让我)?\s*执行(?:以下)?命令[：:]?\s*$',
    ]
    for fp in filler_pats:
        text = re.sub(fp, '', text, flags=re.MULTILINE)

    # 移除意外残留的未执行文件写入 heredoc 脚本（严禁向用户直接显示工具内部的 cat > 或 write_file 脚本）
    heredoc_strips = [
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s+[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n[\s\S]*?(?:\n\1|\Z)',
        r'(?:write_file|cat)\s+>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*\n[\s\S]*?(?:\n\2|\Z)',
        r'(?:write_file|cat)\s*<<\s*[\'"]?([A-Za-z0-9_\-]+)[\'"]?\s*>\s*[\'"]?(/workspace/[^\s\'"\n]+|[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)[\'"]?\s*\n[\s\S]*?(?:\n\1|\Z)'
    ]
    for hs in heredoc_strips:
        text = re.sub(hs, '', text, flags=re.IGNORECASE)

    text = re.sub(r'```(?:json)?\s*```', '', text)
    known_tool_pats = '|'.join(list(XML_KNOWN_TOOLS) + ['invoke', 'function', 'function_call', 'parameter', 'tool_call', 'tool_calls'])
    text = re.sub(rf'</?(?:{known_tool_pats})(?:\s+[^>]*?)?/?>', '', text)
    text = re.sub(r'</?(?:tool_call|tool_calls|[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[^>]*)>', '', text)
    text = re.sub(r'<[｜|]{1,2}[\s\S]*?[｜|]{1,2}>', '', text)
    text = text.replace('<<<DSH_DELTA_RESET>>>', '')
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def is_promising_action(text: str) -> bool:
    """
    Detects if the model's output is an intermediate action promise or continuation intent
    (e.g., '微博页面需要登录，我换用更精确的关键词组合来搜索这个热搜话题的具体内容。')
    without having emitted an actual executable tool call tag.
    """
    cleaned = clean_output(text).strip()
    if not cleaned or len(cleaned) > 160:
        return False

    action_patterns = [
        r"(?:我|让我|我们)?(?:换用|改用|换成|换个|重新|再次|继续|尝试)[^，。！？\n]{0,25}(?:搜索|查询|检索|抓取|获取|查找)",
        r"(?:关键词|词组|检索词)[^，。！？\n]{0,15}(?:搜索|查询|检索|抓取|获取|查找)",
        r"(?:我来|我将|我去|让我来|接下来|稍后|现在)\s*(?:去|来)?\s*(?:搜索|查询|检索|查找|访问|抓取|查)(?:一下|这个|该|相关|看)?",
        r"(?:我|让我)?\s*(?:搜索|查询|检索|查找|访问|抓取|查)一下",
        r"需要登录[，,。]?(?:我|我们)?(?:换用|改用|换|重新|尝试)",
    ]
    return any(re.search(p, cleaned) for p in action_patterns)
