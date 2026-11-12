"""Ground coordinate arguments in this turn's user input or successful read results."""
import json
import re
from decimal import Decimal, InvalidOperation

_coordinates = set()
_reads = []
PAIR = re.compile(r'(?<![\d.])(-?\d{1,3}(?:\.\d+)?)\s*[,，]\s*(-?\d{1,2}(?:\.\d+)?)(?![\d.])')


def _key(value):
    match = PAIR.fullmatch(str(value).strip())
    if not match:
        return None
    try:
        lon, lat = (Decimal(v) for v in match.groups())
        return (lon, lat) if -180 <= lon <= 180 and -90 <= lat <= 90 else None
    except InvalidOperation:
        return None


def bind_user_values(prompt):
    _coordinates.clear()
    _reads.clear()
    for match in PAIR.finditer(str(prompt or '')[:12000]):
        key = _key(match.group())
        if key:
            _coordinates.add(key)


def remember_result_values(result, contract=None, arguments=None):
    found = set()
    cities = set()
    def walk(value, depth=0):
        if depth > 12 or len(_coordinates) >= 256:
            return
        if isinstance(value, str):
            key = _key(value)
            if key:
                _coordinates.add(key)
                found.add(value.strip())
            elif value.lstrip().startswith(('{', '[')):
                try: walk(json.loads(value), depth+1)
                except (ValueError, TypeError): pass
        elif isinstance(value, dict):
            for field, item in value.items():
                if field == 'city' and isinstance(item, str) and item:
                    cities.add(item)
                walk(item, depth+1)
        elif isinstance(value, list):
            for item in value: walk(item, depth+1)
    walk(result)
    if contract and arguments and len(_reads) < 32:
        _reads.append({'binding_id': contract['id'], 'skill_id': contract.get('_skill_id'),
                       'arguments': dict(arguments), 'coordinates': sorted(found), 'cities': sorted(cities)})


def coordinate_reads(skill_id):
    return [r for r in _reads if r['skill_id'] == skill_id]


def ungrounded_coordinates(contract, arguments):
    properties = (contract.get('inputSchema') or {}).get('properties') or {}
    rejected = []
    for name, value in arguments.items():
        spec = properties.get(name) or {}
        if re.search(r'经纬度|经度.{0,8}纬度|coordinates', str(spec.get('description', '')), re.I):
            key = _key(value)
            if not key or key not in _coordinates:
                rejected.append(name)
    return rejected


def coordinate_prerequisites(contract, tools):
    properties = (contract.get('inputSchema') or {}).get('properties') or {}
    needs_coordinates = any(re.search(r'经纬度|经度.{0,8}纬度|coordinates', str(s.get('description', '')), re.I)
                            for s in properties.values() if isinstance(s, dict))
    if _coordinates or not needs_coordinates:
        return []
    return [t['name'] for t in tools if t.get('effect') == 'read' and t.get('id') != contract.get('id')
            and re.search(r'经纬度|coordinates|geocod', str(t.get('description', '')), re.I)
            and re.search(r'转换|解析|geocod', str(t.get('description', '')), re.I)]
