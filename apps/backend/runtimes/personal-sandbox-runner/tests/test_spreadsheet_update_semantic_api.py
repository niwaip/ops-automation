"""Regressions for the 22:13 failure: small semantic API, exact facts and safe preview."""
import copy
import json
import os
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import openpyxl
from dsh_modules.spreadsheet_update.result_catalog import (
    RESULTS, convert_value, fingerprint, reset_results,
)
from dsh_modules.spreadsheet_update.tools import (
    harvest_analytical_facts, reset_turn_results, tool_plan_spreadsheet_update,
    tool_execute_spreadsheet_update,
)
from dsh_modules.spreadsheet_update.semantic_plan import build_semantic_plan
from dsh_modules.spreadsheet_update.tool_schema import SPREADSHEET_UPDATE_TOOL_DEFINITIONS


class SemanticUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ws = Path(self.temp.name).resolve()
        self.target = self.ws / 'target.xlsx'
        self.source = self.ws / 'source.xlsx'
        wb = openpyxl.Workbook()
        sheet = wb.active
        sheet.title = '1019'
        for cell, value in {'A1':'有偿', 'A2':'部门', 'C3':202610, 'D3':202610,
                            'C4':'预测', 'D4':'计划', 'B5':'FC001', 'C5':10,
                            'D5':100, 'B6':'FC002', 'C6':20, 'B7':'Subtotal',
                            'C7':'=SUM(C5:C6)', 'A9':'无偿', 'A10':'部门',
                            'C11':202610, 'C12':'预测', 'B13':'FC001', 'C13':80, 'F1':'单位：K'}.items():
            sheet[cell] = value
        wb.save(self.target)
        wb.close()
        wb = openpyxl.Workbook()
        wb.active.append(['工数年月','部门编号','有偿无偿','金额(K)'])
        wb.active.append(['202610','FC001','有偿',67.0353])
        wb.save(self.source)
        wb.close()
        self.receipt = {'kind':'spreadsheet_analysis', 'evidence_id':'verified_result',
                        'plan':{'where':{'and':[{'field':'工数年月','op':'eq','value':'202610'},
                                              {'field':'有偿无偿','op':'eq','value':'有偿'}]},
                                'group_by':['部门编号'], 'metrics':[{'id':'amount_k','field':'金额(K)','op':'sum','unit':'source'}]},
                        'facts':[{'id':'amount_k__FC001','group_fields':{'部门编号':'FC001'},
                                  'value':'67.0353','unit':'K','matched_records':1}],
                        'coverage':[{'coverage_complete':True}]}
        self.provenance = {'file_path':str(self.source), 'workbook_id':fingerprint(self.source)}
        self.request = {'target_file':'target.xlsx','period':'202610', 'section':'有偿',
                        'target_kind':'forecast','target_unit':'K','new_sheet':'1023','base_sheet':'1019',
                        'period_field':'工数年月','target_label':'预测','unit_cell':'F1','protected_labels':['计划']}
        reset_turn_results()
        harvest_analytical_facts(self.receipt, provenance=self.provenance)
        self.patch_env = patch.dict(os.environ, {'WORKSPACE_DIR':str(self.ws)})
        self.patch_env.start()
        self.patch_config = patch('dsh_modules.config.WORKSPACE_DIR', str(self.ws))
        self.patch_config.start()

    def tearDown(self):
        self.patch_config.stop()
        self.patch_env.stop()
        reset_turn_results()
        self.temp.cleanup()

    def test_actual_fact_unit_is_preserved_without_aliases_or_zero_rows(self):
        from dsh_modules.spreadsheet_update.result_catalog import bind_result
        facts = bind_result(RESULTS['verified_result'], None, '工数年月', '202610')[0].all_facts()
        self.assertEqual(len(facts), 1)
        self.assertEqual(facts[0].numeric_value, Decimal('67.0353'))
        self.assertEqual(facts[0].unit, 'K')
        self.assertEqual(convert_value(facts[0].numeric_value, 'K', '元'), Decimal('67035.3'))
        with self.assertRaises(ValueError):
            convert_value(facts[0].numeric_value, 'K', 'hours')

    def test_preview_has_one_write_in_paid_forecast_and_preserves_unmatched(self):
        before = fingerprint(self.target)
        plan, facts, payload, preview, warnings = build_semantic_plan(self.request, self.ws)
        self.assertEqual(preview, [{'key':'FC001','coordinate':'C5','value':'67.0353','unit':'K'}])
        self.assertEqual(len(plan['operations']), 2)
        self.assertTrue(warnings)
        self.assertIn('FC002', warnings[0])
        self.assertEqual(fingerprint(self.target), before)
        self.assertFalse((self.ws/'target_1023.xlsx').exists())
        self.assertEqual(len(facts.all_facts()), 1)

    def test_period_mismatch_and_hours_to_amount_are_rejected(self):
        for change in ({'period':'202611'}, {'target_unit':'hours'}):
            with self.assertRaises(ValueError):
                build_semantic_plan({**self.request, **change}, self.ws)

    def test_duplicate_source_department_is_rejected_even_with_equal_amount(self):
        receipt = copy.deepcopy(self.receipt)
        receipt['facts'].append(copy.deepcopy(receipt['facts'][0]))
        with self.assertRaises(ValueError):
            harvest_analytical_facts(receipt, provenance=self.provenance)

    def test_target_formula_and_ambiguous_forecast_are_rejected(self):
        wb=openpyxl.load_workbook(self.target)
        wb['1019']['C5']='=1+2'
        wb.save(self.target);wb.close()
        with self.assertRaisesRegex(Exception, 'formula|protected'):
            build_semantic_plan(self.request,self.ws)
        wb=openpyxl.load_workbook(self.target)
        wb['1019']['C5']=10
        wb['1019']['D4']='预测'
        wb.save(self.target);wb.close()
        with self.assertRaisesRegex(ValueError, '不唯一'):
            build_semantic_plan(self.request,self.ws)

    def test_plan_is_preview_only_and_rejects_mutated_fact_payload(self):
        result=tool_plan_spreadsheet_update(self.request)
        self.assertTrue(result.is_success, str(result))
        self.assertEqual(result.data['status'],'planned')
        self.assertFalse((self.ws/'target_1023.xlsx').exists())
        run=next((self.ws/'.dsh/spreadsheet-runs').iterdir())
        (run/'facts.json').write_text('[]')
        applied=tool_execute_spreadsheet_update(result.data['plan_id'])
        self.assertTrue(applied.is_error)
        self.assertIn('统计事实已被修改', str(applied))
        self.assertFalse((self.ws/'target_1023.xlsx').exists())

    def test_plan_cannot_execute_another_plan_or_changed_source(self):
        result=tool_plan_spreadsheet_update(self.request)
        self.assertTrue(result.is_success,str(result))
        wrong=tool_execute_spreadsheet_update('plan_missing')
        self.assertTrue(wrong.is_error)
        self.source.write_bytes(self.source.read_bytes()+b'changed')
        applied=tool_execute_spreadsheet_update(result.data['plan_id'])
        self.assertTrue(applied.is_error)
        self.assertIn('输入文件已变化',str(applied))

    def test_repeated_planning_yields_distinct_unambiguous_ids(self):
        first=tool_plan_spreadsheet_update(self.request)
        second=tool_plan_spreadsheet_update(self.request)
        self.assertTrue(first.is_success,str(first))
        self.assertTrue(second.is_success,str(second))
        self.assertNotEqual(first.data['plan_id'],second.data['plan_id'])
        from dsh_modules.spreadsheet_update.tools import _resolve_plan
        self.assertNotEqual(_resolve_plan(first.data['plan_id']).mgr.run_id,
                            _resolve_plan(second.data['plan_id']).mgr.run_id)

    def test_closed_schema_has_no_private_protocol_or_auto_execution(self):
        plan, execute, _ = SPREADSHEET_UPDATE_TOOL_DEFINITIONS
        props=plan['function']['parameters']
        self.assertFalse(props['additionalProperties'])
        for key in ('operations','snapshot','auto_execute','plan','expected_plan_hash'):
            self.assertNotIn(key,props['properties'])
        self.assertEqual(execute['function']['parameters']['required'],['plan_id'])
        rejected=tool_plan_spreadsheet_update({**self.request,'auto_execute':True})
        self.assertTrue(rejected.is_error)

    def test_newly_uploaded_input_is_not_a_deliverable(self):
        from dsh_modules.deliverable_detection import is_new_deliverable
        import time
        with patch.dict(os.environ,{'DSH_SESSION_ATTACHMENTS':'target.xlsx'}):
            self.assertFalse(is_new_deliverable(self.target,time.time()))
        self.assertFalse(is_new_deliverable(self.target,0,require_update_receipt=True))

    def test_no_fact_results_survive_a_new_turn(self):
        reset_turn_results()
        with self.assertRaisesRegex(ValueError,'唯一结果'):
            build_semantic_plan(self.request,self.ws)

    def test_recalc_equivalence_is_narrow_and_epoch_aware(self):
        from dsh_modules.spreadsheet_update.diff import _cells_equivalent
        from datetime import datetime
        from openpyxl.utils.datetime import CALENDAR_MAC_1904, to_excel
        value=datetime(2026,10,19)
        self.assertTrue(_cells_equivalent(46314,value))
        self.assertFalse(_cells_equivalent(46315,value))
        self.assertTrue(_cells_equivalent(to_excel(value,CALENDAR_MAC_1904),value,CALENDAR_MAC_1904))
        self.assertTrue(_cells_equivalent('=SUM(C5:C5)','=SUM(C5)'))
        self.assertFalse(_cells_equivalent('=SUM(C5:C6)','=SUM(C5)'))
        self.assertFalse(_cells_equivalent('="A B"','="AB"'))
        self.assertFalse(_cells_equivalent('="a"','="A"'))

    def test_status_uses_the_same_public_plan_id(self):
        from dsh_modules.tools import execute_tool
        result=execute_tool('plan_spreadsheet_update',self.request)
        self.assertTrue(result.is_success,str(result))
        status=execute_tool('get_spreadsheet_update_status',{'plan_id':result.data['plan_id']})
        self.assertTrue(status.is_success,str(status))
        self.assertEqual(status.data['status'],'planned')
        rejected=execute_tool('execute_spreadsheet_update',{'plan_id':result.data['plan_id'],'auto_execute':True})
        self.assertTrue(rejected.is_error)

    def test_absolute_deliverable_in_nested_workspace_is_not_reported_missing(self):
        from dsh_modules.agent_loop import detect_missing_claimed_artifacts
        import time
        nested=self.ws/'.validation/example'
        nested.mkdir(parents=True)
        output=nested/'result.xlsx'
        output.write_bytes(self.target.read_bytes())
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR',str(nested)):
            self.assertEqual(detect_missing_claimed_artifacts(
                f'已生成文件 `{output}`',is_generate_intent=True,turn_start_time=time.time()-1),[])
            self.assertTrue(detect_missing_claimed_artifacts(
                f'已生成文件 `{nested/"missing.xlsx"}`',is_generate_intent=True,turn_start_time=time.time()-1))

    def test_unusable_model_prose_falls_back_to_verified_published_receipt(self):
        from dsh_modules.spreadsheet_update.presentation import render_published_update
        from dsh_modules.spreadsheet_update.delivery import register_verified_update
        from dsh_modules.tool_result import ToolResult
        path=self.ws/'output.xlsx'
        path.write_bytes(self.target.read_bytes())
        planned=ToolResult.success(data={'status':'planned','plan_id':'plan_ok','new_sheet':'1023',
            'preview':[{'unit':'K'}],'warnings':['FC002 无匹配，保留原值']})
        applied=ToolResult.success(data={'status':'published','plan_id':'plan_ok','published_file':str(path)},
            provenance={'tool':'execute_spreadsheet_update'})
        evidence=[planned,applied]
        self.assertIsNone(render_published_update(evidence,self.ws))
        register_verified_update(path,fingerprint(path))
        summary=render_published_update(evidence,self.ws)
        self.assertIn('1023',summary)
        self.assertIn('更新 1 条记录',summary)
        self.assertIn('K',summary)
        self.assertIn('保留原值',summary)
        self.assertNotIn('DSH_OUTBOUND_FILE',summary)
        path.write_bytes(path.read_bytes()+b'changed')
        self.assertIsNone(render_published_update(evidence,self.ws))

    def test_published_receipt_prevents_false_script_leak_failure_in_final_answer(self):
        from dsh_modules.tool_result import ToolResult
        from dsh_modules.final_answer import finalize_agent_text
        from dsh_modules.spreadsheet_update.delivery import register_verified_update
        from dsh_modules.telemetry import TelemetryStats
        from dsh_modules.runtime_policy import RuntimePolicy
        path=self.ws/'output.xlsx'
        path.write_bytes(self.target.read_bytes())
        register_verified_update(path,fingerprint(path))
        applied=ToolResult.success(data={'status':'published','plan_id':'plan_ok','published_file':str(path)},
            provenance={'tool':'execute_spreadsheet_update'})
        with patch('dsh_modules.final_answer.detect_unexecuted_script_leak',return_value=True), \
             patch('dsh_modules.final_answer.auto_heal_unexecuted_file_writes',side_effect=lambda text,ws:(text,[])), \
             patch('dsh_modules.final_answer._recalculate_generated_workbooks'):
            text,_=finalize_agent_text('已完成表格更新。',[], 'test',RuntimePolicy.from_env(),None,False,[],False,
                TelemetryStats(),last_user_prompt='更新工数预测',execution_evidence=[applied],
                expected_deliverables=['.xlsx'],workspace_dir=str(self.ws),call_model=lambda *a,**k:{},
                max_agent_rounds=10,max_spreadsheet_rounds=4)
        self.assertIn('已生成',text)
        self.assertNotIn('未输出最终有效正文',text)
        self.assertNotIn('请实际在终端',text)

    def test_published_receipt_prevents_false_uncompleted_metrics_disclaimer(self):
        from dsh_modules.tool_result import ToolResult
        from dsh_modules.final_answer import finalize_agent_text
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.analysis_validation import validate_reply_against_contract
        from dsh_modules.spreadsheet_update.delivery import register_verified_update
        from dsh_modules.telemetry import TelemetryStats
        from dsh_modules.runtime_policy import RuntimePolicy
        path = self.ws / 'output_1023.xlsx'
        path.write_bytes(self.target.read_bytes())
        register_verified_update(path, fingerprint(path))
        planned = ToolResult.success(data={'status': 'planned', 'plan_id': 'plan_test', 'new_sheet': '1023',
            'preview': [{'unit': 'K'}], 'warnings': []})
        applied = ToolResult.success(data={'status': 'published', 'plan_id': 'plan_test', 'published_file': str(path)},
            provenance={'tool': 'execute_spreadsheet_update'})
        evidence = [planned, applied]
        prompt = "需要更新工数管理，里面有计划和预测，先复制最新的sheet 生成今天 1023的新sheet，用 部门编码 统计 部门的 有偿 部分的金额 更新到 这个月的预测部分，以K为单位"
        contract = build_analysis_contract(prompt)
        self.assertTrue(contract.has_metrics)
        self.assertIn('有偿金额', contract.get_metric_names())
        val_res = validate_reply_against_contract(
            contract=contract,
            reply_text='已生成表格',
            round_idx=8,
            max_rounds=8,
            messages=[],
            execution_evidence=evidence
        )
        self.assertTrue(val_res.is_pass)
        self.assertEqual(val_res.satisfied_metrics, ['有偿金额'])
        self.assertEqual(val_res.missing_metrics, [])

        with patch('dsh_modules.final_answer._recalculate_generated_workbooks'):
            text, _ = finalize_agent_text(
                '', [], 'test', RuntimePolicy.from_env(), None, False, [], False,
                TelemetryStats(), last_user_prompt=prompt, execution_evidence=evidence,
                expected_deliverables=['.xlsx'], workspace_dir=str(self.ws), call_model=lambda *a, **k: {},
                max_agent_rounds=10, max_spreadsheet_rounds=4
            )
        self.assertIn('已生成', text)
        self.assertNotIn('【指标核算未完成声明】', text)
        self.assertNotIn('未完成指标', text)
