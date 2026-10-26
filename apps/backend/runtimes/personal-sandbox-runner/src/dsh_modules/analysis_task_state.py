"""Execution and task coverage validation, independent of model presentation JSON."""

import hashlib
import json
import re
from pathlib import Path
from .analysis_contract import build_analysis_contract
from .report_presentation import resolve_conforming_facts
from .analysis_fact_selection import authoritative_receipts
from .analysis_request_text import user_instruction
from .analysis_delivery_constraints import query_delivery_issues, is_empty_query


def extract_positive_filter_values(node):
    """Recursively extract target values from positive equality/inclusion filter predicates."""
    vals = []
    if not isinstance(node, dict):
        return vals
    if "and" in node and isinstance(node["and"], list):
        for child in node["and"]:
            vals.extend(extract_positive_filter_values(child))
        return vals

    op = str(node.get("op", "")).strip().lower()
    # Exclude negation operators
    if op in ("ne", "!=", "<>", "not_in", "not in", "is_null", "is_blank"):
        return vals

    val = node.get("value")
    if val is not None and not isinstance(val, (dict, list)):
        vals.append(str(val))
    if isinstance(node.get("values"), list):
        for v in node["values"]:
            if v is not None and not isinstance(v, (dict, list)):
                vals.append(str(v))
    if isinstance(node.get("prefixes"), list):
        for p in node["prefixes"]:
            if p is not None and not isinstance(p, (dict, list)):
                vals.append(str(p))
    return vals


def filter_matches_entities(receipt, entities):
    if not entities:
        return False
    data = getattr(receipt, "data", {}) if hasattr(receipt, "data") else (receipt.get("data", {}) if isinstance(receipt, dict) else {})
    if not isinstance(data, dict):
        return False

    filters_to_check = []
    for c in data.get("coverage", []):
        filters_to_check.extend(c.get("filters", []))
    plan = data.get("plan") or {}
    if plan.get("where"):
        filters_to_check.append(plan.get("where"))
    if plan.get("filters"):
        filters_to_check.extend(plan.get("filters"))

    extracted = []
    for flt in filters_to_check:
        extracted.extend(extract_positive_filter_values(flt))

    for v in extracted:
        v_str = v.strip().casefold()
        if any(v_str == e.strip().casefold() or e.strip().casefold() in v_str or v_str in e.strip().casefold() for e in entities):
            return True
    return False


def fact_matches_metric(f, metric):
    if metric.semantic_id and f.get('metric_id') == metric.semantic_id:
        return True
    lbl = str(f.get('label', ''))
    if any(re.search(alias, lbl) for alias in metric.aliases):
        return True
    field = str(f.get('field', ''))
    if field and (field == metric.name or any(re.search(alias, field) for alias in metric.aliases)):
        return True
    metric_lbl = str(f.get('metric_label', ''))
    if metric_lbl and (metric_lbl == metric.name or any(re.search(alias, metric_lbl) for alias in metric.aliases)):
        return True
    stem = re.sub(r'[\(（][^\)）]+[\)）]', '', metric.name).strip()
    field_stem = re.sub(r'[\(（][^\)）]+[\)）]', '', field).strip() if field else ''
    if stem:
        synonyms = {'工数', '工时', '时长', '时间', '小时'} if stem in ('工数', '工时', '时长', '时间', '小时') else {stem}
        if any(s in lbl or s in field or s in metric_lbl for s in synonyms):
            return True
        if field_stem and any(s == field_stem or s in field_stem or field_stem in s for s in synonyms):
            return True
    return False


def analysis_task_state(evidence, prompt='', model=None, deadline=None):
    prompt = user_instruction(prompt)
    contract=build_analysis_contract(prompt)
    successful=[e for e in evidence if e.is_success and isinstance(e.data,dict)
                and e.data.get('kind')=='spreadsheet_analysis']
    successful = authoritative_receipts(successful, prompt)
    issues=[]; hashes={}
    if not successful:
        issues.append({'code':'execution_evidence_missing','message':'缺少本轮成功的分析执行证据。'})
    for receipt in successful:
        provenance=receipt.provenance or {}; path=provenance.get('file_path')
        try:
            if path not in hashes:hashes[path]=hashlib.sha256(Path(path).read_bytes()).hexdigest()
            if hashes[path]!=provenance.get('workbook_id'):
                issues.append({'code':'source_changed','message':'原件已变化，本轮证据失效。'})
        except (OSError,TypeError):
            issues.append({'code':'source_unavailable','message':'来源原件或哈希凭据不可用。'})
        data=receipt.data
        if not data.get('evidence_id'):
            issues.append({'code':'evidence_id_missing','message':'执行回执缺少证据ID。'})
        if not any(data.get(key) for key in ('facts','checks','rules','profiles')) and not is_empty_query(data):
            issues.append({'code':'execution_result_empty','message':'没有成功的计算或检查结果。'})
        if any(not c.get('coverage_complete') for c in data.get('coverage',[])):
            issues.append({'code':'scope_incomplete','message':'声明范围尚未完整处理。'})
    # 提取符合当前契约约束的权威事实闭包（自动淘汰未过滤全表试算，后序纠偏覆盖前序，隔离探索口径）
    scope_decisions = []
    facts = resolve_conforming_facts(successful, prompt, scope_decisions=scope_decisions,
                                    model=model, deadline=deadline)
    if successful and not facts and any(r.data.get('facts') for r in successful):
        from .analysis_fact_selection import _is_unsplit_multi_row_conflation
        has_conflation = any(
            _is_unsplit_multi_row_conflation(f, r.data.get('coverage', []), contract)
            for r in successful for f in r.data.get('facts', [])
        )
        if scope_decisions:
            unresolved = any(d['matched'] is None for d in scope_decisions)
            issues.append({
                'code': 'source_scope_unverified' if unresolved else 'source_scope_mismatch',
                'message': ('本轮尚未核实实际取数列或范围是否符合请求的期间与口径，请核对来源后继续。'
                            if unresolved else '实际取数列或范围与请求的期间或口径不一致，请修正取数计划。')})
        elif has_conflation:
            issues.append({
                'code': 'conflated_multi_row_metrics',
                'message': '执行计划在筛选多个不同科目/项目行时未设置 group_by 分组，导致不同指标行被直接混加为同一个数值！请在查询计划中指定 group_by 按科目列分组，或分别按单行条件/单元格提取各指标。'
            })
        else:
            issues.append({
                'code': 'unsolicited_filter_applied',
                'message': '执行计划包含了未经请求的明细行过滤条件，导致核算事实无法对齐当前指令。请移除多余过滤条件后重新聚合计算。'
            })
    # 收集来源表格已知表头字段，用于精确区分「计划未计算」还是「源表确实缺少列」
    known_headers = set()
    fallback_sheets = set()
    for e in evidence:
        if not getattr(e, 'is_success', False) or not isinstance(getattr(e, 'data', None), dict):
            continue
        d = e.data
        if d.get('kind') == 'spreadsheet_structure':
            for s in d.get('sheets', []):
                if s.get('sheet'):
                    fallback_sheets.add(s['sheet'])
                for h in s.get('header_candidates', []):
                    for v in h.get('columns', {}).values():
                        if isinstance(v, str) and v.strip():
                            known_headers.add(v.strip())
        elif d.get('kind') == 'spreadsheet_analysis':
            for c in d.get('coverage', []):
                if c.get('sheet'):
                    fallback_sheets.add(c['sheet'])
                for v in c.get('headers', {}).values():
                    if isinstance(v, str) and v.strip():
                        known_headers.add(v.strip())
    if not known_headers:
        try:
            import os
            from . import config as _cfg
            from .spreadsheet_preflight import profile_spreadsheet_for_planning
            raw_att = os.environ.get('DSH_SESSION_ATTACHMENTS', '').strip()
            att_files = json.loads(raw_att) if raw_att.startswith('[') else [x.strip() for x in raw_att.split(',') if x.strip()]
            for fn in att_files:
                if str(fn).lower().endswith(('.xlsx', '.xlsm', '.xls', '.csv')):
                    prof = profile_spreadsheet_for_planning(Path(_cfg.WORKSPACE_DIR) / Path(fn).name, prompt=prompt)
                    if prof:
                        for s in prof.get('sheets', []):
                            if s.get('sheet'):
                                fallback_sheets.add(s['sheet'])
                            for h_name in (s.get('headers') or {}).values():
                                if isinstance(h_name, str) and h_name.strip():
                                    known_headers.add(h_name.strip())
        except Exception:
            pass

    # 跨指标同源混加守卫：严禁两个不同业务指标同时绑定到完全相同的多单元格未分组求和结果
    conflated_sigs = set()
    if len(contract.metrics) >= 2 and facts:
        metric_to_sigs = {}
        for metric in contract.metrics:
            m_facts = [
                f for f in facts
                if (metric.semantic_id and f.get('metric_id') == metric.semantic_id)
                or (not f.get('metric_id') and any(re.search(alias, f['label']) for alias in metric.aliases))
            ]
            sigs = {
                (tuple(sorted(f.get('source_cells') or [])), str(f.get('value')), str(f.get('unit')))
                for f in m_facts
                if f.get('group_key') is None and len(f.get('source_cells') or []) >= 2
            }
            if sigs:
                metric_to_sigs[metric.name] = sigs
        m_names = list(metric_to_sigs.keys())
        for i in range(len(m_names)):
            for j in range(i + 1, len(m_names)):
                shared = metric_to_sigs[m_names[i]] & metric_to_sigs[m_names[j]]
                if shared:
                    conflated_sigs.update(shared)
    if conflated_sigs:
        facts = [
            f for f in facts
            if (tuple(sorted(f.get('source_cells') or [])), str(f.get('value')), str(f.get('unit'))) not in conflated_sigs
        ]
        issues.append({
            'code': 'conflated_multi_row_metrics',
            'message': '不同指标绑定了完全相同的来源单元格集合与汇总数值（存在多行科目未分组混加），请按科目列设置 group_by 分组或分别引用各指标对应的真实单元格。'
        })

    missing = []
    unit_mismatched = []
    for metric in contract.metrics:
        if any(is_empty_query(r.data) and any(
                any(re.search(alias, str(m.get('label', m.get('id', '')))) for alias in metric.aliases)
                for m in r.data.get('plan', {}).get('metrics', [])) for r in successful):
            continue
        matches = [f for f in facts if fact_matches_metric(f, metric)]
        typed=[f for f in matches if (f['unit'] in ('%', 'ratio', 'rate', 'percentage', 'percent') if metric.expected_type=='percentage' else
                                     f['unit']!='%' if metric.expected_type=='number' else True)]
        if not typed:
            ratio_facts = [f for f in matches if f.get('unit') in ('ratio', 'rate') and metric.expected_type == 'percentage']
            if ratio_facts:
                unit_mismatched.append({
                    'metric_id': metric.semantic_id,
                    'name': metric.name,
                    'expected_type': metric.expected_type,
                    'current_unit': ratio_facts[0].get('unit'),
                    'current_value': ratio_facts[0].get('value'),
                })
                continue
            is_count_metric = any(k in metric.name for k in ("条数", "明细条数", "记录数", "行数", "笔数", "计数"))
            matched_source_cols = [
                h for h in known_headers
                if any(re.search(alias, h) for alias in metric.aliases) or metric.name in h
            ]
            source_col_exists = bool(matched_source_cols) or is_count_metric
            metric_entry = {
                'metric_id': metric.semantic_id,
                'name': metric.name,
                'expected_type': metric.expected_type
            }
            if any(fact_matches_metric(f, metric)
                   for receipt in successful for f in receipt.data.get('facts', [])):
                metric_entry['execution_evidence_exists'] = True
            if source_col_exists:
                metric_entry['source_column_exists'] = True
                metric_entry['matched_source_columns'] = matched_source_cols or ["表格数据行计数"]
            elif known_headers and not metric.semantic_id:
                metric_entry['source_column_exists'] = False
            else:
                metric_entry['source_column_status'] = 'unknown'
            missing.append(metric_entry)

    if unit_mismatched:
        names_str = '、'.join(m['name'] for m in unit_mismatched)
        issues.append({
            'code': 'metric_unit_mismatch',
            'metrics': unit_mismatched,
            'message': f'指标【{names_str}】已完成核算，但当前单位为比率(ratio)；请在计算计划中指定 output_unit="%" 换算为百分比后交付。'
        })
    if missing:
        unresolved_sources = [decision for decision in scope_decisions if decision['matched'] is not True
                              and any(metric.name in {m['name'] for m in missing} and (
                                  metric.semantic_id in decision.get('metric_ids', [])
                                  or any(re.search(alias, label) for alias in metric.aliases
                                         for label in decision.get('fact_labels', [])))
                                      for metric in contract.metrics)]
        if unresolved_sources and not any(issue['code'] in ('source_scope_unverified', 'source_scope_mismatch')
                                          for issue in issues):
            unresolved = any(decision['matched'] is None for decision in unresolved_sources)
            issues.append({'code': 'source_scope_unverified' if unresolved else 'source_scope_mismatch',
                           'message': ('部分已执行指标的来源期间或口径尚未核实。' if unresolved
                                       else '部分已执行指标的实际来源期间或口径与请求不一致。')})
        uncalc = [m['name'] for m in missing if m.get('source_column_exists')
                  and not m.get('execution_evidence_exists')]
        unverified = [m['name'] for m in missing if m.get('execution_evidence_exists')]
        gen_miss = [m['name'] for m in missing if m.get('source_column_exists') is False]
        unknown = [m['name'] for m in missing if m.get('source_column_status') == 'unknown']
        msg_parts = []
        if unverified:
            msg_parts.append('指标已有执行结果，但尚未通过来源或口径核验：' + '、'.join(unverified))
        if uncalc:
            msg_parts.append('分析计划遗漏所需指标计算：' + '、'.join(uncalc) + '，请调用 aggregate_spreadsheet 补充聚合表达式（如 sum）')
        if gen_miss:
            msg_parts.append('源数据中未定位到指标 ' + '、'.join(gen_miss) + ' 对应列')
        if unknown:
            msg_parts.append('尚未核实指标 ' + '、'.join(unknown) + ' 的来源字段；需先读取真实工作表和表头，不能认定原件缺列')
        issues.append({'code':'required_metrics_missing','metrics':missing,
                       'message':'；'.join(msg_parts) + '。'})

    # 实体过滤守卫 (Entity Filter Guard)：
    # 当用户明确指定了具体业务实体（如特定员工工号、人名、项目编号等），严禁用未过滤的全表汇总数据替代单实体指标！
    if contract.entity_predicates and not contract.is_grouped:
        entities = contract.entity_predicates
        has_matching_entity_filter = any(filter_matches_entities(receipt, entities) for receipt in successful)

        if not has_matching_entity_filter:
            entity_str = '、'.join(sorted(set(entities)))
            issues.append({
                'code': 'entity_filter_missing',
                'entities': entities,
                'message': f'用户明确要求查询特定实体【{entity_str}】的数据，当前分析计划未配置针对【{entity_str}】的过滤条件（filters），严禁用未过滤的全表汇总数据替代单人/单实体指标！请在 aggregate 或 query 的 filters 中指定针对实体列（如员工编号、员工姓名等）的过滤条件并补充计算。'
            })

    if contract.is_grouped:
        # 辅助判定函数：收集请求指标名，防止误将指标名或过滤口径当作分组名
        metric_names = {m.name for m in contract.metrics}
        for m in contract.metrics:
            metric_names.update(getattr(m, 'aliases', []))

        def _is_total_fact(f):
            if f.get('group_key'):
                return False
            lbl = f.get('label', '').strip()
            clean_lbl = re.sub(r'[\(（][^\)）]+[\)）]$', '', lbl).strip()
            # 若 label 直接为请求指标名称或别名，属于全表/条件总计，非分组
            if clean_lbl in metric_names or lbl in metric_names:
                return True
            return bool(
                re.search(r'(?:总计|合计|总额|总和|全表|总数|记录总数|总记录数|汇总)', clean_lbl)
                or re.match(r'^(?:总|合计|总计|全表|all|total|整表)', clean_lbl, re.I)
                or clean_lbl in ("记录数", "总数", "行数", "明细条数", "条数")
            )

        def _extract_group_key(f):
            if f.get('group_key'):
                return str(f['group_key']).strip()
            if _is_total_fact(f):
                return None
            lbl = f.get('label', '').strip()
            clean_lbl = re.sub(r'[\(（][^\)）]+[\)）]$', '', lbl).strip()
            if clean_lbl in metric_names or lbl in metric_names:
                return None
            # 检查 fact id 是否具有原生结构化分组标识 (如 calc_id__group_key)
            fid = str(f.get('id', ''))
            if '__' in fid:
                raw_part = fid.split('__', 1)[1].strip()
                if raw_part and raw_part not in metric_names:
                    return raw_part
            grp = re.sub(r'(?:金额|条数|明细条数|工数|工时|数量|费用|成本|比率|占比|总额|求和|汇总|各组|\([^)]+\)|（[^）]+）)$', '', clean_lbl).strip()
            if not grp:
                return None
            # 零硬编码通用判别：
            # 1. 若剥离出的词本身是请求指标名或别名的一部分（如 "有偿金额" 剥离出 "有偿"，"自研成本" 剥离出 "自研"），
            #    说明它只是指标度量的口径修饰词，绝非按主维度（如部门、客户）划分的实体分组！
            if any(grp in m_name for m_name in metric_names):
                return None
            # 2. 若用户指定了分组维度 (如 "部门")，而 grp 与该维度无关且出现在过滤条件短语中，不作为分组
            if contract.group_dimension and grp in prompt and not re.search(rf'按[^\s，。]*{re.escape(grp)}', prompt):
                if grp in known_headers and grp != contract.group_dimension:
                    return None
            return grp or None

        def _fact_matches(f, metric):
            if isinstance(f, dict) and ('field' in f or 'op' in f):
                lbl = str(f.get('label', ''))
                field = str(f.get('field', ''))
                stem = re.sub(r'[\(（][^\)）]+[\)）]', '', getattr(metric, 'name', '')).strip()
                if stem and (stem in lbl or stem in field):
                    return True
                aliases = getattr(metric, 'aliases', [])
                if any(re.search(alias, lbl) for alias in aliases) or any(re.search(alias, field) for alias in aliases):
                    return True
            return fact_matches_metric(f, metric)

        group_keys = set()
        for f in facts:
            if not _is_total_fact(f):
                gk = _extract_group_key(f)
                if gk:
                    group_keys.add(gk)

        # 收集回执全量事实中的有效分组键，作为全局基准（防止权威事实仅过滤出总计项时丢失分组上下文）
        all_receipt_group_keys = set()
        for receipt in successful:
            for f in receipt.data.get('facts', []):
                if not _is_total_fact(f):
                    gk = _extract_group_key(f)
                    if gk:
                        all_receipt_group_keys.add(gk)

        effective_group_keys = group_keys or all_receipt_group_keys
        requested_metrics = [m for m in contract.metrics if not re.match(r'^(?:总|合计|全表|全部|总体)', m.name)]

        # 检查每个明确请求的核心指标是否均通过引擎原生 group_by 完整执行
        def _metric_has_native_grouping(metric):
            if any(r.data.get('query_ir_version') and r.data.get('plan', {}).get('group_by')
                   and all(c.get('coverage_complete') for c in r.data.get('coverage', []))
                   and any(_fact_matches(m, metric) for m in r.data.get('plan', {}).get('metrics', []))
                   for r in successful):
                return True
            return any(
                (c.get('label') == metric.name or metric.name in c.get('label', '') or _fact_matches(c, metric))
                and c.get('expression', {}).get('group_by')
                and any(cov.get('coverage_complete') and cov.get('id') == c['expression'].get('table')
                        for cov in receipt.data.get('coverage', []))
                and (any(str(f.get('id', '')).startswith(c['id'] + '__')
                         and f.get('group_key') is not None for f in receipt.data.get('facts', []))
                     or all(cov.get('evaluated_records') == 0 for cov in receipt.data.get('coverage', [])))
                for receipt in successful
                for c in (receipt.data.get('plan') or {}).get('calculations', [])
            )

        executed_native_group_by = any(
            bool((r.data.get('plan') or {}).get('group_by'))
            and all(c.get('coverage_complete') for c in r.data.get('coverage', []))
            for r in successful
        )

        executed_all_requested_groupings = (
            (bool(requested_metrics) and all(_metric_has_native_grouping(m) for m in requested_metrics))
            or (not requested_metrics and executed_native_group_by)
        )

        has_having_filter = any(
            bool((r.data.get('plan') or {}).get('having'))
            and (r.data.get('stages') or {}).get('groups_count', 0) > 1
            for r in successful
        )

        if len(effective_group_keys) <= 1 and not executed_all_requested_groupings and not has_having_filter:
            dim_name = contract.group_dimension or "指定维度"
            grp_str = f"（当前仅计算了分组: {', '.join(sorted(effective_group_keys))}）" if effective_group_keys else "（当前仅计算了全表汇总，未完成各分组细分）"
            issues.append({
                'code': 'grouping_incomplete',
                'message': f'用户要求按【{dim_name}】分组统计各组指标，{grp_str}，尚未完成各分组的核心指标计算与覆盖。可在 aggregate 表达式中指定 group_by="{dim_name}" 自动按各组汇总，或补充各组的聚合计划。'
            })
        elif re.search(r'前[一二两三\d]+个?(?:字母|字符|前缀)', str(contract.group_dimension or "")):
            # 派生粒度校验：用户明确要求前缀截取分组，若实际 group_keys 均为长编号且数量庞大，属于误用原列明细
            long_keys = [k for k in effective_group_keys if len(k) > 4]
            if len(long_keys) > 20 and len(effective_group_keys) > 30:
                issues.append({
                    'code': 'grouping_dimension_mismatch',
                    'message': f'分组维度粒度错误：用户要求按【{contract.group_dimension}】提取前缀汇总，当前实际按原完整编号产生了 {len(effective_group_keys)} 组明细，未执行前缀派生分组。请在 filters 中使用 prefix 或派生计算。'
                })

        if contract.limit and len(effective_group_keys) > contract.limit:
            issues.append({
                'code': 'ranking_limit_not_applied',
                'message': f'用户要求按排序取前 {contract.limit} 组，当前实际输出了 {len(effective_group_keys)} 组明细，未执行截断筛选要求。'
            })

        # 1. 逐组指标覆盖矩阵校验 (G x M Matrix Coverage)
        # 针对每个请求的业务指标（排除显式全局总计项），严格断言：每个有效业务分组都必须具备该指标！
        if effective_group_keys:
            for metric in requested_metrics:
                grp_facts_for_metric = [
                    f for f in facts
                    if not _is_total_fact(f) and _fact_matches(f, metric)
                ]
                covered_groups = {
                    gk for f in grp_facts_for_metric
                    if (gk := _extract_group_key(f))
                }
                is_metric_native_grouped = _metric_has_native_grouping(metric)
                # 若已执行全量扫描的原生 group_by，未出现在结果中的分组属于物理数据稀疏性（0行记录），非漏算
                if is_metric_native_grouped and covered_groups:
                    missing_groups = set()
                else:
                    missing_groups = effective_group_keys - covered_groups
                if missing_groups:
                    missing_str = '、'.join(sorted(missing_groups))
                    if not covered_groups:
                        msg = f'用户要求按分组统计【{metric.name}】，当前缺少各分组的【{metric.name}】细分聚合。请在 aggregate 表达式中指定 group_by 补充各组的【{metric.name}】计算。'
                    else:
                        msg = f'分组【{missing_str}】缺少指标【{metric.name}】的细分计算，请补充各分组对应的【{metric.name}】聚合。'
                    issues.append({
                        'code': 'per_group_metrics_missing',
                        'metric': metric.name,
                        'missing_groups': sorted(missing_groups),
                        'message': msg
                    })

        # 2. 按指标和量纲独立分区的精确数学守恒检验（严禁跨指标/跨量纲混加）
        checked_base_metrics = set()
        for metric in contract.metrics:
            base_metric_name = re.sub(r'^(?:总|合计|全表|全部|总体)', '', metric.name) or metric.name
            if base_metric_name in checked_base_metrics:
                continue
            checked_base_metrics.add(base_metric_name)

            # 找到匹配该指标的全表总计事实
            total_facts = [
                f for f in facts
                if _is_total_fact(f) and (_fact_matches(f, metric) or base_metric_name in f.get('label', ''))
            ]
            if not total_facts:
                continue
            total_fact = total_facts[0]
            try:
                tot_val = float(str(total_fact.get('value', '')).replace(',', ''))
            except (ValueError, TypeError):
                continue
            if tot_val <= 0:
                continue

            # 找到匹配该指标的所有分组事实（确保同单位）
            grp_facts = [
                f for f in facts
                if not _is_total_fact(f) and (_fact_matches(f, metric) or base_metric_name in f.get('label', ''))
                and (f.get('unit') == total_fact.get('unit') or not total_fact.get('unit'))
            ]
            if not grp_facts:
                continue

            grp_sum = 0.0
            for gf in grp_facts:
                try:
                    grp_sum += float(str(gf.get('value', '')).replace(',', ''))
                except (ValueError, TypeError):
                    pass

            # 若任务包含组过滤 (HAVING，如金额大于100) 或 Top N / 截断限制，各合格分组之和本就小于全表总计，豁免全局守恒校验
            has_group_having = bool(re.search(r'(?:分组|组内|每组|各组|合计|总额|求和).*(?:大于|小于|高于|低于|超过|>=|<=|>|<|\d+)', prompt) or re.search(r'不要先按单条.*筛选', prompt))
            has_limit_truncation = bool(contract.limit or re.search(r'前\s*\d+\s*(?:组|项|条|个)|top\s*\d+', prompt, re.I))
            if has_group_having or has_limit_truncation:
                continue

            # 精确守恒：舍入容差使用 max(0.01, 0.0001 * tot_val)，绝不用 5% 模糊阈值
            tolerance = max(0.01, 0.0001 * tot_val)
            diff = abs(grp_sum - tot_val)
            if diff > tolerance:
                issues.append({
                    'code': 'grouping_coverage_incomplete',
                    'message': f'各分组【{base_metric_name}】之和 ({grp_sum:.2f}) 与全表总计 ({tot_val:.2f}) 存在差额 ({diff:.2f})，尚有分组未被纳入计算。'
                })
    if re.search(r'变化|趋势|增长|增减|改善|change|trend|growth',prompt,re.I):
        scopes={}
        for receipt in successful:
            for c in receipt.data.get('coverage',[]):
                key=((receipt.provenance or {}).get('workbook_id'),c['sheet'])
                scopes.setdefault(key,set()).add(tuple(c['selected_rows']))
        if not any(len(windows)>=2 for windows in scopes.values()):
            issues.append({'code':'comparison_windows_missing',
                'message':'用户要求变化或趋势，需补充同一来源不同期间的对照及比率/变化。'})
    issues.extend(query_delivery_issues(successful, prompt, contract))
    if contract.audit_checks and successful:
        missing_checks = []
        for check_item in contract.audit_checks:
            if re.search(r'重复|唯一|duplicate|unique', check_item, re.I):
                has_dup_evidence = any(
                    any(isinstance(r_rule, dict) and r_rule.get('kind') == 'unique' for r_rule in (r.data.get('rules') or []))
                    or any(isinstance(p, dict) and p.get('table_duplicate_row_count') is not None for p in (r.data.get('profiles') or []))
                    or bool((r.data.get('plan') or {}).get('distinct'))
                    or bool((r.data.get('plan') or {}).get('having'))
                    for r in successful
                )
                if not has_dup_evidence:
                    missing_checks.append(check_item)
                continue
            target_headers = [h for h in known_headers if h in check_item]
            if target_headers:
                def _receipt_touches(r_data, h):
                    plan_s = str(r_data.get('plan') or '')
                    cov_s = str([c.get('filters') for c in r_data.get('coverage', [])])
                    rules_s = str(r_data.get('rules') or '')
                    prof_s = str(r_data.get('profiles') or '')
                    return h in (plan_s + cov_s + rules_s + prof_s)

                if not any(all(_receipt_touches(r.data, th) for th in target_headers) for r in successful):
                    missing_checks.append(check_item)
            else:
                item_keywords = [w for w in re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]{2,}', check_item) if w not in ('查找', '筛选', '找出', '检查', '记录', '全部', '业务行', '的业务行')]
                if item_keywords and not any(any(kw in str(r.data) for kw in item_keywords) for r in successful):
                    missing_checks.append(check_item)

        if missing_checks:
            issues.append({
                'code': 'audit_checks_incomplete',
                'missing_checks': missing_checks,
                'message': f'用户要求执行 {len(contract.audit_checks)} 项合规检查，当前尚有 {len(missing_checks)} 项未在执行回执中覆盖：' + '、'.join(missing_checks) + '。请补充对应检查项的查询或规则。'
            })
    if re.search(r'(?:先|首先).*(?:确认|澄清|说明|定义).*(?:暂不|不要|先不).*计算', prompt):
        issues.append({'code': 'clarification_first_required', 'message': '用户要求先确认定义、暂不计算，请先用业务语言提问，不要强制补算。'})
    # LLM diagnoses the gate; only evidence-backed sparse-group false positives
    # are eligible for deterministic revalidation. Integrity and query stages stay.
    judge_verdict = None
    if issues:
        try:
            from .task_completeness_judge import judge_task_completeness
            all_cov = [c for r in successful for c in r.data.get('coverage', [])]
            judge_verdict = judge_task_completeness(
                prompt=prompt,
                contract=contract,
                facts=facts,
                coverage=all_cov,
                issues=issues, model=model, deadline=deadline,
                context={'known_headers': sorted(known_headers),
                         'plans': [r.data.get('plan') for r in successful],
                         'provenance': [r.provenance for r in successful],
                         'errors': [{'code': r.error_code, 'message': r.error_message}
                                    for r in evidence if getattr(r, 'is_error', False)]}
            )
            if judge_verdict and (
                judge_verdict.get('action') == 'recheck'
                or judge_verdict.get('category') == 'gate_false_positive'
                or bool(judge_verdict.get('dismissed_issue_codes'))
            ):
                from .analysis_gate_review import revalidate_review
                issues, judge_verdict = revalidate_review(issues, judge_verdict, successful, facts)
        except Exception:
            pass
    sheets = []
    for e in evidence:
        if getattr(e, 'is_success', False) and isinstance(getattr(e, 'data', None), dict):
            s_list = e.data.get('available_sheets')
            if s_list and isinstance(s_list, list):
                sheets = s_list
                break
    return {'complete':not issues,'domain':contract.domain,
            'evidence_ids':list(dict.fromkeys(e.data.get('evidence_id') for e in successful)),
            'missing_metrics':missing,'issues':issues,'available_sheets':sheets,
            'known_headers': sorted(known_headers), 'gate_review': judge_verdict}


def task_feedback(evidence,prompt='',model=None,deadline=None):
    state=analysis_task_state(evidence,prompt,model=model,deadline=deadline)
    missing_items = state.get('issues', [])
    missing_cols = any(
        any(m.get('source_column_exists') is False for m in issue.get('metrics', []))
        for issue in missing_items if issue.get('code') == 'required_metrics_missing'
    )
    guidance = ''
    review = state.get('gate_review') or {}
    if review.get('action') == 'clarify':
        guidance += ('【门禁复核建议】：本轮可进入澄清等待，不要求一次算出结果。请核对下述问题与真实表头，'
                     '用用户听得懂的方式说明缺少的数据或口径，给出候选选项，直接提问：'
                     + review.get('user_question', '') + '\n')
    elif review.get('repair_instruction'):
        guidance += '【门禁复核建议】：' + review['repair_instruction'] + '\n'
    if missing_cols:
        guidance += '【提示】：部分请求指标在源数据中未定位到对应列。若无法基于现有字段推导计算，请向用户说明缺失列并请求确认口径，不要捏造数据。\n'
    return (guidance + '【程序任务状态】\n'+json.dumps(state,ensure_ascii=False)+'\n'
            '只修复issues中的执行或任务缺项；已有指标不重复计算。比率不是金额。'
            '证据ID由程序维护，不需要重写ID或最终数字，也不要为修复hypotheses重新调用工具。\n'
            '（注意：上述复核与门禁建议为内部控制指引，面向用户作答时必须直接输出业务结论与数据，切勿在正文中提及“门禁系统”、“误报”、“复核建议”等内部术语。）')
