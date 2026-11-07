"""Use the installed DSH proxy and record child calls for the parent ledger."""
import json
import os
from pathlib import Path
import re
import threading
import time

from dsh_modules.llm import call_model_proxy
from dsh_modules.model_image_transport import request_image_completion
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from .contracts import TranslationError, check_time


class EventFile:
    def __init__(self, path, job_id):
        self.path, self.job_id, self.lock = Path(path), job_id, threading.Lock()

    def append(self, event, data):
        record = {'event': event, 'job_id': self.job_id, 'data': data}
        with self.lock:
            with self.path.open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(record, ensure_ascii=False) + '\n')


def json_response(content):
    text = content.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        text = match.group(1).strip()
    else:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            text = text[start:end+1].strip()
    try:
        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError('expected object')
        return value
    except (ValueError, TypeError) as error:
        raise TranslationError('model_protocol_failed', '模型未返回完整JSON对象') from error


class ModelGateway:
    def __init__(self, folder, context, deadline):
        self.deadline = deadline if deadline is not None else (time.monotonic() + 300)
        self.context, self.folder = context, Path(folder)
        self.telemetry = TelemetryStats()
        self.telemetry._journal = EventFile(Path(folder) / 'model-events.jsonl', context['job_id'])
        self.policy = RuntimePolicy.from_env()
        self.policy.thinking = False
        self.policy.model_max_retries = min(self.policy.model_max_retries, 1)

    def layout(self, image, prompt):
        check_time(self.deadline)
        last_error = None
        for attempt in range(3):
            try:
                check_time(self.deadline)
                data = request_image_completion(Path(image).read_bytes(), 'image/png', prompt,
                    self.context.get('vision_model') or os.getenv('DSH_VISION_MODEL') or 'vision',
                    max_tokens=10000, timeout=min(60, self.deadline - time.monotonic()),
                    telemetry=self.telemetry, purpose='pdf_layout_analysis')
                choices = data.get('choices') or []
                if not choices or choices[0].get('finish_reason') != 'stop':
                    raise TranslationError('model_protocol_failed', '布局分析响应不完整')
                content = choices[0].get('message', {}).get('content') or ''
                try:
                    return json_response(content)
                except TranslationError:
                    # Keep the rejected reply for audit; it is otherwise unrecoverable.
                    raw = self.folder / f'layout-rejected-{time.time_ns()}.txt'
                    raw.write_text(content, encoding='utf-8')
                    raise
            except TranslationError:
                raise
            except Exception as e:
                last_error = e
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
                else:
                    raise last_error

    def translate(self, prompt):
        check_time(self.deadline)
        # 职能分割：翻译层保持纯净自然语言，不前置注入 __PDF_NUM_*__ 伪代码 Token
        # 保护机制与数值校验由后置门禁 (validation gate) 独立承担
        use_opaque_tokens = os.getenv('DSH_PDF_OPAQUE_TOKENS', '0') == '1'
        protected = None
        if use_opaque_tokens:
            from .protected_numbers import protect_prompt, restore_response
            prompt, protected = protect_prompt(prompt)
        timeout = min(90, max(5, self.deadline - time.monotonic())) if self.deadline is not None else 90
        result = call_model_proxy([{'role': 'user', 'content': prompt}],
            model=self.context.get('model') or os.getenv('DSH_MODEL') or 'default',
            max_tokens=8192, temperature=.1, stream_deltas=False, deadline=self.deadline,
            timeout=timeout, policy=self.policy,
            purpose='pdf_translation', telemetry=self.telemetry)
        if result.get('finish_reason') != 'stop' or not result.get('received_done'):
            raise TranslationError('translation_incomplete', '翻译响应未完整结束，不能回填原文')
        raw = json_response(result.get('content') or '')
        if use_opaque_tokens and protected is not None:
            return restore_response(raw, protected)
        return raw
