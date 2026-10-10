"""Independent final acceptance and deterministic presentation of computed facts."""

import hashlib
import json
import re
from pathlib import Path
from decimal import Decimal, localcontext
from .analysis_contract import build_analysis_contract, supports_column_comparison
from .spreadsheet_trends import render_ratio_trends
from .spreadsheet_fact_identity import fact_identity
from .analysis_task_state import analysis_task_state
from .report_presentation import analysis_overview, with_sources


def requires_spreadsheet_analysis(prompt, skill_res):
    contract = build_analysis_contract(prompt)
    if contract.is_advisory_intent and not contract.is_explicit_calc:
        return False
    return (getattr(skill_res,"skill_id",None)=="xlsx"
            and not getattr(skill_res,"is_generate_intent",False)
            and not getattr(skill_res,"requires_execution",False)
            and not getattr(skill_res,"is_guide_intent",False)
            and not contract.is_catalog_only
            and not supports_column_comparison(contract))


def parse_response(text):
    value = text.strip()
    if value.startswith("```json") and value.endswith("```"):
        value = value[7:-3].strip()
    try:
        response = json.loads(value)
    except (ValueError, TypeError):
        return None
    if not isinstance(response,dict) or set(response)!={"evidence_ids","hypotheses"}:
        return None
    return response


def canonical_response(evidence, model_text=''):
    """IDs are runtime state. Invalid optional hypotheses cannot block facts."""
    ids=list(dict.fromkeys(e.data.get('evidence_id') for e in evidence
        if e.is_success and isinstance(e.data,dict) and e.data.get('kind')=='spreadsheet_analysis'))
    hypotheses=[]
    try:
        supplied=parse_response(model_text) if model_text else None
        values=supplied.get('hypotheses',[]) if supplied else []
        if isinstance(values,list):
            hypotheses=[v for v in values if isinstance(v,str) and 0<len(v)<=500 and not re.search(r'\d',v)][:8]
    except (TypeError,AttributeError):
        pass
    return json.dumps({'evidence_ids':ids,'hypotheses':hypotheses},ensure_ascii=False)


def verified_response(evidence,prompt="",model_text=''):
    """The presentation compiler can render verified facts without trusting a
    model's final format. It never imports facts from the model's free text."""
    return canonical_response(evidence,model_text) if analysis_task_state(evidence,prompt)['complete'] else None


def evidence_error(text, evidence, prompt=""):
    response = parse_response(text)
    if response is None:
        return "最终答案必须引用本轮证据ID的JSON；程序会呈现全部核验结果，不能手工重写数字。"
    ids=response["evidence_ids"]; hypotheses=response["hypotheses"]
    if (not isinstance(ids,list) or not ids or any(not isinstance(v,str) for v in ids)
            or len(set(ids))!=len(ids)):
        return "需要非空且唯一的本轮证据ID。"
    if (not isinstance(hypotheses,list) or len(hypotheses)>8
            or any(not isinstance(v,str) or len(v)>500 or re.search(r"\d",v) for v in hypotheses)):
        return "原因假设应为简短文字；数字必须来自程序事实，不能手工换算。"
    successful = {e.data.get("evidence_id"):e for e in evidence if e.is_success and isinstance(e.data,dict)
                  and e.data.get("kind")=="spreadsheet_analysis"}
    if set(ids)!=set(successful):
        return "应引用本轮全部成功的分析证据，不能使用失败、历史或选择性遗漏的结果。"
    for eid in ids:
        e=successful[eid]; p=e.provenance or {}
        try:
            if hashlib.sha256(Path(p["file_path"]).read_bytes()).hexdigest()!=p["workbook_id"]:
                return "原件已变化，本轮证据失效。"
        except (KeyError,OSError):
            return "来源原件或哈希凭据不可用。"
        if not e.data.get("facts") and not e.data.get("checks") and not e.data.get("rules") and not e.data.get('profiles'):
            return "没有成功的计算或检查结果。"
        if any(not c.get("coverage_complete") for c in e.data.get("coverage",[])):
            return "声明范围尚未完整处理。"
    # Existing recognized metric requirements still apply; unknown semantics do
    # not imply success without a model-selected plan and a successful receipt.
    facts=[f for e in successful.values() for f in e.data.get("facts",[])]
    contract=build_analysis_contract(prompt)
    missing=[]
    for metric in contract.metrics:
        matches=[f for f in facts if (metric.semantic_id and f.get('metric_id')==metric.semantic_id)
                 or (not f.get('metric_id') and any(re.search(alias,f["label"]) for alias in metric.aliases))]
        if not matches or (metric.expected_type=="percentage" and not any(f["unit"]=="%" for f in matches)):
            missing.append(metric.name)
    if missing:
        return "分析计划遗漏所需指标或类型："+"、".join(missing)+"。请用原生工具补齐，并遵从本轮领域注册表的指标定义。"
    if re.search(r"变化|趋势|增长|增减|改善|change|trend|growth",prompt,re.I):
        scopes={}
        for e in successful.values():
            for c in e.data.get('coverage',[]):
                scopes.setdefault(c['sheet'],set()).add(tuple(c['selected_rows']))
        if not any(len(windows)>=2 for windows in scopes.values()):
            return "用户要求变化或趋势，当前只有单一范围合计。请补充同一来源不同期间的对照或逐月范围，并计算相关比率/变化，不能将一个期间的合计当作变化解释。"
    return None


def escape(value):
    return str(value).replace("|","\\|").replace("\n"," ")


def format_value(value):
    number=Decimal(str(value))
    with localcontext() as context:
        context.prec=max(32,len(number.as_tuple().digits)+abs(number.as_tuple().exponent)+6)
        rounded=number.quantize(Decimal("0.0001"))
    if number and not rounded:
        return str(number)
    rendered=format(rounded,"f").rstrip("0").rstrip(".") if "." in str(number) else str(number)
    return rendered or "0"


def describe_expression(expr,data):
    if 'aggregate' in expr:
        table=next(c for c in data['coverage'] if c['id']==expr['table'])
        column=expr['column'];header=table['headers'].get(column,column)
        rows=table['selected_rows'];period=f"第{rows[0]}至{rows[-1]}行"
        if table.get("source_months"):period+=f"，月份{table['source_months']}"
        method={'sum':'求和','min':'最小值','max':'最大值','count':'记录计数'}[expr['aggregate']]
        return f"{table['sheet']}：{header}，{period}，{method}"
    if 'cell' in expr:return f"{expr['sheet']}!{expr['cell']}"
    if 'constant' in expr:return str(expr['constant'])
    symbol={'add':'＋','subtract':'－','multiply':'×','divide':'÷'}[expr['op']]
    return '('+symbol.join(describe_expression(arg,data) for arg in expr['args'])+')'


def render_analysis_response(text,evidence,prompt="",model=None,policy=None,deadline=None):
    error=evidence_error(text,evidence,prompt)
    if error:
        failed=next((e for e in reversed(evidence) if e.is_error),None)
        detail=(f"\n\n执行阻碍：{escape(failed.error_code)}：{escape(failed.error_message)}" if failed else "")
        return "本次分析尚未通过执行证据核验。\n\n"+error+detail+"\n\n尚未验证的项目不会被列为完成。"
    response=parse_response(text); by_id={e.data.get("evidence_id"):e for e in evidence if e.is_success and isinstance(e.data,dict)}
    parts=[]; seen_facts=set()
    # Receipt acquisition order is stable; a model's ID ordering cannot choose
    # which duplicate label or scope description is presented first.
    for eid in by_id:
        if eid not in response['evidence_ids']:
            continue
        e=by_id[eid];d=e.data
        parts.append(f"来源：{escape(Path(e.provenance['file_path']).name)}；证据 `{eid}`。")
        semantic=d.get('semantic_domain',{'id':'generic','version':'1'})
        parts.append(f"语义领域：{escape(semantic['id'])}，定义版本{escape(semantic['version'])}；实际来源绑定和业务假设见下文。")
        if e.provenance.get('execution_origin')=='registered_derivation':
            parts.append('本项由程序按注册关系补算：重新执行已绑定的同源同范围表达式；未采用模型口算或历史数值。')
        parts.append(f"原件金额单位：{escape(d['amount_unit'])}；换算单位见各指标。数值最多显示四位小数；核验使用未舍入值。")
        for c in d["coverage"]:
            filtered=f"，过滤条件：{escape(json.dumps(c['filters'],ensure_ascii=False))}" if c["filters"] else ""
            parts.append(f"范围：{escape(c['sheet'])}!{c['data_range']}；业务行{c['input_records']}条，实际处理{c['evaluated_records']}条{filtered}。覆盖声明范围，不含表头。")
        unique_facts=[]
        for fact in d['facts']:
            key=fact_identity(fact,d,e.provenance)
            if key not in seen_facts:
                seen_facts.add(key); unique_facts.append(fact)
        if unique_facts:
            parts.extend(["", "| 计划指标 | 数值 | 单位 | 核算口径 |","|---|---:|---|---|"])
            for f in unique_facts:
                definition=next(v['expression'] for v in d['plan']['calculations'] if v['id']==f['id'])
                parts.append(f"| {escape(f['label'])} | {format_value(f['value'])} | {escape(f['unit'])} | {escape(describe_expression(definition,d))} |")
        if d["checks"]:
            parts.extend(["", "| 声明检查 | 左值 | 右值 | 残差（左－右） | 单位 | 表达式结果 |","|---|---:|---:|---:|---|---|"])
            for c in d["checks"]:
                parts.append(f"| {escape(c['label'])} | {format_value(c['left'])} | {format_value(c['right'])} | {format_value(c['residual'])} | {escape(c['unit'])} | {'通过' if c['passed'] else '不一致'} |")
            parts.append("\n实际比较表达式：")
            for item in d["plan"]["checks"]:
                parts.append(f"- {escape(item['label'])}：{escape(describe_expression(item['left'],d))} ＝ {escape(describe_expression(item['right'],d))}")
            parts.append("\n检查口径与假设（业务适用性尚需验证）：")
            parts.extend(f"- {escape(c['label'])}：{escape(c['assumptions'])}；容差{c['tolerance']}。" for c in d["checks"])
            parts.append("\n等式不一致只证明存在差额，原因和应调整哪一项尚需核查。")
        if d["rules"]:
            parts.append("\n以下规则由分析计划声明，业务适用性尚未独立验证；符合规则不等于业务合规。")
            parts.extend(["", "| 字段检查 | 已检记录 | 不符合规则数 | 结果 |","|---|---:|---:|---|"])
            for r in d["rules"]:
                parts.append(f"| {escape(r['label'])} | {r['evaluated_records']} | {r['violation_count']} | {'符合声明规则' if r['passed'] else '需核查'} |")
                parts.append(f"\n计划说明（待验证）：{escape(r['assumptions'])}；实际条件：{escape(json.dumps({'kind':r['kind'],**r['criteria']},ensure_ascii=False))}。\n")
                for x in r["examples"]:
                    parts.append(f"- {escape(x['cell'])}：{escape(x['value'])}")
                if not r["examples_complete"]:
                    parts.append("- 仅列前20个例子；异常数量依据整个声明范围计算。")
        if d['profiles']:
            parts.append("\n字段概况（来自声明范围全部记录）：")
            requested_fields=set()
            for rule in d['rules']:
                table=next(c for c in d['coverage'] if c['id']==rule['table'])
                column=rule['column']
                bound=next((key for key,value in table['headers'].items() if value==column),column.upper())
                requested_fields.add((rule['table'],bound))
            for p in d["profiles"]:
                if requested_fields and (p['table'],p['column']) not in requested_fields:
                    continue
                line=f"- {escape(p['table'])}.{p['column']}（{escape(p['header'])}）：缺失{p['missing']}条"
                if 0<p["missing"]<=3:line+=f"；缺失位置{escape(json.dumps(p['missing_examples'],ensure_ascii=False))}"
                if "numeric" in p:
                    n=p["numeric"];line+=f"；最小值{n['min']}（原第{n['min_row']}行），最大值{n['max']}（原第{n['max_row']}行）"
                if "date" in p:line+=f"；日期范围{p['date']['min']}（原第{p['date']['min_row']}行）至{p['date']['max']}（原第{p['date']['max_row']}行）"
                if "value_counts" in p:line+=f"；各值计数{escape(json.dumps(p['value_counts'],ensure_ascii=False))}"
                if "value_examples" in p:
                    rare={k:v for k,v in p["value_examples"].items() if p["value_counts"][k]<=3}
                    if rare:line+=f"；低频值原件位置{escape(json.dumps(rare,ensure_ascii=False))}"
                parts.append(line+"。")
    audit = "\n".join(parts)
    parts = []
    if re.search(r"变化|趋势|增长|增减|改善|change|trend|growth",prompt,re.I):
        trends=render_ratio_trends(evidence,format_value)
        if trends:
            parts.append("\n核验数据中的期间变化（只描述数值，不推断经营原因）：")
            parts.extend(trends)
    last_success=max((i for i,e in enumerate(evidence) if e.is_success),default=-1)
    pending=[e for e in evidence[last_success+1:] if e.is_error]
    if pending:
        parts.append("\n后续计划未执行成功，以下项目未列为完成：")
        for failed in pending:
            plan=(failed.data or {}).get("requested_plan",{}) if isinstance(failed.data,dict) else {}
            labels=[item.get("label",item.get("id","未命名项")) for key in ("calculations","checks","rules") for item in plan.get(key,[])]
            parts.append(f"- {escape(failed.error_code)}：{escape(failed.error_message)}；未完成计划项：{escape('、'.join(labels[:10]))}。")
    if response["hypotheses"]:
        parts.append("\n待验证的解释或核查线索（尚无独立来源证明）：")
        parts.extend("- "+escape(h) for h in response["hypotheses"])
    receipts = [by_id[eid] for eid in by_id if eid in response['evidence_ids']]
    main = analysis_overview(receipts, prompt)
    if parts:
        main += "\n\n" + "\n".join(parts)
    deterministic_res = with_sources(main, audit, receipts)
    from .analysis_synthesis import synthesize_analysis_summary
    return synthesize_analysis_summary(
        prompt=prompt,
        receipts=receipts,
        audit=audit,
        fallback_text=deterministic_res,
        model=model,
        policy=policy,
        deadline=deadline
    )
