"""Bounded objective diagnostics and completion checks, using the disclosed tool index only."""
import re


def _description(text):
    return re.sub(r'[（(][^）)]{0,160}[）)]', '', str(text or '')[:1200])


def selected_objective(prompt, skill_id):
    from .mcp_runtime import known_tools
    from .skill_router import extract_query_features
    from .intent_lexicon import STOP_WORDS, GENERIC_VERBS
    features = set(extract_query_features(prompt)) - set(STOP_WORDS) - set(GENERIC_VERBS)
    ranked = []
    for tool in known_tools(skill_id):
        terms = set(extract_query_features(_description(tool.get('description'))))
        score = len(features & terms)
        ranked.append((score, tool))
    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked or ranked[0][0] < 3 or (len(ranked) > 1 and ranked[0][0] - ranked[1][0] < 2):
        return None  # Ambiguous objectives must not become invented execution requirements.
    return ranked[0][1]


def missing_objective(prompt, evidence, skill_id):
    target = selected_objective(prompt, skill_id)
    if not target:
        return None
    for receipt in evidence:
        provenance = getattr(receipt, 'provenance', None) or {}
        if (getattr(receipt, 'is_success', False) and provenance.get('tool') == 'call_external_tool'
                and provenance.get('skill_id') == skill_id and provenance.get('binding_id') == target['id']):
            return None
    return target


def record_mcp_route(prompt, route, telemetry):
    from .mcp_skill_catalog import available_mcp_skills
    from .skill_router import SemanticSkillMatcher
    skills = available_mcp_skills()
    if not skills:
        return
    scores = SemanticSkillMatcher(skills).match(prompt)
    selected = next((s for s in skills if s['id'] == route.skill_id), None)
    telemetry.record_guard('mcp_skill_route', 'selected' if selected else 'not_selected', {
        'selected_skill': selected['id'] if selected else None,
        'score': round(route.affinity_score, 2),
        'configured': selected.get('configured') if selected else None,
        'read_only': selected.get('read_only') if selected else None,
        'candidates': [{'skill_id': key, 'score': round(score, 2), 'reasons': reasons[:4]} for key, score, reasons in scores[:5]],
    })
