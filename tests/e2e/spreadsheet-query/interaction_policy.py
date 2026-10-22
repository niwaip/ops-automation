"""Clarification is a valid turn, while the task can remain awaiting its user.

Text signals only select candidates for review. Acceptance requires an explicit
review bound to this exact session and answer, never a keyword auto-pass.
"""
import hashlib
import re


ACCEPTED = {'valid_clarification', 'valid_partial_clarification', 'grounded_data_gap'}


def answer_hash(answer):
    return hashlib.sha256(answer.encode('utf-8')).hexdigest()


def review_interaction(case_id, session_id, answer, reviews, *, stream_ok, displayed):
    bound = [r for r in reviews if r.get('id') == case_id
             and r.get('session_id') == session_id
             and r.get('answer_sha256') == answer_hash(answer)]
    review = bound[-1] if bound else {}
    disposition = review.get('disposition')
    grounded = bool(review.get('reason') and review.get('context_evidence'))
    if not stream_ok:
        return {'interaction_outcome': 'execution_error', 'task_status': 'blocked_engineering'}
    if disposition in ACCEPTED and grounded:
        return {'interaction_outcome': disposition, 'task_status': 'awaiting_user',
                'end_to_end': 'awaiting_user', 'primary_display': 'not_applicable',
                'review_reason': review['reason']}
    if disposition == 'engineering_blocked_with_information_request' and grounded:
        return {'interaction_outcome': 'truthful_information_request',
                'task_status': 'blocked_engineering', 'end_to_end': 'blocked',
                'review_reason': review['reason']}
    if disposition == 'engineering_blocked_clarification_attempt' and grounded:
        return {'interaction_outcome': 'grounded_clarification_attempt_blocked',
                'task_status': 'blocked_engineering', 'end_to_end': 'blocked',
                'primary_display': 'not_applicable', 'review_reason': review['reason']}
    if disposition == 'grounded_complete_answer' and grounded:
        return {'interaction_outcome': disposition, 'task_status': 'completion_reviewed',
                'extra_claims_reviewed': True, 'review_reason': review['reason']}
    if disposition == 'answer_with_stated_assumption' and grounded and review.get('accepted_definition'):
        return {'interaction_outcome': disposition, 'task_status': 'definition_reviewed',
                'accepted_definition': review['accepted_definition'],
                'extra_claims_reviewed': True, 'review_reason': review['reason']}
    if disposition == 'request_constraints_not_applied' and grounded:
        return {'interaction_outcome': disposition, 'task_status': 'incomplete',
                'request_constraints': 'fail', 'end_to_end': 'fail',
                'review_reason': review['reason']}
    candidate = bool(re.search(r'请确认|请问|请提供|请明确|请补充|口径不明确|信息不足|缺少.{0,12}数据', answer))
    if candidate and not review and displayed != 'fail':
        return {'interaction_outcome': 'clarification_needs_review', 'task_status': 'unresolved',
                'end_to_end': 'inconclusive'}
    return {'interaction_outcome': 'answer_needs_review', 'task_status': 'unresolved',
            'review_disposition': disposition, 'review_reason': review.get('reason')}
