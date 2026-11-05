import json
import unittest
from unittest.mock import patch
from dsh_modules import mcp_runtime as runtime
from dsh_modules.mcp_execution import McpExecutionGate
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules.tools import get_sandbox_tools
from dsh_modules.tool_result import ToolResult

class CoordinatePlanTests(unittest.TestCase):
    def setUp(self):
        runtime._contracts.clear(); runtime._indexes.clear()
        self.prompt='查看公共交通，如果从中星海上名庭到 恒生银行大厦'
        self.gate=McpExecutionGate('mcp-one',self.prompt)
        self.tools=get_sandbox_tools(allowed_names={'read_skill','list_external_tools','call_external_tool'})
        runtime.remember_index('mcp-one',[
            {'id':'trip','name':'trip','effect':'read','description':'规划公共交通方式的通勤方案'},
            {'id':'geo','name':'geo','effect':'read','description':'将地址解析为经纬度坐标'}])
        runtime.remember_contract({'id':'trip','name':'trip','effect':'read','contractToken':'private','inputSchema':{'type':'object','properties':{
            'destination':{'type':'string','description':'目的地经纬度'},'origin':{'type':'string','description':'起点经纬度'}}}},'mcp-one')

    def geo_contract(self):
        runtime.remember_contract({'id':'geo','name':'geo','effect':'read','contractToken':'private','inputSchema':{'type':'object','properties':{
            'address':{'type':'string','description':'待解析的地址'},'city':{'type':'string','description':'查询城市'}}}},'mcp-one')

    def result(self,address,location):
        runtime.consume_contract('geo')
        return runtime.render_mcp_response({'status':'completed','invocationId':address,'result':{'structuredContent':{
            'results':[{'location':location}]}}},'geo',{'address':address}).tool_result

    def test_both_original_entities_and_their_coordinates_are_bound_in_order(self):
        disclosure=ToolResult.success(data={},provenance={'tool':'list_external_tools','binding_id':'trip','skill_id':'mcp-one'})
        tools,choice=self.gate.select(self.tools,[disclosure])
        self.assertEqual(choice['function']['name'],'list_external_tools')
        self.assertEqual(tools[0]['function']['parameters']['properties']['tool_name']['enum'],['geo'])
        self.geo_contract()
        tools,_=self.gate.select(self.tools,[disclosure])
        self.assertEqual(tools[0]['function']['parameters']['properties']['arguments']['properties']['address']['enum'],['中星海上名庭'])
        self.assertNotIn('city',tools[0]['function']['parameters']['properties']['arguments']['properties'])
        with patch('dsh_modules.mcp_tools.urlopen') as network:
            failure=execute_mcp_tool('call_external_tool',{'binding_id':'geo','arguments':{'address':'中星海上名庭','city':'猜测城市'}})
        self.assertEqual(failure.error_code,'MCP_ARGUMENTS_UNGROUNDED');network.assert_not_called()
        self.geo_contract()
        first=self.result('中星海上名庭','121.391560,31.243073')
        tools,choice=self.gate.select(self.tools,[disclosure,first])
        self.assertEqual(choice['function']['name'],'list_external_tools')
        self.geo_contract()
        tools,_=self.gate.select(self.tools,[disclosure,first])
        self.assertEqual(tools[0]['function']['parameters']['properties']['arguments']['properties']['address']['enum'],['恒生银行大厦'])
        second=self.result('恒生银行大厦','121.507398,31.240120')
        tools,choice=self.gate.select(self.tools,[disclosure,first,second])
        self.assertEqual(choice['function']['name'],'call_external_tool')
        params=tools[0]['function']['parameters']
        self.assertEqual(params['properties']['binding_id']['enum'],['trip'])
        self.assertEqual(params['properties']['arguments']['properties']['origin']['enum'],['121.391560,31.243073'])
        self.assertEqual(params['properties']['arguments']['properties']['destination']['enum'],['121.507398,31.240120'])
        with patch('dsh_modules.mcp_tools.urlopen') as network:
            rejected=execute_mcp_tool('call_external_tool',{'binding_id':'trip','arguments':{
                'origin':'121.507398,31.240120','destination':'121.391560,31.243073'}})
        self.assertEqual(rejected.error_code,'MCP_ARGUMENTS_UNGROUNDED');network.assert_not_called()

    def test_failure_or_ambiguous_places_do_not_force_target(self):
        from dsh_modules.mcp_coordinate_plan import coordinate_step
        self.geo_contract()
        runtime.consume_contract('geo')
        runtime.render_mcp_response({'status':'completed','result':{'structuredContent':{'results':[
            {'location':'121.39,31.24'},{'location':'121.40,31.25'}]}}},'geo',{'address':'中星海上名庭'})
        self.assertIsNone(coordinate_step(self.prompt,'mcp-one',[]))

if __name__=='__main__':unittest.main()
