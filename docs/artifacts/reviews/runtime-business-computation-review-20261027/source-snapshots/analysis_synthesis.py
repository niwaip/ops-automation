"""
LLM-driven analysis synthesis with deterministic audit provenance and safe fallback.
Combines user prompt intent with verified execution receipts, falling back to deterministic templates on failure.
"""

import copy
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .analysis_contract import build_analysis_contract
from .report_presentation import text, quantity, with_sources, render_unverified_guidance, resolve_conforming_facts

logger = logging.getLogger(__name__)


def _receipt_data(receipt: Any) -> Dict[str, Any]:
    if hasattr(receipt, "data"):
        data = getattr(receipt, "data", {})
    elif isinstance(receipt, dict):
        data = receipt.get("data", {})
    else:
        data = {}
    return data if isinstance(data, dict) else {}


def _receipt_provenance(receipt: Any) -> Dict[str, Any]:
    if hasattr(receipt, "provenance"):
        prov = getattr(receipt, "provenance", {})
    elif isinstance(receipt, dict):
        prov = receipt.get("provenance", {})
    else:
        prov = {}
    return prov if isinstance(prov, dict) else {}


def _build_synthesis_policy(policy: Any) -> Any:
    """Clones runtime policy with thinking disabled so post-calculation synthesis runs fast."""
    if policy is None:
        from .runtime_policy import RuntimePolicy
        cloned = RuntimePolicy.from_env()
    else:
        try:
            cloned = copy.copy(policy)
        except Exception:
            cloned = policy
    try:
        setattr(cloned, "thinking", False)
        setattr(cloned, "reasoning_effort", None)
    except Exception:
        pass
    return cloned


def _matches_contract_metric(fact: Dict[str, Any], metric: Any) -> bool:
    if fact.get("metric_id") and getattr(metric, "semantic_id", None):
        return fact["metric_id"] == metric.semantic_id
    label = str(fact.get("label") or "")
    unit = str(fact.get("unit") or "")
    expected_type = getattr(metric, "expected_type", "number")
    is_rate_fact = unit == "%" or bool(re.search(r"率|占比|比重|margin|rate|ratio", label, re.I))
    if (expected_type == "percentage") != is_rate_fact:
        return False
    return any(re.search(alias, label) for alias in getattr(metric, "aliases", ()))


def _partition_facts_by_prompt(
    receipts: List[Any], prompt: str = ""
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Splits verified facts into (required_facts, optional_facts) based on user prompt contract."""
    facts = resolve_conforming_facts(receipts or [], prompt or "")

    metrics = build_analysis_contract(prompt or "").metrics if prompt else []
    if metrics:
        required_facts = [f for f in facts if any(_matches_contract_metric(f, m) for m in metrics)]
        if required_facts:
            req_ids = {id(f) for f in required_facts}
            optional_facts = [f for f in facts if id(f) not in req_ids]
            return required_facts, optional_facts

    return facts, []


def _clean_fact_label_for_prompt(label: Any) -> str:
    return str(label or "").replace("（注册关系补算）", "").strip()


def _format_fact_sources_note(fact: Dict[str, Any]) -> str:
    sources = fact.get("source_cells") if isinstance(fact, dict) else None
    if not isinstance(sources, list) or not sources:
        return ""
    clean_sources = [str(s).strip() for s in sources if str(s).strip()]
    if not clean_sources:
        return ""
    if len(clean_sources) <= 6:
        return f"（来源单元格: {', '.join(clean_sources)}）"
    return f"（来源单元格: {clean_sources[0]} .. {clean_sources[-1]}，共 {len(clean_sources)} 个单元格）"


def _is_zero_match_receipts(receipts: List[Any], contract: Any) -> bool:
    """Returns True if receipts represent an executed query that matched 0 records."""
    if not receipts:
        return False
    # Only evaluate query / analysis receipts; ignore metadata/structure inspection receipts
    query_receipts = [
        r for r in receipts
        if _receipt_data(r).get("kind") == "spreadsheet_analysis"
        or "coverage" in _receipt_data(r)
        or "stages" in _receipt_data(r)
    ]
    if not query_receipts:
        return False

    has_valid = False
    for r in query_receipts:
        data = _receipt_data(r)
        if not data:
            continue
        has_valid = True
        cov = [c for c in data.get("coverage", []) if isinstance(c, dict)]
        has_filters = any(c.get("filters") for c in cov) or bool(getattr(contract, "entity_predicates", None))
        if has_filters:
            stages = data.get("stages", {})
            where_zero = (stages.get("where_rows") == 0) if "where_rows" in stages else False
            cov_zero = all(c.get("evaluated_records", 0) == 0 for c in cov if c.get("filters")) if cov else False
            if not (where_zero or cov_zero):
                return False
        else:
            stages = data.get("stages", {})
            if stages and stages.get("final_rows", 0) > 0:
                return False

        rows = [row for row in data.get("rows", []) if isinstance(row, dict)]
        if rows:
            is_zero_metric_row = (
                len(rows) == 1
                and all(str(v).strip() in ('0', '0.0', '') or v == 0 for v in rows[0].values())
            )
            if not is_zero_metric_row:
                return False

        facts = [f for f in data.get("facts", []) if isinstance(f, dict)]
        for f in facts:
            val = f.get("value")
            try:
                if float(str(val).replace(",", "")) > 0:
                    return False
            except (ValueError, TypeError):
                pass
    return has_valid


def build_verified_facts_digest(receipts: List[Any], prompt: str = "") -> str:
    """Extracts a structured, human-readable summary of verified facts and rules for LLM context."""
    sections = []
    contract = build_analysis_contract(prompt or "")
    is_zero_match = _is_zero_match_receipts(receipts, contract)

    # 1. 零匹配场景：显式注入零匹配事实与范围，指导 LLM 给出准确事实与业务排查指引
    if is_zero_match:
        entity_desc = f"（目标实体限定: {'、'.join(contract.entity_predicates)}）" if contract.entity_predicates else ""
        total_scanned = max([c.get("input_records", 0) for r in receipts for c in _receipt_data(r).get("coverage", []) if isinstance(c, dict)] or [0])
        zero_lines = [
            f"【检索事实（零匹配）】: 当前数据源中未检索到符合条件的记录{entity_desc}。",
            f"- 扫描原件数据行数: 共完整扫描 {total_scanned} 条业务记录",
            "- 符合条件的记录数: 0 条",
            "- 事实状态: 过滤条件已正确完整执行，当前工作表中无对应记录",
        ]
        sections.append("\n".join(zero_lines))

    # 2. 指标计算结果（区分必答核心指标与辅助衍生指标）
    required_facts, optional_facts = _partition_facts_by_prompt(receipts, prompt)
    if not is_zero_match:
        if required_facts and optional_facts:
            req_lines = ["【用户提问核心指标（回答正文中必须完整包含以下数值）】:"]
            for f in required_facts:
                val_str = quantity(f.get("value"), f.get("unit"))
                src_note = _format_fact_sources_note(f)
                req_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}{src_note}")
            sections.append("\n".join(req_lines))

            opt_lines = ["【底层衍生/辅助核算指标（可按需引用，无需全部罗列，严禁自行口算其他数字）】:"]
            for f in optional_facts:
                val_str = quantity(f.get("value"), f.get("unit"))
                src_note = _format_fact_sources_note(f)
                opt_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}{src_note}")
            sections.append("\n".join(opt_lines))
        elif required_facts:
            fact_lines = ["【已核算指标数值（回答正文中必须包含）】:"]
            for f in required_facts:
                val_str = quantity(f.get("value"), f.get("unit"))
                src_note = _format_fact_sources_note(f)
                fact_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}{src_note}")
            group_facts = [f for f in required_facts if f.get("group_key")]
            if len(group_facts) >= 2:
                from collections import defaultdict
                metric_groups = defaultdict(list)
                for f in group_facts:
                    mid = f.get("metric_id") or (f.get("id", "").split("__")[0] if "__" in f.get("id", "") else None)
                    u = f.get("unit") or ""
                    metric_groups[(mid, u)].append(f)

                for (mid, u), m_facts in metric_groups.items():
                    if len(m_facts) >= 2:
                        try:
                            tot = sum(float(str(f.get("value")).replace(",", "")) for f in m_facts)
                            lbl = m_facts[0].get("label", "")
                            measure_name = ""
                            for word in ["金额", "工数", "工时", "条数", "数量", "费用", "成本"]:
                                if word in lbl:
                                    measure_name = word
                                    break
                            summary_title = f"各分组核算合计{measure_name}" if measure_name else "各分组核算合计"
                            fact_lines.append(f"- 【{summary_title}】: {quantity(tot, u)}")
                        except Exception:
                            pass
            sections.append("\n".join(fact_lines))

    # 3. 底层过滤检索到的明细记录行 (Rows)
    if not is_zero_match:
        all_rows = [row for r in (receipts or []) for row in _receipt_data(r).get("rows", []) if isinstance(row, dict)]
        valid_rows = [
            r for r in all_rows
            if not all(str(v).strip() in ('0', '0.0', '') or v == 0 for v in r.values())
            and not (len(r) == 1 and any(k in ('total_records', 'count', 'matched_rows_count') for k in r))
        ]
        if valid_rows and (contract.is_detail_query or not contract.is_grouped):
            row_lines = [f"【底层检索到的匹配明细记录清单（共 {len(valid_rows)} 条，回答中若用户要求明细必须以此列出明细表格）】:"]
            row_cols = list(dict.fromkeys(k for r in valid_rows[:20] for k in r.keys() if k != 'group_key'))
            if row_cols:
                row_lines.append("| " + " | ".join(row_cols) + " |")
                row_lines.append("|" + "|".join("---" for _ in row_cols) + "|")
                for r_item in valid_rows[:30]:
                    row_lines.append("| " + " | ".join(str(r_item.get(c, "")) for c in row_cols) + " |")
                if len(valid_rows) > 30:
                    row_lines.append(f"*（仅展示前 30 条明细，完整匹配共 {len(valid_rows)} 条）*")
            sections.append("\n".join(row_lines))

    # 2. 等式检查
    checks = [c for r in (receipts or []) for c in _receipt_data(r).get("checks", [])]
    if checks:
        check_lines = ["【等式与勾稽检查结果】:"]
        for c in checks:
            status = "一致" if c.get("passed") else "需核查"
            residual = quantity(c.get("residual"), c.get("unit"))
            src_note = _format_fact_sources_note(c)
            check_lines.append(f"- {c.get('label')}: {status} (左值: {c.get('left')}, 右值: {c.get('right')}, 差额: {residual}){src_note}")
        sections.append("\n".join(check_lines))

    # 3. 规则核查与异常样本
    rules = [rule for r in (receipts or []) for rule in _receipt_data(r).get("rules", [])]
    if rules:
        rule_lines = ["【数据质量与异常规则筛查】:"]
        for r in rules:
            v_cnt = r.get("violation_count", 0)
            e_cnt = r.get("evaluated_records", 0)
            status = "全部符合规则" if v_cnt == 0 else f"发现 {v_cnt} 处需核查记录"
            assumption = str(r.get("assumptions") or "").strip()
            basis_note = f"（规则假设：{assumption}）" if assumption else ""
            rule_lines.append(f"- {r.get('label')}: 总检 {e_cnt} 条，{status}{basis_note}")
            examples = r.get("examples", [])
            if examples and v_cnt > 0:
                samples = [f"{x.get('cell', '')} (值: {x.get('value', '')})" for x in examples[:5] if x.get("cell")]
                rule_lines.append(f"  典型异常样本: {', '.join(samples)}" + (f" 等共 {v_cnt} 处" if v_cnt > len(samples) else ""))
            v_rows = r.get("violation_rows") or []
            if v_rows and v_cnt > 0:
                rule_lines.append(f"  不符合规则原表行号（共 {v_cnt} 行）: {', '.join(str(x) for x in v_rows[:500])}")
        sections.append("\n".join(rule_lines))

    # 3.2 过滤匹配的原表行号清单 (selected_rows when filtered)
    filtered_row_lines: List[str] = []
    for r in receipts or []:
        data = _receipt_data(r)
        for cov in data.get("coverage", []):
            if not isinstance(cov, dict):
                continue
            sel_rows = cov.get("selected_rows") or []
            in_cnt = cov.get("input_records", 0)
            if sel_rows and (cov.get("filters") or (in_cnt and len(sel_rows) < in_cnt)) and len(sel_rows) <= 500:
                sheet_lbl = cov.get("sheet") or cov.get("id") or "工作表"
                filtered_row_lines.append(
                    f"- {sheet_lbl}（共匹配 {len(sel_rows)} 行，原表行号）：{', '.join(str(x) for x in sel_rows)}"
                )
    if filtered_row_lines:
        sections.append("【筛选匹配的原表行号清单（回答中若用户要求列出全部行号必须完整包含）】:\n" + "\n".join(dict.fromkeys(filtered_row_lines)))

    # 3.5 字段全量统计概况与极值/离群分布 (profiles)
    profile_lines: List[str] = []
    for r in receipts or []:
        data = _receipt_data(r)
        profs = data.get("profiles", [])
        if not profs:
            continue
        cov_by_id = {c.get("id"): c for c in data.get("coverage", []) if isinstance(c, dict)}
        requested_fields = set()
        for rule in data.get("rules", []):
            if not isinstance(rule, dict):
                continue
            tbl = cov_by_id.get(rule.get("table"), {})
            col_name = str(rule.get("column") or "")
            headers = tbl.get("headers", {}) if isinstance(tbl, dict) else {}
            bound = next((k for k, v in headers.items() if v == col_name), col_name.upper())
            requested_fields.add((rule.get("table"), bound))
        for p in profs:
            if not isinstance(p, dict):
                continue
            tbl = cov_by_id.get(p.get("table"), {})
            sheet_name = tbl.get("sheet") or p.get("table") or ""
            if p.get("table_duplicate_row_count") is not None:
                dup_cnt = p["table_duplicate_row_count"]
                dup_rows = p.get("table_duplicate_rows") or []
                dup_note = f"（行号: {', '.join(str(x) for x in dup_rows[:500])}）" if dup_cnt > 0 and dup_rows else ""
                profile_lines.append(f"- {sheet_name} 全表整行完全重复记录数：{dup_cnt} 条{dup_note}")
            if requested_fields and (p.get("table"), p.get("column")) not in requested_fields:
                continue
            col_letter = p.get("column") or ""
            header_name = p.get("header") or col_letter
            rec_cnt = p.get("records", 0)
            miss_cnt = p.get("missing", 0)
            p_parts = [f"- {sheet_name}!{col_letter}（{header_name}）：总计 {rec_cnt} 条，缺失 {miss_cnt} 条"]
            if 0 < miss_cnt <= 3 and p.get("missing_examples"):
                p_parts.append(f"缺失位置 {', '.join(p['missing_examples'][:3])}")
            if miss_cnt > 0 and p.get("missing_rows"):
                p_parts.append(f"缺失原表行号（共 {miss_cnt} 行）：{', '.join(str(x) for x in p['missing_rows'][:500])}")
            if isinstance(p.get("numeric"), dict):
                n = p["numeric"]
                p_parts.append(
                    f"最小值 {n.get('min')}（位于 {sheet_name}!{col_letter}{n.get('min_row')}），"
                    f"最大值 {n.get('max')}（位于 {sheet_name}!{col_letter}{n.get('max_row')}）"
                )
                outliers = n.get("outliers") or []
                if outliers:
                    o_samples = [f"{o.get('cell')} (值: {o.get('value')})" for o in outliers[:5] if isinstance(o, dict)]
                    o_cnt = n.get("outlier_count", len(outliers))
                    p_parts.append(f"统计离群极值（3×IQR）：发现 {o_cnt} 处极端值 [{', '.join(o_samples)}]")
            if isinstance(p.get("date"), dict):
                dt_info = p["date"]
                p_parts.append(
                    f"日期范围 {dt_info.get('min')}（第{dt_info.get('min_row')}行）至 "
                    f"{dt_info.get('max')}（第{dt_info.get('max_row')}行）"
                )
            if isinstance(p.get("value_counts"), dict):
                p_parts.append(f"分类计数 {json.dumps(p['value_counts'], ensure_ascii=False)}")
                if isinstance(p.get("value_examples"), dict):
                    rare = {k: v for k, v in p["value_examples"].items() if p["value_counts"].get(k, 0) <= 3}
                    if rare:
                        p_parts.append(f"低频值位置 {json.dumps(rare, ensure_ascii=False)}")
            profile_lines.append("；".join(p_parts))
    if profile_lines:
        sections.append("【字段全量统计概况与极值分布】:\n" + "\n".join(profile_lines))

    # 4. 数据来源
    names = []
    for r in receipts or []:
        prov = _receipt_provenance(r)
        fp = prov.get("file_path")
        if fp:
            names.append(Path(fp).name)
    if names:
        sections.append(f"【数据来源文件】: {', '.join(dict.fromkeys(names))}")

    return "\n\n".join(sections)


def _can_reach_proxy() -> bool:
    try:
        from urllib.parse import urlparse
        import socket
        from .config import DEFAULT_PROXY_URL
        parsed = urlparse(DEFAULT_PROXY_URL)
        host = parsed.hostname
        if not host:
            return False
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        socket.getaddrinfo(host, port)
        return True
    except Exception:
        return False


def _numeric_candidates(raw_val: Any) -> Tuple[Set[str], Set[float]]:
    """Generates formatted string candidates and numeric float values for a verified value."""
    str_candidates: Set[str] = set()
    float_candidates: Set[float] = set()
    if raw_val is None or isinstance(raw_val, bool):
        return str_candidates, float_candidates
    cleaned = str(raw_val).replace(",", "").replace("，", "").strip()
    if not cleaned:
        return str_candidates, float_candidates
    try:
        num_val = float(cleaned)
    except (ValueError, TypeError):
        return str_candidates, float_candidates

    for v in (num_val, abs(num_val)):
        float_candidates.add(v)
        float_candidates.add(round(v, 2))
        float_candidates.add(round(v, 1))
        float_candidates.add(float(int(round(v))))

    str_candidates.update({
        cleaned,
        f"{num_val:.2f}",
        f"{num_val:.2f}".rstrip("0").rstrip("."),
        f"{num_val:.1f}",
        str(int(round(num_val))),
    })
    if num_val == int(num_val):
        str_candidates.add(str(int(num_val)))
    if abs(num_val) >= 1000:
        for scale in (10.0, 10000.0):
            scaled = num_val / scale
            str_candidates.update({
                f"{scaled:.2f}",
                f"{scaled:.2f}".rstrip("0").rstrip("."),
                f"{scaled:.1f}",
                str(round(scaled, 2)),
                str(int(round(scaled))),
            })
            for sv in (scaled, abs(scaled)):
                float_candidates.add(sv)
                float_candidates.add(round(sv, 2))
                float_candidates.add(round(sv, 1))
    if 0 < abs(num_val) <= 1:
        pct = num_val * 100.0
        str_candidates.update({
            f"{pct:.2f}",
            f"{pct:.2f}".rstrip("0").rstrip("."),
            f"{pct:.1f}",
            f"{pct:.0f}",
            str(round(pct, 2)),
        })
        for pv in (pct, abs(pct)):
            float_candidates.add(pv)
            float_candidates.add(round(pv, 2))
            float_candidates.add(round(pv, 1))

    str_candidates.discard("")
    return str_candidates, float_candidates


def _collect_allowed_numbers(
    receipts: List[Any], prompt: str = "", audit: str = ""
) -> Tuple[Set[str], Set[float]]:
    """Builds the whitelist of verified numbers (and their exact pairwise arithmetic closure) from receipts, prompt, and audit text."""
    allowed_strs: Set[str] = set()
    allowed_floats: Set[float] = set()
    fact_nums: List[float] = []
    row_counts: Set[int] = set()

    def _add(val: Any) -> None:
        s_set, f_set = _numeric_candidates(val)
        allowed_strs.update(s_set)
        allowed_floats.update(f_set)

    def _add_count_pair(cnt: Any, total: Any) -> None:
        _add(cnt)
        _add(total)
        try:
            c_val = float(cnt)
            t_val = float(total)
            if t_val > 0 and 0 <= c_val <= t_val:
                rem = t_val - c_val
                _add(rem)
                _add((c_val / t_val) * 100.0)
                _add((rem / t_val) * 100.0)
        except (ValueError, TypeError):
            pass

    for receipt in receipts or []:
        data = _receipt_data(receipt)
        r_text = getattr(receipt, "text", "") if hasattr(receipt, "text") else (receipt.get("text", "") if isinstance(receipt, dict) else "")
        if r_text:
            for m in re.finditer(r"[-+]?\d+(?:\.\d+)?", str(r_text).replace(",", "")):
                _add(m.group(0))
        facts_list = [f for f in data.get("facts", []) if isinstance(f, dict)]
        if facts_list:
            _add(len(facts_list))
        for fact in facts_list:
            raw_v = fact.get("value")
            _add(raw_v)
            _add(fact.get("matched_records"))
            try:
                fv = float(str(raw_v).replace(",", "").strip())
                if len(fact_nums) < 16:
                    fact_nums.append(fv)
                if 0 < fv < 100:
                    _add(100.0 - fv)
            except (ValueError, TypeError):
                pass
            for m in re.finditer(r"\d+(?:\.\d+)?", str(fact.get("label") or "")):
                _add(m.group(0))
        if fact_nums:
            _add(sum(fact_nums))
        for check in data.get("checks", []):
            if isinstance(check, dict):
                _add(check.get("left"))
                _add(check.get("right"))
                _add(check.get("residual"))
                _add(check.get("tolerance"))
        rules_list = [r for r in data.get("rules", []) if isinstance(r, dict)]
        if rules_list:
            _add(len(rules_list))
            total_violations = sum(int(r.get("violation_count") or 0) for r in rules_list)
            _add(total_violations)
        for rule in rules_list:
            _add_count_pair(rule.get("violation_count"), rule.get("evaluated_records"))
            criteria = rule.get("criteria")
            if isinstance(criteria, dict):
                for cv in criteria.values():
                    _add(cv)
            for ex in rule.get("examples", []):
                if isinstance(ex, dict):
                    _add(ex.get("row"))
                    _add(ex.get("value"))
            for vr in rule.get("violation_rows", []) or []:
                _add(vr)
        for cov in data.get("coverage", []):
            if isinstance(cov, dict):
                _add(cov.get("input_records"))
                _add(cov.get("evaluated_records"))
                _add(cov.get("header_row"))
                for ex_r in cov.get("excluded_header_rows", []) or []:
                    _add(ex_r)
                for m_rng in re.finditer(r"\d+", str(cov.get("data_range") or "")):
                    _add(m_rng.group(0))
                sel_rows = cov.get("selected_rows") or []
                if len(sel_rows) <= 500:
                    for sr in sel_rows:
                        _add(sr)
                elif sel_rows:
                    _add(sel_rows[0])
                    _add(sel_rows[-1])
                for rc_key in ("input_records", "evaluated_records"):
                    rc_val = cov.get(rc_key)
                    if isinstance(rc_val, int) and rc_val > 0:
                        row_counts.add(rc_val)
        for row in data.get("rows", []):
            if isinstance(row, dict):
                for rv in row.values():
                    _add(rv)
        for prof in data.get("profiles", []):
            if isinstance(prof, dict):
                rec_total = prof.get("records")
                _add_count_pair(prof.get("missing"), rec_total)
                _add(prof.get("distinct_values"))
                if prof.get("table_duplicate_row_count") is not None:
                    _add_count_pair(prof.get("table_duplicate_row_count"), rec_total)
                for dr in prof.get("table_duplicate_rows", []) or []:
                    _add(dr)
                for mr in prof.get("missing_rows", []) or []:
                    _add(mr)
                num_prof = prof.get("numeric")
                if isinstance(num_prof, dict):
                    _add(num_prof.get("min"))
                    _add(num_prof.get("max"))
                    _add(num_prof.get("min_row"))
                    _add(num_prof.get("max_row"))
                    _add_count_pair(num_prof.get("outlier_count"), rec_total)
                    for o in num_prof.get("outliers", []) or []:
                        if isinstance(o, dict):
                            _add(o.get("row"))
                            _add(o.get("value"))
                date_prof = prof.get("date")
                if isinstance(date_prof, dict):
                    _add(date_prof.get("min_row"))
                    _add(date_prof.get("max_row"))
                vc = prof.get("value_counts")
                if isinstance(vc, dict):
                    for cnt in vc.values():
                        _add_count_pair(cnt, rec_total)

    # Pre-compute exact pairwise arithmetic derivations between verified facts so
    # mathematically true comparisons (e.g. difference a - b, ratio a / b * 100%, monthly avg a / N)
    # are permitted while any inaccurate mental math or fabricated external number is rejected.
    total_fact_sum = sum(fact_nums) if fact_nums else 0.0
    if total_fact_sum > 1e-9:
        _add(total_fact_sum)
        for a in fact_nums:
            ratio_pct = (a / total_fact_sum) * 100.0
            _add(a / total_fact_sum)
            _add(ratio_pct)
            if 0 < ratio_pct < 100:
                _add(100.0 - ratio_pct)
        # Precompute cumulative sums and percentages for top-k subsets (e.g. top 2, top 3 concentration)
        sorted_facts = sorted(fact_nums, reverse=True)
        running_sum = 0.0
        for val in sorted_facts:
            running_sum += val
            _add(running_sum)
            cum_pct = (running_sum / total_fact_sum) * 100.0
            _add(cum_pct)
            if 0 < cum_pct < 100:
                _add(100.0 - cum_pct)

    for i, a in enumerate(fact_nums):
        for rc in row_counts:
            _add(a / rc)
        for j, b in enumerate(fact_nums):
            if i == j:
                continue
            _add(a + b)
            _add(abs(a - b))
            if abs(b) > 1e-9:
                ratio_pct = (a / b) * 100.0
                _add(a / b)
                _add(ratio_pct)
                if 0 < abs(ratio_pct) < 100:
                    _add(100.0 - abs(ratio_pct))
                _add((abs(a - b) / abs(b)) * 100.0)

    # Also allow any numbers explicitly present in the user prompt, deterministic audit text or file paths
    for source_text in (prompt or "", audit or ""):
        clean_src = source_text.replace(",", "").replace("，", "")
        for m in re.finditer(r"[-+]?\d+(?:\.\d+)?", clean_src):
            _add(m.group(0))
    for receipt in receipts or []:
        prov = getattr(receipt, "provenance", {}) or {}
        if isinstance(prov, dict):
            for m in re.finditer(r"\d+", str(prov.get("file_path") or "")):
                _add(m.group(0))

    return allowed_strs, allowed_floats


def _has_unverified_numbers(
    content: str, allowed_strs: Set[str], allowed_floats: Set[float]
) -> bool:
    """Detects whether LLM synthesis introduced any business number not grounded in receipts/prompt."""
    text_body = (content or "").replace(",", "").replace("，", "")
    # 0. Strip document/file names so numeric identifiers are not treated as business values.
    text_body = re.sub(r"[^\s/\\<>'\"`]+\.(?:xlsx|xls|csv|docx|doc|pdf|txt|json|zip)\b", " ", text_body, flags=re.I)
    # 1. Strip cell references & ranges (e.g. 明细表!B15, A4:N15, F5) and Q1-Q4 quarter tags
    text_body = re.sub(r"\b[A-Za-z]{1,3}\d{1,5}(?::[A-Za-z]{1,3}\d{1,5})?\b", " ", text_body)
    # 2. Strip ISO dates/timestamps (e.g. 2026-01-02T00:00:00) and Chinese calendar dates (e.g. 2026年, 1月3日)
    text_body = re.sub(
        r"\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\b",
        " ",
        text_body,
    )
    text_body = re.sub(r"(?<!\d)(?:19|20)\d{2}\s*年(?:度)?", " ", text_body)
    text_body = re.sub(r"(?<!\d)\d{1,2}\s*月(?:份)?(?:\s*\d{1,2}\s*[日号])?", " ", text_body)
    text_body = re.sub(r"\b\d+(?:\.\d+)?\s*(?:[×xX\*]|倍)\s*IQR\b", " ", text_body, flags=re.I)
    # 3. Strip line-leading Markdown headings and list/section indices (e.g. "1. ", "### 2.1 ", "- **1.** ", "1、")
    text_body = re.sub(
        r"(?m)^\s*(?:#{1,6}\s+|[-*+>]\s+)*(?:\*{1,2})?(?:\(\d+\)|（\d+）|\d+(?:\.\d+){1,2}(?:\.(?!\d)|[、\)）])?|\d+(?:\.(?!\d)|[、\)）]))(?:\*{1,2})?\s*",
        " ",
        text_body,
    )
    # 3.1 Strip inline list indicators (e.g. 1. 2. 1、 2、 (1) （1）) without corrupting decimal numbers
    text_body = re.sub(r"(?<!\d)\d{1,2}(?:\.(?!\d)|[、\)）])", " ", text_body)
    text_body = re.sub(r"[（\(]\d{1,2}[）\)]", " ", text_body)
    # 4. Strip small structural counts (e.g. 10个有效成本中心, 4个指标, 3个维度, 12个月, 3项规则)
    text_body = re.sub(
        r"\b\d{1,2}\s*(?:个负责成本中心|个成本中心|个分组|个组|类分组|个类别|个项目|个部门|个核心指标|个指标|项指标|大指标|个维度|个方面|点建议|条建议|个工作表|张工作表|张表|个月|个季度|条规则|项规则|个规则|类异常|项异常|处异常|个字段|列字段)\b",
        " ",
        text_body,
    )
    # 5. Strip Markdown table pure sequence / ranking columns (e.g. "| 1 |", "| 9 |")
    text_body = re.sub(r"(?<=\|)\s*\d{1,3}\s*(?=\|)", " ", text_body)
    # 6. Strip ranking / ordinal descriptors (e.g. 前3名, 前3大, Top 3, 第1位, 第2梯队)
    text_body = re.sub(
        r"(?<!\d)(?:第\s*\d{1,2}\s*(?:名|位|梯队|阶段|步|项|组)|Top\s*\d{1,2}|前\s*\d{1,2}\s*(?:名|位|大|个))\b",
        " ",
        text_body,
        flags=re.I,
    )

    for m in re.finditer(r"(?<![A-Za-z0-9])[-+]?\d+(?:\.\d+)?(?![A-Za-z0-9])", text_body):
        token = m.group(0)
        raw_unsigned = token.lstrip("+-")
        if token in allowed_strs or raw_unsigned in allowed_strs:
            continue
        try:
            val = float(token)
        except ValueError:
            continue
        if any(abs(val - af) <= 0.035 or abs(abs(val) - af) <= 0.035 for af in allowed_floats):
            continue
        logger.warning(
            "Synthesized summary introduced unverified number '%s'; rejecting synthesis.",
            token,
        )
        return True

    return False


def _number_in_text(cand: str, text: str) -> bool:
    """Verifies that number candidate appears as an isolated numeric token with boundary."""
    if not cand:
        return False
    # Use word boundary to avoid matching inside identifiers like S22024, IK-S63048, etc.
    return bool(re.search(rf'(?<![A-Za-z0-9]){re.escape(cand)}(?![A-Za-z0-9])', text))


_NON_CELL_ABBREVS = {"Q1", "Q2", "Q3", "Q4", "H1", "H2"}


def _collect_allowed_cell_references(
    receipts: List[Any], prompt: str = "", audit: str = ""
) -> Tuple[Set[str], Set[str], bool]:
    """Collects verified bare and sheet-qualified cell coordinates from receipts, prompt, and audit."""
    allowed_bare: Set[str] = set()
    allowed_qualified: Set[str] = set()
    has_cell_provenance = False

    def _add_ref(ref_val: Any, is_provenance: bool = False) -> None:
        nonlocal has_cell_provenance
        raw = str(ref_val or "").strip().strip("`'\" ").replace("$", "")
        if not raw:
            return
        sheet_part = ""
        coord_part = raw
        if "!" in raw:
            sheet_part, coord_part = raw.rsplit("!", 1)
            sheet_part = sheet_part.strip("'\" ")
        coord_up = coord_part.upper()
        for part in coord_up.split(":"):
            if re.match(r"^[A-Z]{1,3}[1-9]\d{0,4}$", part):
                allowed_bare.add(part)
                if sheet_part:
                    allowed_qualified.add(f"{sheet_part}!{part}")
                if is_provenance:
                    has_cell_provenance = True
        if ":" in coord_up:
            allowed_bare.add(coord_up)
            if sheet_part:
                allowed_qualified.add(f"{sheet_part}!{coord_up}")

    def _extract_tokens(text_src: Any) -> None:
        s = str(text_src or "").replace("$", "")
        for m in re.finditer(r"(?:([A-Za-z0-9_\u4e00-\u9fa5]+)!)?\b([A-Za-z]{1,3}[1-9]\d{0,4}(?::[A-Za-z]{1,3}[1-9]\d{0,4})?)\b", s):
            sh, cd = m.group(1), m.group(2)
            _add_ref(f"{sh}!{cd}" if sh else cd, is_provenance=False)

    for receipt in receipts or []:
        data = _receipt_data(receipt)
        for vc in data.get("visited_cells", []) or []:
            _add_ref(vc, is_provenance=True)
        for us in data.get("unit_sources", []) or []:
            _add_ref(us, is_provenance=True)
        for fact in data.get("facts", []) or []:
            if isinstance(fact, dict):
                for sc in fact.get("source_cells", []) or []:
                    _add_ref(sc, is_provenance=True)
                _extract_tokens(fact.get("label"))
                _extract_tokens(fact.get("group_key"))
                _extract_tokens(fact.get("value"))
        for check in data.get("checks", []) or []:
            if isinstance(check, dict):
                for sc in check.get("source_cells", []) or []:
                    _add_ref(sc, is_provenance=True)
        for rule in data.get("rules", []) or []:
            if isinstance(rule, dict):
                for ex in rule.get("examples", []) or []:
                    if isinstance(ex, dict) and ex.get("cell"):
                        _add_ref(ex.get("cell"), is_provenance=True)
        for cov in data.get("coverage", []) or []:
            if isinstance(cov, dict):
                sh = str(cov.get("sheet") or "").strip()
                dr = str(cov.get("data_range") or "").strip()
                if dr:
                    _add_ref(f"{sh}!{dr}" if sh else dr, is_provenance=False)
                hdr_row = cov.get("header_row")
                hdrs = cov.get("headers") or {}
                if isinstance(hdr_row, int) and isinstance(hdrs, dict):
                    for col_let in hdrs:
                        _add_ref(f"{sh}!{col_let}{hdr_row}" if sh else f"{col_let}{hdr_row}", is_provenance=False)
        for prof in data.get("profiles", []) or []:
            if isinstance(prof, dict):
                col = str(prof.get("column") or "").strip().upper()
                for mex in prof.get("missing_examples", []) or []:
                    _add_ref(mex, is_provenance=True)
                num_p = prof.get("numeric") or {}
                if isinstance(num_p, dict):
                    if col and num_p.get("min_row"):
                        _add_ref(f"{col}{num_p['min_row']}", is_provenance=True)
                    if col and num_p.get("max_row"):
                        _add_ref(f"{col}{num_p['max_row']}", is_provenance=True)
                    for o in num_p.get("outliers", []) or []:
                        if isinstance(o, dict) and o.get("cell"):
                            _add_ref(o.get("cell"), is_provenance=True)
                v_ex = prof.get("value_examples") or {}
                if isinstance(v_ex, dict):
                    for c_list in v_ex.values():
                        if isinstance(c_list, list):
                            for c_ref in c_list:
                                _add_ref(c_ref, is_provenance=True)
        for row in data.get("rows", []) or []:
            if isinstance(row, dict):
                for rv in row.values():
                    _extract_tokens(rv)

    _extract_tokens(prompt)
    _extract_tokens(audit)
    return allowed_bare, allowed_qualified, has_cell_provenance


def _has_unverified_cell_references(
    content: str, receipts: List[Any], prompt: str = "", audit: str = ""
) -> bool:
    """Detects whether LLM synthesis fabricated cell coordinates not grounded in receipts."""
    if not content:
        return False
    allowed_bare, allowed_qualified, has_cell_provenance = _collect_allowed_cell_references(
        receipts, prompt=prompt, audit=audit
    )
    if not has_cell_provenance:
        return False

    text_body = re.sub(r"[^\s/\\<>'\"`]+\.(?:xlsx|xls|csv|docx|doc|pdf|txt|json|zip)\b", " ", content, flags=re.I)
    for m in re.finditer(
        r"(?:([A-Za-z0-9_\u4e00-\u9fa5]+)!)?(?<![A-Za-z0-9_!/-])\$?([A-Z]{1,2}[1-9]\d{0,4})(?::\$?([A-Z]{1,2}[1-9]\d{0,4}))?(?![A-Za-z0-9_/-])",
        text_body,
    ):
        sheet_prefix = (m.group(1) or "").strip()
        c1 = m.group(2).upper()
        c2 = (m.group(3) or "").upper()
        if not sheet_prefix and not c2 and c1 in _NON_CELL_ABBREVS:
            continue
        for c_part in ([c1, c2] if c2 else [c1]):
            if sheet_prefix and allowed_qualified:
                if f"{sheet_prefix}!{c_part}" not in allowed_qualified:
                    logger.warning(
                        "Synthesized summary introduced unverified qualified cell reference '%s!%s'; rejecting synthesis.",
                        sheet_prefix,
                        c_part,
                    )
                    return True
            if c_part not in allowed_bare:
                logger.warning(
                    "Synthesized summary introduced unverified cell reference '%s'; rejecting synthesis.",
                    c_part,
                )
                return True
    return False


def _is_synthesis_grounded(
    content: str, receipts: List[Any], prompt: str = "", audit: str = ""
) -> bool:
    """
    Two-way grounding check:
    1. Recall: All required facts matching the user's prompt contract must appear in `content`.
    2. Precision: Every business number and cell reference appearing in `content` must belong to the verified whitelist.
    """
    clean_content = (content or "").replace(",", "").replace("，", "")
    if not clean_content.strip():
        return False

    # 0. 防御甩锅免责致辞：若模型正文声称“未提供按...拆解”或“无法展示各部门”，说明模型拒绝交付或交付残缺，严禁放行
    contract = build_analysis_contract(prompt or "")
    if contract.is_grouped:
        if re.search(r'(?:未提供按.*(?:拆解|细分|分组|明细)|未提供.*明细分组|无法.*展示各.*(?:部门|分组|类别)|缺少按.*(?:分拆|细分|拆解))', clean_content):
            logger.warning("Synthesized summary contained disclaimer for missing grouping breakdown; rejecting synthesis.")
            return False

    # 防御假性零匹配幻觉：若底层回执中明明有实际计算结果或匹配行，但模型正文声称“未找到匹配”或“没有任何一个...超过/达到/符合”，严禁放行
    if not _is_zero_match_receipts(receipts, contract):
        if re.search(r'没有任何一个.*(?:符合|超过|大于|达到)|未找到匹配的目标记录|未检索到符合条件的记录', clean_content):
            logger.warning("Synthesized summary claimed zero-match when receipts have non-zero results; rejecting synthesis.")
            return False

    requires_cell_source = bool(re.search(r"单元格|坐标|\bcell\b", prompt or "", re.I))
    required_facts, _ = _partition_facts_by_prompt(receipts, prompt)
    if contract.metrics and not required_facts and any(_receipt_data(r).get("facts") for r in (receipts or [])):
        logger.warning("Synthesized summary has no conforming required_facts for contract metrics; rejecting synthesis.")
        return False
    for fact in required_facts:
        val = fact.get("value")
        str_candidates, _ = _numeric_candidates(val)
        if not str_candidates:
            continue
        is_zero_fact = (str(val).strip() in ("0", "0.0") or val == 0)
        has_semantic_zero = is_zero_fact and bool(re.search(r'未找到|无匹配|未检索到|0\s*条|零条|无对应记录|未查询到|无此员工', clean_content))
        has_number_match = any(c and _number_in_text(c, clean_content) for c in str_candidates)
        if not (has_number_match or has_semantic_zero):
            logger.warning(
                "Synthesized summary missed required metric '%s' (%s); falling back to template.",
                fact.get("label"),
                fact.get("value"),
            )
            return False
        sc_list = [str(c).strip() for c in (fact.get("source_cells") or []) if str(c).strip()]
        if requires_cell_source and 1 <= len(sc_list) <= 4:
            bare_cands = [c.rsplit("!", 1)[-1].replace("$", "") for c in sc_list]
            if not any(re.search(rf"(?<![A-Za-z0-9]){re.escape(bc)}(?![A-Za-z0-9])", content, re.I) for bc in bare_cands if bc):
                logger.warning(
                    "Synthesized summary missed required source_cells %s for metric '%s'; falling back to template.",
                    sc_list,
                    fact.get("label"),
                )
                return False

    # Check rule violation counts if rules found violations
    for receipt in receipts or []:
        data = _receipt_data(receipt)
        for rule in data.get("rules", []):
            if isinstance(rule, dict) and (rule.get("violation_count") or 0) > 0:
                v_strs, _ = _numeric_candidates(rule.get("violation_count"))
                if v_strs and not any(_number_in_text(c, clean_content) for c in v_strs):
                    return False

    # Prevent unverified claims of zero duplicate rows when no duplicate check was executed (FALSE_AUDIT_COVERAGE)
    if re.search(r"重复[^\n。；;]{0,20}(?:0\s*(?:条|行)|无|未发现|不存在)|(?:未发现|不存在|无)[^\n。；;]{0,15}重复", clean_content):
        has_dup_check = any(
            any(isinstance(rl, dict) and rl.get("kind") == "unique" for rl in (_receipt_data(rc).get("rules") or []))
            or any(isinstance(pf, dict) and pf.get("table_duplicate_row_count") is not None for pf in (_receipt_data(rc).get("profiles") or []))
            or bool((_receipt_data(rc).get("plan") or {}).get("distinct"))
            or bool((_receipt_data(rc).get("plan") or {}).get("having"))
            for rc in (receipts or [])
        )
        if not has_dup_check:
            logger.warning("Synthesized summary claimed zero duplicate rows without duplicate check evidence; rejecting synthesis.")
            return False

    allowed_strs, allowed_floats = _collect_allowed_numbers(receipts, prompt=prompt, audit=audit)
    if _has_unverified_numbers(content, allowed_strs, allowed_floats):
        return False

    if _has_unverified_cell_references(content, receipts, prompt=prompt, audit=audit):
        return False

    return True


def synthesize_analysis_summary(
    prompt: str,
    receipts: List[Any],
    audit: str,
    fallback_text: str,
    model: Optional[str] = None,
    policy: Any = None,
    deadline: Optional[float] = None
) -> str:
    """
    Invokes LLM (with thinking disabled) to synthesize a natural, business-oriented summary
    based on verified receipts. Enforces two-way numeric grounding and falls back on any failure.
    """
    if not receipts or (not model and not policy) or not _can_reach_proxy():
        return fallback_text

    facts_digest = build_verified_facts_digest(receipts, prompt)
    if not facts_digest.strip():
        return fallback_text

    has_actual_facts = any(
        kw in facts_digest
        for kw in ("【已核算指标数值", "【用户提问核心指标", "【检索事实（零匹配）", "【底层检索到的匹配明细记录清单")
    )
    if not has_actual_facts:
        return fallback_text

    system_prompt = (
        "你是一位专业、严谨的数据分析顾问。\n"
        "请结合用户最初的询问语句，依据下方已核验的事实数据，给出清晰凝练、友好易读、专业得体的分析回答。\n\n"
        "【极其严格的数值纪律（必须 100% 遵守，违反将直接被质检系统判定为幻觉驳回）】：\n"
        "1. 必须直接针对用户提问进行解答，完整包含【用户提问核心指标】中的所有数值；\n"
        "2. 【严禁自造区间概数、近似整数与虚假单元格坐标】：正文、表格及要点解读中的所有金额数值和来源单元格坐标（如 月度经营!B16），必须精确引用下方核验数据。不得自行编造范围、上下限、近似整数或猜测单元格行号/列号；描述分布时只能使用本轮回执中实际存在的分组名称和精确数值；\n"
        "3. 若涉及异常检查，请结合【数据质量与异常规则筛查】与【字段全量统计概况与极值分布】，明确指明异常类型、异常记录数，并列出关键异常样本（单元格坐标与实际异常值，包含统计离群极值）；\n"
        "4. 【明细与清单要求】：若用户提问是要求查看明细、清单或具体记录，且核验数据中提供了【底层检索到的匹配明细记录清单】，必须在正文中输出 Markdown 明细表格完整展示具体记录的各关键列（如项目、客户、工时、金额等），绝不能只给几个汇总数字；\n"
        "5. 【零匹配/未找到记录的业务引导要求】：若核验数据表明目标实体或条件匹配结果为 0 条（未找到记录）：\n"
        "   - 必须开门见山友好告知用户未在当前报表中查到该实体的明细记录（匹配 0 条），语言亲切自然、简洁专业；\n"
        "   - 【严禁输出全为 0 的空表格】：切勿输出全为 0 或 0 小时、0 元的空数据表格，直接以文本清晰说明并附带排查建议；\n"
        "   - 给出 2-3 条简明务实的业务排查建议（如：① 核对工号拼写大小写及是否有前后空格；② 确认该员工是否属于本期报表范围，或是否需要查询其他期间文件）；\n"
        "6. 【语言风格与禁语规则】：\n"
        "   - 严禁在开头使用生硬、机械的模板套话（例如“针对...在文件...中的查询”、“经底层引擎严格核验”、“经系统核算/核查无误”等过度机械化表达）；\n"
        "   - 输出排版使用优雅规范的 Markdown 格式（例如简明结论导语 + 核心数据/排查指引），避免冗长无效的说教与客套话。"
    )

    user_prompt = (
        f"【用户最初提问】:\n{prompt}\n\n"
        f"【已核验事实数据】:\n{facts_digest}\n\n"
        "请结合我的提问，给出清晰凝练的分析回答。"
    )

    try:
        from .llm import call_model_proxy
        synthesis_policy = _build_synthesis_policy(policy)
        raw_to = getattr(synthesis_policy, "single_request_timeout", 35) if synthesis_policy else 35
        # Ensure Python socket timeout is >= 35s so it does not abort before
        # ModelProxyController finishes its single-attempt timeout and retry.
        effective_to = min(max(int(raw_to or 35), 35), 45)
        res = call_model_proxy(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model or "default",
            timeout=effective_to,
            deadline=deadline,
            policy=synthesis_policy,
            stream_deltas=False,
            purpose="analysis_synthesis"
        )
        content = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()

        # 质检：排除空内容、过短回复、未解析的纯 JSON、遗漏核心指标或编造未核验数值的回复
        if (
            content
            and len(content) >= 20
            and not (content.startswith("{") and content.endswith("}"))
            and _is_synthesis_grounded(content, receipts, prompt=prompt, audit=audit)
        ):
            # 成功获得 LLM 总结，拼接确定性审计折叠明细
            return with_sources(content, audit, receipts)
    except Exception as e:
        logger.warning("LLM analysis synthesis failed, falling back to deterministic presentation: %s", e)

    return fallback_text


def synthesize_missing_content_explanation(
    prompt: str,
    state: Dict[str, Any],
    fallback_guidance: str,
    model: Optional[str] = None,
    policy: Any = None,
    deadline: Optional[float] = None
) -> str:
    """
    Synthesizes a helpful explanation when required metrics or data cannot be computed,
    clearly stating what is missing and guiding the user to provide more information.
    """
    missing_metrics = state.get("missing_metrics", [])
    issues = state.get("issues", [])

    if (not model and not policy) or not _can_reach_proxy():
        return fallback_guidance

    if not missing_metrics and not issues:
        return fallback_guidance

    uncalculated_metrics = [m for m in missing_metrics if m.get('source_column_exists')]
    genuinely_missing_metrics = [m for m in missing_metrics if not m.get('source_column_exists')]

    system_prompt = (
        "你是一位亲切、专业的数据分析助手。\n"
        "用户向你提出了数据分析需求，但当前未能向用户输出完整的分析结果。\n"
        "请根据【无法计算与缺失信息诊断】客观、实事求是地向用户解释原因，严禁推诿或给出虚假归因：\n"
        "1. 若诊断提示【未完成计算项】（即源表格实际存在对应列，但本轮分析计划尚未执行聚合计算）：\n"
        "   - 必须如实告知用户是当前分析流程未能完成该指标的聚合计算；\n"
        "   - 严禁声称表格缺少该列或要求用户补充该列数据！\n"
        "2. 若诊断提示【源表格确实缺少字段】（经源数据结构核验确实不存在）：\n"
        "   - 明确告知用户表格中缺少该具体列，并友好引导用户补充；\n"
        "3. 若工作表已知或仅有单表，切勿询问用户工作表名称，严禁凭空假设存在多个工作表；\n"
        "4. 保持积极协助的态度，排版条理分明。"
    )

    details_lines = []
    available_sheets = state.get("available_sheets", [])
    if available_sheets:
        if len(available_sheets) == 1:
            details_lines.append(f"表格工作表状态: 仅有单一工作表【{available_sheets[0]}】（已知确切工作表，无需询问用户确认Sheet名称）")
        else:
            details_lines.append(f"表格工作表列表: {', '.join(available_sheets)}")
    if uncalculated_metrics:
        uncalc_str = '、'.join(f"【{m['name']}】（已在源表中定位到对应列：{', '.join(m.get('matched_source_columns', []))}）" for m in uncalculated_metrics)
        details_lines.append(f"未完成计算项（表格已存在对应列，但本轮分析计划尚未完成聚合计算）: {uncalc_str}")
    if genuinely_missing_metrics:
        missing_str = '、'.join(f"【{m['name']}】" for m in genuinely_missing_metrics)
        details_lines.append(f"源表格确实缺少字段: {missing_str}")
    for issue in issues:
        msg = issue.get("message")
        if msg:
            details_lines.append(f"阻碍原因: {msg}")

    user_prompt = (
        f"【用户最初提问】: {prompt}\n\n"
        f"【无法计算与缺失信息诊断】:\n" + "\n".join(details_lines) + "\n\n"
        "请向用户解释无法计算的原因，并给出清晰的具体输入引导。"
    )

    try:
        from .llm import call_model_proxy
        synthesis_policy = _build_synthesis_policy(policy)
        timeout = getattr(synthesis_policy, "single_request_timeout", 15) if synthesis_policy else 15
        res = call_model_proxy(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model or "default",
            timeout=min(timeout, 20),
            deadline=deadline,
            policy=synthesis_policy,
            stream_deltas=False,
            purpose="analysis_synthesis"
        )
        content = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
        if content and len(content) >= 20 and not (content.startswith("{") and content.endswith("}")):
            header = "本次分析尚未通过执行证据核验。\n\n" if "尚未通过" not in content else ""
            footer = "\n\n尚未验证的项目不会被列为完成。" if "尚未验证" not in content else ""
            return f"{header}{content}{footer}"
    except Exception as e:
        logger.warning("LLM missing content guidance synthesis failed, falling back: %s", e)

    return fallback_guidance


def synthesize_informational_presentation(
    prompt: str,
    evidence: List[Any],
    model: Optional[str] = None,
    policy: Any = None,
    deadline: Optional[float] = None
) -> str:
    """
    Synthesizes a helpful and factual presentation for informational/non-computational spreadsheets,
    without demanding mathematical calculation receipts or prepending rejection warnings.
    """
    info_receipt = next(
        (e for e in evidence if getattr(e, "is_success", False) and getattr(e, "data", {}).get("kind") == "informational_spreadsheet"),
        None
    )
    struct_receipt = next(
        (e for e in evidence if getattr(e, "is_success", False) and getattr(e, "data", {}).get("kind") == "spreadsheet_structure"),
        None
    )

    reason = ""
    summary_focus = ""
    if info_receipt:
        reason = info_receipt.data.get("reason", "")
        summary_focus = info_receipt.data.get("summary_focus", "")

    sheets_info = []
    if struct_receipt:
        for s in struct_receipt.data.get("sheets", []):
            name = s.get("sheet", "")
            rows = s.get("physical_rows", 0)
            headers = [col_name for h in s.get("header_candidates", []) for col_name in h.get("columns", {}).values()]
            header_str = f"（字段: {', '.join(headers[:8])}）" if headers else ""
            sheets_info.append(f"- 工作表《{name}》: 约 {rows} 行记录{header_str}")

    context_lines = []
    if reason:
        context_lines.append(f"表格属性说明: {reason}")
    if summary_focus:
        context_lines.append(f"归纳重点: {summary_focus}")
    if sheets_info:
        context_lines.append("表格结构概况:\n" + "\n".join(sheets_info))

    fallback = (
        f"已为您查看并梳理表格内容。\n\n"
        + (f"📌 **表格性质与说明**：\n{reason}\n\n" if reason else "")
        + ("📊 **结构概况**：\n" + "\n".join(sheets_info) if sheets_info else "")
    ).strip()

    if (not model and not policy) or not _can_reach_proxy():
        return fallback

    system_prompt = (
        "你是一位专业的数据分析助手。\n"
        "用户上传了一个包含配置信息、状态日志或非数值型清单的工作簿，并提出了内容查看或归纳需求。\n"
        "请根据表格的实际结构与字段信息，为用户提供条理清晰、重点突出、准确客观的内容解读与归纳总结：\n"
        "1. 概括表格的主题、核心记录对象与当前运行/配置状态；\n"
        "2. 提取关键字段所反映的信息结构（如各节点状态、执行结果、时间记录等）；\n"
        "3. 如有任何异常或需关注的状态项，予以明确列出；\n"
        "4. 保持格式工整，使用清晰的 Markdown 排版。"
    )

    user_prompt = (
        f"【用户需求】: {prompt}\n\n"
        f"【表格结构与上下文信息】:\n" + "\n".join(context_lines) + "\n\n"
        "请为用户输出一份完整、清晰的内容梳理与归纳总结。"
    )

    try:
        from .llm import call_model_proxy
        synthesis_policy = _build_synthesis_policy(policy)
        timeout = getattr(synthesis_policy, "single_request_timeout", 20) if synthesis_policy else 20
        res = call_model_proxy(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model or "default",
            timeout=min(timeout, 25),
            deadline=deadline,
            policy=synthesis_policy,
            stream_deltas=False,
            purpose="analysis_synthesis"
        )
        content = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
        if content and len(content) >= 20 and not (content.startswith("{") and content.endswith("}")):
            return content
    except Exception as e:
        logger.warning("Informational presentation synthesis failed: %s", e)

    return fallback
