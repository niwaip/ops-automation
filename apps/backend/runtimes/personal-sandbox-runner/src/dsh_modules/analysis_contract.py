"""
AnalysisContract: Task-level contract declaration.
Deconstructs user queries into explicit, structured evaluation goals.
Uses optional domain vocabularies to supplement generic operation contracts.
"""

import re
import json
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from .analysis_semantics import domain_definitions, select_domain


@dataclass
class MetricRequirement:
    name: str
    aliases: List[str]
    expected_type: str = "number"  # "number" | "percentage" | "text"
    period: Optional[str] = None
    required: bool = True
    semantic_id: Optional[str] = None


@dataclass
class AnalysisContract:
    raw_prompt: str
    period: Optional[str] = None
    currency: Optional[str] = None
    metrics: List[MetricRequirement] = field(default_factory=list)
    is_audit_intent: bool = False
    is_catalog_only: bool = False
    is_advisory_intent: bool = False
    is_explicit_calc: bool = False
    operation: Optional[str] = None  # "argmax" | "argmin" | "summary" | "audit"
    dimension: Optional[str] = None  # "month" | "year" | "category"
    comparison: Optional[str] = None  # "variance" | "budget_vs_actual" | "yoy"
    comparison_basis: Optional[str] = None  # budget | cross_metric | yoy | mom; None requires data context
    ranking: str = "absolute"  # absolute | signed | rate
    concepts: List[str] = field(default_factory=list)
    domain: str = "generic"


    @property
    def has_metrics(self) -> bool:
        return len(self.metrics) > 0

    def get_metric_names(self) -> List[str]:
        return [m.name for m in self.metrics]


def required_analysis_capabilities(contract):
    _, definitions = domain_definitions(contract.domain)
    return {name for definition in definitions if definition['name'] in contract.concepts
            for name in definition['capabilities']}


def build_analysis_contract(prompt: str, domain: Optional[str] = None) -> AnalysisContract:
    """
    Parses a user query into a dynamic AnalysisContract.
    Extracts recognized metrics and operation hints; source context resolves the schema.
    """
    if not prompt:
        return AnalysisContract(raw_prompt="")

    clean_prompt = prompt.strip()
    active_domain = select_domain(clean_prompt, domain)
    metric_definitions, concept_definitions = domain_definitions(active_domain)

    # 1. 识别时间区间/年份 (如 2026年 / 2026 / 2025Q1)
    period = None
    m_year = re.search(r'(?<!\d)(20\d\d)(?!\d)(?:年)?(?:\s*(?:上半年|下半年|Q[1-4]|季度|月份|月))?', clean_prompt)
    if m_year:
        period = m_year.group(0)

    # 2. 识别是否仅为目录概览提问
    catalog_keywords = [
        "有哪些sheet", "有哪些表", "有哪些工作表", "什么sheet", "列出sheet",
        "列出工作表", "每个sheet用途", "sheet用途", "工作表用途", "sheet清单",
        "工作表清单", "目录", "包含哪些表"
    ]
    is_catalog_only = (any(k in clean_prompt.lower() for k in catalog_keywords)
                       or bool(re.search(r'列出.{0,15}(?:sheet|工作表)',clean_prompt,re.I))) and not any(
        k in clean_prompt for k in ["收入", "利润", "金额", "计算", "核算", "总结", "统计", "分析", "查重"]
    )

    # 2.5 识别操作、维度与比较意图 (如: 找出偏差最大的月份 / 最大偏差 / 哪个月份差异最大)
    operation = None
    dimension = None
    comparison = None

    if re.search(r'(?:最大|最高|最低|最小|极值|最显著|偏差最大|差异最大|偏差率最大|超额最多)', clean_prompt):
        if re.search(r'(?:最低|最小|欠额最多|落后最多)', clean_prompt):
            operation = "argmin"
        else:
            operation = "argmax"

    if re.search(r'(?:月份|按月|各月|哪个月|哪月|月度|各月份)', clean_prompt):
        dimension = "month"

    if re.search(r'(?:偏差|差异|差额|实际.*预算|预算.*实际|达成率|偏离)', clean_prompt):
        comparison = "variance"

    comparison_basis = None
    if "同比" in clean_prompt:
        comparison_basis = "yoy"
    elif "环比" in clean_prompt:
        comparison_basis = "mom"
    elif re.search(r'预算|目标值|计划值', clean_prompt):
        comparison_basis = "budget"

    ranking = "rate" if re.search(r'偏差率|差异率|达成率', clean_prompt) else "absolute"
    if re.search(r'正向|负向|超额|缺口|不足', clean_prompt):
        ranking = "signed"
        if re.search(r'负向|缺口|不足', clean_prompt):
            operation = "argmin"

    # 2.8 识别定性咨询/管理建议意图与显式计算动词
    advisory_patterns = [
        r'(?:提出|给出|提供|有哪些|列出|整理|提)\s*(?:\d+条)?.*(?:建议|措施|策略|对策|方案|方向|意见)',
        r'(?:财务|经营|业务|管理|成本|费用|战略|运营|风控|内控|整改|落地|改善|优化|改进).*(?:建议|措施|策略|对策|方案|方向)',
        r'(?:如何|怎样|怎么|怎样做|如何做)\s*(?:提升|提高|改善|优化|降低|控制|减少|加强|规避|扭亏|促进|做好|解决|扭转)',
        r'(?:管理建议|财务建议|经营建议|改善建议|优化建议|改进建议|整改建议|落地建议|业务建议)',
        r'(?:经营风险|财务风险|业务风险|合规风险).*(?:防范|应对|建议|对策|措施)',
        r'\b(?:recommendations?|suggestions?|actionable advice|strategic advice|how to improve|how to reduce)\b',
    ]
    is_advisory = any(bool(re.search(pat, clean_prompt, re.I)) for pat in advisory_patterns)
    is_explicit_calc = bool(re.search(r'(?:计算|核算|求|统计|算一下|汇总|查重|对账|检验|勾稽|识别.*异常|\b(?:calculate|compute|reconcile|audit)\b)', clean_prompt, re.I))

    # 3. 识别是否为审计/查重意图
    audit_keywords = [
        "查重", "重复", "重复凭证", "重号", "核对", "稽核", "勾稽", "检验", "对账",
        "最大绝对偏差", "最大偏差", "偏差最大", "绝对偏差", "异常凭证",
        "缺失", "漏填", "空值", "未填", "缺失字段"
    ]
    is_audit = any(k in clean_prompt for k in audit_keywords)

    # 4. 动态匹配请求的指标
    requested_metrics: List[MetricRequirement] = []
    matched_names = set()

    for m_def in metric_definitions:
        for p in m_def["patterns"]:
            if re.search(p, clean_prompt):
                metric_name = m_def["name"]
                if metric_name not in matched_names:
                    matched_names.add(metric_name)
                    requested_metrics.append(MetricRequirement(
                        name=metric_name,
                        aliases=m_def["patterns"],
                        expected_type=m_def["expected_type"],
                        period=period,
                        semantic_id=m_def.get("id"),
                    ))
                break

    concepts=[]
    for definition in concept_definitions:
        if not any(re.search(p,clean_prompt,re.I) for p in definition['patterns']):continue
        if definition['name'] not in concepts:concepts.append(definition['name'])
        for name in definition['required_metrics']:
            if name in matched_names:continue
            metric=next(m for m in metric_definitions if m['name']==name)
            requested_metrics.append(MetricRequirement(name=name,aliases=metric['patterns'],
                                    expected_type=metric['expected_type'],period=period,semantic_id=metric.get('id')))
            matched_names.add(name)

    # 5. 通用后备匹配：检测类似于 "统计X金额" / "计算X总额" 的通用需求
    if not requested_metrics and not is_catalog_only:
        m_generic = re.search(r'(?:统计|计算|核算|汇总|求)\s*([^\s，。！？、]{2,8}(?:金额|数量|费用|成本|总额|比率|率|均值))', clean_prompt)
        if m_generic:
            custom_metric = m_generic.group(1).strip()
            requested_metrics.append(MetricRequirement(
                name=custom_metric,
                aliases=[re.escape(custom_metric)],
                expected_type="number",
                period=period,
            ))

    # 6. 定性咨询场景中，匹配到的指标（如“如何提升毛利率”中的毛利率）属于咨询议题，而非底层公式取数
    if is_advisory and not is_explicit_calc:
        for m in requested_metrics:
            if m.name not in concepts:
                concepts.append(m.name)
        requested_metrics = []

    # Explicit relations apply to any recognized metric pair, not a particular
    # revenue/profit question. A conjunction alone does not declare subtraction.
    for left in requested_metrics:
        for right in requested_metrics:
            if left.name == right.name:
                continue
            lhs, rhs = "(?:" + "|".join(left.aliases) + ")", "(?:" + "|".join(right.aliases) + ")"
            arithmetic = re.search(lhs + r'\s*(?:[-−]|减去?|减)\s*' + rhs, clean_prompt)
            between = re.search(lhs + r'\s*[与和、]\s*' + rhs + r'.{0,8}(?:两者|之间).{0,8}(?:差值|差额|差距|偏差)', clean_prompt)
            if arithmetic or (between and "预算" not in clean_prompt):
                comparison_basis, comparison = "cross_metric", "variance"

    return AnalysisContract(
        raw_prompt=clean_prompt,
        period=period,
        metrics=requested_metrics,
        is_audit_intent=is_audit,
        is_catalog_only=is_catalog_only,
        is_advisory_intent=is_advisory,
        is_explicit_calc=is_explicit_calc,
        operation=operation,
        dimension=dimension,
        comparison=comparison,
        comparison_basis=comparison_basis,
        ranking=ranking,
        concepts=concepts,
        domain=active_domain,
    )


def build_advisory_guidance(contract: AnalysisContract) -> str:
    """Builds expert advisory guidance for qualitative consulting tasks."""
    topics = "、".join(contract.concepts) if contract.concepts else ""
    topic_clause = f"（核心关注议题：{topics}）" if topics else ""
    is_finance = contract.domain == "finance" or any(k in contract.raw_prompt for k in ["财务", "利润", "收入", "费用", "成本", "资金", "盈利"])
    domain_label = "财务与经营" if is_finance else ("商贸与供应链" if contract.domain == "commerce" else "经营与业务")
    data_hint = "（如关键财务指标、利润率趋势及核验结果等）" if is_finance else "（如核心业务指标、趋势变化及数据核查结果等）"
    return (
        f"\n\n【{domain_label}管理咨询规范】{topic_clause}\n"
        "当前任务属于定性分析、管理建议或业务策略咨询。\n"
        f"1. 请充分结合当前会话历史中已核验的数据指标与分析结论{data_hint}或文件背景，针对用户的问题提出专业、深入且切实可行的管理建议与举措；\n"
        "2. 建议应具备高度可操作性，可从业务拓展、成本与费用管控、风险防范与流程规范等具体维度展开，明确举措与管理价值；\n"
        "3. 输出排版使用清晰规范的 Markdown 格式，条理分明，语言专业精炼；无需调用表格核算工具，直接输出分析与建议结论。"
    )


def build_analysis_plan_context(prompt: str) -> str:
    """Expose parsed task requirements to planning, without choosing source columns."""
    contract = build_analysis_contract(prompt)
    if not supports_column_comparison(contract):
        return ""
    requirements = {
        "metrics": [{"name": m.name, "type": m.expected_type} for m in contract.metrics],
        "operation": contract.operation, "dimension": contract.dimension,
        "period": contract.period, "basis": contract.comparison_basis or "unresolved",
        "ranking": contract.ranking,
    }
    return (
        "\n\n【Analysis Task Requirements】\n" + json.dumps(requirements, ensure_ascii=False)
        + "\nThese are parsed task requirements, not calculated results. Confirm them against the user's request. "
        "Select actual source headers/ranges and a justified comparison baseline. "
        "When the baseline is unresolved and the source supplies one complete actual/budget candidate, "
        "follow the selected skill's budget default and state that basis. Explicit user baselines take precedence. "
        "Compute EACH requested metric separately unless the request explicitly specifies a cross-metric difference. "
        "Do not replace numeric difference extrema with a profit margin, ratio or a different baseline. "
        "Use read_file if source structure is uncertain, then compare_spreadsheet_columns; interpret its successful result. "
        "Keep the signed difference distinct from its absolute magnitude, which cannot be negative. "
        "Answer the requested extrema concisely from the verified results. Additional rankings or causal explanations "
        "require separate supporting data; do not invent them."
    )


def supports_column_comparison(contract: AnalysisContract) -> bool:
    """Capability check based on declared operations and value types, not question text."""
    return (contract.operation in ("argmax", "argmin") and contract.comparison == "variance"
            and contract.has_metrics and all(m.expected_type == "number" for m in contract.metrics))
