"""Execution and task coverage validation, independent of model presentation JSON."""

import hashlib
import json
import re
from pathlib import Path
from .analysis_contract import build_analysis_contract


def analysis_task_state(evidence, prompt=''):
    contract=build_analysis_contract(prompt)
    successful=[e for e in evidence if e.is_success and isinstance(e.data,dict)
                and e.data.get('kind')=='spreadsheet_analysis']
    issues=[]; hashes={}
    if not successful:
        issues.append({'code':'execution_evidence_missing','message':'缺少本轮成功的分析执行证据。'})
    for receipt in successful:
        provenance=receipt.provenance or {}; path=provenance.get('file_path')
        try:
            if path not in hashes:hashes[path]=hashlib.sha256(Path(path).read_bytes()).hexdigest()
            if hashes[path]!=provenance.get('workbook_id'):
                issues.append({'code':'source_changed','message':'原件已变化，本轮证据失效。'})
        except (OSError,TypeError):
            issues.append({'code':'source_unavailable','message':'来源原件或哈希凭据不可用。'})
        data=receipt.data
        if not data.get('evidence_id'):
            issues.append({'code':'evidence_id_missing','message':'执行回执缺少证据ID。'})
        if not any(data.get(key) for key in ('facts','checks','rules','profiles')):
            issues.append({'code':'execution_result_empty','message':'没有成功的计算或检查结果。'})
        if any(not c.get('coverage_complete') for c in data.get('coverage',[])):
            issues.append({'code':'scope_incomplete','message':'声明范围尚未完整处理。'})
    facts=[f for e in successful for f in e.data.get('facts',[])]
    missing=[]
    for metric in contract.metrics:
        matches=[f for f in facts if (metric.semantic_id and f.get('metric_id')==metric.semantic_id)
                 or (not f.get('metric_id') and any(re.search(alias,f['label']) for alias in metric.aliases))]
        typed=[f for f in matches if (f['unit']=='%' if metric.expected_type=='percentage' else
                                     f['unit']!='%' if metric.expected_type=='number' else True)]
        if not typed:
            missing.append({'metric_id':metric.semantic_id,'name':metric.name,'expected_type':metric.expected_type})
    if missing:
        issues.append({'code':'required_metrics_missing','metrics':missing,
                       'message':'分析计划遗漏所需指标或类型：'+'、'.join(m['name'] for m in missing)+'。'})
    if re.search(r'变化|趋势|增长|增减|改善|change|trend|growth',prompt,re.I):
        scopes={}
        for receipt in successful:
            for c in receipt.data.get('coverage',[]):
                key=((receipt.provenance or {}).get('workbook_id'),c['sheet'])
                scopes.setdefault(key,set()).add(tuple(c['selected_rows']))
        if not any(len(windows)>=2 for windows in scopes.values()):
            issues.append({'code':'comparison_windows_missing',
                'message':'用户要求变化或趋势，需补充同一来源不同期间的对照及比率/变化。'})
    return {'complete':not issues,'domain':contract.domain,
            'evidence_ids':list(dict.fromkeys(e.data.get('evidence_id') for e in successful)),
            'missing_metrics':missing,'issues':issues}


def task_feedback(evidence,prompt=''):
    state=analysis_task_state(evidence,prompt)
    return ('【程序任务状态】\n'+json.dumps(state,ensure_ascii=False)+'\n'
            '只修复issues中的执行或任务缺项；已有指标不重复计算。比率不是金额。'
            '证据ID由程序维护，不需要重写ID或最终数字，也不要为修复hypotheses重新调用工具。')
