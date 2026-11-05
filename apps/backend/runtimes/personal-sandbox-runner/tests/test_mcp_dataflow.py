import json
import unittest
from unittest.mock import patch
from dsh_modules import mcp_runtime as runtime
from dsh_modules.mcp_dataflow import bind_user_values, remember_result_values, ungrounded_coordinates
from dsh_modules.mcp_tools import execute_mcp_tool

CONTRACT={'id':'trip','name':'trip','effect':'read','contractToken':'private','inputSchema':{
    'type':'object','properties':{'origin':{'type':'string','description':'出发点经纬度，格式为经度，纬度'},
                                'destination':{'type':'string','description':'Destination coordinates'}}}}

class McpDataflowTests(unittest.TestCase):
    def setUp(self):
        runtime._contracts.clear()
        runtime.configure_steps(None)
        bind_user_values('查询公共交通')

    def test_geocoding_results_are_not_document_results_and_keep_coordinates(self):
        runtime.remember_contract({**CONTRACT,'id':'geo','inputSchema':{}},'mcp-one')
        result={'content':[{'type':'text','text':json.dumps({'results':[{'city':'上海市','location':'121.391560,31.243073'}]})}]}
        output=runtime.render_mcp_response({'status':'completed','invocationId':'geo-one','result':result},'geo')
        self.assertIsNone(runtime.document_results(result))
        self.assertIn('121.391560,31.243073',output)
        self.assertEqual(ungrounded_coordinates(CONTRACT,{'origin':'121.39156,31.243073'}),[])

    def test_sql_result_rows_are_preserved(self):
        result={'structuredContent':{'results':[{'revenue':100,'period':'2026-11'}]}}
        self.assertIsNone(runtime.document_results(result))
        self.assertIn('revenue',runtime.render_mcp_response({'status':'completed','result':result},'sql'))

    def test_document_results_remain_recognized(self):
        rows=[{'title':'Docs','contentUrl':'https://docs.example/a','content':'Actual document'}]
        self.assertEqual(runtime.document_results({'structuredContent':{'results':rows}}),rows)

    def test_guessed_and_rounded_coordinates_are_blocked_before_network(self):
        remember_result_values({'location':'121.391560,31.243073'})
        runtime.remember_contract(CONTRACT,'mcp-one')
        for origin in ('121.428,31.242','121.392,31.243'):
            with patch('dsh_modules.mcp_tools.urlopen') as network:
                failure=execute_mcp_tool('call_external_tool',{'binding_id':'trip','arguments':{'origin':origin}})
            self.assertEqual(failure.error_code,'MCP_ARGUMENTS_UNGROUNDED')
            network.assert_not_called()

    def test_user_coordinates_are_accepted_but_cannot_leak_to_next_turn(self):
        bind_user_values('起点坐标121.391560,31.243073')
        self.assertEqual(ungrounded_coordinates(CONTRACT,{'origin':'121.391560,31.243073'}),[])
        bind_user_values('新的查询')
        self.assertEqual(ungrounded_coordinates(CONTRACT,{'origin':'121.391560,31.243073'}),['origin'])

    def test_failed_geocoding_cannot_supply_values(self):
        runtime.remember_contract({**CONTRACT,'id':'geo','inputSchema':{}},'mcp-one')
        runtime.render_mcp_response({'status':'tool_error','result':{'isError':True,'structuredContent':{'location':'121.391560,31.243073'}}},'geo')
        self.assertEqual(ungrounded_coordinates(CONTRACT,{'origin':'121.391560,31.243073'}),['origin'])

    def test_non_coordinate_arguments_are_not_restricted_by_this_guard(self):
        self.assertEqual(ungrounded_coordinates({'inputSchema':{'properties':{'address':{'description':'地点名称'}}}},
            {'address':'中星海上名庭'}),[])

    def test_missing_coordinate_source_discloses_a_readonly_prerequisite_first(self):
        from dsh_modules.mcp_execution import McpExecutionGate
        from dsh_modules.tools import get_sandbox_tools
        gate=McpExecutionGate('mcp-one','查询公共交通')
        runtime.remember_index('mcp-one',[{'id':'geo','name':'geo','description':'将地址解析为经纬度坐标','effect':'read'},
                                        {'id':'write','name':'write_geo','description':'解析经纬度','effect':'write'}])
        runtime.remember_contract(CONTRACT,'mcp-one')
        tools=get_sandbox_tools(allowed_names={'read_skill','list_external_tools','call_external_tool'})
        selected,choice=gate.select(tools,[])
        self.assertEqual(choice['function']['name'],'list_external_tools')
        self.assertEqual(selected[0]['function']['parameters']['properties']['tool_name']['enum'],['geo'])

if __name__=='__main__':unittest.main()
