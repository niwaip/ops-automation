"""Conservative post-run audit of API evidence and primary displayed tables.

Presentation matches do not imply native route/evidence acceptance. Unsupported
answer layouts stay inconclusive rather than passing by loose number matching.
"""
import argparse
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path
import re
import statistics
import sys
from interaction_policy import answer_hash, review_interaction


def clean(value):
    return re.sub(r'[*`]', '',value).strip()


def number(value):
    match=re.search(r'(?<![A-Za-z\d])[-+]?\d[\d,]*(?:\.\d+)?',clean(value))
    return match.group(0).replace(',','') if match else None


def metric(label):
    label=clean(label)
    if any(term in label for term in ('条数','记录数','行数','笔数','明细数')): return 'records'
    label=label.replace('工数年月','')
    if '最小' in label and ('工数' in label or '工时' in label): return 'min_hours'
    if '最大' in label and ('工数' in label or '工时' in label): return 'max_hours'
    if '平均' in label and ('工数' in label or '工时' in label): return 'avg_hours'
    if '金额' in label: return 'amount_k'
    if '工数' in label or '工时' in label: return 'hours'
    return None


def tables(text):
    blocks=[]
    current=[]
    for line in text.splitlines()+['']:
        if line.strip().startswith('|'):
            cells=[clean(v) for v in line.strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[:\-\s]*',v) for v in cells): current.append(cells)
        elif current:
            blocks.append(current)
            current=[]
    return blocks


def equal_display(actual,expected):
    if actual is None or expected is None: return actual==expected
    try:
        actual=Decimal(str(actual))
        expected=Decimal(str(expected))
        return actual==expected.quantize(Decimal(1).scaleb(actual.as_tuple().exponent),rounding=ROUND_HALF_UP)
    except Exception:
        return actual==expected


def extract_primary(text,expected):
    wanted=expected['rows']
    if not wanted: return None,'empty-group-layout-needs-review'
    blocks=tables(text)
    keys=set(wanted[0])
    numeric={'records','amount_k','hours','min_hours','max_hours','avg_hours','distinct_wbs'}
    dimension_keys=keys-numeric
    if not dimension_keys:
        for block in blocks:
            if keys=={'avg_hours'}:
                precise=[(i,int(m.group(1))) for i,label in enumerate(block[0])
                         if (m:=re.search(r'保留\s*(\d+)\s*位小数',label))]
                if precise:
                    column=max(precise,key=lambda pair:pair[1])[0]
                    for row in block[1:]:
                        if len(row)>column and metric(row[0])=='avg_hours':
                            return [{'avg_hours':number(row[column])}],'explicit-decimal-average-column'
            found={}
            result_columns=[i for i,label in enumerate(block[0]) if i>0 and re.search(r'数值|结果|统计值|核验值',label)]
            value_column=result_columns[0] if len(result_columns)==1 else 1
            for row in block[1:]:
                m=metric(row[0])
                if keys=={'min_hours','max_hours'} and '工数' in ''.join(block[0]):
                    m='min_hours' if '最小' in row[0] else 'max_hours' if '最大' in row[0] else m
                if keys=={'distinct_wbs'} and 'WBS' in row[0].upper() and any(t in row[0] for t in ('不同','去重','唯一')):
                    m='distinct_wbs'
                if len(row)>value_column and m in keys:
                    found.setdefault(m,number(row[value_column]))
                if keys<=set(found): return [found],'vertical-metric-table'
            header=block[0]
            columns={i:metric(v) for i,v in enumerate(header) if metric(v) in keys}
            if keys<=set(columns.values()):
                for row in reversed(block[1:]):
                    if '合计' in ''.join(row) or len(block)==2:
                        return [{m:number(row[i]) for i,m in columns.items() if i<len(row)}],'horizontal-total-table'
        if keys=={'avg_hours'} and ('平均工数' in text or '平均每条' in text):
            match=re.search(r'保留\s*6\s*位小数\s*[:：]\s*([\d,.]+)',clean(text))
            if match: return [{'avg_hours':match.group(1).replace(',','')}],'explicit-six-decimal-average'
        if keys=={'distinct_wbs'}:
            match=re.search(r'不同\s*WBS\s*编号数量(?:\s*[（(][^（）()\n]{0,30}[）)])?[】]?\s*[:：]\s*(\d+)',clean(text),re.I)
            if match: return [{'distinct_wbs':int(match.group(1))}],'explicit-distinct-count'
        return None,'primary-table-not-found'
    if keys=={'cost_center'}:
        values=list(dict.fromkeys(re.findall(r'\bFC\d{5}\b',text)))
        if not values:
            return None,'distinct-code-list-not-delivered'
        return [{'cost_center':v} for v in values],'distinct-code-list'
    for block in blocks:
        header=block[0]
        columns={}
        for i,label in enumerate(header):
            m=metric(label)
            if m in numeric and m in keys: columns[i]=m
            elif '成本中心' in label:
                columns[i]='cost_center' if 'cost_center' in keys else 'group_key'
            elif '有偿' in label and 'billable' in keys: columns[i]='billable'
            elif 'group_key' in keys and ('前缀' in label or re.search(r'WBS.*前(?:两|二|2)(?:位|个字符)',label,re.I)):
                columns[i]='group_key'
        if not keys<=set(columns.values()): continue
        rows=[]
        for row in block[1:]:
            if any('合计' in v or '总计' in v for v in row[:2]): continue
            if len(row)<=max(columns): continue
            values={m:number(row[i]) if m in numeric else row[i] for i,m in columns.items()}
            # Labels such as 'EX 开头' denote the same prefix, not a new key.
            if 'group_key' in values and re.fullmatch(r'[A-Z]{2}\s*开头',values['group_key']):
                values['group_key']=values['group_key'][:2]
            rows.append(values)
        return rows,'dimension-table'
    # Runtime fallback prints one explicit code-group metric per row. Preserve
    # identity/order and reject duplicates or missing metrics; never just match
    # an unordered bag of numbers from prose or source details.
    if dimension_keys=={'group_key'}:
        for block in blocks:
            if len(block[0])!=2 or '统计指标' not in block[0][0] or '分组' not in block[0][0]:
                continue
            grouped={}
            duplicate=False
            for row in block[1:]:
                if len(row)!=2: continue
                matched=re.fullmatch(r'(FC\d{5}|[A-Z]{2})\s+(.+)',row[0])
                if not matched: continue
                group,label=matched.groups()
                name=metric(label)
                if name not in keys: continue
                values=grouped.setdefault(group,{'group_key':group})
                if name in values: duplicate=True
                values[name]=number(row[1])
            if duplicate: return None,'duplicate-vertical-group-metric'
            if grouped and all(set(values)==keys for values in grouped.values()):
                return list(grouped.values()),'canonical-vertical-group-metrics'
    return None,'dimension-table-not-found'


def compare(rows,expected,ordered):
    if len(rows)!=len(expected): return False
    numeric={'records','amount_k','hours','min_hours','max_hours','avg_hours','distinct_wbs'}
    if not ordered:
        dimensions=sorted(set(expected[0])-numeric)
        key=lambda r:tuple(str(r.get(k)) for k in dimensions)
        rows=sorted(rows,key=key)
        expected=sorted(expected,key=key)
    return all(set(a)==set(b) and all(
        equal_display(a[k],b[k]) if k in numeric else type(a[k]) is type(b[k]) and a[k]==b[k]
        for k in b) for a,b in zip(rows,expected))


def explicitly_incomplete(answer):
    return bool(re.search(
        r'未及|未能完成|未在.{0,10}完成|尚未通过执行证据核验|本轮执行尚未完成|'
        r'因.{0,20}轮次.{0,20}上限|指标核算未完成声明|未输出最终有效正文', answer))


def stream_contract_complete(events):
    return (any(e.get('type')=='result' for e in events)
            and not any(e.get('type') in ('error','parse_error') for e in events))


def main(evidence,workspace):
    expected=json.loads((evidence/'expected.json').read_text())
    reviews_path=evidence/'interaction-reviews.json'
    reviews=json.loads(reviews_path.read_text()) if reviews_path.exists() else []
    definitions_path=evidence/'definition-expected.json'
    definitions=json.loads(definitions_path.read_text()) if definitions_path.exists() else {}
    api_dirs=sorted(p for p in evidence.glob('api-*') if p.is_dir())
    attempts=[]
    latest={}
    for api in api_dirs:
        if not (api/'runs.json').exists(): continue
        for run in json.loads((api/'runs.json').read_text()):
            attempts.append({'id':run['id'],'api_dir':str(api),'status':run['status']})
            latest[run['id']]=(api,run)
    results=[]
    for cid,(api,run) in sorted(latest.items()):
        cid=run['id']
        path=api/(cid+'.events.json')
        events=json.loads(path.read_text()) if path.exists() else []
        event=next((e for e in reversed(events) if e.get('type')=='result'),{})
        answer=event.get('content','')
        meta=event.get('data',{})
        metrics=meta.get('sandbox',{}).get('metrics',{})
        calls=metrics.get('toolCalls',[])
        session=workspace/'.dsh/sessions'/run['sessionId']
        receipt_path=session.with_name(session.name+'.evidence.json')
        snapshot=api/(cid+'.evidence.json')
        if snapshot.exists(): receipt_path=snapshot
        state=json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
        actual,layout=extract_primary(answer,expected[cid])
        if cid in ('Q18','Q19'):
            displayed='inconclusive'
            reason='原问题的空/非空未区分NULL和空字符串；基线SQL只检查NULL'
        elif actual is None:
            displayed='not_computed' if explicitly_incomplete(answer) else 'inconclusive'
            reason='explicit_incomplete_answer' if displayed=='not_computed' else layout
        else:
            displayed='pass' if compare(actual,expected[cid]['rows'],expected[cid]['ordered'] and cid!='Q28') else 'fail'
            reason=layout
        native_calls=[c for c in calls if c.get('name') in ('aggregate_spreadsheet','analyze_spreadsheet','bounded_summary_recovery')]
        transport_ok=bool(run.get('done') and run.get('historyHttpStatus')==200)
        stream_ok=stream_contract_complete(events)
        stream_errors=[{'code':e.get('data',{}).get('code'),'message':e.get('content',e.get('data'))}
                       for e in events if e.get('type') in ('error','parse_error')]
        executed=meta.get('sandbox',{}).get('executed') is True
        if not transport_ok:
            displayed='inconclusive'
            reason='transport_or_history_evidence_failure'
        elif not stream_ok:
            displayed='not_delivered'
            reason='explicit_stream_execution_error' if stream_errors else 'missing_result_envelope'
        row={'id':cid,'api_dir':str(api),'session_id':run['sessionId'],'trace_ids':run.get('traceIds',[]),
             'transport':'pass' if transport_ok else 'fail',
             'stream_contract':'pass' if stream_ok else 'fail','stream_errors':stream_errors,
             'primary_display':displayed,'display_reason':reason,'displayed_rows':actual,
             'native_query_route':'pass' if native_calls else 'unknown' if not stream_ok else 'fail' if executed else 'not_run',
             'runtime_verified':state.get('verified'),
             'source_envelope_matches':state.get('source_hashes',{}).get('工数实绩明细_20261020134124.xlsx')==run['fixtureSha256'],
             'calls':[{k:c.get(k) for k in ('name','status','error_code','workbook_id')} for c in calls],
             'guard_decisions':metrics.get('guardDecisions',[]),
             'seconds':run['seconds'],'ttft_ms':metrics.get('ttftMs'),'llm_ms':metrics.get('llmDurationMs'),
             'llm_invocations':metrics.get('llmInvocations'),'usage':meta.get('usage'),
             'state_file':str(receipt_path),'state_sha256':hashlib.sha256(receipt_path.read_bytes()).hexdigest() if receipt_path.exists() else None,
             'end_to_end':'blocked' if not transport_ok else 'fail' if not stream_ok or displayed in ('fail','not_computed','not_delivered') or not native_calls or state.get('verified') is not True else 'inconclusive'}
        # Presentation scope is only the requested primary table. Extra narrative
        # and derived figures require separate review, never silently approved.
        row['extra_claims_reviewed']=False
        row['answer_sha256']=answer_hash(answer)
        row.update(review_interaction(cid,run['sessionId'],answer,reviews,
                                      stream_ok=transport_ok and stream_ok,displayed=displayed))
        if (row['interaction_outcome']=='grounded_complete_answer' and displayed=='pass'
                and transport_ok and stream_ok and native_calls and state.get('verified') is True
                and row['source_envelope_matches']):
            row.update(end_to_end='pass',task_status='complete')
        if row['interaction_outcome']=='answer_with_stated_assumption':
            definition=definitions.get(row['accepted_definition'])
            if definition:
                definition_rows,definition_layout=extract_primary(answer,definition)
                matches=(definition_rows is not None and compare(definition_rows,definition['rows'],False))
                row.update(definition_display='pass' if matches else 'inconclusive' if definition_rows is None else 'fail',
                           definition_displayed_rows=definition_rows,definition_layout=definition_layout)
                if (matches and transport_ok and stream_ok and native_calls
                        and state.get('verified') is True and row['source_envelope_matches']
                        and definition.get('source_sha256')==run['fixtureSha256']):
                    row.update(end_to_end='pass',task_status='complete_under_reviewed_definition')
        results.append(row)
    durations=sorted(r['seconds'] for r in results)
    report={'api_dirs':[str(p) for p in api_dirs],'attempts':attempts,'evaluated':len(results),'expected_cases':len(expected),
            'transport':dict(Counter(r['transport'] for r in results)),
            'stream_contract':dict(Counter(r['stream_contract'] for r in results)),
            'primary_display':dict(Counter(r['primary_display'] for r in results)),
            'reviewed_definition_display':dict(Counter(r['definition_display'] for r in results if 'definition_display' in r)),
            'native_query_route':dict(Counter(r['native_query_route'] for r in results)),
            'end_to_end':dict(Counter(r['end_to_end'] for r in results)),
            'runtime_verified_true':sum(r['runtime_verified'] is True for r in results),
            'duration_seconds':{'p50':statistics.median(durations),'p95_nearest_rank':durations[max(0,(95*len(durations)+99)//100-1)],'total_serial':sum(durations)},
            'total_model_invocations':sum(r['llm_invocations'] or 0 for r in results),
            'total_reported_tokens':sum((r['usage'] or {}).get('total_tokens',0) for r in results),
            'cases':results}
    (evidence/'api-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('cases','attempts')},ensure_ascii=False))
    if any(r['end_to_end'] in ('fail','blocked') for r in results):
        return 1
    return 2 if len(results)!=len(expected) or any(r['end_to_end']=='inconclusive' for r in results) else 0


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('evidence',type=Path)
    p.add_argument('workspace',type=Path)
    a=p.parse_args()
    sys.exit(main(a.evidence,a.workspace))
