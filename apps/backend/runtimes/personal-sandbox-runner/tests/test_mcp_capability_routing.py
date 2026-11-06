import unittest
from dsh_modules.skill_router import SkillRouter
from dsh_modules.prompt_builder import build_skills_catalog
from dsh_modules.mcp_runtime import remember_index, _indexes
from dsh_modules.mcp_sources import finalize_mcp_sources
from dsh_modules.tool_result import ToolResult
from dsh_modules.mcp_objective import selected_objective

PROMPT='查看公共交通，如果从中星海上名庭到 恒生银行大厦'
TRANSIT='根据用户起终点经纬度坐标规划综合各类公共（火车、公交、地铁）交通方式的通勤方案'
TOOLS=[{'id':'geo','name':'maps_geo','description':'将详细的结构化地址转换为经纬度坐标','effect':'read'},
       {'id':'trip','name':'maps_direction_transit_integrated','description':TRANSIT,'effect':'read'}]

class CapabilityRoutingTests(unittest.TestCase):
    def setUp(self):
        _indexes.clear()
        self.skill={'id':'mcp-opaque','name':'opaque-service','source':'mcp','type':'mcp','aliases':['opaque-service'],
            'triggers':['opaque-service'],'description':TRANSIT.replace('（火车、公交、地铁）',''),
            'read_only':True,'disclosure_steps':3,'requires_execution':False,'deliverables':[],'default_rounds':10}

    def test_business_query_routes_without_service_name(self):
        result=SkillRouter.route(PROMPT,available_skills=[self.skill],files=[],load_skill_context=False)
        self.assertEqual(result.skill_id,'mcp-opaque')
        self.assertTrue(result.mcp_read_only)
        from dsh_modules.runtime_policy import RuntimePolicy
        self.assertEqual(RuntimePolicy().determine_max_rounds(PROMPT,skill_res=result),10)

    def test_prerequisite_chain_has_bounded_round_budget(self):
        from dsh_modules.runtime_policy import RuntimePolicy
        from types import SimpleNamespace
        self.assertEqual(RuntimePolicy().determine_max_rounds(PROMPT,skill_res=SimpleNamespace(disclosure_steps=3,default_rounds=10)),10)
        self.assertEqual(RuntimePolicy().determine_max_rounds(PROMPT,skill_res=SimpleNamespace(disclosure_steps=3,default_rounds=100)),12)

    def test_unrelated_query_does_not_route(self):
        result=SkillRouter.route('比较两份财务报告的收入差异',available_skills=[self.skill],files=[],load_skill_context=False)
        self.assertNotEqual(result.skill_id,'mcp-opaque')

    def test_ai_summary_synonym_keeps_source_terms_for_routing_without_prompt_bloat(self):
        metadata={**self.skill,'description':'公交与骑行路线规划。',
                  'routing_description':self.skill['description']+'；SOURCE_TERMS_ONLY'}
        result=SkillRouter.route(PROMPT,available_skills=[metadata],files=[],load_skill_context=False)
        self.assertEqual(result.skill_id,'mcp-opaque')
        text=build_skills_catalog([metadata])
        self.assertIn('公交与骑行',text)
        self.assertNotIn('SOURCE_TERMS_ONLY',text)
        self.assertNotIn('公共交通',text)

    def test_negated_capability_does_not_receive_phrase_boost(self):
        from dsh_modules.mcp_affinity import capability_phrase_score
        self.assertEqual(capability_phrase_score('不要查询公共交通',self.skill['description'])[0],0)

    def test_catalog_keeps_bounded_useful_description_and_no_schema(self):
        text=build_skills_catalog([{**self.skill,'inputSchema':{'secret':'NEVER_INCLUDE'},'description':self.skill['description']*20}])
        self.assertIn('公共交通',text)
        self.assertNotIn('NEVER_INCLUDE',text)
        self.assertLess(len(text),320)

    def test_auxiliary_success_cannot_certify_objective(self):
        remember_index('mcp-opaque',TOOLS)
        self.assertEqual(selected_objective(PROMPT,'mcp-opaque')['id'],'trip')
        evidence=[ToolResult.success(data={},provenance={'tool':'call_external_tool','binding_id':'geo','skill_id':'mcp-opaque'})]
        answer=finalize_mcp_sources('乘坐某线路，票价5元',evidence,selected=True,prompt=PROMPT,skill_id='mcp-opaque')
        self.assertIn('尚未取得目标工具',answer)
        self.assertNotIn('票价5元',answer)

    def test_current_target_receipt_is_required_and_foreign_skill_is_rejected(self):
        remember_index('mcp-opaque',TOOLS)
        for skill,expected in [('mcp-opaque',False),('mcp-another',True)]:
            evidence=[ToolResult.success(data={},provenance={'tool':'call_external_tool','binding_id':'trip','skill_id':skill})]
            answer=finalize_mcp_sources('本轮路线结果',evidence,selected=True,prompt=PROMPT,skill_id='mcp-opaque')
            self.assertEqual('尚未取得目标工具' in answer,expected)

    def test_ambiguous_objective_does_not_invent_a_required_tool(self):
        remember_index('mcp-opaque',[TOOLS[1],{**TOOLS[1],'id':'other'}])
        self.assertIsNone(selected_objective(PROMPT,'mcp-opaque'))

if __name__=='__main__':unittest.main()
