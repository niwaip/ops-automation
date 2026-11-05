"""Progressive MCP disclosure, privacy and native fast-path integration."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from dsh_modules import mcp_skill_catalog as catalog
from dsh_modules.skills import get_available_skills, read_skill
from dsh_modules.prompt_builder import build_skills_catalog
from dsh_modules.tool_routing import select_active_tools

SKILL = {'id': 'mcp-123', 'name': 'Example Docs', 'description': '查询 Example 官方文档', 'routing_description': 'SOURCE_ROUTING_TERMS',
         'source': 'mcp', 'type': 'mcp', 'aliases': ['Example Docs'], 'triggers': ['Example Docs'],
         'execution_mode': 'mcp', 'default_rounds': 6, 'inputSchema': {'secret': 'NEVER_FIRST_LAYER'}}


class McpSkillDisclosureTests(unittest.TestCase):
    def setUp(self):
        catalog._cache = None
        catalog._cache_until = 0

    def test_level_one_exposes_metadata_not_schema(self):
        with patch.object(catalog, '_get', return_value=[SKILL]) as get:
            skills = get_available_skills()
            dynamic = next(s for s in skills if s['id'] == 'mcp-123')
            self.assertNotIn('inputSchema', dynamic)
            self.assertEqual(dynamic['routing_description'], 'SOURCE_ROUTING_TERMS')
            text = build_skills_catalog(skills)
            self.assertIn('Example Docs', text)
            self.assertNotIn('NEVER_FIRST_LAYER', text)
            self.assertNotIn('SOURCE_ROUTING_TERMS', text)
            get.assert_called_once_with('skills')
            self.assertLess(len(build_skills_catalog([dynamic])), 220)

    def test_read_skill_fetches_only_selected_index(self):
        with patch.object(catalog, '_get', side_effect=[[SKILL], {
            'instructions': 'use selected tool', 'tools': [{'id': 'binding', 'name': 'search'}]}]) as get:
            body = read_skill('mcp-123')
            self.assertIn('search', body)
            self.assertNotIn('inputSchema', body)
            self.assertEqual(get.call_args_list[-1].args[0], 'skills/mcp-123')

    def test_document_fast_path_also_exposes_skill_discovery(self):
        r = SimpleNamespace(is_send_intent=False)
        with patch.object(catalog, '_get', return_value=[SKILL]), \
             patch('dsh_modules.tool_routing.is_retrieval_pdf_task', return_value=True):
            names = {t['function']['name'] for t in select_active_tools('查询 Example Docs 并核对 PDF', r, True, True)}
            self.assertTrue({'read_skill', 'list_external_tools', 'call_external_tool', 'render_pdf'} <= names)
            self.assertNotIn('bash', names)

    def test_failed_refresh_does_not_return_stale_catalog(self):
        catalog._cache = [SKILL]
        with patch.object(catalog, '_get', side_effect=RuntimeError('revoked')):
            self.assertEqual(catalog.available_mcp_skills(), [])

    def test_remote_read_skill_does_not_grant_shell_or_silent_web_fallback(self):
        r = SimpleNamespace(disclosure_steps=3, is_generate_intent=False, requires_execution=False, source_formats=[])
        with patch.object(catalog, '_get', return_value=[SKILL]):
            names = {t['function']['name'] for t in select_active_tools('用 Example Docs 查询', r, True, True)}
            self.assertEqual(names, {'read_skill', 'list_external_tools', 'call_external_tool'})
        from dsh_modules.runtime_policy import RuntimePolicy
        self.assertEqual(RuntimePolicy().determine_max_rounds('查询', skill_res=r), 5)

    def test_registered_readonly_mcp_uses_read_admission_without_clarifying_broad_query(self):
        from dsh_modules.skill_router import SkillRouter
        from dsh_modules.skill_admission import admit_skill
        from dsh_modules.telemetry import TelemetryStats
        metadata = {**SKILL, 'read_only': True, 'disclosure_steps': 3, 'requires_execution': False, 'deliverables': []}
        route = SkillRouter.route('用 Example Docs 查询配置方法', available_skills=[metadata], files=[], load_skill_context=False)
        self.assertEqual(route.skill_id, 'mcp-123')
        self.assertTrue(route.is_inspect_intent)
        with patch('dsh_modules.skill_admission.extract_task_intent') as intent:
            self.assertIs(admit_skill('query', [], [], route, 'model', None, TelemetryStats(), None, available_skills=[metadata]), route)
            intent.assert_not_called()

    def test_selected_tool_disclosure_is_scoped(self):
        from dsh_modules.mcp_tools import execute_mcp_tool
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{"inputSchema":{"type":"object"}}'
        with patch('dsh_modules.mcp_tools.urlopen', return_value=Response()) as open_url:
            data = execute_mcp_tool('list_external_tools', {'skill_id': 'mcp-123', 'tool_name': 'search'})
            self.assertIn('inputSchema', json.loads(data))
            self.assertIn('skill_id=mcp-123&tool_name=search', open_url.call_args.args[0].full_url)


if __name__ == '__main__':
    unittest.main()
