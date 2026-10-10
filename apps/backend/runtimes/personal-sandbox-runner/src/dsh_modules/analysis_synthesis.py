"""
LLM-driven analysis synthesis with deterministic audit provenance and safe fallback.
Combines user prompt intent with verified execution receipts, falling back to deterministic templates on failure.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .report_presentation import text, quantity, with_sources, render_unverified_guidance

logger = logging.getLogger(__name__)


def build_verified_facts_digest(receipts: List[Any], prompt: str = "") -> str:
    """Extracts a structured, human-readable summary of verified facts and rules for LLM context."""
    sections = []

    # 1. 指标计算结果
    facts = []
    seen_facts = set()
    for receipt in receipts:
        data = getattr(receipt, "data", {}) if hasattr(receipt, "data") else receipt.get("data", {})
        for fact in data.get("facts", []):
            f_key = (fact.get("label"), str(fact.get("value")), fact.get("unit"))
            if f_key not in seen_facts:
                seen_facts.add(f_key)
                facts.append(fact)
    if facts:
        fact_lines = ["【已核算指标数值】:"]
        for f in facts:
            val_str = quantity(f.get("value"), f.get("unit"))
            fact_lines.append(f"- {f.get('label')}: {val_str}")
        sections.append("\n".join(fact_lines))

    # 2. 等式检查
    checks = [c for r in receipts for c in getattr(r, "data", {}).get("checks", [])]
    if checks:
        check_lines = ["【等式与勾稽检查结果】:"]
        for c in checks:
            status = "一致" if c.get("passed") else "需核查"
            residual = quantity(c.get("residual"), c.get("unit"))
            check_lines.append(f"- {c.get('label')}: {status} (左值: {c.get('left')}, 右值: {c.get('right')}, 差额: {residual})")
        sections.append("\n".join(check_lines))

    # 3. 规则核查与异常样本
    rules = [rule for r in receipts for rule in getattr(r, "data", {}).get("rules", [])]
    if rules:
        rule_lines = ["【数据质量与异常规则筛查】:"]
        for r in rules:
            v_cnt = r.get("violation_count", 0)
            e_cnt = r.get("evaluated_records", 0)
            status = "全部符合规则" if v_cnt == 0 else f"发现 {v_cnt} 处需核查记录"
            rule_lines.append(f"- {r.get('label')}: 总检 {e_cnt} 条，{status}")
            examples = r.get("examples", [])
            if examples and v_cnt > 0:
                samples = [f"{x.get('cell', '')} (值: {x.get('value', '')})" for x in examples[:5] if x.get("cell")]
                rule_lines.append(f"  典型异常样本: {', '.join(samples)}" + (f" 等共 {v_cnt} 处" if v_cnt > len(samples) else ""))
        sections.append("\n".join(rule_lines))

    # 4. 数据来源
    names = []
    for r in receipts:
        prov = getattr(r, "provenance", {}) or {}
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
    Invokes LLM to synthesize a natural, business-oriented summary based on verified receipts.
    Wraps result with audit details, falling back to deterministic template on any failure.
    """
    if not receipts or (not model and not policy) or not _can_reach_proxy():
        return fallback_text

    facts_digest = build_verified_facts_digest(receipts, prompt)
    if not facts_digest.strip():
        return fallback_text

    system_prompt = (
        "你是一位专业、严谨且富有商业洞察力的高级数据分析专家。\n"
        "请结合用户最初的询问语句，依据下方由底层计算引擎严格核验的事实数据，给出结构清晰、专业得体、条理分明的回答。\n\n"
        "【严格要求】：\n"
        "1. 直接针对用户最初提出的问题进行针对性总结；\n"
        "2. 正文中所提及的所有金额、比例、数量、行号、单元格坐标，必须 100% 依据提供的事实数据，严禁口算篡改或编造未提供的数据；\n"
        "3. 若涉及异常检查，务必明确指明异常类型、异常记录数，并列出关键异常样本（单元格坐标与实际异常值）；\n"
        "4. 输出排版使用优雅规范的 Markdown 格式，条理分明，不要包含任何客套开场白，直接给出分析结论。"
    )

    user_prompt = (
        f"【用户最初提问】:\n{prompt}\n\n"
        f"【底层已核验事实数据】:\n{facts_digest}\n\n"
        "请结合我的提问，给出清晰完整的分析总结回答。"
    )

    try:
        from .llm import call_model_proxy
        timeout = getattr(policy, "single_request_timeout", 20) if policy else 20
        res = call_model_proxy(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model or "default",
            timeout=min(timeout, 30),
            deadline=deadline,
            policy=policy,
            stream_deltas=False
        )
        content = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()

        # 质检：排除空内容、过短回复或未解析的纯 JSON
        if content and len(content) >= 20 and not (content.startswith("{") and content.endswith("}")):
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
        timeout = getattr(policy, "single_request_timeout", 15) if policy else 15
        res = call_model_proxy(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model or "default",
            timeout=min(timeout, 20),
            deadline=deadline,
            policy=policy,
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
