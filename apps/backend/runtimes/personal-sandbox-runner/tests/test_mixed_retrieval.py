"""Source boundaries, task coverage, and bounded deployment correction regressions."""
import sys
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.retrieval_policy import plan_retrieval
from dsh_modules.retrieval_evidence import select_evidence, render_personal_context
from dsh_modules.deployment_evidence_review import DeploymentEvidenceReview
from dsh_modules.tool_result import ToolResult
from dsh_modules.web_tools import decompose_search_queries, perform_multi_web_search
from dsh_modules.prompt_builder import build_user_turn
from dsh_modules.response_sources import append_retrieval_sources_footer

WEB_TOOLS = [{'type': 'function', 'function': {'name': 'web_search'}}]
COMMAND = '```bash\nhelm install gateway vendor/gateway\n```'


def document(i, **extra):
    return dict(id=str(i), name=f'AI网关资料{i}', url=f'https://workspace.local/{i}',
                path=f'personal-knowledge://{i}', content='AI 网关的内部配置约定。', score=500, **extra)


class MixedRetrievalTests(unittest.TestCase):
    def test_source_routing_boundaries(self):
        cases = [
            ('联网查看AI网关有哪些，如何部署', True, True, 'explicit_web'),
            ('AI网关有哪些，如何部署', True, True, 'public_technical'),
            ('如何部署 Higress', True, True, 'public_technical'),
            ('Docker 最新版本是什么', True, True, 'public_technical'),
            ('我的资料里AI网关如何部署', True, False, 'personal_first'),
            ('在个人空间搜索AI网关部署资料', True, False, 'personal_first'),
            ('结合我的资料，AI网关如何部署', True, True, 'public_technical'),
            ('不要联网，AI网关如何部署', False, False, 'user_local_only'),
            ('只根据我的资料解释AI网关', False, False, 'user_local_only'),
            ('Do not search the web, how to deploy Higress', False, False, 'user_local_only'),
            ('AI网关是什么意思', True, False, 'on_demand'),
            ('Docker是什么', True, False, 'on_demand'),
        ]
        for prompt, allowed, prefetch, reason in cases:
            with self.subTest(prompt=prompt):
                plan = plan_retrieval(prompt, web_available=True)
                self.assertEqual((plan.web_allowed, plan.prefetch_web, plan.reason), (allowed, prefetch, reason))

    def test_permission_and_document_scope(self):
        self.assertFalse(plan_retrieval('联网查AI网关', web_available=False).prefetch_web)
        self.assertFalse(plan_retrieval('总结附件的部署说明', web_available=True, attachment_only=True).prefetch_web)
        self.assertFalse(plan_retrieval('生成部署指南文档', web_available=True, document_task=True).prefetch_web)
        self.assertTrue(plan_retrieval('联网补充附件的部署说明', web_available=True, attachment_only=True).prefetch_web)
        self.assertFalse(plan_retrieval('只联网查看AI网关', web_available=True).personal_allowed)
        self.assertFalse(plan_retrieval('在连接的资料源搜索AI网关部署', web_available=True,
                                       connected_workflow=True).prefetch_web)

    def test_generic_ai_infrastructure_does_not_count_as_gateway_evidence(self):
        web = ('1. [Deploy AI compute infrastructure](https://docs.vendor.example/infrastructure)\nAI compute platform.\n'
               '2. [AI Gateway install](https://docs.gateway.example/install)\nGateway configuration guide.')
        _, context, selected = select_evidence('AI网关如何部署', [document(1)], web)
        self.assertNotIn('infrastructure)', context)
        self.assertIn('gateway.example', context)
        self.assertEqual(len(selected), 2)

    def test_excerpt_prefers_topic_section_over_frontmatter_tags(self):
        doc = document(1)
        doc['content'] = '---\ntags: [AI网关]\n---\n' + '通用背景。' * 800 + '\n## AI 网关部署\n部署专属内容。' * 30
        text = render_personal_context([doc], prompt='AI网关如何部署', max_chars=500)
        self.assertIn('部署专属内容', text)

    def test_queries_cover_products_and_deployment_without_news(self):
        queries = decompose_search_queries('联网查看关于AI网关的都有什么，如何部署')
        self.assertEqual(len(queries), 3)
        self.assertIn('AI网关', queries[0])
        self.assertIn('对比', queries[0])
        self.assertIn('installation', queries[1])
        self.assertIn('验证', queries[2])
        self.assertNotIn('latest news', ' '.join(queries))
        self.assertNotIn('latest updates', ' '.join(queries))

    def test_deployment_uses_official_first_provider_policy(self):
        with patch('dsh_modules.web_tools.perform_platform_web_search', return_value='results') as search:
            perform_multi_web_search('AI网关如何部署')
        self.assertEqual(search.call_args.kwargs['source_policy'], 'official-first')
        self.assertIn('installation', ' '.join(search.call_args.kwargs['extra_queries']))

    def test_shared_top_five_covers_personal_and_manual_without_raw_scores(self):
        docs = [document(i) for i in range(8)]
        docs[0]['score'] = 999999
        web = ('1. [AI网关宣传页](https://vendor.example/ai-gateway)\n产品能力。\n'
               '2. [AI网关安装](https://vendor.example/docs/install)\n安装配置。\n'
               '3. [重复安装页](https://vendor.example/docs/install#configuration)\n重复。')
        local, context, selected = select_evidence('AI网关如何部署', docs, web)
        self.assertEqual(len(selected), 5)
        self.assertTrue(local)
        self.assertIn('/docs/install)', context)
        self.assertEqual(sum('/docs/install' in s['url'] for s in selected), 1)
        self.assertNotIn('重复安装页', context)

    def test_no_fixed_source_quota_and_local_hash_deduplication(self):
        docs = [document(i, contentSha256='same') for i in range(3)]
        web = '\n'.join(f'{i}. [AI网关手册{i}](https://vendor.example/docs/{i})\nAI网关安装。' for i in range(8))
        local, _, selected = select_evidence('AI网关如何部署', docs, web)
        self.assertEqual(len(local), 1)
        self.assertEqual(sum(s['source'] == 'web' for s in selected), 4)

    def test_unknown_vertical_format_is_preserved(self):
        weather = '【实时权威气象与多日预报】上海 20℃'
        self.assertEqual(select_evidence('上海天气', [], weather)[1], weather)

    def test_prompt_has_one_source_policy_and_private_links_are_internal(self):
        text = build_user_turn('AI网关如何部署', knowledge_context='本地资料', search_context='网络资料',
                               available_tool_names=['web_search', 'fetch_page', 'read_file'])
        self.assertNotIn('唯一事实依据', text)
        self.assertNotIn('个人空间文档优先硬约束', text)
        self.assertIn('用户环境、已有配置和内部约定', text)
        self.assertIn('对应版本的官方文档', text)
        self.assertIn('产品选择、环境前提、版本、安装配置和验证方法', text)

    def test_unused_sources_are_not_added_and_internal_uri_is_replaced(self):
        docs = [document(1), document(2)]
        result = append_retrieval_sources_footer('参考[原件](personal-knowledge://1)。',
            local_knowledge_files=docs, search_context='1. [未使用](https://other.example/docs)', used_only=True)
        self.assertIn('https://workspace.local/1', result)
        self.assertNotIn('personal-knowledge://', result)
        self.assertNotIn('workspace.local/2', result)
        self.assertNotIn('other.example', result)

    def test_deployment_correction_is_bounded_and_failed_receipts_are_not_evidence(self):
        review = DeploymentEvidenceReview('AI网关如何部署', WEB_TOOLS)
        telemetry = Mock()
        failed = ToolResult.error('unavailable', COMMAND, provenance={'tool': 'fetch_page'})
        feedback, _ = review.review(COMMAND, [failed], can_retry=True, telemetry=telemetry)
        self.assertIn('fetch_page', feedback)
        feedback, answer = review.review(COMMAND, [], can_retry=True, telemetry=telemetry)
        self.assertFalse(feedback)
        self.assertNotIn('helm install', answer)
        self.assertIn('尚未', answer)

    def test_supported_commands_and_personal_originals_are_accepted(self):
        for source in ['fetch_page', 'scan_knowledge', 'read_file']:
            review = DeploymentEvidenceReview('AI网关如何部署', WEB_TOOLS)
            receipt = ToolResult.success(COMMAND, provenance={'tool': source})
            feedback, answer = review.review(COMMAND, [receipt], can_retry=True, telemetry=Mock())
            self.assertFalse(feedback)
            self.assertEqual(answer, COMMAND)

    def test_no_network_does_not_trigger_deployment_repair(self):
        review = DeploymentEvidenceReview('不要联网，AI网关如何部署', [])
        self.assertEqual(review.review(COMMAND, [], can_retry=True, telemetry=Mock()), ('', COMMAND))

    def test_unverified_yaml_requires_review(self):
        review = DeploymentEvidenceReview('AI网关如何部署', WEB_TOOLS)
        feedback, _ = review.review('```yaml\napiVersion: imaginary/v1\nkind: Gateway\n```', [],
                                    can_retry=True, telemetry=Mock())
        self.assertTrue(feedback)

    def test_invented_citation_triggers_same_bounded_review(self):
        review = DeploymentEvidenceReview('AI网关如何部署', WEB_TOOLS)
        text = '| 产品 | 文档 |\n| --- | --- |\n| Imaginary | [官方文档](https://imaginary.example/docs) |'
        feedback, _ = review.review(text, [], can_retry=True, telemetry=Mock())
        self.assertTrue(feedback)
        feedback, final = review.review(text, [], can_retry=True, telemetry=Mock())
        self.assertFalse(feedback)
        self.assertNotIn('Imaginary', final)
        self.assertNotIn('imaginary.example', final)

    def test_personal_document_title_resolves_to_its_real_ui_link(self):
        from dsh_modules.retrieval_citations import assess_citations
        uri = '/workspaces?tab=personal&workspaceId=owned&fileId=original'
        source = ToolResult.success(f'[阿里云AI应用开发新范式：企业实践.md]({uri})', provenance={'tool': 'scan_knowledge'})
        text, unknown = assess_citations('[阿里云AI应用开发新范式](https://made-up.example/)', [source])
        self.assertIn(uri, text)
        self.assertFalse(unknown)

    def test_known_web_citation_is_not_replaced_by_similarly_named_personal_note(self):
        from dsh_modules.retrieval_citations import assess_citations
        text = '[阿里云AI应用开发新范式](https://vendor.example/docs)'
        receipts = [ToolResult.success('[阿里云AI应用开发新范式.md](/workspaces?fileId=original)', provenance={'tool': 'scan_knowledge'}),
                    ToolResult.success(text, provenance={'tool': 'web_search'})]
        repaired, unknown = assess_citations(text, receipts)
        self.assertEqual(repaired, text)
        self.assertFalse(unknown)

    def test_loop_integrates_one_repair_then_omits_unsupported_commands(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        draft = {'content': COMMAND, 'finish_reason': 'stop'}
        with patch('dsh_modules.agent_loop.call_model_proxy', side_effect=[draft, draft]) as model, \
             patch('dsh_modules.agent_loop.execute_tool') as execute, redirect_stdout(io.StringIO()):
            result = run_agent_loop([{'role': 'user', 'content': 'AI网关如何部署'}], 'default',
                                    RuntimePolicy(), 1, tools=WEB_TOOLS, user_prompt='AI网关如何部署')
        self.assertEqual(model.call_count, 2)
        execute.assert_not_called()
        self.assertNotIn('helm install', result.final_text)
        self.assertIn('尚未', result.final_text)

    def test_workflow_without_explicit_online_still_searches_and_selects_five(self):
        from dsh_modules.retrieval_workflow import retrieve_context
        from dsh_modules.personal_knowledge_search import retain_scanned_knowledge_files
        skill = SimpleNamespace(is_knowledge_intent=False, is_inspect_intent=False, is_generate_intent=False,
                                requires_execution=False, skill_id=None, is_search_intent=False)
        def scan(**kwargs):
            retain_scanned_knowledge_files([document(i) for i in range(7)])
            return 'personal context'
        with patch('dsh_modules.tools.scan_personal_knowledge', side_effect=scan), \
             patch('dsh_modules.tools.perform_multi_web_search', return_value='1. [AI网关安装](https://vendor.example/docs/install)\n安装说明。') as search, \
             patch('dsh_modules.web_tools.enrich_search_context_with_pages', side_effect=lambda context, **kw: context):
            telemetry = Mock()
            result = retrieve_context('AI网关有哪些，如何部署', skill, existing_history=[], session_files=[],
                                      web_available=True, weather_intent=False, deadline=None, telemetry=telemetry)
        search.assert_called_once()
        self.assertEqual(result.plan.reason, 'public_technical')
        self.assertIn('个人空间资料', result.personal)
        selected = next(c.args[2]['selected'] for c in telemetry.record_guard.call_args_list if c.args[0] == 'retrieval_selection')
        self.assertEqual(len(selected), 5)

    def test_missing_installation_facet_gets_one_targeted_supplement(self):
        from dsh_modules.retrieval_workflow import retrieve_context
        skill = SimpleNamespace(is_knowledge_intent=False, is_inspect_intent=False, is_generate_intent=False,
                                requires_execution=False, skill_id=None, is_search_intent=False)
        with patch('dsh_modules.tools.scan_personal_knowledge', return_value=''), \
             patch('dsh_modules.tools.perform_multi_web_search', side_effect=[
                 '1. [AI Gateway](https://vendor.example/overview)\nGateway overview.',
                 '1. [AI Gateway installation](https://vendor.example/docs/install)\nGateway installation.']) as search, \
             patch('dsh_modules.web_tools.enrich_search_context_with_pages', side_effect=lambda context, **kw: context):
            result = retrieve_context('AI网关如何部署', skill, existing_history=[], session_files=[],
                                      web_available=True, weather_intent=False, deadline=None, telemetry=Mock())
        self.assertEqual(search.call_count, 2)
        self.assertEqual(search.call_args.kwargs['max_queries'], 1)
        self.assertIn('/docs/install', result.web)

    def test_local_only_workflow_never_calls_web_adapter(self):
        from dsh_modules.retrieval_workflow import retrieve_context
        skill = SimpleNamespace(is_knowledge_intent=False, is_inspect_intent=False, is_generate_intent=False,
                                requires_execution=False, skill_id=None, is_search_intent=True)
        with patch('dsh_modules.tools.scan_personal_knowledge', return_value=''), \
             patch('dsh_modules.tools.perform_multi_web_search') as search:
            result = retrieve_context('只根据我的资料说明AI网关部署', skill, existing_history=[], session_files=[],
                                      web_available=True, weather_intent=False, deadline=None, telemetry=Mock())
        search.assert_not_called()
        self.assertFalse(result.plan.web_allowed)

    def test_web_only_workflow_never_scans_personal_documents(self):
        from dsh_modules.retrieval_workflow import retrieve_context
        skill = SimpleNamespace(is_knowledge_intent=True, is_inspect_intent=False, is_generate_intent=False,
                                requires_execution=False, skill_id=None, is_search_intent=True)
        with patch('dsh_modules.tools.scan_personal_knowledge') as scan, \
             patch('dsh_modules.tools.perform_multi_web_search', return_value='1. [Gateway](https://vendor.example/docs/install)\nGateway install.'), \
             patch('dsh_modules.web_tools.enrich_search_context_with_pages', side_effect=lambda context, **kw: context):
            result = retrieve_context('只联网查看AI网关如何部署', skill, existing_history=[], session_files=[],
                                      web_available=True, weather_intent=False, deadline=None, telemetry=Mock())
        scan.assert_not_called()
        self.assertFalse(result.personal)


if __name__ == '__main__':
    unittest.main()
