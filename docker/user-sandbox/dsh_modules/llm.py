"""
LLM communications, tool call extraction and response cleanup for DeepSeek Harness.
"""

import json
import re
import urllib.request
import urllib.error
from .config import DEFAULT_PROXY_URL, VIRTUAL_API_KEY


def call_model_proxy(messages: list, model: str = "deepseek-chat") -> str:
    """Invokes the central model proxy through internal network streaming"""
    api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
    payload = {"model": model, "messages": messages, "temperature": 0.4, "max_tokens": 4096, "stream": True}
    req = urllib.request.Request(
        api_endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {VIRTUAL_API_KEY}"}
    )
    chunks = []
    with urllib.request.urlopen(req, timeout=300) as response:
        for line in response:
            l = line.decode("utf-8", errors="replace").strip()
            if not l.startswith("data:"):
                continue
            d = l[5:].strip()
            if d == "[DONE]":
                break
            try:
                data_obj = json.loads(d)
                if "error" in data_obj:
                    raise RuntimeError(data_obj["error"].get("message", "Model execution error"))
                chunk = data_obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                if chunk:
                    chunks.append(chunk)
            except json.JSONDecodeError:
                pass
    return "".join(chunks).strip()


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


def parse_tool_calls(text: str) -> list:
    """Parses tool calls from DSML, tool_call XML tags, or markdown code blocks"""
    tools = []
    # 1. 解析 DSML invoke 格式
    for m in re.finditer(r'<｜DSML｜invoke name="(?P<name>[^"]+)"[^>]*>(?P<body>.*?)(?:</｜DSML｜invoke>|</｜DSML｜>|$)', text, re.DOTALL):
        params = {pm.group("pname"): pm.group("pval").strip() for pm in re.finditer(r'<｜DSML｜parameter name="(?P<pname>[^"]+)"[^>]*>(?P<pval>.*?)</｜DSML｜parameter>', m.group("body"), re.DOTALL)}
        tools.append({"type": "dsml", "name": m.group("name"), "params": params, "raw": m.group(0)})

    # 2. 解析通用 <tool_call> ... (支持以 </tool_call> 或 </｜DSML｜> 闭合，并具备 JSON 语法容错)
    tool_call_matches = re.finditer(
        r'<tool_call>(.*?)(?:</tool_call>|</｜DSML｜(?:invoke)?>|</tool_calls>|$)',
        text,
        re.DOTALL
    )
    for m in tool_call_matches:
        raw_body = m.group(1).strip()
        if not raw_body:
            continue
        try:
            parsed = json.loads(raw_body)
            tools.append({
                "type": "json",
                "name": parsed.get("name", ""),
                "params": parsed.get("arguments", {}),
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

    # 3. 解析裸 JSON / Markdown JSON 代码块工具调用 (自愈兼容嵌套花括号、字符串转义与缺省闭合括号)
    if not tools:
        bare_tools = extract_bare_json_tool_calls(text)
        if bare_tools:
            tools.extend(bare_tools)

    # 4. 解析 markdown bash / sh / python 代码块工具调用（无论是否有前置或后置对话说明）
    if not tools:
        bash_matches = list(re.finditer(r'```(?:bash|sh|shell|zsh)?\s*\n([\s\S]*?)```', text))
        for m in bash_matches:
            cmd = m.group(1).strip()
            executable_prefixes = ("curl ", "python", "python3", "cat ", "ls ", "node ", "npm ", "pnpm ", "git ", "sh ", "bash ", "grep ", "find ", "sed ", "awk ", "dsh ", "cd ", "mkdir ", "wget ", "pip ", "set ", "echo ")
            if any(cmd.startswith(pfx) or f"\n{pfx}" in cmd for pfx in executable_prefixes):
                tools.append({"type": "bash", "name": "bash", "params": {"cmd": cmd}, "raw": m.group(0)})
                break

    # 5. 极端容错：模型未用代码块，直接输出以 curl/python3/sh 等开头的执行管道
    if not tools:
        cmd_candidate = text.strip()
        pipe_m = re.search(r'(?:^|\n\n)(curl\s+[^\n]+(?:\s*&&\s*python3\s*<<\s*[\'"]?EOF[\'"]?[\s\S]*?EOF)?)\s*$', cmd_candidate, re.DOTALL)
        if pipe_m:
            tools.append({"type": "bash", "name": "bash", "params": {"cmd": pipe_m.group(1).strip()}, "raw": pipe_m.group(1)})

    return tools


def clean_output(text: str) -> str:
    """Removes raw DSML, tool_call, bare tool JSON, and internal tags from final user output"""
    text = re.sub(r'<｜DSML｜tool_calls>.*?</｜DSML｜tool_calls>', '', text, flags=re.DOTALL)
    text = re.sub(r'<｜DSML｜invoke[^>]*>.*?(?:</｜DSML｜invoke>|</｜DSML｜>|$)', '', text, flags=re.DOTALL)
    text = re.sub(r'<tool_call>.*?(?:</tool_call>|</｜DSML｜(?:invoke)?>|</tool_calls>|$)', '', text, flags=re.DOTALL)

    bare_tools = extract_bare_json_tool_calls(text)
    for bt in bare_tools:
        raw_snippet = bt.get("raw")
        if raw_snippet and raw_snippet in text:
            text = text.replace(raw_snippet, "")

    # 移除残留的未执行或已执行 bash/sh 工具代码块
    text = re.sub(r'```(?:bash|sh|shell|zsh)?\s*\n(?:curl|python|python3|cat|ls|node|git|sh|bash|grep|find|sed|awk|dsh|cd |mkdir|wget|pip|set |echo)[\s\S]*?```', '', text)
    # 移除裸露的 curl / python 管道脚本
    text = re.sub(r'curl\s+[^\n]+(?:\s*&&\s*python3\s*<<\s*[\'"]?EOF[\'"]?[\s\S]*?EOF)?', '', text, flags=re.DOTALL)

    # 移除如「页面已抓取成功，现在解析...」「页面已抓到...」这类中间垫话
    filler_pats = [
        r'^(?:页面|网页|数据)?已抓[取到成功]+[，,。]?\s*(?:现在|接下来|正在)?解析[^\n]*\s*$',
        r'^(?:正在|接下来)?调用[^\n]*工具[^\n]*\s*$',
    ]
    for fp in filler_pats:
        text = re.sub(fp, '', text, flags=re.MULTILINE)

    text = re.sub(r'```(?:json)?\s*```', '', text)
    text = re.sub(r'</?(?:tool_call|tool_calls|｜DSML｜[^>]*)>', '', text)
    text = re.sub(r'<｜.*?｜>', '', text)
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
        r"(?:我|让我|我们)?(?:换用|改用|换成|换个|重新|再次|继续|尝试)?(?:更精确|更准|更详细)?(?:的)?(?:关键词|词组|检索词)?(?:来|去)?(?:搜索|查询|检索|抓取|获取|查找|查)",
        r"(?:我来|我将|我去|让我来|接下来|稍后|现在)?(?:搜索|查询|检索|查找|访问|抓取|查)(?:一下|这个|该|相关|看)",
        r"需要登录[，,。]?(?:我|我们)?(?:换用|改用|换|重新|尝试)",
    ]
    return any(re.search(p, cleaned) for p in action_patterns)
