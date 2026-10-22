"""Admit candidate calculation skills, execute, review and repair before publishing."""

import hashlib
import json
import re
import time
from pathlib import Path

from .config import CUSTOM_SKILL_DIR, WORKSPACE_DIR
from .evidence_store import persist_turn_evidence
from .personal_skill_workflow_engine import render_receipt
from .personal_skill_execution import (load_package, candidate_context, execute_proposal,
                                       verify_current_source, render_query_receipt)
from .personal_skill_gate import plan_candidate, review_candidate
from .telemetry import TelemetryStats
from .tool_result import ToolResult


def _fallback_to_general_analysis(skill_res):
    """Do not leave rejected business rules in the ordinary agent's prompt."""
    from .skills import read_skill
    skill_res.skill_id = 'xlsx'
    skill_res.skill_context = read_skill('xlsx') or ''
    skill_res.requires_execution = False
    skill_res.deliverables = []
    skill_res.is_office_intent = True


def try_run_personal_workflow(skill_res, files, prompt, history_file, history, start_time, deadline,
                              model=None, policy=None, present=False):
    slug = getattr(skill_res, 'skill_id', None)
    if not slug or not re.fullmatch(r'[a-zA-Z0-9_-]+', slug):
        return False
    package = Path(CUSTOM_SKILL_DIR) / slug
    manifest_file = package / 'execution.json'
    skill_file = package / 'SKILL.md'
    rules_file = package / 'references/rules.json'
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
    hashes = {}; receipt = None; attempts = []; accepted = False
    try:
        if not manifest_file.is_file():
            raise ValueError('该核算技能仅保存了说明，尚无可验证执行流程，请先升级技能')
        manifest, saved, validation = load_package(package)
        if len(files) != 1:
            raise ValueError('请提供当前会话唯一的 XLSX/XLSM 附件')
        filename = files[0]
        source = (Path(WORKSPACE_DIR) / filename).resolve()
        if not source.is_relative_to(Path(WORKSPACE_DIR).resolve()) or not source.is_file():
            raise ValueError('本轮附件不在授权工作区或不存在')
        hashes[filename] = hashlib.sha256(source.read_bytes()).hexdigest()
        context = candidate_context(slug, skill_md, saved, prompt, history, source)
        catalog_file = Path(CUSTOM_SKILL_DIR).parent / '.personal-skills-catalog.json'
        catalog = json.loads(catalog_file.read_text(encoding='utf-8')) if catalog_file.is_file() else {}
        records = [r for r in catalog.values() if r.get('slug') == slug]
        identity = {'slug': slug, **({k: records[0].get(k) for k in ('skillId', 'version', 'packageHash')}
                                    if len(records) == 1 else {}),
                    'plan_sha256': manifest['plan_sha256'], 'engine_sha256': manifest['engine_sha256']}
        feedback = None
        # At most two plans and two reviews. No unbounded retry or unsafe old-flow fallback.
        for attempt in range(2):
            try:
                proposal = plan_candidate(context, feedback, model, policy, telemetry, deadline)
                if proposal['mode'] == 'fallback':
                    _fallback_to_general_analysis(skill_res)
                    return False
                if proposal['mode'] == 'clarify':
                    raise ValueError('需要确认：' + proposal['question'])
                tool_name = ('execute_personal_skill_workflow' if proposal['query'] == context.get('saved_query_template')
                             else 'aggregate_spreadsheet')
                telemetry.record_tool_call(tool_name, {'candidate_skill': slug, 'attempt': attempt + 1, 'mode': proposal['mode']})
                receipt = execute_proposal(proposal, source, saved, validation, identity, context, deadline)
                attempts.append(receipt)
                telemetry.record_execution_result(receipt)
                verify_current_source(receipt, source, hashes[filename])
                verdict = review_candidate(context, proposal, receipt, model, policy, telemetry, deadline)
                verify_current_source(receipt, source, hashes[filename])
                if verdict['status'] == 'accept':
                    accepted = True
                    break
                receipt.status = 'partial'
                if verdict['status'] == 'clarify':
                    raise ValueError('需要确认：' + verdict['question'])
                feedback = {'previous_proposal': proposal, 'review': verdict}
            except (OSError, ValueError, KeyError, TypeError, TimeoutError) as error:
                if receipt is not None and receipt in attempts:
                    receipt.status = 'partial'
                # A changed source must never be silently rebound on a later attempt.
                if hashlib.sha256(source.read_bytes()).hexdigest() != hashes[filename]:
                    raise ValueError('附件在规划或验收期间发生变化，请重新执行') from error
                telemetry.record_guard('personal_skill_attempt', 'reject', str(error)[:600])
                proposed = getattr(error, 'proposal', locals().get('proposal'))
                attempts.append(ToolResult.error('personal_skill_attempt_rejected', str(error),
                                                 data={'attempt': attempt + 1, 'proposal': proposed}))
                if str(error).startswith('需要确认：'):
                    raise
                feedback = {'error': str(error), 'previous_proposal': proposed}
        if not accepted:
            raise ValueError('重新规划与校验后仍未满足本轮要求，请明确统计口径或缩小查询范围')
        # No result, including streaming deltas, is exposed until semantic review accepts it.
        telemetry.record_guard('personal_skill_evidence', 'accept', receipt.data['evidence_id'])
        saved_result = receipt.data.get('kind') == 'personal_skill_workflow'
        text = render_receipt(receipt.data) if saved_result else render_query_receipt(receipt)
        if present and saved_result:
            from .personal_skill_presentation import present_verified_workflow
            text = present_verified_workflow(receipt.data, text, prompt, model, policy, telemetry, deadline)
        verify_current_source(receipt, source, hashes[filename])
    except (OSError, ValueError, KeyError, TypeError, TimeoutError) as error:
        if accepted:
            print('<<<DSH_DELTA_RESET>>>', flush=True)
        accepted = False
        receipt = ToolResult.error('personal_skill_workflow_rejected', str(error))
        attempts.append(receipt)
        telemetry.record_execution_result(receipt)
        telemetry.record_guard('personal_skill_evidence', 'reject', str(error)[:600])
        text = f'本次尚未通过完整校验：{error}。未将本轮任务标记完成。'
    if history_file:
        verification = persist_turn_evidence(history_file, hashes, prompt, attempts, telemetry.guard_decisions)
        history.extend([{'role': 'user', 'content': prompt},
                        {'role': 'assistant', 'content': text, 'verification': verification}])
        Path(history_file).write_text(json.dumps(history[-20:], ensure_ascii=False), encoding='utf-8')
    telemetry.finish_reason = 'verified_workflow' if accepted else 'workflow_rejected'
    telemetry.set_wall_clock_duration((time.time() - start_time) * 1000)
    telemetry.emit_metrics_event()
    TelemetryStats.emit_final_output(text)
    return True
