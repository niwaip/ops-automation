"""A bounded prerequisite plan for an explicit from/to request and coordinate tool contracts."""
import re
from .mcp_objective import selected_objective
from .mcp_runtime import known_tools, disclosed_contracts
from .mcp_dataflow import coordinate_reads


def coordinate_step(prompt, skill_id, evidence):
    match = re.search(r'从\s*(.{1,120}?)\s*到\s*([^\n，。？！?！]{1,120})', prompt or '')
    if not match:
        return None
    entities = [part.strip() for part in match.groups()]
    target = selected_objective(prompt, skill_id)
    if not target or target.get('effect') != 'read':
        return None
    if any(getattr(e, 'is_success', False) and (e.provenance or {}).get('tool') == 'call_external_tool'
           and (e.provenance or {}).get('skill_id') == skill_id
           and (e.provenance or {}).get('binding_id') == target['id'] for e in evidence):
        return None
    contracts = disclosed_contracts(skill_id)
    goal = contracts.get(target['id'])
    if not goal:
        return ('list_external_tools', 'skill_id', [skill_id], [target['name']], {})
    properties = goal['inputSchema'].get('properties', {})
    fields = [key for key, spec in properties.items() if re.search(r'经纬度|经度.{0,8}纬度|coordinates', str(spec.get('description', '')), re.I)]
    if len(fields) != 2:
        return None
    origin = [key for key in fields if re.search(r'出发|起点|origin|start', key+' '+str(properties[key].get('description', '')), re.I)]
    destination = [key for key in fields if re.search(r'目的地|终点|destination|arrival|end', key+' '+str(properties[key].get('description', '')), re.I)]
    if len(origin) != 1 or len(destination) != 1 or origin[0] == destination[0]:
        return None
    fields = [origin[0], destination[0]]
    readers = [t for t in known_tools(skill_id) if t.get('effect') == 'read'
               and re.search(r'经纬度|coordinates|geocod', str(t.get('description', '')), re.I)
               and re.search(r'转换|解析|geocod', str(t.get('description', '')), re.I)]
    if len(readers) != 1:
        return None
    reader = readers[0]
    contract = contracts.get(reader['id'])
    if not contract:
        return ('list_external_tools', 'skill_id', [skill_id], [reader['name']], {})
    address_fields = [key for key, spec in contract['inputSchema'].get('properties', {}).items()
                      if re.search(r'地址|address', str(spec.get('description', '')), re.I) and spec.get('type') == 'string']
    if len(address_fields) != 1:
        return None
    address = address_fields[0]
    coordinates = []
    cities = []
    for entity in entities:
        reads = [r for r in coordinate_reads(skill_id) if r['binding_id'] == reader['id'] and r['arguments'].get(address) == entity]
        if reads:
            if len(reads[-1]['coordinates']) != 1:
                return None  # No result or ambiguous places require clarification, not guessed coordinates.
            coordinates.append(reads[-1]['coordinates'][0])
            cities.append(reads[-1].get('cities', []))
            continue
        if contract.get('_attempted'):
            return ('list_external_tools', 'skill_id', [skill_id], [reader['name']], {})
        # Do not let the model add a guessed city/region to an otherwise explicit place name.
        required = contract['inputSchema'].get('required', [])
        arguments = {address: entity, **{key: None for key in contract['inputSchema'].get('properties', {}) if key != address and key not in required}}
        return ('call_external_tool', 'binding_id', [reader['id']], None, arguments)
    if goal.get('_attempted'):
        return None  # Never automatically replay a failed target operation.
    arguments = dict(zip(fields, coordinates))
    for key, spec in properties.items():
        desc = str(spec.get('description', ''))
        if re.search(r'起点城市|出发城市|origin city', desc, re.I) and len(cities[0]) == 1:
            arguments[key] = cities[0][0]
        elif re.search(r'终点城市|目的.*城市|destination city', desc, re.I) and len(cities[1]) == 1:
            arguments[key] = cities[1][0]
    return ('call_external_tool', 'binding_id', [target['id']], None, arguments)
