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
        if code in ('required_metrics_missing', 'metric_unit_mismatch'):
            # 严格断言：每个缺失的指标都必须在事实或支持事实中真正存在，绝不允许以偏概全
            metric_names = [m.get('name') for m in issue.get('metrics', [])]
            fact_labels = {str(f.get('label', '')) for f in facts} | {str(f.get('id', '')) for f in facts}
            if metric_names:
                all_metrics_covered = all(
                    any(m_name in lbl for lbl in fact_labels)
                    for m_name in metric_names if m_name
                )
            else:
                all_metrics_covered = bool(fact_labels)
            # Other requested metrics cannot stand in for the missing measure.
            justified = all_metrics_covered
        elif code == 'unsolicited_filter_applied':
            # 仅在裁判明确判定误报且存在支撑事实证据时才可撤销
            justified = (verdict.get('category') == 'gate_false_positive'
                         and (bool(supporting) or bool(facts)))
        elif code == 'per_group_metrics_missing':
            has_group_calc = (supporting and ids <= {f.get('id') for f in facts}
                              and any(
                                  issue.get('metric', '') in c.get('label', '')
                                  and c.get('expression', {}).get('group_by')
                                  and any(v.get('id') == c['expression'].get('table') and v.get('coverage_complete')
                                          for v in r.data.get('coverage', []))
                                  for r in receipts for c in (r.data.get('plan') or {}).get('calculations', [])))
            # 若裁判判定指令本身为全局指标口径说明而非按维度分组，且全局事实存在，判定成立
            not_a_grouped_query = verdict.get('category') == 'gate_false_positive' and bool(facts)
            justified = has_group_calc or not_a_grouped_query
        elif code == 'entity_filter_missing':
            entities = issue.get('entities') or []
            justified = any(
                getattr(r, 'is_success', False)
                and any(v.get('coverage_complete') for v in r.data.get('coverage', []))
                and filter_matches_entities(r, entities)
                for r in receipts if isinstance(getattr(r, 'data', None), dict)
            )
        elif code == 'grouping_incomplete':
            # 真实核验：必须真正产生了多组明细或具有多个不同分组键，绝不能仅凭计划包含 group_by 字段就豁免
            justified = any(
                getattr(r, 'is_success', False)
                and isinstance(getattr(r, 'data', None), dict)
                and any(v.get('coverage_complete') for v in r.data.get('coverage', []))
                and (
                    (r.data.get('stages') or {}).get('groups_count', 0) > 1
                    or len(r.data.get('rows', [])) > 1
                    or len({f.get('group_key') for f in r.data.get('facts', []) if f.get('group_key') is not None}) > 1
                )
                for r in receipts
            )
        elif code == 'row_filter_not_applied':
            # 刚性红线：行级筛选缺失绝不能仅凭 group_by 豁免！
            # 仅当执行证据中真正执行了行筛选条件，或裁判指明支撑事实且实际执行了 having 聚合筛选时才可豁免
            has_row_filter_exec = any(
                getattr(r, 'is_success', False)
                and isinstance(getattr(r, 'data', None), dict)
                and (
                    any(bool(v.get('filters')) for v in r.data.get('coverage', []))
                    or bool((r.data.get('plan') or {}).get('where'))
                    or bool((r.data.get('plan') or {}).get('filters'))
                )
                for r in receipts
            )
            has_having_exec = (
                bool(supporting)
                and any(
                    getattr(r, 'is_success', False)
                    and isinstance(getattr(r, 'data', None), dict)
                    and any(v.get('coverage_complete') for v in r.data.get('coverage', []))
                    and bool((r.data.get('plan') or {}).get('having'))
                    for r in receipts
                )
            )
            justified = has_row_filter_exec or has_having_exec
        elif code == 'audit_checks_incomplete':
            # 多项合规检查未完成绝对不能由复核自动豁免
            justified = False
        elif code in ('group_filter_not_applied', 'group_filter_boolean_incomplete'):
            # Dismissed by judge: verified if receipts actually executed a having stage
            justified = any(
                getattr(r, 'is_success', False)
                and isinstance(getattr(r, 'data', None), dict)
                and bool((r.data.get('plan') or {}).get('having'))
                for r in receipts
            )
        elif code in ('ordering_not_applied', 'ordering_incomplete'):
            # Dismissed by judge: verified if receipts actually executed an order_by stage
            justified = any(
                getattr(r, 'is_success', False)
                and isinstance(getattr(r, 'data', None), dict)
                and bool((r.data.get('plan') or {}).get('order_by'))
                for r in receipts
            )
        elif code == 'ranking_limit_not_applied':
            # Dismissed by judge: verified if receipts actually executed a limit stage
            justified = any(
                getattr(r, 'is_success', False)
                and isinstance(getattr(r, 'data', None), dict)
                and (r.data.get('plan') or {}).get('limit') is not None
                for r in receipts
            )

        if justified:
            dismissed.append(code)
        else:
            remaining.append(issue)

    return remaining, {**verdict, 'revalidated': True, 'dismissed_issue_codes': dismissed,
                       'complete': not remaining,
                       'action': 'recheck' if not remaining else 'repair'}
