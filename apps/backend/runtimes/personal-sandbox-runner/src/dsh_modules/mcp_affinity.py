"""Catalog-size independent recall for explicit capability phrases in MCP summaries."""
import re
from .intent_contract import is_term_negated


def routing_description(skill):
    """Keep source capability terms for recall independently of the short AI display summary."""
    text = skill.get('routing_description') or skill.get('description', '')
    return text[:1024] if isinstance(text, str) else ''


def capability_phrase_score(query, description):
    query = str(query or '').lower()[:3000]
    description = re.sub(r'[（(][^）)]{0,160}[）)]', '', str(description or '').lower()[:1024])
    # Require a substantive exact phrase, not one shared verb or a single character.
    phrases = set()
    for block in re.findall(r'[\u4e00-\u9fff]+', query):
        for size in range(4, min(8, len(block)) + 1):
            phrases.update(block[i:i+size] for i in range(len(block)-size+1))
    matches = [p for p in phrases if p in description and not is_term_negated(query, p)]
    if matches:
        phrase = max(matches, key=len)
        return min(18.0, 8.0 + len(phrase)), phrase
    return 0.0, None
