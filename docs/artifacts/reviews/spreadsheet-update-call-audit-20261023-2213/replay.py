"""Isolated API-contract review. No model calls, updates, or workbook writes.

Exercise normalization with a fake coordinator; capture before real planning.
"""
import copy
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from unittest.mock import patch

import openpyxl

from dsh_modules.spreadsheet_update.schema import validate_update_plan
from dsh_modules.spreadsheet_update.sources import FactTable
from dsh_modules.agent_loop import detect_missing_requested_deliverable
from dsh_modules.workbook_delivery import deliverable_is_valid
from dsh_modules.spreadsheet_update.tools import (
    SPREADSHEET_UPDATE_TOOL_DEFINITIONS, harvest_analytical_facts,
    tool_plan_spreadsheet_update,
)

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
WS = ROOT / 'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace'
SID = 'chat-session-1792763169153-avueiz5g'
TID = '1792764784041692090-fdda230a87dd45fab14bd440fb48ef04'
EP = WS / '.dsh/sessions' / (SID + '.evidence') / (TID + '.json')
E = json.loads(EP.read_text())
analysis = E['receipts'][0]['data']
target = WS / '工数3Q预实管理.xlsx'
source = WS / '工数实绩明细_20261020134124.xlsx'
before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [target, source]}
api_schema = next(t['function']['parameters'] for t in SPREADSHEET_UPDATE_TOOL_DEFINITIONS
                  if t['function']['name'] == 'plan_spreadsheet_update')

def declared_schema_issues(value, schema, path='$'):
    """Check the type/required/enum keywords used by these concrete examples.

    This is not a general JSON Schema implementation; no unsupported keywords
    are needed to demonstrate the absent per-operation required coordinate.
    """
    errors = []
    kinds = {'object': dict, 'array': list, 'string': str, 'boolean': bool}
    kind = schema.get('type')
    if kind in kinds and not isinstance(value, kinds[kind]):
        return [path + ': wrong type']
    if 'enum' in schema and value not in schema['enum']:
        errors.append(path + ': not in enum')
    if isinstance(value, dict):
        errors.extend(path + ': missing ' + k for k in schema.get('required', []) if k not in value)
        for k,v in value.items():
            if k in schema.get('properties', {}):
                errors.extend(declared_schema_issues(v, schema['properties'][k], path+'.'+k))
    elif isinstance(value, list) and 'items' in schema:
        for i,v in enumerate(value):
            errors.extend(declared_schema_issues(v, schema['items'], path+f'[{i}]'))
    return errors

# Controlled minimal input isolates the missing-coordinate condition from the
# real error receipt. Historical full function arguments were not retained.
minimal = {
    'target_ref': target.name,
    'snapshot': {'selected_sheet_id': '1019', 'new_sheet_name': '1023'},
    'operations': [
        {'op': 'copy_sheet', 'source_sheet': '1019', 'target_sheet': '1023'},
        {'op': 'set_snapshot_date', 'op_id': 'op_2_date', 'date_value': '2026-10-23'},
    ],
    'auto_execute': True,
}
assert not declared_schema_issues(minimal, api_schema)

class CaptureCoordinator:
    captured = []
    def plan_update(self, plan, **kwargs):
        self.captured.append(copy.deepcopy(plan))
        return {'success': False, 'status': 'audit_capture', 'error': 'Stopped before real planning'}

def normalize_without_planning(payload, facts):
    CaptureCoordinator.captured = []
    with patch('dsh_modules.spreadsheet_update.tools.SpreadsheetUpdateTurnCoordinator', CaptureCoordinator), \
         patch('dsh_modules.spreadsheet_update.tools._SESSION_FACTS', facts), \
         patch('dsh_modules.config.WORKSPACE_DIR', str(WS)):
        tool_plan_spreadsheet_update(copy.deepcopy(payload))
    return CaptureCoordinator.captured[-1]

normalized_date = normalize_without_planning(minimal, FactTable())
valid_date, date_issues = validate_update_plan(normalized_date)
harvested = harvest_analytical_facts(analysis, FactTable())
receipt_fc = next(f for f in analysis['facts'] if f['group_fields']['部门编号'] == 'FC48005')
harvest_fc = [f for f in harvested.all_facts() if f.logical_key.department_code == 'FC48005'
              and f.logical_key.region_id == 'default_region'
              and f.logical_key.metric_id == 'amount_k'
              and f.logical_key.value_kind == 'forecast'
              and f.logical_key.unit == 'K']

skill_text = (ROOT / '.agents/skills/work-hours-update/SKILL.md').read_text()
examples = [json.loads(s) for s in re.findall(r'```json\s*\n(.*?)```', skill_text, re.S)]
skill_plan = next(x for x in examples if 'operations' in x)
assert not declared_schema_issues(skill_plan, api_schema)
normalized_example = normalize_without_planning(skill_plan, harvested)
fills = [o for o in normalized_example['operations'] if o['op'] == 'fill_from_result']
id_counts = Counter(o['op_id'] for o in fills)
cell_counts = Counter(o.get('coordinate') for o in fills)

wb = openpyxl.load_workbook(target, read_only=True, data_only=False)
sheet_names = wb.sheetnames
wb.close()
turn_start = 1792764705.484
qualifying_inputs = [p.name for p in [target, source]
                     if p.stat().st_mtime >= turn_start-2 and deliverable_is_valid(p)]
with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(WS)):
    requested_missing = detect_missing_requested_deliverable(E['query'], turn_start,
        expected_deliverables=['.xlsx'], is_generate_intent=True)
old_output = WS/'工数3Q预实管理_1023.xlsx'
after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [target, source]}
result = {
    'session_id': SID, 'turn_id': TID,
    'real_plan_error': E['receipts'][1]['error'],
    'contract_mismatch': {'controlled_missing_date_coordinate_passes_public_schema': True,
        'normalized_plan_passes_domain_schema': valid_date, 'domain_issues': date_issues,
        'public_check_scope': 'Declared type/required/enum constraints of concrete example; no external schema library.',
        'note': 'Controlled minimal payload matches real error condition; not recovered full historical arguments.'},
    'harvest_exact_receipt': {
        'input_facts': len(analysis['facts']), 'harvested_facts': len(harvested.all_facts()),
        'source_metric_unit_request': analysis['plan']['metrics'][0].get('unit'),
        'receipt_FC48005': {'value': receipt_fc['value'], 'unit': receipt_fc['unit']},
        'harvest_FC48005_forecast_K': str(harvest_fc[0].numeric_value),
        'created_zero_departments': sorted({f.logical_key.department_code for f in harvested.all_facts()
                                           if f.source_id == 'analysis_zero_match'}),
        'note': 'Runs exact receipt through current same-hash adapter in an isolated FactTable.'},
    'published_skill_example_normalization': {
        'original_operations': len(skill_plan['operations']),
        'normalized_operations': len(normalized_example['operations']),
        'fill_operations': len(fills), 'unique_fill_op_ids': len(id_counts),
        'max_repetitions_same_op_id': max(id_counts.values()),
        'distinct_target_coordinates': len(cell_counts),
        'max_writes_same_coordinate': max(cell_counts.values()),
        'note': 'Controlled skill example, not historical payload. Fake coordinator stops before planning/writes.'},
    'api_review': {'top_level_fields': list(api_schema.get('properties',{})),
        'top_level_required': api_schema.get('required', []),
        'operation_required': api_schema['properties']['operations']['items'].get('required',[]),
        'operation_unit_property_exposed': 'unit' in api_schema['properties']['operations']['items']['properties'],
        'auto_execute_description': api_schema['properties']['auto_execute']['description'],
        'runtime_default_from_source': False},
    'file_integrity': {'before': before, 'after': after, 'unchanged': before == after,
        'matches_call': before == E['source_hashes'], 'target_sheet_names': sheet_names,
        'desired_output_exists': old_output.exists(),
        'desired_output_mtime': old_output.stat().st_mtime if old_output.exists() else None,
        'desired_output_predates_turn': old_output.stat().st_mtime < turn_start-2 if old_output.exists() else None},
    'delivery_false_positive_reproduction': {
        'current_inputs_passing_fresh_valid_xlsx_condition': qualifying_inputs,
        'missing_requested_deliverable_result': requested_missing,
        'published_receipts_in_this_turn': 0,
        'note': 'Exact fresh-file predicate includes input attachments; existing output predates this turn.'},
    'model_calls': 0, 'workbook_writes': 0,
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'replay-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
assert not valid_date and any("invalid coordinate ''" in s for s in date_issues)
assert len(harvested.all_facts()) == 1056
assert str(harvest_fc[0].numeric_value) == '0.0670353'
assert len(fills) == 1056 and len(id_counts) == 11
assert before == after and result['file_integrity']['matches_call']
assert qualifying_inputs and requested_missing is None
print(json.dumps(result,ensure_ascii=False,indent=2))
