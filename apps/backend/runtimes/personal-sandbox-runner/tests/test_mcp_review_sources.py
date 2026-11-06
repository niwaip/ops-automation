"""Review selection and rejection diagnostics across multiple MCP invocations."""
import json
import unittest
from dsh_modules.mcp_review_sources import collect_review_sources, source_id, MAX_TOTAL_CHARS
from dsh_modules.mcp_claim_validation import validate_claims
from dsh_modules.mcp_sources import finalize_mcp_sources
from dsh_modules.tool_result import ToolResult


def search_receipt(docs, invocation='search-one'):
    return ToolResult.success(data={'result': {'results': docs}}, provenance={
        'tool': 'call_external_tool', 'binding_id': 'search', 'invocation_id': invocation, 'skill_id': 'mcp-one',
        'sources': [{'url': d['contentUrl'], 'title': d['title']} for d in docs]})


def doc(number, text=None):
    return {'title': f'VPN Guide {number}', 'contentUrl': f'https://docs.example/guide-{number}#section',
            'content': text or f'Create virtual network number {number} before creating the VPN gateway.'}


class McpReviewSourceTests(unittest.TestCase):
    def test_duplicate_chunks_do_not_displace_later_distinct_documents(self):
        first = [doc(i) for i in range(5)]
        second = [doc(i) for i in (0, 1, 2, 3, 4)]
        third = [doc(i) for i in (2, 4, 5)]
        sources, stats = collect_review_sources([search_receipt(first), search_receipt(second, 'two'), search_receipt(third, 'three')])
        self.assertEqual(stats['candidate_chunks'], 13)
        self.assertEqual(len(sources), 6)
        self.assertIn(source_id(doc(5)['contentUrl']), {s['id'] for s in sources})
        self.assertEqual(len(next(s for s in sources if s['id'] == source_id(doc(0)['contentUrl']))['segments']), 1)
        reversed_sources, _ = collect_review_sources([search_receipt(third, 'three'), search_receipt(first)])
        self.assertEqual({s['id'] for s in reversed_sources}, {s['id'] for s in sources})

    def test_selected_quote_keeps_its_actual_invocation_after_merging(self):
        a = 'First source supplies the network prerequisites.'
        b = 'Second source supplies a different authenticated configuration setting.'
        sources, _ = collect_review_sources([search_receipt([doc(1, a)], 'first'), search_receipt([doc(1, b)], 'second')])
        proof, _ = validate_claims({'claims': [{'source_id': sources[0]['id'], 'statement': '配置要点。', 'quote': b}]}, sources)
        self.assertEqual(proof[0]['invocationId'], 'second')
        invalid, reasons = validate_claims({'claims': [{'source_id': sources[0]['id'], 'statement': '拼接。', 'quote': a + '\n\n' + b}]}, sources)
        self.assertEqual(invalid, [])
        self.assertEqual(reasons['rejection_counts'], {'quote_not_found': 1})

    def test_full_content_priority_community_classification_and_budget(self):
        community = {'title': 'VPN Microsoft Q&A', 'contentUrl': 'https://learn.microsoft.com/answers/a/123', 'content': 'Community text. ' * 500}
        fetched = ToolResult.success(data={'result': {'url': doc(0)['contentUrl'], 'title': 'VPN full guide', 'content': 'Full page body. ' * 1000}},
            provenance={'tool': 'call_external_tool', 'binding_id': 'fetch', 'invocation_id': 'full', 'skill_id': 'mcp-one'})
        sources, stats = collect_review_sources([search_receipt([community, *[doc(i, 'Search fragment. ' * 500) for i in range(6)]]), fetched], 'VPN')
        self.assertEqual(sources[0]['segments'][0]['kind'], 'fetch')
        self.assertEqual(sources[-1]['kind'], 'community')
        self.assertLessEqual(stats['selected_chars'], MAX_TOTAL_CHARS)
        self.assertEqual(len(sources), 7)

    def test_rejections_preserve_specific_safe_candidate_diagnostics(self):
        sources, _ = collect_review_sources([search_receipt([doc(1)])])
        sid = sources[0]['id']
        claims = [None, {'source_id': 'not-real', 'statement': 'missing', 'quote': 'some long unmatched quote'},
            {'source_id': sid, 'statement': '', 'quote': 'some long unmatched quote'},
            {'source_id': sid, 'statement': 'too short', 'quote': 'short'},
            {'source_id': sid, 'statement': 'wrong', 'quote': 'password=private-value Bearer private-token unmatched words'}]
        proof, diagnostics = validate_claims({'claims': claims}, sources)
        self.assertEqual(proof, [])
        self.assertEqual(set(diagnostics['rejection_counts']), {'invalid_candidate', 'unknown_source', 'invalid_statement', 'quote_too_short', 'quote_not_found'})
        self.assertNotIn('private-value', json.dumps(diagnostics))
        self.assertNotIn('private-token', json.dumps(diagnostics))
        self.assertEqual(diagnostics['rejections'][1]['suggested_source_id'], 'not-real')

    def test_footer_matches_reviewed_canonical_urls_despite_different_anchors(self):
        receipts = [search_receipt([doc(1), doc(2)])]
        text = '配置要点。[原文](https://docs.example/guide-2)'
        answer = finalize_mcp_sources(text, receipts, selected=True)
        self.assertNotIn('guide-1', answer)
        self.assertIn('guide-2#section', answer)

    def test_anchor_selection_returns_actual_text_and_rejects_foreign_source_span(self):
        sources, _ = collect_review_sources([search_receipt([doc(1), doc(2)])])
        source = sources[0]
        anchor = source['segments'][0]['spans'][0]
        proof, _ = validate_claims({'claims': [{'source_id': source['id'], 'span_id': anchor['id'],
            'statement': '按该场景创建网关。', 'quote': 'Model-authored quote must not become evidence.'}]}, sources)
        self.assertEqual(proof[0]['quote'], anchor['text'])
        self.assertEqual(proof[0]['invocationId'], 'search-one')
        invalid, diagnostics = validate_claims({'claims': [{'source_id': sources[1]['id'], 'span_id': anchor['id'],
            'statement': '不能跨来源使用段落编号。'}]}, sources)
        self.assertEqual(invalid, [])
        self.assertEqual(diagnostics['rejection_counts'], {'unknown_span': 1})
