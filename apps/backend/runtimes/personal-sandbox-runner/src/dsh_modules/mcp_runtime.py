"""Per-process contract receipts and bounded MCP document evidence for the model."""
import json
import re
import time
from urllib.parse import urlsplit, urlunsplit
from .tool_result import ToolResult, TextToolOutput

_contracts = {}
_indexes = {}
_step_skill = None
_round_binding = None
_round_arguments = {}


def remember_contract(value, skill_id=None):
    global _round_binding
    if isinstance(value, dict) and value.get('id') and value.get('contractToken') and 'inputSchema' in value:
        _contracts[value['id']] = {**value, '_skill_id': skill_id, '_until': time.monotonic() + 9 * 60,
                                   '_disclosed_at': time.monotonic_ns(), '_attempted': False}
        _round_binding = None
        return {k: v for k, v in value.items() if k != 'contractToken'}
    return value


def contract_for(binding_id):
    item = _contracts.get(binding_id)
    return item if item and item['_until'] > time.monotonic() else None


def disclosed_contracts(skill_id):
    return {key: item for key, item in _contracts.items()
            if item.get('_skill_id') == skill_id and contract_for(key)}


def configure_steps(skill_id):
    global _step_skill
    _step_skill = skill_id
    bind_round(None)


def bind_round(binding_id, arguments=None):
    global _round_binding, _round_arguments
    _round_binding = binding_id
    _round_arguments = dict(arguments or {})


def round_arguments():
    return dict(_round_arguments)


def round_contract():
    return contract_for(_round_binding)


def pending_contract(skill_id=None):
    target = skill_id or _step_skill
    latest = max((c for c in _contracts.values() if target and c.get('_skill_id') == target),
                 key=lambda c: c['_disclosed_at'], default=None)
    return latest if latest and contract_for(latest['id']) and latest.get('effect') == 'read' and not latest['_attempted'] else None


def consume_contract(binding_id):
    if binding_id in _contracts:
        _contracts[binding_id]['_attempted'] = True


def remember_index(skill_id, tools):
    _indexes[skill_id] = [{k: t.get(k) for k in ('id', 'name', 'effect', 'description')}
                          for t in tools if isinstance(t, dict)]


def known_tools(skill_id):
    return list(_indexes.get(skill_id, []))


def known_readers(skill_id):
    return [t for t in _indexes.get(skill_id, []) if t['effect'] == 'read'
            and re.search(r'fetch|read.*(?:page|document)|get.*(?:page|document)', str(t['name']), re.I)]


def safe_source_url(value):
    if not isinstance(value, str) or any(c in value for c in '\r\n<>'):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {'https', 'http'} or not parsed.hostname or parsed.username or parsed.password:
            return None
        return value
    except ValueError:
        return None


def document_results(result):
    def documents(rows):
        # SQL/geocoding APIs also use `results`; the key alone does not identify documents.
        return isinstance(rows, list) and (not rows or any(isinstance(row, dict) and
            ('contentUrl' in row or ('url' in row and ('content' in row or 'snippet' in row))) for row in rows))
    structured = result.get('structuredContent')
    if isinstance(structured, dict) and documents(structured.get('results')):
        return structured['results']
    for block in result.get('content', []):
        if block.get('type') == 'text':
            try:
                parsed = json.loads(block.get('text', ''))
                if isinstance(parsed, dict) and documents(parsed.get('results')):
                    return parsed['results']
            except (ValueError, TypeError):
                pass
    return None


def render_mcp_response(value, binding_id, arguments=None):
    if value.get('status') != 'completed' or value.get('result', {}).get('isError'):
        text = json.dumps(value, ensure_ascii=False)
        provenance = {'tool': 'call_external_tool', 'mcp_status': value.get('status')}
        if value.get('status') == 'awaiting_confirmation':
            receipt = ToolResult.partial(data=value, text=text, provenance=provenance)
        else:
            receipt = ToolResult.error(value.get('code') or 'MCP_CALL_UNVERIFIED',
                '外部操作未确认成功，不得声称完成；结果不明的写入不得重试。', data=value, provenance=provenance, text=text)
        return TextToolOutput(text, receipt)
    result = value.get('result', {})
    if (contract_for(binding_id) or {}).get('effect') == 'read':
        from .mcp_dataflow import remember_result_values
        remember_result_values(result, contract_for(binding_id), arguments)
    docs = document_results(result)
    sources = []
    if docs is not None:
        unique = {}
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            url = safe_source_url(doc.get('contentUrl') or doc.get('url'))
            if not url:
                continue
            parsed = urlsplit(url)
            key = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ''))
            text = str(doc.get('content') or doc.get('snippet') or '')
            if key not in unique:
                unique[key] = {'title': str(doc.get('title') or url)[:240], 'contentUrl': url, 'content': text[:2200]}
            elif text and text[:100] not in unique[key]['content']:
                unique[key]['content'] = (unique[key]['content'] + '\n' + text)[:2200]
        selected = list(unique.values())[:5]
        sources = [{'title': d['title'], 'url': d['contentUrl'], 'invocationId': value.get('invocationId'),
                    'bindingId': binding_id, 'kind': 'mcp_document'} for d in selected]
        result = {'results': selected, 'returnedCount': len(docs), 'disclosedCount': len(selected),
                  'evidenceNote': '以下为本次检索片段，不等于已读取完整文档。区分产品、版本、教程与问答；无证据的配置值不得补写为事实。'}
    elif arguments and safe_source_url(arguments.get('url')):
        blocks = result.get('content', [])
        body = '\n'.join(b.get('text', '') for b in blocks if b.get('type') == 'text')
        heading = re.search(r'(?m)^#\s+([^\r\n]+)', body[:1500])
        if heading:
            url = arguments['url']
            title = heading.group(1).strip()[:240]
            sources = [{'title': title, 'url': url, 'invocationId': value.get('invocationId'), 'bindingId': binding_id, 'kind': 'mcp_document_fetch'}]
            result = {'url': url, 'title': title, 'content': body[:14000], 'truncated': len(body) > 14000}
    data = {'invocationId': value.get('invocationId'), 'status': 'completed', 'result': result}
    receipt = contract_for(binding_id) or {}
    provenance = {'tool': 'call_external_tool', 'binding_id': binding_id, 'invocation_id': value.get('invocationId'),
                  'skill_id': receipt.get('_skill_id'),
                  'skill_name': receipt.get('connectionName'), 'sources': sources}
    text = json.dumps(data, ensure_ascii=False)
    return TextToolOutput(text, ToolResult.success(data=data, text=text, provenance=provenance))
