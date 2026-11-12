"""Shared non-streaming image transport; callers own interpretation and publication."""
import base64
import json
import time
import urllib.request
import uuid

from .config import DEFAULT_PROXY_URL, VIRTUAL_API_KEY


def request_image_completion(image_bytes, mime, prompt, model, *, max_tokens=8192,
                             timeout=180, telemetry=None, purpose='pdf_layout_analysis',
                             api_endpoint=None, api_key=None):
    call_id, started, usage = uuid.uuid4().hex, time.monotonic(), {}
    if telemetry:
        telemetry.checkpoint('model_started', {'call_id': call_id, 'purpose': purpose, 'model': model})
    try:
        payload = {'model': model, 'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': prompt}, {'type': 'image_url', 'image_url': {
                'url': f'data:{mime};base64,' + base64.b64encode(image_bytes).decode('ascii'),
                'detail': 'auto'}}]}], 'temperature': .2, 'max_tokens': max_tokens,
            'thinking': False, 'stream': False}
        request = urllib.request.Request(
            api_endpoint or DEFAULT_PROXY_URL.rstrip('/') + '/chat/completions',
            data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (api_key if api_key is not None else VIRTUAL_API_KEY)})
        with urllib.request.urlopen(request, timeout=max(.1, timeout)) as response:
            data = json.loads(response.read().decode())
        usage = data.get('usage') or {}
        if telemetry:
            telemetry.record_auxiliary_call(purpose, usage, (time.monotonic() - started) * 1000,
                                            data.get('model') or model, call_id=call_id)
        return data
    except Exception as error:
        if telemetry:
            telemetry.record_model_failure(call_id=call_id, purpose=purpose, model=model,
                total_ms=(time.monotonic() - started) * 1000, code='image_transport_failed', usage=usage,
                details={'error_type': type(error).__name__, 'error_message': str(error)})
        raise
