"""Protect audit verdicts against missing results and weak number matching."""
import unittest
from grade_api import compare, equal_display, extract_primary, explicitly_incomplete, stream_contract_complete


class ApiGraderTests(unittest.TestCase):
    def test_declared_rounding(self):
        self.assertTrue(equal_display('1.01','1.005'))
        self.assertFalse(equal_display('1.00','1.005'))

    def test_missing_metric_does_not_reuse_an_unrelated_number(self):
        text='| 指标 | 数值 |\n|---|---|\n| 条数 | 274 |\n'
        actual,_=extract_primary(text,{'rows':[{'records':274,'amount_k':'42'}]})
        self.assertIsNone(actual)

    def test_duplicate_group_is_not_a_set_match(self):
        expected=[{'group_key':'A','records':1},{'group_key':'B','records':1}]
        actual=[{'group_key':'A','records':1},{'group_key':'A','records':1}]
        self.assertFalse(compare(actual,expected,False))

    def test_order_is_checked_when_requested(self):
        expected=[{'group_key':'A','records':1},{'group_key':'B','records':2}]
        self.assertFalse(compare(list(reversed(expected)),expected,True))
        self.assertTrue(compare(list(reversed(expected)),expected,False))

    def test_dimension_identifiers_are_not_numeric_display_values(self):
        self.assertFalse(compare([{'group_key':'001','records':1}],
                                 [{'group_key':'1','records':1}],False))
        self.assertFalse(compare([{'group_key':1,'records':1}],
                                 [{'group_key':'1','records':1}],False))

    def test_structural_year_is_not_a_query_result(self):
        actual,_=extract_primary('2026年，数据区第5至278行。',{'rows':[{'records':274}]})
        self.assertIsNone(actual)

    def test_min_max_header_context(self):
        text='| 指标 | 工数(小时) |\n|---|---|\n| 最小值 | 0.17 |\n| 最大值 | 136 |\n'
        actual,_=extract_primary(text,{'rows':[{'min_hours':'0.17','max_hours':'136'}]})
        self.assertTrue(compare(actual,[{'min_hours':'0.17','max_hours':'136'}],False))

    def test_explicit_runtime_incomplete_markers_identify_noncompletion(self):
        self.assertTrue(explicitly_incomplete('【指标核算未完成声明】'))
        self.assertTrue(explicitly_incomplete('上游模型未输出最终有效正文。'))
        self.assertFalse(explicitly_incomplete('统计结果如下，已完成全部指标。'))

    def test_explicit_wbs_prefix_header(self):
        text='| WBS前两位 | 明细条数 |\n|---|---|\n| EX | 3 |\n'
        wanted=[{'group_key':'EX','records':3}]
        actual,_=extract_primary(text,{'rows':wanted})
        self.assertTrue(compare(actual,wanted,True))
        ambiguous=text.replace('WBS前两位','项目代码')
        self.assertIsNone(extract_primary(ambiguous,{'rows':wanted})[0])

    def test_explicit_distinct_count_with_parenthetical_note(self):
        text='有效总行数：274。不同 WBS 编号数量（去重后）：229 个。'
        wanted=[{'distinct_wbs':229}]
        actual,_=extract_primary(text,{'rows':wanted})
        self.assertTrue(compare(actual,wanted,True))

    def test_done_event_does_not_hide_execution_error_or_missing_result(self):
        self.assertFalse(stream_contract_complete([{'type':'done'}]))
        self.assertFalse(stream_contract_complete([{'type':'error'},{'type':'done'}]))
        self.assertFalse(stream_contract_complete([{'type':'result'},{'type':'parse_error'},{'type':'done'}]))
        self.assertTrue(stream_contract_complete([{'type':'result'},{'type':'done'}]))

    def test_count_metric_with_duration_field_qualifier(self):
        text='| 统计指标 | 数值 |\n|---|---|\n| 工数年月202610明细条数 | 274 条 |\n| 金额(K)合计 | 1887.73 K |\n| 工数(小时)合计 | 6532.01 小时 |\n'
        wanted=[{'records':274,'amount_k':'1887.73102','hours':'6532.01'}]
        actual,_=extract_primary(text,{'rows':wanted})
        self.assertTrue(compare(actual,wanted,False))

    def test_canonical_vertical_group_metrics_keep_identity_and_order(self):
        text='| 统计指标 / 分组 | 核算结果 |\n|---|---|\n| FC45031 明细条数 | 2条 |\n| FC34022 明细条数 | 1条 |\n| FC45031 金额(K) | 100K |\n| FC34022 金额(K) | 20K |'
        wanted=[{'group_key':'FC45031','records':2,'amount_k':'100'},
                {'group_key':'FC34022','records':1,'amount_k':'20'}]
        actual,_=extract_primary(text,{'rows':wanted})
        self.assertTrue(compare(actual,wanted,True))
        self.assertFalse(compare(actual,list(reversed(wanted)),True))
        prefix_text=text.replace('FC45031','EX').replace('FC34022','IP')
        prefix_wanted=[{**r,'group_key':g} for r,g in zip(wanted,['EX','IP'])]
        self.assertTrue(compare(extract_primary(prefix_text,{'rows':prefix_wanted})[0],prefix_wanted,True))

    def test_vertical_group_metrics_do_not_fill_duplicates_or_missing_values(self):
        text='| 统计指标 / 分组 | 核算结果 |\n|---|---|\n| FC45031 明细条数 | 2条 |\n| FC45031 明细条数 | 3条 |'
        wanted=[{'group_key':'FC45031','records':2}]
        self.assertIsNone(extract_primary(text,{'rows':wanted})[0])
        text=text.replace('| FC45031 明细条数 | 3条 |','')
        wanted[0]['amount_k']='100'
        self.assertIsNone(extract_primary(text,{'rows':wanted})[0])

    def test_declared_precision_column_cannot_be_hidden_by_two_decimal_value(self):
        text='| 统计指标 | 核验值 | 保留6位小数 |\n|---|---|---|\n| 平均工数 | 23.84 | 23.840000 |'
        wanted=[{'avg_hours':'23.83945255474452554744525547'}]
        actual,_=extract_primary(text,{'rows':wanted})
        self.assertFalse(compare(actual,wanted,False))
        correct=text.replace('23.840000','23.839453')
        self.assertTrue(compare(extract_primary(correct,{'rows':wanted})[0],wanted,False))

    def test_rule_text_numbers_are_not_the_explicit_result_column(self):
        text='| 统计指标 | 统计口径与处理规则 | 统计结果 |\n|---|---|---|\n| 不同WBS编号数量 | 同一编号重复仅计1次 | 229个 |'
        wanted=[{'distinct_wbs':229}]
        self.assertTrue(compare(extract_primary(text,{'rows':wanted})[0],wanted,False))

    def test_missing_distinct_list_is_not_an_asserted_empty_result(self):
        text='本次分析尚未通过执行证据核验。缺少对应列，无法完成计算。'
        wanted=[{'cost_center':'FC45031'}]
        self.assertIsNone(extract_primary(text,{'rows':wanted})[0])
        self.assertTrue(explicitly_incomplete(text))

    def test_supplementary_slice_cannot_replace_primary_totals(self):
        text='| 统计指标 | 核算结果 |\n|---|---|\n| 客户名称为空条数 | 32条 |\n| 客户名称为空金额 | 310.34K |\n| 客户名称为空工数 | 1058.93小时 |\n| P1客户名称为空条数 | 20条 |\n| P1客户名称为空金额 | 166.53K |\n| P1客户名称为空工数 | 529.17小时 |'
        wanted=[{'records':32,'amount_k':'310.34466','hours':'1058.93'}]
        self.assertTrue(compare(extract_primary(text,{'rows':wanted})[0],wanted,False))
        wrong_primary=text.replace('32条','99条')+'\n| 复核条数 | 32条 |'
        self.assertFalse(compare(extract_primary(wrong_primary,{'rows':wanted})[0],wanted,False))

    def test_month_filter_row_is_not_a_duration_result(self):
        text='| 统计指标 | 统计结果 |\n|---|---|\n| 筛选工数年月 | 202610 |\n| 有效明细条数 | 274条 |\n| 工数合计 | 6532.01小时 |\n| 金额合计 | 1887.73K |'
        wanted=[{'records':274,'hours':'6532.01','amount_k':'1887.73102'}]
        self.assertTrue(compare(extract_primary(text,{'rows':wanted})[0],wanted,False))


if __name__=='__main__':
    unittest.main()
