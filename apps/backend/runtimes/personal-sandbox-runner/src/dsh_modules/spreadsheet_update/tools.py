"""Small public tools; workbook protocols and integrity checks stay server-side."""
import hashlib
import json
from pathlib import Path

from ..tool_result import ToolResult, TextToolOutput
from .turn import SpreadsheetUpdateTurnCoordinator
from .state import UpdateRunManager
from .sources import FactTable
from .result_catalog import harvest_analytical_facts as _harvest, fingerprint, load_facts, reset_results
from .semantic_plan import build_semantic_plan
from .layout_binding import BindingNeedsInput
from .tool_schema import SPREADSHEET_UPDATE_TOOL_DEFINITIONS

_ACTIVE_COORDINATORS = {}
_ACTIVE_FACTS = {}
_SESSION_FACTS = FactTable()


def reset_turn_results():
    global _SESSION_FACTS
    reset_results()
    from ..user_declarations import bind_user_declarations
    bind_user_declarations()
    _SESSION_FACTS = FactTable()
    _ACTIVE_COORDINATORS.clear()
    _ACTIVE_FACTS.clear()
    from .delivery import _VERIFIED_UPDATE_FILES
    _VERIFIED_UPDATE_FILES.clear()


def register_turn_facts(run_id, facts):
    _ACTIVE_FACTS[run_id] = facts


def get_session_facts():
    return _SESSION_FACTS


def harvest_analytical_facts(data, fact_table=None, provenance=None):
    global _SESSION_FACTS
    facts = _harvest(data, fact_table, provenance)
    if fact_table is None:
        _SESSION_FACTS = facts
    return facts


def _output(data=None, error=None):
    if error:
        result = ToolResult.error(code='spreadsheet_update_rejected', message=str(error), text=str(error))
    else:
        result = ToolResult.success(data=data, text=json.dumps(data, ensure_ascii=False))
    return TextToolOutput(result.render_text(), result)


def tool_plan_spreadsheet_update(plan, user_id='sandbox_user'):
    """Preview only. Never mutate a workbook from this tool."""
    from ..config import WORKSPACE_DIR
    try:
        internal, facts, payload, preview, warnings = build_semantic_plan(plan, WORKSPACE_DIR)
        coord = SpreadsheetUpdateTurnCoordinator()
        result = coord.plan_update(internal, user_id=user_id)
        if not result.get('success'):
            return _output(error=result.get('error', '规划失败'))
        (coord.mgr.run_dir / 'facts.json').write_bytes(payload)
        _ACTIVE_COORDINATORS[coord.mgr.run_id] = coord
        register_turn_facts(coord.mgr.run_id, facts)
        return _output({'status': 'planned', 'plan_id': result['plan_id'],
                        'preview': preview, 'warnings': warnings,
                        'base_sheet': internal['snapshot']['selected_sheet_id'],
                        'new_sheet': internal['snapshot']['new_sheet_name'],
                        'next_action': '调用 execute_spreadsheet_update(plan_id) 生成并验证文件；当前尚未生成'})
    except BindingNeedsInput as exc:
        result = ToolResult.partial(data={'status':'needs_input','question':str(exc)},text=str(exc))
        return TextToolOutput(str(exc),result)
    except Exception as exc:
        return _output(error=exc)


def _resolve_plan(plan_id):
    if not isinstance(plan_id, str) or not plan_id.startswith('plan_'):
        raise ValueError('无效计划 ID')
    matches = []
    # Do not create a phantom run merely to locate an existing one.
    import os
    from ..config import WORKSPACE_DIR
    runs = Path(os.environ.get('WORKSPACE_DIR') or WORKSPACE_DIR).resolve() / '.dsh' / 'spreadsheet-runs'
    for path in runs.glob('*/state.json'):
        state = json.loads(path.read_text())
        if state.get('plan_id') == plan_id:
            matches.append(path.parent)
    if len(matches) != 1:
        raise ValueError(f'计划 ID 未唯一匹配当前工作区：{plan_id}')
    manager = UpdateRunManager(run_id=matches[0].name, base_dir=runs)
    return SpreadsheetUpdateTurnCoordinator(run_manager=manager)


def tool_execute_spreadsheet_update(plan_id):
    """Resolve exact plan and facts; callers need not copy hashes or internal run IDs."""
    try:
        coord = _resolve_plan(plan_id)
        state = coord.mgr.load_state()
        plan = json.loads((coord.mgr.run_dir / 'plan.json').read_text())
        from .contract import compute_plan_hash
        if compute_plan_hash(plan) != state.plan_hash:
            raise ValueError('锁定计划已被修改')
        if state.status == 'published':
            from .delivery import register_verified_update
            if fingerprint(state.published_path) != state.published_hash:
                raise ValueError('已发布文件发生变化')
            register_verified_update(state.published_path, state.published_hash)
            data = {'status': 'published', 'plan_id': plan_id, 'published_file': state.published_path}
        else:
            semantics = plan['semantic_bindings']
            for file_path, expected in semantics['input_hashes'].items():
                if fingerprint(file_path) != expected:
                    raise ValueError('输入文件已变化，请重新统计和规划：' + file_path)
            payload = (coord.mgr.run_dir / 'facts.json').read_bytes()
            if hashlib.sha256(payload).hexdigest() != semantics['facts_hash']:
                raise ValueError('锁定统计事实已被修改')
            result = coord.execute_update(plan_id, state.plan_hash, load_facts(payload))
            if not result.is_success:
                return _output(error='更新未通过门禁：' + '；'.join(result.issues))
            data = {'status': result.status, 'plan_id': plan_id, 'published_file': result.published_file,
                    'summary': result.summary, 'warnings': result.warnings}
        marker = json.dumps({'filePath': data['published_file'], 'fileName': Path(data['published_file']).name,
                             'comment': '已完成更新和门禁验证'}, ensure_ascii=False)
        text = json.dumps(data, ensure_ascii=False) + f'\n<<<DSH_OUTBOUND_FILE:len={len(marker)}:{marker}>>>'
        return TextToolOutput(text, ToolResult.success(data=data, text=text))
    except Exception as exc:
        return _output(error=exc)


def tool_get_spreadsheet_update_status(plan_id):
    try:
        state = _resolve_plan(plan_id).mgr.load_state()
        return _output(data={'plan_id':plan_id, 'status':state.status,
                             'published_file':state.published_path, 'errors':state.errors})
    except Exception as exc:
        return _output(error=exc)


def dispatch_update_tool(name, params):
    """Enforce the same closed public fields that the model sees."""
    definition = next(t['function'] for t in SPREADSHEET_UPDATE_TOOL_DEFINITIONS
                      if t['function']['name'] == name)
    schema = definition['parameters']
    if not isinstance(params, dict):
        return _output(error='工具参数必须为对象')
    unknown = params.keys() - schema['properties'].keys()
    missing = [key for key in schema['required'] if not params.get(key)]
    if name == 'plan_spreadsheet_update':
        has_sections = bool(params.get('sections'))
        if not has_sections and not params.get('section'):
            missing.append('section')
        sections_list = params.get('sections') if isinstance(params.get('sections'), list) else []
        sections_have_labels = bool(sections_list and all(isinstance(s, dict) and s.get('target_label') for s in sections_list))
        if not params.get('target_label') and not sections_have_labels:
            missing.append('target_label')
    if unknown or missing:
        return _output(error=f'不支持的参数：{sorted(unknown)}；缺少必填参数：{sorted(set(missing))}')
    if name == 'plan_spreadsheet_update':
        return tool_plan_spreadsheet_update(params)
    if name == 'execute_spreadsheet_update':
        return tool_execute_spreadsheet_update(params['plan_id'])
    return tool_get_spreadsheet_update_status(params['plan_id'])
