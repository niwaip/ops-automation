"""Source-driven aggregation, coverage, failed receipts and final acceptance."""

import datetime as dt
import io
import json
import os
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
import openpyxl

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"src"))
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_analysis_evidence import evidence_error, render_analysis_response, requires_spreadsheet_analysis
from dsh_modules.spreadsheet_context import build_spreadsheet_source_context
from dsh_modules.sampling_guard import sampling_feedback
from dsh_modules.agent_loop import run_agent_loop, _finalize_agent_text
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult
from dsh_modules.runner import select_active_tools
from dsh_modules.skill_router import SkillRouter


def aggregate(table,column,unit="amount",method="sum"):
    return {"aggregate":method,"table":table,"column":column,"unit":unit}


class SpreadsheetAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/"source.xlsx"
        w=openpyxl.Workbook();s=w.active;s.title="任意业务名称"
        s.append(["单位","千元"]);s.append(["业务记录"]);s.append([]);s.append([])
        s.append(["凭证","日期","金额","审批状态","部门"])
        for i in range(80):s.append([f"K{i}",dt.date(2026,1,1),100+i,"已审批","业务部"])
        s['C45']=98000;s['B60']=dt.date(2027,1,3);s['D75']='待审批';s['E70']=None
        s['A9']='K1'
        m=w.create_sheet("月度来源改名");m.append(["单位","千元"]);m.append(["月份","收入","毛利","净利润"])
        for i in range(12):m.append([f"{i+1}月",100+i*100,40+i*30,10+i*5])
        b=w.create_sheet("任意余额表");b.append(["单位","千元"]);b.append(["项目","金额"])
        b.append(["资产",100]);b.append(["负债及权益",110])
        w.save(self.path);w.close()
        self.table={"id":"tx","sheet":"任意业务名称","header_row":5,"data_range":"A6:E85"}

    def tearDown(self):self.tmp.cleanup()

    def compute(self,**plan):return calculate_spreadsheet_analysis(self.path,plan,domain="finance")

    def rule(self,id,col,kind,**kwargs):
        return {"id":id,"label":id,"table":"tx","column":col,"kind":kind,
                "assumptions":"按来源声明的报告期和待核查审批规则检查",**kwargs}

    def response(self,*receipts,hypotheses=None):
        return json.dumps({"evidence_ids":[r.data['evidence_id'] for r in receipts],"hypotheses":hypotheses or []})

    def test_tail_anomalies_full_records_and_profiles(self):
        r=self.compute(tables=[self.table],rules=[self.rule('dates','B','date_range',min='2026-01-01',max='2026-12-31'),
            self.rule('approvals','D','allowed_values',allowed=['已审批']),self.rule('amount','C','number_range',min=0,max=1000),
            self.rule('unique_ids','A','unique'),self.rule('department','E','not_empty')])
        self.assertTrue(r.is_success,r.error)
        rules={v['id']:v for v in r.data['rules']}
        self.assertEqual(r.data['coverage'][0]['evaluated_records'],80)
        for name,row in [('dates',60),('approvals',75),('amount',45),('department',70)]:
            self.assertEqual(rules[name]['examples'][0]['row'],row)
        amount=next(p for p in r.data['profiles'] if p['column']=='C')
        self.assertEqual(amount['numeric']['max'],98000)
        approvals=next(p for p in r.data['profiles'] if p['column']=='D')
        self.assertEqual(approvals['value_counts'],{'已审批':79,'待审批':1})
        self.assertEqual(approvals['value_examples']['待审批'],['任意业务名称!D75'])
        text=render_analysis_response(self.response(r),[r])
        self.assertIn('业务行80条',text);self.assertIn('98000',text);self.assertIn('2027-01-03',text)
        self.assertIn('待审批',text)
        self.assertIn('任意业务名称!E70',text)

    def test_weighted_ratio_and_source_unit_conversion(self):
        table={'id':'m','sheet':'月度来源改名','header_row':2,'data_range':'A3:D14',
               'filters':[{'column':'A','values':['7月','8月','9月','10月','11月','12月']}]}
        expr={'op':'divide','args':[aggregate('m','C'),aggregate('m','B')]}
        r=self.compute(tables=[table],calculations=[{'id':'rev','label':'下半年收入','expression':aggregate('m','B'),'output_unit':'亿元'},
             {'id':'ratio','label':'加权毛利率','expression':expr}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['coverage'][0]['evaluated_records'],6)
        self.assertEqual(Decimal(r.data['facts'][0]['value']),Decimal('0.057'))
        expected=sum(Decimal(40+i*30) for i in range(6,12))/sum(Decimal(100+i*100) for i in range(6,12))*100
        self.assertEqual(Decimal(r.data['facts'][1]['value']),expected)
        self.assertEqual(r.data['facts'][1]['unit'],'%')

    def test_verified_ratios_produce_factual_direction_without_model_causes(self):
        first={'id':'h1','sheet':'月度来源改名','header_row':2,'data_range':'A3:D8'}
        second={'id':'h2','sheet':'月度来源改名','header_row':2,'data_range':'A9:D14'}
        calculations=[{'id':t['id']+'_ratio','label':caption+'毛利率',
            'expression':{'op':'divide','args':[aggregate(t['id'],'C'),aggregate(t['id'],'B')]}}
            for t,caption in [(first,'上半年'),(second,'下半年')]]
        r=self.compute(tables=[first,second],calculations=calculations)
        self.assertTrue(r.is_success,r.error)
        text=render_analysis_response(self.response(r),[r],'解释毛利率变化')
        self.assertIn('下降1.8045个百分点',text)
        self.assertIn('不推断经营原因',text)

    def test_equation_residual_and_assumptions_are_reported(self):
        cell=lambda addr:{'cell':addr,'sheet':'任意余额表','unit':'amount'}
        r=self.compute(checks=[{'id':'balance','label':'资产与负债权益','left':cell('B3'),'right':cell('B4'),
                              'tolerance':0.01,'assumptions':'同一主体同一日期，不存在范围调整'}])
        self.assertTrue(r.is_success,r.error)
        self.assertFalse(r.data['checks'][0]['passed']);self.assertEqual(r.data['checks'][0]['residual'],'-10')
        text=render_analysis_response(self.response(r),[r]);self.assertIn('不一致',text);self.assertIn('原因',text)

    def receipt(self):
        return self.compute(tables=[self.table],calculations=[{'id':'n','label':'业务记录数','expression':aggregate('tx','A','number','count')}])

    def test_failed_partial_old_source_and_omitted_evidence_fail_closed(self):
        r=self.receipt();resp=self.response(r)
        self.assertIsNone(evidence_error(resp,[r]))
        self.assertIsNotNone(evidence_error(resp,[ToolResult.error('failed','工具失败')]))
        self.assertIsNotNone(evidence_error(resp,[ToolResult.partial(data=r.data,provenance=r.provenance)]))
        self.assertIsNotNone(evidence_error(self.response(r),[r,self.compute(tables=[self.table],calculations=[{'id':'min','label':'最小金额','expression':aggregate('tx','C',method='min')}])]))
        self.path.write_bytes(b'changed')
        self.assertIsNotNone(evidence_error(resp,[r]))

    def test_plain_numerical_answer_and_invalid_envelope_are_rejected(self):
        r=self.receipt()
        for response in ['经Python全表扫描，记录82条。','{"evidence_ids":[{}],"hypotheses":[]}',
                         self.response(r,hypotheses=['净利润9961.35千元'])]:
            self.assertIsNotNone(evidence_error(response,[r]))

    def test_successful_results_do_not_hide_a_failed_followup_plan(self):
        r=self.receipt()
        failed=ToolResult.error('invalid_analysis_plan','后续检查缺少来源',
            data={'requested_plan':{'checks':[{'id':'extra','label':'补充检查'}]}})
        text=render_analysis_response(self.response(r),[r,failed])
        self.assertIn('业务行80条',text)
        self.assertIn('后续计划未执行成功',text)
        self.assertIn('补充检查',text)

    def test_unknown_operation_missing_range_and_zero_denominator_are_errors(self):
        for plan in [{},{'tables':[dict(self.table,header_row=10)],'calculations':[{'id':'x','label':'x','expression':aggregate('tx','C')}]},
          {'calculations':[{'id':'x','label':'x','expression':{'op':'divide','args':[{'constant':1,'unit':'number'},{'constant':0,'unit':'number'}]}}]},
          {'calculations':[{'id':'x','label':'x','expression':{'eval':'__import__("os")'}}]}]:
            self.assertTrue(calculate_spreadsheet_analysis(self.path,plan).is_error)

    def test_json_encoded_array_is_decoded_without_changing_business_scope(self):
        from dsh_modules.spreadsheet_analysis import execute_spreadsheet_analysis
        with patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.path,None)):
            output=execute_spreadsheet_analysis({'file_path':str(self.path),'tables':json.dumps([self.table]),
                'calculations':json.dumps([{'id':'n','label':'记录数','expression':aggregate('tx','A','number','count')}])})
        self.assertTrue(output.tool_result.is_success,output)
        self.assertEqual(output.tool_result.data['coverage'][0]['evaluated_records'],80)

    def test_native_tool_cannot_select_a_different_session_file(self):
        from dsh_modules.spreadsheet_analysis import execute_spreadsheet_analysis
        with patch.dict(os.environ,{'DSH_SESSION_ATTACHMENTS':'different.xlsx'}),\
             patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.path,None)),\
             patch('dsh_modules.config.WORKSPACE_DIR',self.tmp.name):
            output=execute_spreadsheet_analysis({'file_path':str(self.path),'tables':[self.table],'profile_tables':True})
        self.assertEqual(output.tool_result.error_code,'source_outside_session_scope')

    def test_named_expression_references_and_display_unit_compile_without_guessing(self):
        r=self.compute(tables=[self.table],calculations=[{'id':'total','label':'总金额','expression':aggregate('tx','C')},
            {'id':'twice','label':'金额两倍','expression':{'op':'add','args':[{'id':'total'},{'ref':'total'}],'output_unit':'万元'}}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(Decimal(r.data['facts'][1]['value']),Decimal(r.data['facts'][0]['value'])/5)
        self.assertTrue(r.data['normalizations'])
        cycle=self.compute(calculations=[{'id':'a','label':'循环','expression':{'ref':'a'}}])
        self.assertTrue(cycle.is_error)
        self.assertIn('循环',cycle.error_message)

    def test_explicit_cell_arithmetic_and_table_aliases_compile_safely(self):
        cell={'sheet':'任意余额表','cell':'B4-B3','label':'元数据'}
        r=self.compute(calculations=[{'id':'delta','label':'余额差额','expression':cell}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['facts'][0]['value'],'10')
        r=self.compute(tables=[self.table],rules=[{**self.rule('min','C','number_range',min='0'),'table':'任意业务名称'}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['plan']['rules'][0]['table'],'tx')

    def test_explicit_table_row_column_address_resolves_only_actual_headers(self):
        r=self.compute(tables=[self.table],calculations=[{'id':'maxrow','label':'指定记录金额',
            'expression':{'table_id':'tx','column':'金额','row':45}}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['facts'][0]['value'],'98000')
        r=self.compute(tables=[self.table],calculations=[{'id':'bad','label':'越界',
            'expression':{'table_id':'tx','column':'金额','row':86}}])
        self.assertTrue(r.is_error)
        filtered={**self.table,'filters':[{'column':'D','values':['待审批']}]}
        r=self.compute(tables=[filtered],calculations=[{'id':'wrongscope','label':'指定记录金额',
            'expression':{'table_id':'tx','column':'C','row':45}}])
        self.assertTrue(r.is_error)

    def test_composite_caption_cannot_relabel_one_expense_as_three(self):
        w=openpyxl.load_workbook(self.path);w['月度来源改名']['D2']='销售费用';w.save(self.path);w.close()
        table={'id':'m','sheet':'月度来源改名','header_row':2,'data_range':'A3:D14'}
        r=self.compute(tables=[table],calculations=[{'id':'bad','label':'三费总额','expression':aggregate('m','D')}])
        self.assertTrue(r.is_error)
        self.assertIn('实际引用1',r.error_message)

    def test_missing_rule_fields_are_reported_together_with_precise_paths(self):
        r=self.compute(tables=[self.table],rules=[self.rule('dates','B','date_range'),self.rule('status','D','allowed_values')])
        self.assertTrue(r.is_error)
        self.assertIn('rules.dates',r.error_message)
        self.assertIn('rules.status',r.error_message)

    def test_constant_business_fact_is_rejected(self):
        r=self.compute(calculations=[{'id':'fake','label':'收入','expression':{'constant':10000,'unit':'number'}}])
        self.assertTrue(r.is_error)

    def test_exact_header_boundary_and_unambiguous_header_name_are_normalized(self):
        table={**self.table,'data_range':'A5:E85','filters':[{'column':'审批状态','values':['待审批']}]}
        r=self.compute(tables=[table],calculations=[{'id':'amount','label':'待审批金额',
            'expression':aggregate('tx','金额')}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['coverage'][0]['excluded_header_rows'],[5])
        self.assertEqual(r.data['coverage'][0]['input_records'],80)
        self.assertEqual(r.data['coverage'][0]['evaluated_records'],1)

    def test_unicode_identifiers_and_profile_only_quality_capability(self):
        from dsh_modules.tools import execute_tool
        with patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.path,None)):
            r=execute_tool('validate_spreadsheet_rows',{'file_path':str(self.path),'tables':[{**self.table,'id':'交易明细'}]}).tool_result
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['coverage'][0]['evaluated_records'],80)
        self.assertIn('待审批',render_analysis_response(self.response(r),[r]))

    def test_change_request_requires_distinct_source_periods(self):
        r=self.receipt()
        self.assertIsNotNone(evidence_error(self.response(r),[r],'解释变化趋势'))

    def test_profitability_concept_requires_ratios_not_only_amounts(self):
        from dsh_modules.analysis_contract import build_analysis_contract
        contract=build_analysis_contract('查看盈利质量')
        self.assertEqual(contract.concepts,['profitability'])
        self.assertIn('净利率',contract.get_metric_names())
        r=self.receipt()
        self.assertIn('毛利率',evidence_error(self.response(r),[r],'解释盈利能力变化'))

    def test_ratio_caption_cannot_use_wrong_numerator_or_average_percentages(self):
        table={'id':'m','sheet':'月度来源改名','header_row':2,'data_range':'A3:D14'}
        r=self.compute(tables=[table],calculations=[{'id':'bad','label':'净利率','expression':
            {'op':'divide','args':[aggregate('m','C'),aggregate('m','B')]}}])
        self.assertTrue(r.is_error)
        self.assertIn('分子/分母',r.error_message)

    def test_one_sided_bounds_preserve_only_explicit_constraints(self):
        r=self.compute(tables=[self.table],rules=[self.rule('lower','C','number_range',min=0),
            self.rule('upper_date','B','date_range',max='2026-12-31')])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(r.data['rules'][0]['criteria'],{'min':0})
        self.assertEqual(r.data['rules'][1]['examples'][0]['row'],60)

    def test_period_caption_cannot_publish_annual_data_as_half_year(self):
        table={'id':'m','sheet':'月度来源改名','header_row':2,'data_range':'A3:D14'}
        plan={'tables':[table],'calculations':[{'id':'bad','label':'下半年收入','expression':aggregate('m','B')}]}
        r=self.compute(**plan)
        self.assertTrue(r.is_error)
        self.assertIn('期间与来源不一致',r.error_message)
        self.assertEqual(r.data['requested_plan'],plan)
        self.assertIsNotNone(evidence_error('{"evidence_ids":[],"hypotheses":[]}',[r]))
        for caption in ['H1营业收入','Q3营业收入']:
            r=self.compute(tables=[table],calculations=[{'id':'bad','label':caption,'expression':aggregate('m','B')}])
            self.assertTrue(r.is_error)

    def test_direct_metric_caption_must_match_actual_column(self):
        table={'id':'m','sheet':'月度来源改名','header_row':2,'data_range':'A3:D14'}
        r=self.compute(tables=[table],calculations=[{'id':'bad','label':'净利润','expression':aggregate('m','B')}])
        self.assertTrue(r.is_error)
        self.assertIn('来源字段不一致',r.error_message)

    def test_approval_enum_pass_is_not_business_compliance(self):
        r=self.compute(tables=[self.table],rules=[self.rule('审批格式','D','allowed_values',allowed=['已审批','待审批'])])
        self.assertTrue(r.data['rules'][0]['passed'])
        text=render_analysis_response(self.response(r),[r])
        self.assertIn('业务适用性尚未独立验证',text)
        self.assertIn('任意业务名称!D75',text)

    def test_additive_source_identity_rejects_component_as_total(self):
        from dsh_modules.spreadsheet_checks import validate_source_identity
        w=openpyxl.Workbook();w.active.title='自由表名'
        w.active['D9']='=D7+D8'
        cell=lambda c:{'cell':c,'sheet':'自由表名'}
        check={'left':cell('D7'),'right':cell('D9')}
        with self.assertRaisesRegex(ValueError,'分项不能'):
            validate_source_identity(check,w)
        validate_source_identity({**check,'relation_type':'component_comparison'},w)
        validate_source_identity({'left':{'op':'add','args':[cell('D7'),cell('D8')]},'right':cell('D9')},w)
        w.close()

    def test_explicit_private_stream_never_flushes_unverified_draft(self):
        from dsh_modules.llm import call_model_proxy
        captured={}
        class Response:
            def __enter__(self):
                return iter([b'data: {"choices":[{"delta":{"content":"unverified draft"}}]}\n',b'data: [DONE]\n'])
            def __exit__(self,*args):pass
        def open_request(request,**kwargs):
            captured.update(json.loads(request.data));return Response()
        output=io.StringIO()
        with redirect_stdout(output),patch('urllib.request.urlopen',side_effect=open_request):
            r=call_model_proxy([{'role':'user','content':'test'}],tools=[{'type':'function','function':{'name':'aggregate_spreadsheet'}}],
                               stream_deltas=False,tool_choice='required')
        self.assertEqual(r['content'],'unverified draft')
        self.assertNotIn('DSH_DELTA:',output.getvalue())
        self.assertEqual(captured['tool_choice'],'required')

    def test_dimensioned_optional_op_unit_and_nary_add(self):
        expr={'op':'add','unit':'amount','args':[aggregate('tx','C'),aggregate('tx','C'),aggregate('tx','C')]}
        r=self.compute(tables=[self.table],calculations=[{'id':'three','label':'三项相同金额之和','expression':expr}])
        self.assertTrue(r.is_success,r.error)
        self.assertEqual(Decimal(r.data['facts'][0]['value']),sum(Decimal(100+i) for i in range(80))*3+(Decimal(98000)-Decimal(139))*3)

    def test_overview_preserves_positions_and_does_not_claim_full_coverage(self):
        overview=build_spreadsheet_source_context(self.path)
        self.assertIn('SCHEMA_SAMPLE',overview);self.assertIn('"coverage_complete": false',overview)
        self.assertIn('A5',overview)
        self.assertNotIn('98000',overview)

    def test_failed_attempt_history_cannot_suppress_final_coverage_warning(self):
        t=TelemetryStats();t.record_tool_call('bash',{'cmd':'python3 read_excel.py'},'error')
        text='经核对，全表不存在重复。'+('已完成所有检查。'*20)
        final,_=_finalize_agent_text(text,[{'role':'user','content':'检验数据\n工作表覆盖度提醒: 抽样/截断'}],
            'test',RuntimePolicy(),None,False,['bash:python3 read_excel.py'],False,t,last_user_prompt='检验数据')
        self.assertIn('数据覆盖度与真实性提示',final)

    def test_unknown_wording_selects_readonly_native_tools_and_requires_plan(self):
        for q in ['解释下半年盈利能力变化。','识别金额、日期和审批状态异常。']:
            skill=SkillRouter.route(q,[],files=['any.xlsx'])
            self.assertTrue(requires_spreadsheet_analysis(q,skill))
            names={t['function']['name'] for t in select_active_tools(q,skill,False,False)}
            self.assertIn('aggregate_spreadsheet',names);self.assertIn('validate_spreadsheet_rows',names)
            self.assertNotIn('bash',names);self.assertNotIn('patch_file',names)
        skill=SkillRouter.route('列出工作簿中的Sheet，并说明用途。',[],files=['any.xlsx'])
        self.assertFalse(requires_spreadsheet_analysis('列出工作簿中的Sheet，并说明用途。',skill))

    def test_advisory_consulting_bypasses_spreadsheet_analysis_and_restricts_tools(self):
        advisory_queries = [
            '提出3条可执行的财务管理建议。',
            '结合报表数据，给出经营管理建议。',
            '如何提升毛利率？',
            '针对销售费用提出优化建议',
            '分析公司的经营风险并给出对策',
        ]
        for q in advisory_queries:
            skill = SkillRouter.route(q, [], files=['any.xlsx'])
            self.assertFalse(requires_spreadsheet_analysis(q, skill), f"Should not require spreadsheet analysis for: {q}")
            names = {t['function']['name'] for t in select_active_tools(q, skill, False, False)}
            self.assertIn('read_file', names)
            self.assertNotIn('aggregate_spreadsheet', names)
            self.assertNotIn('bash', names)
            self.assertNotIn('patch_file', names)

        # 显式计算带有建议时，仍应先执行计算
        hybrid_q = '计算2026年毛利率并提出3条改善建议'
        skill = SkillRouter.route(hybrid_q, [], files=['any.xlsx'])
        self.assertTrue(requires_spreadsheet_analysis(hybrid_q, skill))

    def test_loop_rejects_unexecuted_claim_even_when_budget_exhausted(self):
        with patch('dsh_modules.agent_loop.call_model_proxy',return_value={'content':'通过Python检查，全表全部正常。','finish_reason':'stop'}):
            result=run_agent_loop([{'role':'system','content':'test'},{'role':'user','content':'识别异常'}],'test',RuntimePolicy(),
                1,tools=[],spreadsheet_analysis_required=True)
        self.assertIn('尚未通过',result.final_text);self.assertNotIn('全表全部正常',result.final_text)
        self.assertEqual(result.telemetry.guard_decisions[-1]['action'],'reject')

    def test_loop_tool_then_structured_final_uses_real_receipt(self):
        params={'file_path':str(self.path),'tables':[self.table],
            'calculations':[{'id':'n','label':'业务记录数','expression':aggregate('tx','A','number','count')}]}
        receipt=calculate_spreadsheet_analysis(self.path,{k:v for k,v in params.items() if k!='file_path'})
        replies=[{'content':'','finish_reason':'tool_calls','tool_calls':[{'id':'call_a','type':'function',
            'function':{'name':'analyze_spreadsheet','arguments':json.dumps(params)}}]},
            {'content':self.response(receipt),'finish_reason':'stop'}]
        from dsh_modules.tools import get_sandbox_tools
        with patch('dsh_modules.agent_loop.call_model_proxy',side_effect=replies),patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.path,None)):
            result=run_agent_loop([{'role':'system','content':'test'},{'role':'user','content':'统计记录'}],'test',RuntimePolicy(),
                3,tools=get_sandbox_tools({'analyze_spreadsheet'}),spreadsheet_analysis_required=True)
        self.assertIn('业务行80条',result.final_text);self.assertEqual(result.telemetry.guard_decisions[-1]['action'],'accept')

    def test_loop_allows_advisory_consulting_response_without_spreadsheet_rejection(self):
        advisory_reply = (
            "基于2026年财务经营数据，提出以下3条可执行的财务管理建议：\n\n"
            "1. **加强销售费用管控与投产比考核**：针对下半年销售费用上升，设定渠道ROI预警线；\n"
            "2. **建立负数金额交易复核机制**：对异常交易实行双人审批制；\n"
            "3. **推进预算动态管控与滚动预测**：确保经营目标按月追踪闭环。"
        )
        captured_messages = []
        def mock_proxy(messages, *args, **kwargs):
            captured_messages.extend(messages)
            return {'content': advisory_reply, 'finish_reason': 'stop'}

        skill = SkillRouter.route('提出3条可执行的财务管理建议。', [], files=['any.xlsx'])
        req_analysis = requires_spreadsheet_analysis('提出3条可执行的财务管理建议。', skill)
        self.assertFalse(req_analysis)

        with patch('dsh_modules.agent_loop.call_model_proxy', side_effect=mock_proxy):
            result = run_agent_loop(
                [{'role': 'system', 'content': 'You are an assistant.'},
                 {'role': 'user', 'content': '【当前会话有效附件清单】: any.xlsx\n用户指令：提出3条可执行的财务管理建议。'}],
                'test',
                RuntimePolicy(),
                3,
                tools=[],
                spreadsheet_analysis_required=req_analysis
            )

        self.assertIn('加强销售费用管控', result.final_text)
        self.assertIn('建立负数金额交易复核机制', result.final_text)
        self.assertNotIn('尚未通过执行证据核验', result.final_text)
        self.assertNotIn('缺少分析执行证据', result.final_text)
        # 验证注入了咨询规范指南
        sys_msgs = [m['content'] for m in captured_messages if m.get('role') == 'system']
        self.assertTrue(any('【财务与经营管理咨询规范】' in s for s in sys_msgs))

    def test_task_contract_keeps_tools_required_after_insufficient_success(self):
        from dsh_modules.tools import get_sandbox_tools
        params={'file_path':str(self.path),'tables':[self.table],
                'calculations':[{'id':'n','label':'记录数','expression':aggregate('tx','A','number','count')}]}
        tool_reply={'content':'','finish_reason':'tool_calls','tool_calls':[{'id':'c','type':'function',
            'function':{'name':'analyze_spreadsheet','arguments':json.dumps(params)}}]}
        calls=[]
        def model(*args,**kwargs):
            calls.append(kwargs)
            return tool_reply if len(calls)==1 else {'content':'已完成','finish_reason':'stop'}
        with patch('dsh_modules.agent_loop.call_model_proxy',side_effect=model),\
             patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.path,None)):
            result=run_agent_loop([{'role':'system','content':'test'},{'role':'user','content':'汇总营业收入'}],
                'test',RuntimePolicy(),2,tools=get_sandbox_tools({'analyze_spreadsheet'}),spreadsheet_analysis_required=True)
        self.assertEqual(calls[1]['tool_choice'],'required')
        self.assertIn('尚未通过',result.final_text)


if __name__=='__main__':unittest.main()
