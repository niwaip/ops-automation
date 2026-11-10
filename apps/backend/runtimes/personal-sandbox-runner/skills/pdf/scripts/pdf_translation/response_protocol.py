"""Parse complete JSON replies and retain rejected responses as private evidence."""
import json
from pathlib import Path
import re
import uuid

from .contracts import TranslationError, write_json


def json_response(content):
    text = content.strip()
    # Parse the entire response first: a translated string may itself contain fences.
    candidates = [text]
    fence = re.fullmatch(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if fence:
        candidates.append(fence.group(1).strip())
    elif not text.startswith(('{', '[')):
        start, end = text.find('{'), text.rfind('}')
        if 0 <= start < end:
            candidates.append(text[start:end + 1])
    last_error = None
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except (ValueError, TypeError) as error:
            last_error = error
        else:
            if isinstance(value, dict):
                return value
            last_error = ValueError('expected JSON object')
            break
    error = TranslationError('model_protocol_failed', '模型未返回完整JSON对象')
    error.details = {'parse_error': str(last_error),
                     **{key: getattr(last_error, key) for key in ('pos', 'lineno', 'colno')
                        if hasattr(last_error, key)}}
    raise error from last_error


def record_rejection(folder, result, error):
    path = Path(folder) / 'translation-rejected' / (uuid.uuid4().hex + '.json')
    metadata = {key: result.get(key) for key in
                ('call_id', 'model', 'finish_reason', 'finish_reason_source', 'received_done', 'usage')}
    metadata.update(error_code=error.code, message=str(error),
                    **getattr(error, 'details', {}))
    write_json(path, dict(metadata, content=result.get('content') or ''))
    error.details = dict(metadata, response_path=str(path))
    return error.details
