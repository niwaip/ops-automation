"""Execute selected personal calculation skills before any model can invent results."""

import hashlib
import json
import re
import time
from pathlib import Path

from .config import CUSTOM_SKILL_DIR, WORKSPACE_DIR
from .evidence_store import persist_turn_evidence
from .personal_skill_workflow_engine import execute_workflow, render_receipt, verify_receipt
from .telemetry import TelemetryStats
from .tool_result import ToolResult


def requests_workflow_change(instruction):
    if re.search(r'改为|改成|修改|调整|新增|增加|删掉|删除', instruction):
        return True
    # Asking how an existing rule works is a presentation request, not a rule mutation.
    if re.search(r'为什么|为何|解释|解读|说明|含义|怎么计算|如何计算', instruction):
        return False
    return bool(re.search(r'排除|剔除|不包含|不统计|仅统计|只统计|仅保留|只保留|仅包含|只包含|筛选|按照|分组|汇总金额', instruction))


def try_run_personal_workflow(skill_res, files, prompt, history_file, history, start_time, deadline,
                              model=None, policy=None, present=False):
    slug = getattr(skill_res, 'skill_id', None)
    if not slug or not re.fullmatch(r'[a-zA-Z0-9_-]+', slug):
        return False
    package = Path(CUSTOM_SKILL_DIR) / slug
    manifest_file = package / 'execution.json'
    skill_file = package / 'SKILL.md'
    rules_file = package / 'references' / 'rules.json'
    if not skill_file.is_file():
        return False
    skill_md = skill_file.read_text(encoding='utf-8')
    legacy_calc = False
    if not manifest_file.exists() and rules_file.is_file():
        try:
            rules = json.loads(rules_file.read_text(encoding='utf-8'))
            legacy_calc = bool(re.search(r'汇总|合计|求和|核算|统计|计算|平均|加权|计数|比率', '\n'.join(rules.get('confirmedInstructions', [])))
                               and any(i.get('type') in {'xlsx', 'xlsm', 'csv', 'xls'} for i in rules.get('inputExpectations', [])))
        except (OSError, ValueError, TypeError):
            legacy_calc = True
    if not manifest_file.exists() and 'execution_mode: verified_workflow' not in skill_md and not legacy_calc:
        return False

    telemetry = TelemetryStats()
    hashes = {}; receipt = None
    telemetry.record_tool_call('execute_personal_skill_workflow', {'skill': slug})
    try:
        if not manifest_file.is_file():
            raise ValueError('该核算技能仅保存了说明，尚无可验证执行流程，请先升级技能')
        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        if (manifest.get('schema_version') != 1 or manifest.get('kind') != 'personal_skill_workflow'
                or manifest.get('entrypoint') != 'scripts/run.py' or manifest.get('plan') != 'references/workflow.json'):
            raise ValueError('非法执行入口或流程版本')
        plan_bytes = (package / manifest['plan']).read_bytes()
        engine_bytes = (package / manifest['entrypoint']).read_bytes()
        trusted_engine = Path(__file__).with_name('personal_skill_workflow_engine.py').read_bytes()
        if (hashlib.sha256(engine_bytes).hexdigest() != manifest.get('engine_sha256')
                or engine_bytes != trusted_engine
                or hashlib.sha256(plan_bytes).hexdigest() != manifest.get('plan_sha256')):
            raise ValueError('核算程序或规则已变化，必须重新验证后再调用')
        if len(files) != 1:
            raise ValueError('请提供本轮唯一的 XLSX/XLSM 附件，不能自动选择历史文件')
        # The saved flow is immutable during an invocation; do not silently ignore overrides.
        user_instruction = prompt.split('用户指令：')[-1]
        if requests_workflow_change(user_instruction):
            raise ValueError('本轮包含新的核算口径，请先更新并验证技能版本后执行')
        if re.search(r'生成|导出|(?:输出|保存).*(?:文件|xlsx|csv|pdf)', user_instruction, re.I):
            raise ValueError('该技能保存的是文本核算流程，尚无本轮所需的文件交付步骤')
        filename = files[0]
        source = (Path(WORKSPACE_DIR) / filename).resolve()
        if not source.is_relative_to(Path(WORKSPACE_DIR).resolve()) or not source.is_file():
            raise ValueError('本轮附件不在授权工作区或不存在')
        plan = json.loads(plan_bytes)
        hashes[filename] = hashlib.sha256(source.read_bytes()).hexdigest()
        data = execute_workflow(source, plan, deadline)
        verify_receipt(data, plan, source)
        # Save-time replay is an independent check when the exact source is reused.
        validation_file = package / 'references' / 'validation.json'
        if not validation_file.is_file():
            raise ValueError('技能缺少保存时的核算重放回执')
        validation = json.loads(validation_file.read_text(encoding='utf-8'))
        if validation.get('status') != 'replayed' or validation.get('plan_sha256') != manifest['plan_sha256']:
            raise ValueError('保存时的核算验证与当前流程不一致')
        if validation.get('source_sha256') == data['workbook_id']:
            from decimal import Decimal
            if (int(Decimal(data['total']) * Decimal('1e20')) != int(validation['total_scaled_1e20'])
                    or data['included_rows'] != validation['included_rows']
                    or data['excluded_rows'] != validation['excluded_rows']):
                raise ValueError('重放结果与独立保存验收不一致')
        catalog_file = Path(CUSTOM_SKILL_DIR).parent / '.personal-skills-catalog.json'
        catalog = json.loads(catalog_file.read_text(encoding='utf-8')) if catalog_file.is_file() else {}
        records = [record for record in catalog.values() if record.get('slug') == slug]
        identity = ({k: records[0].get(k) for k in ('skillId', 'version', 'packageHash')}
                    if len(records) == 1 else {})
        data['skill'] = {'slug': slug, **identity, 'plan_sha256': manifest['plan_sha256'],
                         'engine_sha256': manifest['engine_sha256']}
        # Re-seal after adding the immutable skill identity.
        from .personal_skill_workflow_engine import digest
        data['evidence_id'] = digest({k: v for k, v in data.items() if k != 'evidence_id'})[:24]
        receipt = ToolResult.success(data=data, provenance={'file_path': str(source), 'workbook_id': data['workbook_id']},
                                     text=json.dumps(data, ensure_ascii=False))
        telemetry.record_guard('personal_skill_evidence', 'accept', data['evidence_id'])
        text = render_receipt(data)
    except (OSError, ValueError, KeyError, TypeError, TimeoutError) as error:
        receipt = ToolResult.error('personal_skill_workflow_rejected', str(error))
        telemetry.record_guard('personal_skill_evidence', 'reject', str(error))
        text = f'本次核算未通过验证：{error}。未输出未经核算的金额。'
    telemetry.record_execution_result(receipt)
    if receipt.is_success and present:
        from .personal_skill_presentation import present_verified_workflow
        text = present_verified_workflow(receipt.data, text, prompt, model, policy, telemetry, deadline)
        try:
            verify_receipt(receipt.data, plan, source)
        except (OSError, ValueError) as error:
            print('<<<DSH_DELTA_RESET>>>', flush=True)
            receipt = ToolResult.error('personal_skill_source_changed', str(error))
            telemetry.record_execution_result(receipt)
            telemetry.record_guard('personal_skill_evidence', 'reject', 'source_changed_during_presentation')
            text = '附件在结果解读期间发生变化，本次结果不再作为当前附件的有效核算，请重新执行。'
    if history_file:
        verification = persist_turn_evidence(history_file, hashes, prompt, [receipt], telemetry.guard_decisions)
        history.extend([{'role': 'user', 'content': prompt},
                        {'role': 'assistant', 'content': text, 'verification': verification}])
        Path(history_file).write_text(json.dumps(history[-20:], ensure_ascii=False), encoding='utf-8')
    telemetry.finish_reason = 'verified_workflow' if receipt.is_success else 'workflow_rejected'
    telemetry.set_wall_clock_duration((time.time() - start_time) * 1000)
    telemetry.emit_metrics_event()
    TelemetryStats.emit_final_output(text)
    return True
