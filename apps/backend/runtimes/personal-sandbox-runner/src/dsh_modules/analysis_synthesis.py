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
from .report_presentation import text, quantity, with_sources, render_unverified_guidance

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
    facts: List[Dict[str, Any]] = []
    seen_facts = set()
    for receipt in receipts or []:
        data = _receipt_data(receipt)
        for fact in data.get("facts", []):
            if not isinstance(fact, dict):
                continue
            f_key = (fact.get("label"), str(fact.get("value")), fact.get("unit"))
            if f_key not in seen_facts:
                seen_facts.add(f_key)
                facts.append(fact)

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


def build_verified_facts_digest(receipts: List[Any], prompt: str = "") -> str:
    """Extracts a structured, human-readable summary of verified facts and rules for LLM context."""
    sections = []

    # 1. 指标计算结果（区分必答核心指标与辅助衍生指标）
    required_facts, optional_facts = _partition_facts_by_prompt(receipts, prompt)
    if required_facts and optional_facts:
        req_lines = ["【用户提问核心指标（回答正文中必须完整包含以下数值）】:"]
        for f in required_facts:
            val_str = quantity(f.get("value"), f.get("unit"))
            req_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}")
        sections.append("\n".join(req_lines))

        opt_lines = ["【底层衍生/辅助核算指标（可按需引用，无需全部罗列，严禁自行口算其他数字）】:"]
        for f in optional_facts:
            val_str = quantity(f.get("value"), f.get("unit"))
            opt_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}")
        sections.append("\n".join(opt_lines))
    elif required_facts:
        fact_lines = ["【已核算指标数值（回答正文中必须包含）】:"]
        for f in required_facts:
            val_str = quantity(f.get("value"), f.get("unit"))
            fact_lines.append(f"- {_clean_fact_label_for_prompt(f.get('label'))}: {val_str}")
        sections.append("\n".join(fact_lines))

    # 2. 等式检查
    checks = [c for r in (receipts or []) for c in _receipt_data(r).get("checks", [])]
    if checks:
        check_lines = ["【等式与勾稽检查结果】:"]
        for c in checks:
            status = "一致" if c.get("passed") else "需核查"
            residual = quantity(c.get("residual"), c.get("unit"))
            check_lines.append(f"- {c.get('label')}: {status} (左值: {c.get('left')}, 右值: {c.get('right')}, 差额: {residual})")
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
        sections.append("\n".join(rule_lines))

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
            if requested_fields and (p.get("table"), p.get("column")) not in requested_fields:
                continue
            tbl = cov_by_id.get(p.get("table"), {})
            sheet_name = tbl.get("sheet") or p.get("table") or ""
            col_letter = p.get("column") or ""
            header_name = p.get("header") or col_letter
            rec_cnt = p.get("records", 0)
            miss_cnt = p.get("missing", 0)
            p_parts = [f"- {sheet_name}!{col_letter}（{header_name}）：总计 {rec_cnt} 条，缺失 {miss_cnt} 条"]
            if 0 < miss_cnt <= 3 and p.get("missing_examples"):
                p_parts.append(f"缺失位置 {', '.join(p['missing_examples'][:3])}")
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
        for fact in data.get("facts", []):
            if isinstance(fact, dict):
                raw_v = fact.get("value")
                _add(raw_v)
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
        for cov in data.get("coverage", []):
            if isinstance(cov, dict):
                _add(cov.get("input_records"))
                _add(cov.get("evaluated_records"))
                for rc_key in ("input_records", "evaluated_records"):
                    rc_val = cov.get(rc_key)
                    if isinstance(rc_val, int) and rc_val > 0:
                        row_counts.add(rc_val)
        for prof in data.get("profiles", []):
            if isinstance(prof, dict):
                rec_total = prof.get("records")
                _add_count_pair(prof.get("missing"), rec_total)
                _add(prof.get("distinct_values"))
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

    # Also allow any numbers explicitly present in the user prompt or deterministic audit text
    for source_text in (prompt or "", audit or ""):
        clean_src = source_text.replace(",", "").replace("，", "")
        for m in re.finditer(r"[-+]?\d+(?:\.\d+)?", clean_src):
            _add(m.group(0))

    return allowed_strs, allowed_floats


def _has_unverified_numbers(
    content: str, allowed_strs: Set[str], allowed_floats: Set[float]
) -> bool:
    """Detects whether LLM synthesis introduced any business number not grounded in receipts/prompt."""
    text_body = (content or "").replace(",", "").replace("，", "")
    # 1. Strip cell references & ranges (e.g. 明细表!B15, A4:N15, F5) and Q1-Q4 quarter tags
    text_body = re.sub(r"\b[A-Za-z]{1,3}\d{1,5}(?::[A-Za-z]{1,3}\d{1,5})?\b", " ", text_body)
    # 2. Strip ISO dates/timestamps (e.g. 2026-01-02T00:00:00) and Chinese calendar dates (e.g. 2026年, 1月3日)
    text_body = re.sub(
        r"\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\b",
        " ",
        text_body,
    )
    text_body = re.sub(r"(?<!\d)(?:19|20)\d{2}\s*年(?:度)?", " ", text_body)
    text_body = re.sub(r"\b\d{1,2}\s*月\s*\d{1,2}\s*[日号]\b", " ", text_body)
    text_body = re.sub(r"\b\d+(?:\.\d+)?\s*(?:[×xX\*]|倍)\s*IQR\b", " ", text_body, flags=re.I)
    # 3. Strip line-leading Markdown headings and list/section indices (e.g. "1. ", "### 2.1 ", "- **1.** ")
    text_body = re.sub(
        r"(?m)^\s*(?:#{1,6}\s+|[-*+>]\s+)*(?:\*{1,2})?(?:\(\d+\)|（\d+）|\d+(?:\.\d+){1,2}[\.\)、]?|\d+[\.\)、])(?:\*{1,2})?\s+",
        " ",
        text_body,
    )
    # 4. Strip small structural counts (e.g. 4个指标, 3个维度, 12个月, 3项规则)
    text_body = re.sub(
        r"\b\d{1,2}\s*(?:个核心指标|个指标|项指标|大指标|个维度|个方面|点建议|条建议|个工作表|张工作表|张表|个月|个季度|条规则|项规则|个规则|类异常|项异常|处异常|个字段|列字段)\b",
        " ",
        text_body,
    )

    for m in re.finditer(r"(?<![A-Za-z])[-+]?\d+(?:\.\d+)?", text_body):
        token = m.group(0)
        raw_unsigned = token.lstrip("+-")
        if token in allowed_strs or raw_unsigned in allowed_strs:
            continue
        try:
            val = float(token)
        except ValueError:
            continue
        if any(abs(val - af) <= 0.015 or abs(abs(val) - af) <= 0.015 for af in allowed_floats):
            continue
        logger.warning(
            "Synthesized summary introduced unverified number '%s'; rejecting synthesis.",
            token,
        )
        return True

    return False


def _is_synthesis_grounded(
    content: str, receipts: List[Any], prompt: str = "", audit: str = ""
) -> bool:
    """
    Two-way grounding check:
    1. Recall: All required facts matching the user's prompt contract must appear in `content`.
    2. Precision: Every business number appearing in `content` must belong to the verified whitelist.
    """
    clean_content = (content or "").replace(",", "").replace("，", "")
    if not clean_content.strip():
        return False

    required_facts, _ = _partition_facts_by_prompt(receipts, prompt)
    for fact in required_facts:
        str_candidates, _ = _numeric_candidates(fact.get("value"))
        if not str_candidates:
            continue
        if not any(c and c in clean_content for c in str_candidates):
            logger.warning(
                "Synthesized summary missed required metric '%s' (%s); falling back to template.",
                fact.get("label"),
                fact.get("value"),
            )
            return False

    # Check rule violation counts if rules found violations
    for receipt in receipts or []:
        data = _receipt_data(receipt)
        for rule in data.get("rules", []):
            if isinstance(rule, dict) and (rule.get("violation_count") or 0) > 0:
                v_strs, _ = _numeric_candidates(rule.get("violation_count"))
                if v_strs and not any(c in clean_content for c in v_strs):
                    return False

    allowed_strs, allowed_floats = _collect_allowed_numbers(receipts, prompt=prompt, audit=audit)
    if _has_unverified_numbers(content, allowed_strs, allowed_floats):
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

    system_prompt = (
        "你是一位专业、严谨的数据分析顾问。\n"
        "请结合用户最初的询问语句，依据下方由底层计算引擎严格核验的事实数据，给出结构清晰、友好易读、专业得体的分析总结。\n\n"
        "【严格要求】：\n"
        "1. 直接针对用户最初提出的问题进行总结，必须完整包含【用户提问核心指标】中的所有数值；\n"
        "2. 正文中所提及的所有金额、比例、数量、行号、单元格坐标，必须 100% 来源于下方提供的已核验数据，请勿自行额外口算未提供的比率、同比/环比或差额；\n"
        "3. 若涉及异常检查，请结合【数据质量与异常规则筛查】与【字段全量统计概况与极值分布】，明确指明异常类型、异常记录数，并列出关键异常样本（单元格坐标与实际异常值，包含统计离群极值）；\n"
        "4. 输出排版使用优雅规范的 Markdown 格式（例如简明核心结论导语 + 汇总表格 + 要点解读），不要包含客套寒暄。"
    )

    user_prompt = (
        f"【用户最初提问】:\n{prompt}\n\n"
        f"【底层已核验事实数据】:\n{facts_digest}\n\n"
        "请结合我的提问，给出清晰完整的分析总结回答。"
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
            stream_deltas=False
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

    system_prompt = (
        "你是一位亲切、专业的数据分析助手。\n"
        "用户向你提出了数据分析需求，但底层数据在核验时发现缺少必要的内容或字段导致无法完成完整计算。\n"
        "请用专业、清晰且有建设性的口吻回复用户：\n"
        "1. 明确告知用户由于表格中缺少什么具体内容/字段而无法计算；\n"
        "2. 友好且具体地引导用户补充所需的信息（例如补充哪些工作表、列名或核算口径）；\n"
        "3. 保持积极协助的态度，排版条理分明。"
    )

    details_lines = []
    if missing_metrics:
        details_lines.append(f"缺失指标项: {', '.join(m.get('name', m.get('metric_id', '')) for m in missing_metrics)}")
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
            stream_deltas=False
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
            stream_deltas=False
        )
        content = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
        if content and len(content) >= 20 and not (content.startswith("{") and content.endswith("}")):
            return content
    except Exception as e:
        logger.warning("Informational presentation synthesis failed: %s", e)

    return fallback
