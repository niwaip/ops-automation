"""Adversarial audit beyond the fixed 36 examples; never edits source workbooks.

The tiny in-memory workbook is a test double, not a delivered spreadsheet.
Outputs observed/expected counterexamples; nonzero exit means defects reproduced.
"""
import argparse
import copy
from decimal import Decimal
import json
from pathlib import Path
import sys

import openpyxl

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'apps/backend/runtimes/personal-sandbox-runner/src'))
from dsh_modules.query_predicates import eval_row_predicate, to_decimal
from dsh_modules.query_contract import validate_predicate_node
from dsh_modules.query_executor import execute_query_plan
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from oracle import load_source, connection


def main(source, output):
    cases=[]
    def check(cid, description, observed, expected):
        cases.append({'id':cid,'description':description,'observed':observed,
                      'expected':expected,'status':'pass' if observed==expected else 'fail'})

    check('B01','NOT(NULL = x) must remain UNKNOWN and be excluded by WHERE',
          eval_row_predicate({'not':{'op':'eq','field':'code','value':'x'}},{'code':None}),False)
    check('B02','Text identifier 001 must not equal text identifier 1',
          eval_row_predicate({'op':'eq','field':'code','value':'1'},{'code':'001'}),False)
    bad={'and':[{'op':'eq','field':'code','value':'x'}],
         'or':[{'op':'eq','field':'code','value':'y'}]}
    try:
        validate_predicate_node(bad,{'code'})
        accepted=True
    except ValueError:
        accepted=False
    check('B03','Conflicting boolean keys must be rejected instead of ignoring or',accepted,False)
    nonfinite=to_decimal('NaN')
    check('B04','Text NaN must not be a valid finite Decimal',
          nonfinite is not None and not nonfinite.is_finite(),False)

    wb=openpyxl.Workbook()
    ws=wb.active
    ws.title='Rows'
    ws.append(['Group','金额(K)','工数(小时)'])
    ws.append(['A',20,1])
    ws.append(['B',30,2])
    ws.append(['C',10,3])
    plan={'source':{'sheet':'Rows','header_row':1,'data_range':'A2:C4'},
          'group_by':[{'field':'Group'}],
          'metrics':[{'id':'value','op':'sum','field':'金额(K)','unit':'amount'}],
          'order_by':[{'ref':'value','direction':'desc'}],'offset':1,'limit':1}
    result=execute_query_plan(wb,copy.deepcopy(plan))
    check('B05','ORDER BY DESC OFFSET 1 LIMIT 1 must return second group',
          result.rows,[{'group_key':'A','value':'20'}])

    distinct={'source':plan['source'],'distinct':True,'fields':['Group'],
              'order_by':[{'ref':'Group'}],'offset':1,'limit':1}
    result=execute_query_plan(wb,distinct)
    check('B06','DISTINCT must apply OFFSET and LIMIT',result.rows,[{'Group':'B'}])

    units={'source':plan['source'],'metrics':[{'id':'custom_amount','op':'sum','field':'金额(K)','unit':'source'}]}
    result=execute_query_plan(wb,units)
    check('B07','Source amount unit must not depend on metric ID',result.facts[0]['unit'],'K')
    out_of_bounds={'source':{'sheet':'Rows','header_row':1,'data_range':'A2:D4'},
                   'metrics':[{'id':'n','op':'count_rows'}]}
    try:
        execute_query_plan(wb,out_of_bounds)
        accepted=True
    except ValueError:
        accepted=False
    check('B08','Range extending beyond physical columns must be rejected',accepted,False)
    wb.close()

    wb=openpyxl.Workbook()
    ws=wb.active
    ws.title='Types'
    ws.append(['Code','Value'])
    ws.append([1,10])
    ws.append(['1',20])
    ws.append([None,30])
    ws.append(['',40])
    result=execute_query_plan(wb,{'source':{'sheet':'Types','header_row':1,'data_range':'A2:B5'},
                                'group_by':['Code'],'metrics':[{'id':'n','op':'count_rows'}]})
    check('B09','Grouping must preserve typed 1/string 1 and NULL/empty distinction',result.group_count,4)
    result=execute_query_plan(wb,{'source':{'sheet':'Types','header_row':1,'data_range':'A2:B5'},
                                'metrics':[{'id':'n','op':'count_distinct','field':'Code'}]})
    check('B10','COUNT DISTINCT must preserve source scalar types and ignore NULL',result.rows[0]['n'],3)
    wb.close()

    records,profile=load_source(source)
    conn=connection(records,profile['scales'])
    expected_count=conn.execute("SELECT COUNT(*) FROM detail WHERE billable='有偿' AND hours>20*?",(profile['scales']['hours'],)).fetchone()[0]
    conn.close()
    table={'id':'detail','sheet':profile['sheet'],'header_row':profile['header_row'],'data_range':profile['data_range'],
           'filters':[{'column':'有偿无偿','op':'in','values':['有偿']}],
           'where':{'op':'gt','field':'工数(小时)','value':20}}
    result=calculate_spreadsheet_analysis(source,{'tables':[table],
        'calculations':[{'id':'n','label':'n','expression':{'aggregate':'count','table':'detail','column':'WBS编号','unit':'count'}}]})
    check('B11','Bridge must apply legacy filters AND new WHERE, not discard filters',
          result.data['coverage'][0]['evaluated_records'] if result.is_success else result.error,expected_count)
    result=calculate_spreadsheet_analysis(source,{'query':{
        'source':{'sheet':profile['sheet'],'header_row':profile['header_row'],'data_range':profile['data_range']},
        'metrics':[{'id':'converted','op':'sum','field':'金额(K)','unit':'万元'}]}})
    expected=sum(r['amount'] for r in records)/10
    fact=result.data['facts'][0] if result.is_success else {}
    observed={'value':str(Decimal(str(fact['value']))) if fact else None,'unit':fact.get('unit')}
    check('B12','K to 万元 must scale value by 1/10, not only change unit label',
          observed,{'value':str(expected),'unit':'万元'})
    output=Path(output)
    output.write_text(json.dumps({'scope':'adversarial_local_not_live_e2e','cases':cases,
                                 'passed':sum(c['status']=='pass' for c in cases),
                                 'failed':sum(c['status']=='fail' for c in cases)},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed':sum(c['status']=='pass' for c in cases),'failed':sum(c['status']=='fail' for c in cases)},ensure_ascii=False))
    return int(any(c['status']=='fail' for c in cases))


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path)
    p.add_argument('output',type=Path)
    a=p.parse_args()
    sys.exit(main(a.source,a.output))
