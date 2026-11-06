"""At most one same-Skill document read through the existing authenticated gateway."""
import time
from .mcp_runtime import disclosed_contracts, known_readers, pending_contract, contract_for
from .mcp_review_sources import canonical_url
from .mcp_tools import execute_mcp_tool
from .tool_result import adapt_tool_output


def is_document_reader(contract):
    schema = contract.get('inputSchema', {})
    properties = schema.get('properties', {}) if isinstance(schema, dict) else {}
    required = schema.get('required', []) if isinstance(schema, dict) else []
    return (contract.get('effect') == 'read' and isinstance(properties, dict)
            and isinstance(properties.get('url'), dict) and properties['url'].get('type') == 'string'
            and isinstance(required, list) and set(required) <= {'url'})


def supplement_document(evidence, sources, skill_id, telemetry, deadline, execute=None):
    def stopped(reason):
        telemetry.record_guard('mcp_review_recovery', 'skip', {'reason': reason})
        return False
    if not skill_id:
        return stopped('not_admitted_readonly_skill')
    if deadline - time.monotonic() < 2:
        return stopped('recovery_budget_exhausted')
    contracts = disclosed_contracts(skill_id)
    fetched = {canonical_url(s['url']) for s in sources for p in s['segments'] if p['kind'] == 'fetch'}
    source = next((s for s in sources if s['kind'] != 'community' and s['url'] not in fetched
                   and any(p['bindingId'] in contracts for p in s['segments'])), None)
    if not source:
        return stopped('no_new_same_skill_document')
    pending = pending_contract(skill_id)
    if pending and not is_document_reader(pending):
        return stopped('different_step_pending')
    reader = pending or next((c for c in contracts.values() if is_document_reader(c)), None)
    reader_name = reader.get('name') if reader else next((t['name'] for t in known_readers(skill_id)), None)
    if not reader_name:
        return stopped('no_known_readonly_reader')
    gateway = execute or execute_mcp_tool

    def call(name, params):
        telemetry.checkpoint('tool_started', {'name': name, 'execution_origin': 'mcp_review_recovery'})
        receipt = adapt_tool_output(gateway(name, params, deadline=deadline))
        receipt.provenance = {**(receipt.provenance or {}), 'tool': name, 'execution_origin': 'mcp_review_recovery'}
        evidence.append(receipt)
        telemetry.record_tool_call(name, params, status='success' if receipt.is_success else 'error')
        telemetry.record_execution_result(receipt)
        return receipt

    # Refresh exactly one contract; the server rechecks user, version and effect.
    try:
        disclosed = call('list_external_tools', {'skill_id': skill_id, 'tool_name': reader_name})
        data = disclosed.data if isinstance(disclosed.data, dict) else {}
        contract = contract_for(data.get('id')) if disclosed.is_success else None
        if not contract or contract.get('_skill_id') != skill_id or not is_document_reader(contract):
            return stopped('reader_contract_unavailable_or_not_readonly')
        if deadline - time.monotonic() < 2:
            return stopped('recovery_budget_exhausted')
        result = call('call_external_tool', {'binding_id': contract['id'], 'arguments': {'url': source['url']}})
        telemetry.record_guard('mcp_review_recovery', 'completed' if result.is_success else 'failed',
            {'source_id': source['id'], 'binding_id': contract['id'], 'error_code': result.error_code,
             'invocation_id': (result.provenance or {}).get('invocation_id')})
        return result.is_success
    except Exception as error:
        telemetry.record_guard('mcp_review_recovery', 'failed', {'reason': type(error).__name__})
        return False
