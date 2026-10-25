"""Protect questions while checking factual assertions in partial answers."""

import hashlib
from pathlib import Path
import re


def clarification_is_grounded(text, evidence):
    from .analysis_synthesis import _collect_allowed_numbers, _has_unverified_numbers
    receipts = []
    for receipt in evidence or []:
        if not getattr(receipt, 'is_success', False) or not isinstance(receipt.data, dict):
            continue
        if receipt.data.get('kind') != 'spreadsheet_analysis':
            continue
        provenance = receipt.provenance or {}
        try:
            if hashlib.sha256(Path(provenance['file_path']).read_bytes()).hexdigest() != provenance.get('workbook_id'):
                continue
        except (OSError, KeyError, TypeError):
            continue
        receipts.append(receipt)
    allowed, numbers = _collect_allowed_numbers(receipts, prompt='', audit='')
    for clause in re.split(r'[。！？!?\n]', text):
        clause = clause.strip()
        if not clause:
            continue
        # Quoted thresholds/options in a question are not claims about results.
        # A result assertion before the question remains independently checked.
        if re.match(r'^(?:请确认|请问|请选择|是否|能否|您是指|需要您确认|please (?:confirm|clarify|specify))', clause, re.I) \
                and not re.search(r'结果|已核验|核算完成|已完成|总计为|合计为', clause):
            continue
        if _has_unverified_numbers(clause, allowed, numbers):
            return False
    return True


def review_clarification(text, evidence, prompt, model=None, deadline=None):
    """Keep clarification, but review explanatory claims about business meaning.

    Pure questions and short grounded partial answers do not need another model
    call. An unavailable review never forces calculation or blocks clarification.
    """
    if len(text) < 400 and (re.match(r'^请(?:确认|问|提供|明确|选择)', text)
                           or not re.search(r'属于|仅为|定义为|等同|折算|公式|换算为|代表', text)):
        return text, None
    from .analysis_contract import build_analysis_contract
    from .task_completeness_judge import judge_task_completeness
    contract = build_analysis_contract(prompt)
    facts, coverage, headers = [], [], set()
    for receipt in evidence or []:
        if not getattr(receipt, 'is_success', False) or not isinstance(receipt.data, dict):
            continue
        data = receipt.data
        facts.extend(data.get('facts', []))
        coverage.extend(data.get('coverage', []))
        for scope in data.get('coverage', []):
            headers.update(str(v) for v in scope.get('headers', {}).values())
        for sheet in data.get('sheets', []):
            for candidate in sheet.get('header_candidates', []):
                headers.update(str(v) for v in candidate.get('columns', {}).values())
    if not headers:
        try:
            import json
            import os
            from . import config as _cfg
            from .spreadsheet_preflight import profile_spreadsheet_for_planning
            raw_att = os.environ.get('DSH_SESSION_ATTACHMENTS', '').strip()
            att_files = json.loads(raw_att) if raw_att.startswith('[') else [x.strip() for x in raw_att.split(',') if x.strip()]
            for fn in att_files:
                if str(fn).lower().endswith(('.xlsx', '.xlsm', '.xls', '.csv')):
                    prof = profile_spreadsheet_for_planning(Path(_cfg.WORKSPACE_DIR) / Path(fn).name, prompt=prompt)
                    if prof:
                        for s in prof.get('sheets', []):
                            for h_name in (s.get('headers') or {}).values():
                                if isinstance(h_name, str) and h_name.strip():
                                    headers.add(h_name.strip())
        except Exception:
            pass
    verdict = judge_task_completeness(prompt, contract, facts, coverage,
        [{'code': 'clarification_claims_need_review',
          'message': '保留澄清权；核对并移除澄清解释中没有来源支持的字段业务含义、公式或结果断言。已挂载附件时严禁要求用户重新上传文件。'}],
        model=model, deadline=deadline,
        context={'clarification_candidate': text, 'known_headers': sorted(headers),
                 'provenance': [r.provenance for r in (evidence or []) if getattr(r, 'is_success', False)]})
    candidate = (verdict or {}).get('user_question', '')
    if headers and re.search(r'请上传|上传.*(?:文件|表格|附件)', candidate) and not re.search(r'请上传|上传.*(?:文件|表格|附件)', text):
        return text, verdict
    if ((verdict or {}).get('action') == 'clarify' and len(candidate) >= 10
            and re.search(r'请确认|请问|请提供|请明确|请补充|请选择|能否', candidate)
            and clarification_is_grounded(candidate, evidence)):
        return candidate, verdict
    target = '、'.join(contract.get_metric_names()) or '您需要的统计'
    return (f'要继续{target}，还需要确认相关字段的业务含义及计算口径。'
            '请说明哪些字段对应所需指标，或补充相应数据；确认后我再继续。'), verdict
