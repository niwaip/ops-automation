"""Independently verify the recorded live runs; does not call a model."""
import hashlib
import json
import re
from decimal import Decimal as D
from pathlib import Path

import openpyxl

BASE = Path(__file__).resolve().parent
SOURCE = Path('/Users/chain/Desktop/AI能力测试_财务报表.xlsx')
SOURCE_HASH = '9d71ca8cc6172add7e558ac6a906f677c784fcc5c9d3444cbb17de2772fd992f'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_HASH
wb = openpyxl.load_workbook(SOURCE, data_only=False)
ws = wb['月度经营']


def number(sheet, cell):
    return D(str(wb[sheet][cell].value))


def close(actual, expected, tolerance='0.000001'):
    assert abs(D(str(actual)) - expected) <= D(tolerance), (actual, str(expected))


months = {}
for r in range(4, 16):
    revenue = number('月度经营', f'B{r}')
    cost_formula = ws[f'C{r}'].value
    match = re.fullmatch(rf'=B{r}\*\(1-([0-9.]+)\)', cost_formula)
    assert match, cost_formula
    gross = revenue * D(match[1])
    expenses = D('0')
    for col in ('F', 'G'):
        formula = ws[f'{col}{r}'].value
        rate = re.fullmatch(rf'=B{r}\*([0-9.]+)', formula)
        assert rate, formula
        expenses += revenue * D(rate[1])
    operating = gross - expenses - number('月度经营', f'H{r}')
    pretax = operating + number('月度经营', f'K{r}')
    net = pretax - max(D('0'), pretax * number('参数', 'B8'))
    months[ws[f'A{r}'].value] = dict(revenue=revenue, gross=gross, operating=operating, net=net, row=r)

revenue = sum(m['revenue'] for m in months.values())
gross = sum(m['gross'] for m in months.values())
operating = sum(m['operating'] for m in months.values())
net = sum(m['net'] for m in months.values())
golden = dict(revenue=revenue, gross_profit=gross, operating_profit=operating, net_profit=net,
              gross_margin=gross/revenue, net_margin=net/revenue)



assets = sum(number('资产负债表', f'B{r}') for r in (4,5,6,7,9,10))
le = sum(number('资产负债表', f'B{r}') for r in (12,13,14,15,17)) + number('资产负债表','C18') + net
cfo = net + number('现金流量表','B5') - (number('资产负债表','B5')-number('资产负债表','C5')) - (number('资产负债表','B6')-number('资产负债表','C6')) + (number('资产负债表','B13')-number('资产负债表','C13'))
debt = sum(number('资产负债表', f'B{r}')-number('资产负债表', f'C{r}') for r in (12,15))
cash = number('资产负债表','C4') + cfo - number('参数','B11') + debt + number('现金流量表','B13')
ws = wb['交易明细']
from collections import Counter
keys=Counter(ws.cell(r,1).value for r in range(4,84))
headers={c.value:c.column for c in ws[3] if c.value}
def rows_for(predicate):
    return [r for r in range(4,84) if predicate(r)]
anomalies={'duplicate_voucher':rows_for(lambda r:keys[ws.cell(r,1).value]>1),'blank_department':rows_for(lambda r:ws.cell(r,headers['部门']).value in (None,'')),'large_amount':rows_for(lambda r:abs(D(str(ws.cell(r,headers['金额']).value)))>10000),'out_of_period':rows_for(lambda r:ws.cell(r,headers['日期']).value.year!=2026),'unapproved':rows_for(lambda r:ws.cell(r,headers['审批状态']).value!='已审批')}
budget=[]
for name,m in months.items():
    r=m['row'];budget.append({'month':name,'actual':m['net'],'budget':number('预算对比',f'E{r}'),'difference':m['net']-number('预算对比',f'E{r}')})
summary={'source_sha256':SOURCE_HASH,'method':'Independent Decimal reconstruction from raw literals and formula rates; no model or runtime calculation tools','golden':golden,'budget_net_extreme':max(budget,key=lambda x:abs(x['difference'])),'equations':[{'left':assets,'right':le,'difference':assets-le},{'left':cash,'right':number('资产负债表','B4'),'difference':cash-number('资产负债表','B4')}],'anomaly_rows':anomalies}
(BASE/'oracle.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,default=str))
print(json.dumps(summary,ensure_ascii=False,default=str))
