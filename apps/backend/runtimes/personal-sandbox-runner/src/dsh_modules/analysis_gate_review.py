"""Revalidate an LLM's proposed false positive against actual execution receipts."""

from .analysis_task_state import filter_matches_entities


def revalidate_review(issues, verdict, receipts, facts):
    proposed = set(verdict.get('dismissed_issue_codes') or [])
    ids = set(verdict.get('supporting_fact_ids') or [])
    supporting = [f for f in facts if f.get('id') in ids]
    integrity_failed = any(i.get('code') in {
        'source_changed', 'source_unavailable', 'evidence_id_missing', 'scope_incomplete',
        'execution_evidence_missing', 'execution_result_empty'
    } for i in issues)
    dismissed = []
    remaining = []
    for issue in issues:
        code = issue.get('code')
        if integrity_failed or code not in proposed:
            remaining.append(issue)
            continue

        justified = False
        if code == 'per_group_metrics_missing':
            justified = (supporting and ids <= {f.get('id') for f in facts}
                         and any(
                             issue.get('metric', '') in c.get('label', '')
                             and c.get('expression', {}).get('group_by')
                             and any(v.get('id') == c['expression'].get('table') and v.get('coverage_complete')
                                     for v in r.data.get('coverage', []))
                             for r in receipts for c in (r.data.get('plan') or {}).get('calculations', [])))
        elif code == 'entity_filter_missing':
            entities = issue.get('entities') or []
            justified = any(
                getattr(r, 'is_success', False)
                and any(v.get('coverage_complete') for v in r.data.get('coverage', []))
                and filter_matches_entities(r, entities)
                for r in receipts if isinstance(getattr(r, 'data', None), dict)
            )

        if justified:
            dismissed.append(code)
        else:
            remaining.append(issue)

    return remaining, {**verdict, 'revalidated': True, 'dismissed_issue_codes': dismissed,
                       'complete': not remaining,
                       'action': 'recheck' if not remaining else 'repair'}

