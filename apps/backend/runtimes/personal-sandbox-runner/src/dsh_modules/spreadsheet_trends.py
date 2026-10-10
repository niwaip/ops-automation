"""Describe verified period ratios; do not infer business causes."""

from decimal import Decimal


def render_ratio_trends(evidence, formatter):
    groups={}
    for receipt in evidence:
        if not receipt.is_success or not isinstance(receipt.data,dict):continue
        data=receipt.data
        if data.get('kind')!='spreadsheet_analysis':continue
        tables={c['id']:c for c in data['coverage']}
        definitions={c['id']:c['expression'] for c in data['plan'].get('calculations',[])}
        for fact in data['facts']:
            expr=definitions[fact['id']]
            if fact['unit']!='%' or expr.get('op')!='divide':continue
            args=expr.get('args',[])
            if len(args)!=2 or any(a.get('aggregate')!='sum' for a in args):continue
            pair=[tables[a['table']] for a in args]
            months=pair[0].get('source_months')
            if not months or pair[0]['sheet']!=pair[1]['sheet'] or pair[0]['selected_rows']!=pair[1]['selected_rows']:continue
            headers=[]
            for arg,table in zip(args,pair):
                column=arg['column']
                headers.append(table['headers'].get(column.upper(),column))
            key=(receipt.provenance['workbook_id'],pair[0]['sheet'],*headers)
            groups.setdefault(key,{})[tuple(months)]=Decimal(fact['value'])
    lines=[]
    for (_,sheet,numerator,denominator),values in groups.items():
        windows=sorted(values,key=lambda v:(v[0],v[-1]))
        for before in windows:
            after=next((w for w in windows if min(w)>max(before)),None)
            if after is None:continue
            a,b=values[before],values[after];delta=b-a
            direction='提高' if delta>0 else '下降' if delta<0 else '不变'
            # Month labels come from coverage, not from the model's caption.
            period=lambda m:','.join(str(v) for v in m)+'月'
            safe=lambda s:str(s).replace('|','\\|').replace('\n',' ')
            lines.append(f"- {safe(sheet)}：{period(before)} → {period(after)}，"
                         f"{safe(numerator)}÷{safe(denominator)}从{formatter(a)}%变为{formatter(b)}%，"
                         f"{direction}{formatter(abs(delta))}个百分点。")
            if len(lines)>=12:return lines
    return lines
