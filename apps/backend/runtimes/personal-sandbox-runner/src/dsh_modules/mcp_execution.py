"""Progressive tool selection for an explicitly admitted, read-only MCP Skill."""
from copy import deepcopy
from .mcp_runtime import disclosed_contracts, pending_contract, configure_steps, bind_round


class McpExecutionGate:
    def __init__(self, skill_id=None, prompt=''):
        self.skill_id = skill_id
        self.prompt = prompt
        configure_steps(skill_id)
        from .mcp_dataflow import bind_user_values
        bind_user_values(prompt)
        from .telemetry import get_active_telemetry
        stats = get_active_telemetry()
        if stats:
            stats.record_guard('mcp_execution_gate', 'enabled' if skill_id else 'disabled', {
                'skill_id': skill_id, 'request': str(prompt)[:180]})

    def select(self, tools, evidence):
        bind_round(None)
        names = {t.get('function', {}).get('name') for t in tools}
        if not self.skill_id or not {'list_external_tools', 'call_external_tool'} <= names:
            return tools, None
        relevant = [e for e in evidence if (e.provenance or {}).get('tool') in
                    {'read_skill', 'list_external_tools', 'call_external_tool'}]
        if any((e.provenance or {}).get('mcp_status') in {'awaiting_confirmation', 'outcome_unknown'} for e in relevant):
            return tools, None
        contracts = disclosed_contracts(self.skill_id)
        pending = pending_contract(self.skill_id)
        from .mcp_coordinate_plan import coordinate_step
        plan = coordinate_step(self.prompt, self.skill_id, relevant)
        if plan:
            from .telemetry import get_active_telemetry
            stats = get_active_telemetry()
            if stats:
                stats.record_guard('mcp_dependency_step', 'bound', {'tool': plan[0], 'binding_or_skill': plan[2], 'arguments': plan[4]})
        expected_arguments = {}
        if plan:
            name, key, allowed, planned_names, expected_arguments = plan
            if name == 'call_external_tool':
                pending = contracts[allowed[0]]
                bind_round(pending['id'], expected_arguments)
        elif pending:
            from .mcp_dataflow import coordinate_prerequisites
            from .mcp_runtime import known_tools
            prerequisites = coordinate_prerequisites(pending, known_tools(self.skill_id))
            if prerequisites:
                name, key, allowed = 'list_external_tools', 'skill_id', [self.skill_id]
            else:
                name, key, allowed = 'call_external_tool', 'binding_id', [pending['id']]
                bind_round(pending['id'])
        elif any(not e.is_success or (e.provenance or {}).get('tool') == 'call_external_tool' for e in relevant):
            return tools, None
        elif contracts:
            # An attempted/unknown/write contract must not trigger another forced call.
            return tools, None
        elif any((e.provenance or {}).get('tool') == 'read_skill' for e in relevant):
            name, key, allowed = 'list_external_tools', 'skill_id', [self.skill_id]
        else:
            name, key, allowed = 'read_skill', 'skill_name', [self.skill_id]
        selected = [deepcopy(t) for t in tools if t.get('function', {}).get('name') == name]
        if not selected:
            return tools, None
        schema = selected[0]['function']['parameters']
        schema['properties'][key] = {**schema['properties'].get(key, {}), 'enum': allowed}
        schema['required'] = list(dict.fromkeys([*schema.get('required', []), key]))
        if name == 'list_external_tools':
            # The Skill index is already visible. Require disclosure of one chosen contract.
            schema['required'].append('tool_name')
            if plan and planned_names:
                schema['properties']['tool_name'] = {**schema['properties']['tool_name'], 'enum': planned_names}
            elif pending and prerequisites:
                schema['properties']['tool_name'] = {**schema['properties']['tool_name'], 'enum': prerequisites}
        elif name == 'call_external_tool':
            # Reuse only the contract already disclosed for this step, never all remote schemas.
            schema['properties']['arguments'] = deepcopy(pending['inputSchema'])
            for field, value in expected_arguments.items():
                if value is None:
                    schema['properties']['arguments']['properties'].pop(field, None)
                    schema['properties']['arguments']['additionalProperties'] = False
                else:
                    schema['properties']['arguments']['properties'][field]['enum'] = [value]
        return selected, {'type': 'function', 'function': {'name': name}}
