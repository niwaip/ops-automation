"""Keep PDF output authorization and page requirements separate from source metadata."""

import re


def pdf_user_instruction(prompt):
    # The attachment envelope describes inputs; it cannot request a deliverable.
    text = re.sub(
        r'【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】[：:][^\n]*',
        '', prompt or '')
    return re.sub(r'^\s*用户指令[：:]', '', text).strip()


def pdf_page_requirement_text(prompt):
    # Numbers in either input or output filenames are never page-count clauses.
    text = pdf_user_instruction(prompt)
    return re.sub(
        r'[^\s，。；：:、\n\"\'“”‘’《》`]+\.(?:pdf|docx?|pptx?|xlsx?|txt|md)(?![a-zA-Z0-9])',
        '<FILE_REF>', text, flags=re.I)


def requests_pdf_output(prompt, expected_deliverables=None):
    from .intent_contract import extract_source_and_target_artifacts, is_term_negated
    from .skill_router import is_text_only_request

    request = pdf_user_instruction(prompt)
    if is_text_only_request(request) or is_term_negated(request, 'pdf'):
        return False
    if any(str(ext).lower() == '.pdf' for ext in (expected_deliverables or [])):
        return True
    _, targets, _ = extract_source_and_target_artifacts(request)
    return '.pdf' in targets
