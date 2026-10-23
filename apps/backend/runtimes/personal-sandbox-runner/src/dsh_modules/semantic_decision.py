"""Domain-neutral, buffered structured decisions with bounded transport and telemetry."""

import json
import re
import time
from dataclasses import replace

from .llm import call_model_proxy
from .runtime_policy import RuntimePolicy


def ground_user_quote(quote, texts):
    """Resolve whitespace-only normalization back to an actual user source span."""
    if not isinstance(quote, str) or not quote.strip():
        return None
    wanted = ''.join(quote.split())
    for text in texts:
        positions = [m.start() for m in re.finditer(r'\S', text)]
        compact = ''.join(text[p] for p in positions)
        at = compact.find(wanted)
        if at >= 0:
            return text[positions[at]:positions[at + len(wanted) - 1] + 1]
    return None


def structured_decision(instructions, payload, tool, model, policy, telemetry, deadline,
                        guard, max_tokens=768, caller=None):
    remaining = deadline - time.monotonic() if deadline is not None else 30
    if remaining < 2:
        raise ValueError('语义决策剩余时间不足')
    active = replace(policy or RuntimePolicy.from_env(), thinking=False, reasoning_effort=None, model_max_retries=0)
    started = time.monotonic(); recorded = False
    try:
        response = (caller or call_model_proxy)([
            {'role': 'system', 'content': instructions + '\n通过唯一的结构化函数提交结论。函数仅记录决策，没有外部副作用。'},
            {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False, default=str)},
        ], model=model, tools=[tool], tool_choice='required', timeout=min(30, remaining), deadline=deadline,
            temperature=0, max_tokens=max_tokens, policy=active, stream_deltas=False)
        telemetry.record_llm_response(response, is_first_round=telemetry.llm_invocations == 0)
        recorded = True
        if response.get('finish_reason') not in {'stop', 'tool_calls'}:
            raise ValueError('语义决策响应未完整结束')
        calls = response.get('tool_calls') or []
        if calls:
            if len(calls) != 1 or calls[0].get('function', {}).get('name') != tool['function']['name']:
                raise ValueError('调用了非决策函数')
            raw = calls[0]['function']['arguments']
            result = json.loads(raw) if isinstance(raw, str) else raw
        else:
            raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', response.get('content', '').strip())
            result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('语义决策必须返回对象')
        return result
    except Exception as error:
        if not recorded:
            telemetry.record_llm_response({'content': '', 'finish_reason': 'error',
                'total_ms': (time.monotonic() - started) * 1000}, is_first_round=telemetry.llm_invocations == 0)
        telemetry.record_guard(guard, 'reject', type(error).__name__)
        raise ValueError('语义决策不可用或响应无效') from error
