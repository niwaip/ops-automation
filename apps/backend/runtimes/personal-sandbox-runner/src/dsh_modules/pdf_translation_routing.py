"""Bind explicit source-format preservation before choosing a PDF workflow."""
import re


def preserves_pdf_format(prompt):
    request = (prompt or '').split('用户指令：')[-1]
    if re.search(r'(?:不要|无需|不用|不必|不要求|do not|without)\s*(?:保持|保留|保存|keep|preserv)', request, re.I):
        return False
    return bool(re.search(r'(?:保持|保留|保存)(?:原有|原始|原)?(?:的)?(?:格式|版式)(?:不变)?|'
                          r'(?:格式|版式)不变|preserve\s+(?:the\s+)?(?:original\s+)?format|'
                          r'keep\s+(?:the\s+)?(?:original\s+)?format', request, re.I))


def normalize_pdf_translation_route(prompt, files, routed, telemetry):
    from .pdf_translation_workflow import fixed_translation
    request = (prompt or '').split('用户指令：')[-1]
    admission = getattr(routed, 'admission', {}) or {}
    if (not preserves_pdf_format(prompt) or not fixed_translation(prompt, files)
            or getattr(routed, 'is_guide_intent', False) or admission.get('task_mode') == 'consult'
            or admission.get('skill_invocation', {}).get('mode') == 'execute'
            or re.search(r'(?<![A-Za-z])(?:word|docx?|xlsx?|excel|pptx?|powerpoint|html|markdown|txt)'
                         r'(?![A-Za-z])|\.md\b|纯文本', request, re.I)):
        return routed
    previous = list(getattr(routed, 'deliverables', []))
    if len(previous) > 1 or any(not str(item).lower().endswith(('.docx', '.pdf')) for item in previous):
        return routed
    routed.deliverables = [item for item in previous if str(item).lower().endswith('.pdf')] or ['.pdf']
    routed.is_generate_intent = routed.requires_execution = True
    routed.is_inspect_intent = routed.is_docx_intent = False
    if getattr(routed, 'skill_id', None) == 'docx':
        routed.skill_id, routed.skill_context = None, ''
        admission = dict(admission, action='general', skill_id=None,
                         use_default_rules=False, rule_basis='', reason='preserve_source_format')
    routed.admission = dict(admission, artifact_types=list(routed.deliverables), output_mode='artifact')
    if previous != routed.deliverables:
        telemetry.record_guard('pdf_translation_format', 'preserve_source',
                               {'previous': previous, 'deliverables': routed.deliverables})
    return routed
