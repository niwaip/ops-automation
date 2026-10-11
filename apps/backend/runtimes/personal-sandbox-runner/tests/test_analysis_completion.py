"""Task-state and registered-recipe recovery from successful but incomplete plans."""

import io
import json
import os
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
import openpyxl

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'src'))
from dsh_modules.analysis_task_state import analysis_task_state, task_feedback
from dsh_modules.analysis_turn import AnalysisTurn
from dsh_modules.analysis_semantics import DOMAIN_MODULES, derivation_recipes
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
from dsh_modules.spreadsheet_analysis_evidence import verified_response
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult
from dsh_modules.agent_loop import run_agent_loop
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.tools import get_sandbox_tools
from dsh_modules.llm import _process_sse_data


QUERY='总结2026年收入、毛利率、营业利润和净利润。'


class AnalysisCompletionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.source=Path(self.temp.name)/'renamed.xlsx'
        workbook=openpyxl.Workbook();sheet=workbook.active;sheet.title='来源甲'
        sheet.append(['单位','千元']);sheet.append(['月份','营业收入','毛利','营业利润','净利润','主营业务毛利'])
        for m in range(1,13):sheet.append([f'{m}月',100+m,40+m,20+m,10+m,30+m])
        workbook.save(self.source);workbook.close()
        self.table={'id':'period','sheet':'来源甲','header_row':2,'data_range':'A3:F14'}

    def tearDown(self):self.temp.cleanup()

    def receipt(self, metrics=None, table=None):
        table=table or self.table
        definitions=metrics or [('finance.revenue','营业收入','B'),('finance.gross_profit','毛利润','C'),
            ('finance.operating_profit','营业利润','D'),('finance.net_profit','净利润','E')]
        plan={'tables':[table],'calculations':[{'id':f'm{i}','metric_id':metric,'label':label,
            'expression':{'aggregate':'sum','table':table['id'],'column':column,'unit':'amount'}}
            for i,(metric,label,column) in enumerate(definitions)]}
        result=calculate_spreadsheet_analysis(self.source,plan,domain='finance')
        self.assertTrue(result.is_success,result.error)
        return result

    def complete(self,evidence,prompt=QUERY,allowed=('aggregate_spreadsheet',),completion=None):
        completion=completion or RegisteredMetricCompletion()
        return completion.complete(evidence,prompt,TelemetryStats(),allowed)

    def test_structured_task_state_detects_missing_rate_independent_of_json(self):
        state=analysis_task_state([self.receipt()],QUERY)
        self.assertFalse(state['complete'])
        self.assertEqual(state['missing_metrics'],[{'metric_id':'finance.gross_margin','name':'毛利率','expected_type':'percentage'}])
        self.assertIn('finance.gross_margin',task_feedback([self.receipt()],QUERY))

    def test_duplicate_realistic_receipts_are_completed_once_and_ids_are_runtime_owned(self):
        evidence=[self.receipt(),self.receipt(table={**self.table,'id':'retry'})]
        completed=self.complete(evidence)
        self.assertEqual(len(completed),1)
        fact=completed[0].data['facts'][0]
        self.assertEqual(fact['metric_id'],'finance.gross_margin');self.assertEqual(fact['unit'],'%')
        self.assertAlmostEqual(float(fact['value']),float(Decimal(558)/Decimal(1278)*100))
        self.assertEqual(completed[0].provenance['execution_origin'],'registered_derivation')
        response=json.loads(verified_response(evidence,QUERY,'{"evidence_ids":["wrong"],"hypotheses":["2026数字",{},"待验证原因"]}'))
        self.assertEqual(set(response['evidence_ids']),{r.data['evidence_id'] for r in evidence})
        self.assertEqual(response['hypotheses'],['待验证原因'])
        self.assertEqual(self.complete(evidence),[])

    def test_pipeline_finishes_from_executed_plan_without_a_model_protocol_round(self):
        receipt=self.receipt()
        params={'file_path':str(self.source),**receipt.data['plan']}
        tool={'content':'未验证草稿','finish_reason':'tool_calls','tool_calls':[{'id':'one','type':'function',
              'function':{'name':'aggregate_spreadsheet','arguments':json.dumps(params)}}]}
        with patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path',return_value=(self.source,None)), \
             patch.dict(os.environ,{'DSH_SESSION_ATTACHMENTS':''}), \
             patch('dsh_modules.agent_loop.call_model_proxy',return_value=tool) as model,redirect_stdout(io.StringIO()):
            result=run_agent_loop([{'role':'system','content':'test'},{'role':'user','content':QUERY}],
                'test',RuntimePolicy(),4,tools=get_sandbox_tools({'aggregate_spreadsheet'}),spreadsheet_analysis_required=True)
        self.assertEqual(model.call_count,1)
        self.assertIn('毛利率（注册关系补算）',result.final_text)
        self.assertNotIn('未验证草稿',result.final_text)
        self.assertEqual(result.telemetry.guard_decisions[-1]['action'],'accept')
        self.assertEqual(result.telemetry.tool_invocations,2)

    def test_malformed_final_protocol_cannot_block_complete_generic_execution(self):
        source=self.receipt()
        evidence=[source];self.complete(evidence)
        turn=AnalysisTurn(QUERY)
        for text in ['bad JSON','{"evidence_ids":[],"hypotheses":"wrong"}',
                     '{"evidence_ids":["old"],"hypotheses":["2026年收入999"]}']:
            final=turn.render(evidence,text,TelemetryStats())
            self.assertNotIn('尚未通过',final);self.assertIn('毛利率（注册关系补算）',final)
            self.assertNotIn('999',final)

    def test_cross_period_operands_are_not_combined(self):
        first={**self.table,'filters':[{'column':'A','values':[f'{m}月' for m in range(1,7)]}]}
        last={**self.table,'filters':[{'column':'A','values':[f'{m}月' for m in range(7,13)]}]}
        evidence=[self.receipt([('finance.gross_profit','毛利润','C')],first),
                  self.receipt([('finance.revenue','营业收入','B')],last)]
        self.assertEqual(self.complete(evidence,'总结毛利率'),[])

    def test_registered_relationship_is_completed_for_each_matching_period(self):
        evidence=[]
        for months in (range(1,7),range(7,13)):
            evidence.append(self.receipt(table={**self.table,'filters':[{'column':'A','values':[f'{m}月' for m in months]}]}))
        completed=self.complete(evidence,'解释盈利能力变化')
        self.assertEqual(len(completed),1)
        self.assertEqual(len(completed[0].data['facts']),6)
        self.assertTrue(analysis_task_state(evidence,'解释盈利能力变化')['complete'])

    def test_ambiguous_source_fields_remain_missing(self):
        evidence=[self.receipt(),self.receipt([('finance.gross_profit','毛利润','F')])]
        self.assertEqual(self.complete(evidence),[])
        self.assertFalse(analysis_task_state(evidence,QUERY)['complete'])

    def test_no_recipe_is_applied_in_generic_or_unsupported_capability_mode(self):
        evidence=[self.receipt()]
        self.assertEqual(self.complete(evidence,allowed=['validate_spreadsheet_rows']),[])
        with patch.dict(os.environ,{'DSH_ANALYSIS_DOMAIN':'generic'}):
            self.assertEqual(self.complete(evidence),[])
        self.assertEqual(derivation_recipes('generic'),[])

    def test_zero_denominator_is_execution_failure_and_does_not_loop(self):
        workbook=openpyxl.load_workbook(self.source)
        for row in range(3,15):workbook.active.cell(row,2,0)
        workbook.save(self.source);workbook.close()
        evidence=[self.receipt()];completion=RegisteredMetricCompletion()
        result=self.complete(evidence,completion=completion)
        self.assertEqual(len(result),1);self.assertTrue(result[0].is_error)
        self.assertIsNone(verified_response(evidence,QUERY))
        self.assertEqual(self.complete(evidence,completion=completion),[])

    def test_source_change_and_partial_evidence_cannot_trigger_completion(self):
        receipt=self.receipt()
        partial=ToolResult.partial(data=receipt.data,provenance=receipt.provenance)
        self.assertEqual(self.complete([partial]),[])
        self.source.write_bytes(b'changed')
        evidence=[receipt]
        self.assertEqual(self.complete(evidence),[])
        codes={i['code'] for i in analysis_task_state(evidence,QUERY)['issues']}
        self.assertEqual(codes,{'source_changed','required_metrics_missing'})

    def test_receipt_domain_version_must_match_current_registry(self):
        receipt=self.receipt();receipt.data['semantic_domain']['version']='old'
        self.assertEqual(self.complete([receipt]),[])

    def test_unregistered_nonfinancial_ratio_uses_the_same_completion_engine_when_registered(self):
        pack=types.ModuleType('dsh_modules.analysis_domain_experiment')
        pack.VERSION='test';pack.CONCEPTS=[];pack.GUIDANCE='实验指标'
        pack.METRICS=[{'id':'experiment.input','name':'投入','patterns':['投入'],'expected_type':'number'},
            {'id':'experiment.pass','name':'合格','patterns':['合格数量'],'expected_type':'number'},
            {'id':'experiment.yield','name':'合格率','patterns':['合格率'],'expected_type':'percentage',
             'numerator_metric':'合格','denominator_metric':'投入'}]
        workbook=openpyxl.Workbook();ws=workbook.active;ws.title='随意实验表'
        ws.append(['投入','合格数量']);ws.append([10,8]);ws.append([30,24])
        workbook.save(self.source);workbook.close()
        plan={'tables':[{'id':'batch','sheet':'随意实验表','header_row':1,'data_range':'A2:B3'}],
            'calculations':[{'id':str(i),'metric_id':metric,'label':label,
                'expression':{'aggregate':'sum','table':'batch','column':column,'unit':'number'}}
                for i,(metric,label,column) in enumerate([('experiment.input','投入','A'),('experiment.pass','合格','B')])]}
        with patch.dict(DOMAIN_MODULES,{'experiment':'.analysis_domain_experiment'}), \
             patch.dict(sys.modules,{'dsh_modules.analysis_domain_experiment':pack}), \
             patch.dict(os.environ,{'DSH_ANALYSIS_DOMAIN':'experiment'}):
            evidence=[calculate_spreadsheet_analysis(self.source,plan,domain='experiment')]
            self.assertTrue(evidence[0].is_success,evidence[0].error)
            result=self.complete(evidence,'总结合格率')
            self.assertEqual(len(result),1);self.assertEqual(Decimal(result[0].data['facts'][0]['value']),80)
            self.assertTrue(analysis_task_state(evidence,'总结合格率')['complete'])

    def test_internal_stream_suppresses_both_thoughts_and_content(self):
        chunk=json.dumps({'choices':[{'delta':{'reasoning_content':'I calculated all results','content':'unverified draft'}}]})
        output=io.StringIO();chunks=[]
        with redirect_stdout(output):_process_sse_data(chunk,chunks,{},0,None,stream_deltas=False)
        self.assertEqual(chunks,['unverified draft']);self.assertEqual(output.getvalue(),'')

    def test_presentation_audit_records_shape_without_untrusted_text(self):
        evidence=[self.receipt()];self.complete(evidence)
        telemetry=TelemetryStats()
        final=AnalysisTurn(QUERY).render(evidence,'{"evidence_ids":["sensitive-unknown-text"],"hypotheses":[]}',telemetry)
        audit=telemetry.guard_decisions[0]
        self.assertEqual(audit['guard'],'analysis_presentation')
        self.assertEqual(audit['reason']['unknown_id_count'],1)
        self.assertNotIn('sensitive-unknown-text',json.dumps(telemetry.guard_decisions))
        self.assertNotIn('尚未通过',final)

    def test_completion_reexecutes_source_expressions_not_converted_cached_values(self):
        receipt=self.receipt()
        # Output formatting may express different scales; recipes use the source
        # expressions, not the already-presented numeric strings.
        for fact in receipt.data['facts']:
            if fact['metric_id']=='finance.revenue':
                fact['value']=str(Decimal(fact['value'])/10);fact['unit']='万元'
        result=self.complete([receipt])
        self.assertEqual(len(result),1)
        self.assertAlmostEqual(float(result[0].data['facts'][0]['value']),float(Decimal(558)/Decimal(1278)*100))

    def test_registered_number_cannot_be_satisfied_by_a_percentage(self):
        receipt=self.receipt()
        revenue=next(f for f in receipt.data['facts'] if f['metric_id']=='finance.revenue')
        revenue['unit']='%'
        missing=analysis_task_state([receipt],QUERY)['missing_metrics']
        self.assertIn('finance.revenue',{m['metric_id'] for m in missing})
        expr={'aggregate':'sum','table':'period','column':'B','unit':'amount'}
        result=calculate_spreadsheet_analysis(self.source,{'tables':[self.table],'calculations':[
            {'id':'wrong','label':'营业收入','metric_id':'finance.revenue',
             'expression':{'op':'divide','args':[expr,expr]}}]},domain='finance')
        self.assertTrue(result.is_error);self.assertIn('结果类型不符',result.error_message)

    def test_analysis_overview_includes_rule_violation_examples(self):
        """阶段一测试：验证数据检查规则核查在正文中透出具体违规单元格与取值"""
        from dsh_modules.report_presentation import analysis_overview
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "facts": [],
            "checks": [],
            "rules": [
                {
                    "label": "日期范围规则",
                    "evaluated_records": 80,
                    "violation_count": 1,
                    "examples": [{"row": 15, "cell": "明细表!B15", "value": "2027-01-02"}]
                },
                {
                    "label": "金额正数规则",
                    "evaluated_records": 80,
                    "violation_count": 64,
                    "examples": [
                        {"row": 5, "cell": "明细表!F5", "value": "-120.00"},
                        {"row": 6, "cell": "明细表!F6", "value": "-85.50"}
                    ]
                }
            ]
        }, provenance={"file_path": "/workspace/AI能力测试_财务报表.xlsx"})
        rendered = analysis_overview([receipt], "识别金额、日期和审批状态异常")
        self.assertIn("日期范围规则", rendered)
        self.assertIn("需核查记录具体位置与异常值", rendered)
        self.assertIn("`明细表!B15` (值: `2027-01-02`)", rendered)
        self.assertIn("`明细表!F5` (值: `-120.00`)", rendered)
        self.assertIn("等共 64 处", rendered)

    def test_render_unverified_guidance_explains_missing_content_and_guides_user(self):
        """阶段三测试：验证当数据缺失时明确回答缺少什么并引导用户输入"""
        from dsh_modules.report_presentation import render_unverified_guidance
        state = {
            "missing_metrics": [{"name": "毛利率", "metric_id": "finance.gross_margin"}],
            "issues": [
                {"code": "required_metrics_missing", "message": "分析计划遗漏所需指标或类型：毛利率。"}
            ]
        }
        guidance = render_unverified_guidance(state, "总结2026年毛利率")
        self.assertIn("本次分析尚未通过执行证据核验", guidance)
        self.assertIn("无法完成计算的原因", guidance)
        self.assertIn("缺少计算 【毛利率】 所需的原始列或对应数据", guidance)
        self.assertIn("建议您补充以下信息以继续", guidance)
        self.assertIn("请补充提供包含 【毛利率】 对应原始列的工作表", guidance)
        self.assertIn("尚未验证的项目不会被列为完成", guidance)

    def test_synthesize_analysis_summary_with_mock_llm(self):
        """阶段二测试：验证 LLM 总结生效时输出自然语言业务报告并附带折叠明细，且强制关闭 thinking"""
        from types import SimpleNamespace
        from dsh_modules.analysis_synthesis import synthesize_analysis_summary
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "facts": [{"label": "2026年收入", "value": "124020", "unit": "千元"}],
            "rules": []
        }, provenance={"file_path": "/workspace/test.xlsx"})

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy") as mock_proxy:
            mock_proxy.return_value = {
                "content": "2026年全年营业收入为 124,020 千元，业务规模稳健增长。"
            }
            orig_policy = SimpleNamespace(single_request_timeout=10, thinking=True, reasoning_effort="medium")
            res = synthesize_analysis_summary(
                prompt="总结2026年收入",
                receipts=[receipt],
                audit="审计明细文本",
                fallback_text="兜底文本",
                model="test-model",
                policy=orig_policy
            )
            self.assertIn("2026年全年营业收入为 124,020 千元", res)
            self.assertIn("查看来源与核算明细", res)
            self.assertIn("审计明细文本", res)
            called_policy = mock_proxy.call_args.kwargs.get("policy")
            self.assertFalse(getattr(called_policy, "thinking", True))
            self.assertIsNone(getattr(called_policy, "reasoning_effort", "medium"))
            self.assertTrue(orig_policy.thinking)

    def test_synthesize_analysis_summary_allows_omitting_unrequested_auxiliary_facts(self):
        """验证当工具顺带算出辅助指标时，LLM 只回答用户提问的核心指标不会被误杀回退"""
        from types import SimpleNamespace
        from dsh_modules.analysis_synthesis import synthesize_analysis_summary
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "facts": [
                {"id": "annual_revenue", "metric_id": "finance.revenue", "label": "2026年营业收入合计", "value": "12402", "unit": "万元"},
                {"id": "annual_gross_profit", "metric_id": "finance.gross_profit", "label": "2026年毛利合计", "value": "5344.325", "unit": "万元"},
                {"id": "annual_gross_margin", "metric_id": "finance.gross_margin", "label": "2026年综合毛利率", "value": "43.09244476697307", "unit": "%"},
                {"id": "annual_operating_profit", "metric_id": "finance.operating_profit", "label": "2026年营业利润合计", "value": "2120.94", "unit": "万元"},
                {"id": "annual_operating_margin", "metric_id": "finance.operating_margin", "label": "2026年营业利润率", "value": "17.1015965", "unit": "%"},
                {"id": "annual_net_profit", "metric_id": "finance.net_profit", "label": "2026年净利润合计", "value": "1603.8300", "unit": "万元"},
                {"id": "annual_net_margin", "metric_id": "finance.net_margin", "label": "2026年净利率", "value": "12.932027", "unit": "%"},
            ],
            "rules": []
        }, provenance={"file_path": "/workspace/AI能力测试_财务报表.xlsx"})

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy") as mock_proxy:
            mock_proxy.return_value = {
                "content": (
                    "2026年全年核心财务指标总结如下：\n\n"
                    "1. **营业收入合计**：12,402 万元\n"
                    "2. **综合毛利率**：43.09%\n"
                    "3. **营业利润合计**：2,120.94 万元\n"
                    "4. **净利润合计**：1,603.83 万元"
                )
            }
            res = synthesize_analysis_summary(
                prompt="总结2026年收入、毛利率、营业利润和净利润。",
                receipts=[receipt],
                audit="范围：月度经营!A4:N15；业务行12条。",
                fallback_text="兜底模板文本",
                model="test-model",
                policy=SimpleNamespace(single_request_timeout=10, thinking=True)
            )
            self.assertNotEqual(res, "兜底模板文本")
            self.assertIn("2026年全年核心财务指标总结如下", res)
            self.assertIn("12,402 万元", res)
            self.assertIn("43.09%", res)

    def test_synthesize_analysis_summary_rejects_hallucinated_extra_numbers(self):
        """验证双向数值锚定（F5）：若 LLM 包含全部必答数值但额外编造了未核验数值，必须拦截并回退"""
        from types import SimpleNamespace
        from dsh_modules.analysis_synthesis import synthesize_analysis_summary
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "facts": [
                {"id": "annual_revenue", "metric_id": "finance.revenue", "label": "2026年营业收入合计", "value": "12402", "unit": "万元"},
                {"id": "annual_net_profit", "metric_id": "finance.net_profit", "label": "2026年净利润合计", "value": "1603.83", "unit": "万元"},
            ],
            "rules": []
        }, provenance={"file_path": "/workspace/AI能力测试_财务报表.xlsx"})

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy") as mock_proxy:
            # 额外编造了未核验的同比增长率 18.5%
            mock_proxy.return_value = {
                "content": "2026年营业收入合计为 12,402 万元（同比增长 18.5%），净利润合计为 1,603.83 万元。"
            }
            res = synthesize_analysis_summary(
                prompt="总结2026年收入和净利润。",
                receipts=[receipt],
                audit="范围：月度经营!A4:N15；业务行12条。",
                fallback_text="兜底模板文本",
                model="test-model",
                policy=SimpleNamespace(single_request_timeout=10)
            )
            self.assertEqual(res, "兜底模板文本")

    def test_synthesize_analysis_summary_allows_exact_pairwise_arithmetic_derivations(self):
        """验证双向数值锚定允许基于已核验指标的精确二元四则派生（如差额、留存占比），同时拒绝幻觉数字"""
        from types import SimpleNamespace
        from dsh_modules.analysis_synthesis import synthesize_analysis_summary
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "facts": [
                {"id": "c_rev", "label": "2026年营业收入合计", "value": "12402", "unit": "万元"},
                {"id": "c_gm", "label": "2026年综合毛利率（注册关系补算）", "value": "43.09244476697307", "unit": "%"},
                {"id": "c_op", "label": "2026年营业利润合计", "value": "2120.94", "unit": "万元"},
                {"id": "c_np", "label": "2026年净利润合计", "value": "1603.83", "unit": "万元"},
            ],
            "rules": []
        }, provenance={"file_path": "/workspace/AI能力测试_财务报表.xlsx"})

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy") as mock_proxy:
            # 2120.94 - 1603.83 = 517.11 万元；1603.83 / 2120.94 = 75.62%（约 75.6%）；1603.83 / 12402 = 12.93%
            mock_proxy.return_value = {
                "content": (
                    "2026年全年核心财务指标总结如下：\n\n"
                    "- **营业收入合计**：12,402 万元\n"
                    "- **综合毛利率**：43.09%\n"
                    "- **营业利润合计**：2,120.94 万元\n"
                    "- **净利润合计**：1,603.83 万元（对应净利率约 12.93%，营业利润向净利润转化率约 75.6%，差额约 517.11 万元）"
                )
            }
            res = synthesize_analysis_summary(
                prompt="总结2026年收入、毛利率、营业利润和净利润。",
                receipts=[receipt],
                audit="范围：月度经营!A4:N15；业务行12条。",
                fallback_text="兜底模板文本",
                model="test-model",
                policy=SimpleNamespace(single_request_timeout=10)
            )
            self.assertNotEqual(res, "兜底模板文本")
            self.assertIn("517.11 万元", res)
            self.assertIn("75.6%", res)
            # 确认传给 LLM 的 digest 已经去掉了内部后缀（注册关系补算）
            sent_messages = mock_proxy.call_args.kwargs.get("messages", [])
            user_prompt_text = sent_messages[-1]["content"] if sent_messages else ""
            self.assertNotIn("注册关系补算", user_prompt_text)

    def test_spreadsheet_plan_normalizes_redundant_unit_on_divide_and_amount_sum(self):
        """验证当模型在二元 divide 节点或金额列的 sum 节点上误加 unit='ratio' 时，normalize_plan 能自动纠正并在第 1 轮一次通过"""
        from openpyxl import Workbook
        from dsh_modules.spreadsheet_plan import normalize_plan
        wb = Workbook()
        ws = wb.active
        ws.title = "月度经营"
        ws["B3"] = "营业收入"
        ws["D3"] = "毛利"
        ws["B4"] = 1000.0
        ws["D4"] = 430.9
        ws["B4"].number_format = "#,##0.00"
        ws["D4"].number_format = "#,##0.00"
        source_tables = {
            "t_monthly": {
                "id": "t_monthly",
                "sheet": "月度经营",
                "header_row": 3,
                "bounds": (1, 4, 4, 4),
                "selected_rows": [4],
                "headers": {"B": "营业收入", "D": "毛利"},
            }
        }
        requested = {
            "tables": [{"id": "t_monthly", "sheet": "月度经营", "header_row": 3, "start_row": 4, "end_row": 4}],
            "calculations": [
                {
                    "id": "c_gross_margin",
                    "label": "2026年综合毛利率",
                    "output_unit": "%",
                    "expression": {
                        "op": "divide",
                        "unit": "ratio",
                        "args": [
                            {"aggregate": "sum", "table": "t_monthly", "column": "毛利", "unit": "ratio"},
                            {"aggregate": "sum", "table": "t_monthly", "column": "营业收入", "unit": "amount"},
                        ]
                    }
                }
            ]
        }
        plan, changes = normalize_plan(requested, workbook=wb, source_tables=source_tables)
        compiled = plan["calculations"][0]["expression"]
        self.assertEqual(compiled["op"], "divide")
        self.assertNotIn("unit", compiled)
        self.assertEqual(compiled["args"][0]["unit"], "amount")
        self.assertEqual(compiled["args"][1]["unit"], "amount")
        self.assertTrue(any("非百分比金额列聚合维度由ratio修正为amount" in c for c in changes))

    def test_outlier_rule_and_profile_detects_extreme_anomaly_without_flagging_normal_signed_rows(self):
        """验证标准统计离群值规则 (kind='outlier', 3×IQR) 与全列概况能够精准识别正负混合列中的极端大额异常，不误杀正常负数支出"""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "交易明细"
        for r in range(1, 3):
            ws.cell(r, 1, "说明")
        headers = ["凭证号", "日期", "类别", "金额", "审批状态"]
        for idx, h in enumerate(headers, start=1):
            ws.cell(3, idx, h)
        # 64 笔正常负数支出 (-380 ~ -2270)，15 笔正常正数收入 (800 ~ 2200)，1 笔极端大额异常 (98000 at row 43)
        for i in range(80):
            row_idx = 4 + i
            ws.cell(row_idx, 1, f"V2026-{i+1:04d}")
            ws.cell(row_idx, 2, "2027-01-03" if row_idx == 58 else "2026-06-15")
            if row_idx == 43:
                ws.cell(row_idx, 3, "设备处置")
                ws.cell(row_idx, 4, 98000)
            elif i % 5 == 1:
                ws.cell(row_idx, 3, "主营业务收入")
                ws.cell(row_idx, 4, 800 + (i * 15))
            else:
                ws.cell(row_idx, 3, "采购成本")
                ws.cell(row_idx, 4, -(380 + (i * 20)))
            ws.cell(row_idx, 5, "待审批" if row_idx == 73 else "已审批")
        wb.save(self.source)
        wb.close()

        plan = {
            "tables": [{"id": "t_tx", "sheet": "交易明细", "header_row": 3, "data_range": "A4:E83"}],
            "rules": [
                {"id": "r_amt", "label": "金额统计离群值检查", "table": "t_tx", "column": "D", "kind": "outlier", "min": 0, "assumptions": "采用3×IQR识别极端异常金额"},
                {"id": "r_date", "label": "日期范围检查", "table": "t_tx", "column": "B", "kind": "date_range", "min": "2026-01-01", "max": "2026-12-31", "assumptions": "2026年度内"},
                {"id": "r_status", "label": "审批状态检查", "table": "t_tx", "column": "E", "kind": "allowed_values", "allowed": ["已审批"], "assumptions": "入账记录应已审批"},
            ]
        }
        receipt = calculate_spreadsheet_analysis(self.source, plan, domain="finance")
        self.assertTrue(receipt.is_success, receipt.error)
        rules_by_id = {r["id"]: r for r in receipt.data["rules"]}
        self.assertEqual(rules_by_id["r_amt"]["violation_count"], 1)
        self.assertEqual(rules_by_id["r_amt"]["examples"][0]["cell"], "交易明细!D43")
        self.assertEqual(rules_by_id["r_amt"]["examples"][0]["value"], 98000)
        self.assertEqual(rules_by_id["r_date"]["violation_count"], 1)
        self.assertEqual(rules_by_id["r_date"]["examples"][0]["cell"], "交易明细!B58")
        self.assertEqual(rules_by_id["r_status"]["violation_count"], 1)
        self.assertEqual(rules_by_id["r_status"]["examples"][0]["cell"], "交易明细!E73")

        d_profile = next(p for p in receipt.data["profiles"] if p["column"] == "D")
        self.assertEqual(d_profile["numeric"]["outlier_count"], 1)
        self.assertEqual(d_profile["numeric"]["outliers"][0]["cell"], "交易明细!D43")

        turn = AnalysisTurn("识别金额、日期和审批状态异常。")
        self.assertTrue(turn.contract.is_audit_intent)
        self.assertTrue(turn.may_finish([receipt]))

    def test_synthesize_analysis_summary_accepts_rule_violation_rates_and_profile_extremes(self):
        """验证异常核查场景下，LLM 报告中的规则违规率 (1/80=1.25%, 79/80=98.75%) 与全列极值 (98,000, 第43行) 不会被误判为幻觉"""
        from types import SimpleNamespace
        from dsh_modules.analysis_synthesis import build_verified_facts_digest, synthesize_analysis_summary
        from dsh_modules.tool_result import ToolResult
        receipt = ToolResult.success({
            "kind": "spreadsheet_analysis",
            "coverage": [{
                "id": "t_detail",
                "sheet": "交易明细",
                "data_range": "A4:K83",
                "input_records": 80,
                "evaluated_records": 80,
                "headers": {"B": "日期", "G": "金额", "J": "审批状态"}
            }],
            "facts": [],
            "checks": [],
            "rules": [
                {
                    "id": "r_date",
                    "label": "日期范围规则",
                    "table": "t_detail",
                    "column": "B",
                    "kind": "date_range",
                    "assumptions": "交易日期应在2026年度内",
                    "evaluated_records": 80,
                    "violation_count": 1,
                    "passed": False,
                    "examples": [{"row": 58, "cell": "交易明细!B58", "value": "2027-01-03"}]
                },
                {
                    "id": "r_amt",
                    "label": "金额离群值规则",
                    "table": "t_detail",
                    "column": "G",
                    "kind": "outlier",
                    "assumptions": "使用3×IQR检测极端金额",
                    "evaluated_records": 80,
                    "violation_count": 1,
                    "passed": False,
                    "examples": [{"row": 43, "cell": "交易明细!G43", "value": 98000}]
                },
                {
                    "id": "r_app",
                    "label": "审批状态规则",
                    "table": "t_detail",
                    "column": "J",
                    "kind": "allowed_values",
                    "assumptions": "入账交易需为已审批状态",
                    "evaluated_records": 80,
                    "violation_count": 1,
                    "passed": False,
                    "examples": [{"row": 73, "cell": "交易明细!J73", "value": "待审批"}]
                }
            ],
            "profiles": [
                {
                    "table": "t_detail",
                    "column": "G",
                    "header": "金额",
                    "records": 80,
                    "missing": 0,
                    "numeric": {
                        "count": 80,
                        "min": -2442,
                        "min_row": 37,
                        "max": 98000,
                        "max_row": 43,
                        "outlier_count": 1,
                        "outliers": [{"row": 43, "cell": "交易明细!G43", "value": 98000}]
                    }
                }
            ]
        }, provenance={"file_path": "/workspace/AI能力测试_财务报表.xlsx"})

        digest = build_verified_facts_digest([receipt], "识别金额、日期和审批状态异常。")
        self.assertIn("【字段全量统计概况与极值分布】", digest)
        self.assertIn("统计离群极值（3×IQR）：发现 1 处极端值 [交易明细!G43 (值: 98000)]", digest)

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy") as mock_proxy:
            mock_proxy.return_value = {
                "content": (
                    "经对《AI能力测试_财务报表.xlsx》中 `交易明细!A4:K83` 共 80 条记录进行筛查，共识别出 3 类需核查异常：\n\n"
                    "### 2.1 异常明细解读\n"
                    "1. **金额极端离群异常**：检出 1 条异常（占比 1.25%，其余 79 条即 98.75% 位于正常区间），位置为 `交易明细!G43`（原第 43 行），金额高达 **98,000**（全表最小值为第 37 行的 -2,442）。\n"
                    "2. **跨期日期异常**：检出 1 条异常（占比 1.25%），位置为 `交易明细!B58`，日期为 `2027-01-03`（2027年1月3日），超出 2026 年度范围。\n"
                    "3. **审批状态异常**：检出 1 条异常（占比 1.25%），位置为 `交易明细!J73`，状态为 `待审批`。"
                )
            }
            res = synthesize_analysis_summary(
                prompt="识别金额、日期和审批状态异常。",
                receipts=[receipt],
                audit="审计明细",
                fallback_text="兜底模板文本",
                model="test-model",
                policy=SimpleNamespace(single_request_timeout=10)
            )
            self.assertNotEqual(res, "兜底模板文本")
            self.assertIn("98,000", res)
            self.assertIn("1.25%", res)


if __name__=='__main__':unittest.main()

