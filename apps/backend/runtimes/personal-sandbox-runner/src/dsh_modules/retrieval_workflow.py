"""First-pass personal/web retrieval orchestration with an auditable source plan."""
import time
from dataclasses import asdict, dataclass

from .retrieval_policy import RetrievalPlan, plan_retrieval
from .retrieval_evidence import render_personal_context, select_evidence


@dataclass
class RetrievalContext:
    personal: str
    web: str
    query: str
    plan: RetrievalPlan


def _missing_facets(plan, metadata):
    if not plan.prefetch_web:
        return []
    web = [item for item in metadata if item['source'] == 'web']
    if not web:
        return ['relevant_web_evidence']
    return ['installation_reference'] if plan.deployment and not any(item['installationHint'] for item in web) else []


def retrieve_context(prompt, skill_res, *, existing_history, session_files,
                     web_available, weather_intent, deadline, telemetry):
    from .skill_router import SkillRouter
    from .tool_routing import is_document_translation_task
    from .tools import scan_personal_knowledge, perform_multi_web_search
    from .personal_knowledge_search import get_last_scanned_knowledge_files, retain_scanned_knowledge_files
    from .web_tools import enrich_search_context_with_pages
    query = SkillRouter.resolve_contextual_query(prompt, existing_history)
    attachment_only = bool(session_files and not skill_res.is_knowledge_intent
        and not any(k in prompt for k in ['知识库', '个人空间', '我的文档', '我的资料', '历史成果'])
        and ((skill_res.is_inspect_intent and not skill_res.is_generate_intent and not skill_res.requires_execution)
             or is_document_translation_task(prompt, skill_res)))
    plan = plan_retrieval(prompt, resolved_query=query, web_available=web_available,
        routed_search=bool(skill_res.is_search_intent or weather_intent),
        attachment_only=attachment_only,
        document_task=bool(skill_res.is_generate_intent or skill_res.skill_id in
                           {'docx', 'xlsx', 'pdf', 'pptx', 'html-ppt', 'guizang-ppt'}),
        connected_workflow=bool(getattr(skill_res, 'disclosure_steps', 0)))
    telemetry.record_guard('retrieval_policy', 'planned', asdict(plan))
    personal = ''
    retain_scanned_knowledge_files([])
    if plan.personal_allowed and not getattr(skill_res, 'disclosure_steps', 0):
        if skill_res.is_knowledge_intent:
            personal = scan_personal_knowledge(prompt=query)
        elif not attachment_only:
            personal = scan_personal_knowledge(prompt=query, auto_match_only=True)
            if personal:
                skill_res.is_knowledge_intent = True
    web = ''
    if plan.prefetch_web:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError('Task deadline exceeded before retrieval')
        print(f'🔍 [Harness Web Search] 正在检索: {query}', flush=True)
        web = perform_multi_web_search(query, deadline=deadline)
    documents = get_last_scanned_knowledge_files()
    selected, web, metadata = select_evidence(query, documents, web)
    missing = _missing_facets(plan, metadata)
    supplemented = False
    if missing and (deadline is None or deadline - time.monotonic() >= 10):
        supplement_query = query + (' official installation quickstart configuration' if plan.deployment else ' 官方资料')
        extra = perform_multi_web_search(supplement_query, max_queries=1, deadline=deadline)
        selected, web, metadata = select_evidence(query, documents, web + '\n\n' + extra)
        supplemented = True
    telemetry.record_guard('retrieval_coverage', 'supplemented' if supplemented else 'checked', {
        'missingFacets': _missing_facets(plan, metadata), 'supplementUsed': supplemented,
        'assessment': 'source_and_task_facets_only_not_factual_verification'})
    retain_scanned_knowledge_files(selected)
    if documents:
        personal = render_personal_context(selected, prompt=query)
    telemetry.record_guard('retrieval_selection', 'selected', {
        'initialLimit': 5, 'personalCandidates': len(documents), 'selected': metadata,
        'personalChars': len(personal), 'webChars': len(web)})
    if web:
        page_deadline = min(deadline, time.monotonic() + 8) if deadline else time.monotonic() + 8
        try:
            web = enrich_search_context_with_pages(web, max_pages=2,
                max_chars_per_page=4500 if plan.deployment else 2500, deadline=page_deadline)
        except Exception as error:
            telemetry.record_guard('retrieval_pages', 'failed', {'errorType': type(error).__name__})
    return RetrievalContext(personal, web, query, plan)
