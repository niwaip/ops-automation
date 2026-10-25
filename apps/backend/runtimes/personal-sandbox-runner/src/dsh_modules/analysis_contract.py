"""
AnalysisContract: Task-level contract declaration.
Deconstructs user queries into explicit, structured evaluation goals.
Uses optional domain vocabularies to supplement generic operation contracts.
"""

import re
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Dict, Any
from .analysis_semantics import domain_definitions, select_domain
from .analysis_request_text import user_instruction as extract_user_instruction


TASK_TYPE_TABULAR_QUERY = "tabular_query"
TASK_TYPE_TABULAR_COMPUTE = "tabular_compute"
TASK_TYPE_TABULAR_AUDIT = "tabular_audit"
TASK_TYPE_TABULAR_OVERVIEW = "tabular_overview"
TASK_TYPE_ADVISORY = "advisory"


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
    is_browse_or_summary: bool = False
    is_explicit_calc: bool = False
    is_detail_query: bool = False
    is_grouped: bool = False
    group_dimension: Optional[str] = None
    operation: Optional[str] = None  # "argmax" | "argmin" | "summary" | "audit"
    dimension: Optional[str] = None  # "month" | "year" | "category"
    comparison: Optional[str] = None  # "variance" | "budget_vs_actual" | "yoy"
    comparison_basis: Optional[str] = None  # budget | cross_metric | yoy | mom; None requires data context
    ranking: str = "absolute"  # absolute | signed | rate
    concepts: List[str] = field(default_factory=list)
    domain: str = "generic"
    has_filters: bool = False
    requires_source_scope_review: bool = False
    scope_requirements: Optional[dict] = None
    task_type: str = TASK_TYPE_TABULAR_COMPUTE
    entity_predicates: List[str] = field(default_factory=list)
    attribute_targets: List[str] = field(default_factory=list)
    limit: Optional[int] = None
    audit_checks: List[str] = field(default_factory=list)


    @property
    def has_metrics(self) -> bool:
        return len(self.metrics) > 0

    def get_metric_names(self) -> List[str]:
        return [m.name for m in self.metrics]


def required_analysis_capabilities(contract):
    _, definitions = domain_definitions(contract.domain)
    return {name for definition in definitions if definition['name'] in contract.concepts
            for name in definition['capabilities']}


_HEADER_RESOLUTION_CACHE: Dict[str, List[str]] = {}


def _resolve_available_headers(prompt: str) -> Optional[List[str]]:
    """Attempts to discover real table headers from session attachments and preflight profiling."""
    try:
        import os
        from . import config as _cfg
        from .spreadsheet_preflight import profile_spreadsheet_for_planning
        raw_att = os.environ.get('DSH_SESSION_ATTACHMENTS', '').strip()
        cache_key = f"{raw_att}::{prompt.strip()}"
        if cache_key in _HEADER_RESOLUTION_CACHE:
            return _HEADER_RESOLUTION_CACHE[cache_key]

        att_files = json.loads(raw_att) if raw_att.startswith('[') else [x.strip() for x in raw_att.split(',') if x.strip()]
        all_headers: List[str] = []
        for fn in att_files:
            if str(fn).lower().endswith(('.xlsx', '.xlsm', '.xls', '.csv')):
                fpath = Path(_cfg.WORKSPACE_DIR) / Path(fn).name
                if fpath.exists():
                    prof = profile_spreadsheet_for_planning(fpath, prompt=prompt)
                    if prof and prof.get('headers'):
                        for h in prof['headers'].values():
                            if h and str(h).strip() and str(h).strip() not in all_headers:
                                all_headers.append(str(h).strip())
        if all_headers:
            _HEADER_RESOLUTION_CACHE[cache_key] = all_headers
            return all_headers
    except Exception:
        pass
    return None


def _contract_from_judge_verdict(prompt: str, verdict: Dict[str, Any], domain: str) -> AnalysisContract:
    """Builds an AnalysisContract directly from LLM-as-a-Judge semantic adjudication."""
    metric_definitions, concept_definitions = domain_definitions(domain)
    metrics: List[MetricRequirement] = []
    seen_metric_names = set()

    for m_name in verdict.get("metrics", []):
        if not m_name or m_name in seen_metric_names:
            continue
        seen_metric_names.add(m_name)
        matched_def = next((
            d for d in metric_definitions
            if d["name"] == m_name or any(re.search(p, m_name) for p in d.get("patterns", []))
        ), None)
        if matched_def:
            metrics.append(MetricRequirement(
                name=matched_def["name"],
                aliases=matched_def.get("patterns", [m_name]),
                expected_type=matched_def.get("expected_type", "number"),
                period=verdict.get("period"),
                semantic_id=matched_def.get("id"),
            ))
        else:
            aliases = [re.escape(m_name), re.escape(m_name) + r'(?:汇总|总额|总计|合计|\([^)]+\)|（[^）]+）)?']
            if any(k in m_name for k in ("工数", "工时", "时间", "时长")):
                aliases.extend([r'时间', r'时长', r'小时', r'时数', r'工数\(小时\)', r'工时\(小时\)'])
            metrics.append(MetricRequirement(
                name=m_name,
                aliases=aliases,
                expected_type="number",
                period=verdict.get("period"),
            ))

    task_type = verdict.get("task_type", TASK_TYPE_TABULAR_COMPUTE)
    is_audit = task_type == TASK_TYPE_TABULAR_AUDIT or bool(verdict.get("is_audit"))
    is_grouped = bool(verdict.get("is_grouped"))
    group_dimension = verdict.get("group_dimension")
    entity_predicates = [str(e) for e in verdict.get("entity_predicates", []) if e and str(e).strip()]
    filter_conditions = [str(f) for f in verdict.get("filter_conditions", []) if f and str(f).strip()]
    audit_checks = [str(c) for c in verdict.get("audit_checks", []) if c and str(c).strip()]

    attribute_targets = []
    for pat in [r'(?:工数|工时|单价|金额|产值|费用|成本|收入|明细|实绩|记录|小时|用量|数量|数据)']:
        for m in re.finditer(pat, prompt):
            val = m.group(0).strip()
            if val and val not in attribute_targets:
                attribute_targets.append(val)

    concepts = []
    for definition in concept_definitions:
        if any(re.search(p, prompt, re.I) for p in definition.get('patterns', [])):
            concepts.append(definition['name'])

    return AnalysisContract(
        raw_prompt=prompt,
        period=verdict.get("period"),
        metrics=metrics,
        is_audit_intent=is_audit,
        is_catalog_only=task_type == TASK_TYPE_TABULAR_OVERVIEW,
        is_advisory_intent=task_type == TASK_TYPE_ADVISORY,
        is_detail_query=task_type == TASK_TYPE_TABULAR_QUERY,
        is_grouped=is_grouped,
        group_dimension=group_dimension,
        operation=verdict.get("operation"),
        dimension=verdict.get("dimension"),
        comparison=verdict.get("comparison"),
        comparison_basis=verdict.get("comparison_basis"),
        ranking=verdict.get("ranking", "absolute"),
        domain=domain,
        has_filters=bool(filter_conditions),
        requires_source_scope_review=bool(verdict.get('period')),
        scope_requirements={'period': verdict.get('period'), 'conditions': filter_conditions,
                            'entities': entity_predicates, 'group_dimension': group_dimension},
        task_type=task_type,
        entity_predicates=entity_predicates,
        attribute_targets=attribute_targets,
        limit=verdict.get("limit"),
        audit_checks=audit_checks,
        concepts=concepts,
    )


def build_analysis_contract(
    prompt: str,
    domain: Optional[str] = None,
    headers: Optional[List[str]] = None
) -> AnalysisContract:
    """
    Parses a user query into a dynamic AnalysisContract.
    Prioritizes zero-hardcoding SemanticContractJudge (LLM-as-a-Judge) with persistent caching,
    falling back to structural baseline for offline unit testing.
    """
    if not prompt:
        return AnalysisContract(raw_prompt="")

    clean_prompt = extract_user_instruction(prompt)
    active_domain = select_domain(clean_prompt, domain)

    # 1. 尝试从前置探测与会话附件中自动发现已知表头
    if headers is None:
        headers = _resolve_available_headers(clean_prompt)

    # 2. 优先调用 LLM-as-a-Judge 进行语义契约裁决（带磁盘持久化缓存，0ms 复用）
    # 当有真实表格上下文(headers)且可连接代理时，启用智能裁判；无表格附件的纯单测文本直接走快速基线
    if headers:
        try:
            from .analysis_synthesis import _can_reach_proxy
            if _can_reach_proxy():
                from .semantic_contract_judge import judge_contract_intent
                verdict = judge_contract_intent(clean_prompt, headers=headers, domain=active_domain)
                if verdict and isinstance(verdict, dict) and "task_type" in verdict:
                    return _contract_from_judge_verdict(clean_prompt, verdict, active_domain)
        except Exception:
            pass

    # 3. 离线/单测容灾兜底
    return _build_fallback_contract(prompt, domain)


def _build_fallback_contract(prompt: str, domain: Optional[str] = None) -> AnalysisContract:
    """
    Parses a user query into a dynamic AnalysisContract.
    Extracts recognized metrics and operation hints; source context resolves the schema.
    """
    if not prompt:
        return AnalysisContract(raw_prompt="")

    clean_prompt = extract_user_instruction(prompt)
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

    # 2.7 识别分组/分类汇总维度 (Group By / Breakdown)
    GROUP_CONNECTOR = r'(?:按(?:照)?|用|以|依据|根据|基于)'
    AGG_ACTION = r'(?:分组|汇总|统计|分类|求和|计算|分析|归集)'
    is_grouped = bool(re.search(
        rf'(?:{GROUP_CONNECTOR}\s*[^，。！？、;；\n]{{1,20}}?(?:{AGG_ACTION}|前\d+个[字符|字母]|前两位|前两位字母)|每组|各组|各类别|各个|逐组|分别统计|按组|分部门|各部门|各项目|各员工|各人员)',
        clean_prompt
    ))
    group_dimension = None
    m_grp = re.search(
        rf'{GROUP_CONNECTOR}\s*[“"\'\`]?([^\s，。！？、;；\n()（）"\'\`]{{1,30}}?)[”"\'\`]?\s*(?:进行)?{AGG_ACTION}',
        clean_prompt
    )
    if m_grp:
        group_dimension = re.sub(r'的$', '', m_grp.group(1).strip())
    elif "每组" in clean_prompt or "各组" in clean_prompt:
        group_dimension = "分组"
    elif re.search(r'分部门|各部门', clean_prompt):
        group_dimension = "部门"
    elif re.search(r'分项目|各项目', clean_prompt):
        group_dimension = "项目"

    # 若抓取到的维度实际上是数据来源/介词指代（如 "根据工作簿计算", "依据附件计算", "根据表格统计"），排除伪分组
    if group_dimension and any(k in group_dimension for k in ('工作簿', '工作表', '表格', '附件', '文件', '数据', '原件', '模型', '系统', '规则')):
        group_dimension = None
        is_grouped = bool(re.search(r'每组|各组|各类别|各个|逐组|分别统计|按组|分部门|各部门|各项目|各员工|各人员', clean_prompt))

    # 若抓取到的维度实际上是算术公式说明（如 "按全年利润除以全年收入计算"），排除伪分组
    if group_dimension and re.search(r'除以|乘以|加上|减去|[-+*/]|口径|公式|规则|方法', group_dimension):
        group_dimension = None
        is_grouped = bool(re.search(r'每组|各组|各类别|各个|逐组|分别统计|按组|分部门|各部门|各项目|各员工|各人员', clean_prompt))

    # 识别以疑问词引导的维度枚举查询（如 "有哪些部门", "工数超过100小时的有哪些员工", "有哪些项目"）
    m_interrogative_dim = re.search(r'(?:有哪些|哪几个|哪几家|列出所有|查询所有)\s*(部门|员工|人员|项目|客户)', clean_prompt)
    if not m_interrogative_dim:
        m_interrogative_dim = re.search(r'(部门|员工|人员|项目|客户)[^\s，。！？、;；]{0,10}?(?:有哪些|哪几个|哪几家)', clean_prompt)
    if not group_dimension and m_interrogative_dim:
        group_dimension = m_interrogative_dim.group(1).strip()
        is_grouped = True

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
    is_explicit_calc = bool(re.search(r'(?:计算|核算|求和|求出|求解|统计|算一下|汇总|合计|总计|加总|累加|合算|查重|对账|检验|勾稽|识别.*异常|\b(?:calculate|compute|reconcile|audit|sum|total)\b)', clean_prompt, re.I))

    # 2.9 识别行记录与明细查询意图 (Detail / Row-level Records Query)
    # 提取真实用户指令（剔除系统附加的附件前缀元数据，避免附件名中的“明细”干扰意图识别）
    user_instruction = clean_prompt

    # 剥离文件名/表名引用
    text_for_detail = re.sub(r'[^\s/\\<>\'"`]+\.(?:xlsx|xls|csv|docx|doc|pdf|txt|json)\b', ' ', user_instruction, flags=re.I)
    text_for_detail = re.sub(r'《[^》]+》', ' ', text_for_detail)
    text_for_detail = re.sub(r'【[^】]+】', ' ', text_for_detail)

    detail_query_patterns = [
        r'(?:明细|清单|记录|详情|哪几条|哪几笔|具体哪|每一条|每一笔|所有记录|全部记录|明细行|明细数据|明细列表)',
        r'\b(?:list|details?|records?|rows?|breakdown records)\b',
    ]
    has_explicit_agg_verb = bool(re.search(r'(?:求和|总计|合计|汇总|平均|均值|占比|比率|总额|总工数|总金额|计算.*总|统计)', user_instruction))
    has_explicit_detail_requirement = bool(re.search(r'(?:明细行|逐行|每条记录|每一笔|具体哪几笔|明细清单|明细表格|明细列表|全部记录|所有记录)', text_for_detail))
    is_pure_detail_keyword = any(bool(re.search(pat, text_for_detail, re.I)) for pat in detail_query_patterns)

    if is_grouped or (has_explicit_agg_verb and not is_pure_detail_keyword):
        is_detail_query = has_explicit_detail_requirement
    elif has_explicit_agg_verb and is_pure_detail_keyword:
        is_detail_query = has_explicit_detail_requirement or bool(re.search(r'查看.*明细|查.*明细|列出.*明细|展示.*明细|看.*明细', text_for_detail))
    else:
        is_detail_query = is_pure_detail_keyword

    # 3. 识别是否为审计/查重/异常筛查意图
    audit_keywords = [
        "查重", "重复", "重复凭证", "重号", "核对", "稽核", "勾稽", "检验", "对账",
        "最大绝对偏差", "最大偏差", "偏差最大", "绝对偏差", "异常", "筛查", "排查",
        "缺失", "漏填", "空值", "未填", "缺失字段"
    ]
    is_audit = any(k in clean_prompt.replace('不重复', '') for k in audit_keywords)

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
    if {'data_quality', 'reconciliation'} & set(concepts):
        is_audit = True

    # 5. 通用后备匹配：检测类似于 "统计X金额" / "计算X总额" / "汇总金额和工数" 的通用需求
    if not requested_metrics and not is_catalog_only and not (is_detail_query and not has_explicit_agg_verb and not is_explicit_calc):
        peel_prefixes = (
            r'^(?:(?:各|该|所有)?(?:附件|工作表|表格|文件|数据|表内|其中|对应|相关|上述)(?:[中里内])?(?:的)?|'
            r'(?:每|每个|各|各个|该|所有|逐)?(?:组|类别|部门|中心|项目)(?:的)?|'
            r'(?:各|该)?明细(?:的)?|'
            r'[和及与、并]|'
            r'的)+'
        )
        # 兼容中文共享后置度量语法，如 "有偿和无偿金额" -> 展开匹配 "有偿金额" 与 "无偿金额"
        measure_pattern = r'金额|数量|费用|成本|总额|比率|均值|工数|工时|时间|时长|单价|明细条数|条数|行数|记录数|笔数|计数'
        def _expand_shared_measure(m):
            w1, w2, meas = m.group(1), m.group(2), m.group(3)
            if re.search(f'(?:{measure_pattern})$', w1):
                return m.group(0)
            if any(k in w1 for k in ('范围', '表头', '名称', '工作表', '依据')):
                return m.group(0)
            return f'{w1}{meas}和{w2}{meas}'

        expanded_target_prompt = re.sub(
            r'([^\s，。！？、()（）和及与并]{1,8})[和与及并]([^\s，。！？、()（）和及与并]{1,8})(' + measure_pattern + r')',
            _expand_shared_measure,
            clean_prompt
        )
        normalized_target_prompt = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', expanded_target_prompt)
        # 匹配动词引导或连词连接的数值度量（如 金额、工数、工时、数量、费用、成本、总额、单价、比率、明细条数等）
        matches = list(re.finditer(
            r'(?:(?:统计|计算|核算|汇总|求|列出|分析)\s*|[和及与、并]\s*)'
            r'([^\s，。！？、()（）和及与、并]{0,12}(?:' + measure_pattern + r'))',
            expanded_target_prompt
        ))
        if normalized_target_prompt != expanded_target_prompt:
            matches.extend(list(re.finditer(
                r'(?:(?:统计|计算|核算|汇总|求|列出|分析)\s*|[和及与、并]\s*)'
                r'([^\s，。！？、()（）和及与、并]{0,12}(?:' + measure_pattern + r'))',
                normalized_target_prompt
            )))
        # 兼容中文动宾倒装句式，如“进行金额的统计”、“针对工数进行汇总”、“做部门费用的核算”
        inverted_matches = list(re.finditer(
            r'(?:进行|做|针对|开展|对)\s*'
            r'([^\s，。！？、()（）和及与、并]{0,12}(?:' + measure_pattern + r'))\s*(?:的)?\s*(?:进行|做)?\s*'
            r'(?:统计|计算|核算|汇总|求和|分析)',
            expanded_target_prompt
        ))
        if normalized_target_prompt != expanded_target_prompt:
            inverted_matches.extend(list(re.finditer(
                r'(?:进行|做|针对|开展|对)\s*'
                r'([^\s，。！？、()（）和及与、并]{0,12}(?:' + measure_pattern + r'))\s*(?:的)?\s*(?:进行|做)?\s*'
                r'(?:统计|计算|核算|汇总|求和|分析)',
                normalized_target_prompt
            )))
        matches.extend(inverted_matches)
        # 兼容“查看/展示/给出 [度量1] 和 [度量2] 的 合计/总计/汇总/求和”等后置聚合句式（仅在前序未识别到度量时兜底识别）
        if not matches:
            m_trailing_agg = re.search(r'(?:的)?\s*(?:合计|总计|汇总|求和|加总|累加|均值|平均)\b', expanded_target_prompt)
            if m_trailing_agg:
                prefix_part = expanded_target_prompt[:m_trailing_agg.start()]
                trailing_matches = list(re.finditer(
                    r'(?:[和及与、并\s]|^)([^\s，。！？、()（）和及与、并]{0,8}(?:' + measure_pattern + r'))(?=[和及与、并\s]|$)',
                    prefix_part
                ))
                matches.extend(trailing_matches)
        found_metrics = []
        for m_item in matches:
            raw_metric = m_item.group(1).strip()
            # A numeric literal followed by a measure (e.g. an expected empty-result
            # value) is not another requested source column. Keep numeric field
            # qualifiers such as years or alphanumeric product names intact.
            if re.fullmatch(r'[-+]?\d+(?:\.\d+)?\s*(?:金额|数量|费用|成本|总额|比率|均值|工数|工时|时间|时长|单价|明细条数|条数|行数|记录数|笔数|计数)', raw_metric):
                continue
            clean_metric = re.sub(peel_prefixes, '', raw_metric).strip()
            clean_metric = re.sub(r'部分的?', '', clean_metric).strip()
            if re.search(r'(?:所有不同|不重复|去重|唯一).*?(?:负责|所属)', raw_metric):
                continue  # A categorical column name is not a requested cost metric.
            if not clean_metric:
                clean_metric = raw_metric
            if clean_metric and clean_metric not in [item[0] for item in found_metrics]:
                found_metrics.append((clean_metric, raw_metric))

        for clean_metric, raw_metric in found_metrics:
            aliases = [re.escape(clean_metric)]
            if raw_metric != clean_metric:
                aliases.append(re.escape(raw_metric))
            # 常见衍生形式（如 "金额(K)"、"金额汇总"、"部门A金额"）
            aliases.append(re.escape(clean_metric) + r'(?:汇总|总额|总计|合计|\([^)]+\)|（[^）]+）)?')
            aliases.append(r'[^\s，。！？、]{0,10}' + re.escape(clean_metric))
            if clean_metric in ("时间", "时长"):
                aliases.extend([r'工数', r'工时', r'小时', r'时数', r'工数\(小时\)', r'工时\(小时\)'])
            elif clean_metric in ("工数", "工时"):
                aliases.extend([r'时间', r'时长', r'小时', r'时数'])

            requested_metrics.append(MetricRequirement(
                name=clean_metric,
                aliases=aliases,
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

    # 7. 实体槽位与定向字段查询抽取 (Entity Slots & Attribute Targets)
    entity_predicates = []
    # 7.1 提取编号/代码主键类实体
    for m in re.finditer(r'(?:员工编号|工号|部门编号|BU编号|WBS编号|WBS|项目编号|项目代码|客户编号|订单号|单号|编号|代码|ID)\s*[:：=]?\s*([A-Za-z0-9_-]+)', clean_prompt, re.I):
        val = m.group(1).strip()
        upper_val = val.upper()
        if upper_val and upper_val not in entity_predicates:
            entity_predicates.append(upper_val)
        elif val and val not in entity_predicates:
            entity_predicates.append(val)
    # 提取代码标记 (如 S22014 或 IW-S62662 等典型业务编号)
    for m in re.finditer(r'\b([A-Za-z]\d{4,}|\b[A-Za-z]{2}-[A-Za-z0-9]{4,}(?:-[0-9A-Za-z]+)*)\b', clean_prompt):
        val = m.group(1).strip()
        upper_val = val.upper()
        if upper_val and upper_val not in entity_predicates and not re.match(r'^(?:20\d\d)$', upper_val):
            entity_predicates.append(upper_val)
    # 7.2 提取命名业务实体约束 (如 员工杨烨, 部门華東MIS, 客户将军空调)
    for m in re.finditer(r'(?:员工|人员|用户|同事|部门|客户|项目)\s*[:：=]?\s*([^\s，。！？、;；:：的]{2,15})', clean_prompt):
        val = m.group(1).strip()
        # 排除过滤条件谓词或疑问代词（如 "为空", "是有偿", "缺失", "不存在", "有哪些" 等）
        if re.search(r'为空|缺失|不存在|为0|异常|重复|哪些|什么|谁|哪个|哪家|列表|清单|记录', val) or val.startswith(('是', '为', '非', '不', '有', '无')):
            continue
        # 1. 结构化判定：若处于分组连词（用/按/以...）结构中，为聚合维度指定，绝非实体实例
        start_idx = m.start()
        prefix_ctx = clean_prompt[max(0, start_idx - 10):start_idx]
        if re.search(rf'{GROUP_CONNECTOR}\s*$', prefix_ctx):
            continue
        # 2. 若当前已提取分组维度，且 val 与 group_dimension 互为子串（如“部门编码”与“编码”），严禁作为实体约束
        if group_dimension and (val in group_dimension or group_dimension in val):
            continue
        if val and val not in entity_predicates and not any(k in val for k in ["编号", "姓名", "名称", "明细", "数据", "实绩", "工数", "金额", "列表", "情况"]):
            entity_predicates.append(val)
    # 提取逆序组织实体约束 (如 华东MIS部门, 交付中心BU)
    for m in re.finditer(r'([^\s，。！？、;；:：]{2,10}?)(?:部门|分部|BU|组|中心)', clean_prompt):
        val = m.group(1).strip()
        for prefix in ['调出', '查看', '看下', '查询', '统计', '检索', '定位', '筛选']:
            if val.startswith(prefix):
                val = val[len(prefix):].strip()
        if re.search(r'哪些|哪[个家位几]|什么|谁|所有|各个|每个|不同|该|此|所属|负责|对应|列出|按|重复|为空|记录|检查|核验|明细', val):
            continue
        if group_dimension and (val in group_dimension or group_dimension in val):
            continue
        if val and val not in entity_predicates:
            entity_predicates.append(val)

    if group_dimension:
        entity_predicates = [
            e for e in entity_predicates
            if e != group_dimension and e not in group_dimension and group_dimension not in e
        ]

    # 7.3 提取关注的明细与度量属性
    attribute_targets = []
    attribute_patterns = [
        r'(?:工数|工时|单价|金额|产值|费用|成本|收入|明细|实绩|记录|小时|用量|数量|数据)'
    ]
    for pat in attribute_patterns:
        for m in re.finditer(pat, clean_prompt):
            val = m.group(0).strip()
            if val and val not in attribute_targets:
                attribute_targets.append(val)

    LAYOUT_TRIMMING_PATTERN = r'(?:排除|去除|剔除|不包含|去掉|忽略)\s*(?:(?:标题|表头|尾注|报表尾注|表尾|汇总行|合计行|空行|注释|说明行|非数据行|物理行)[、，\s和及与]*)+'
    business_filter_prompt = re.sub(LAYOUT_TRIMMING_PATTERN, '', clean_prompt)
    has_filters = bool(re.search(
        r'(?:不包含|(?<!不)排除|剔除|仅保留|只保留|只包含|仅包含|包含|(?<!不)(?<!无需)过滤|筛选|只要|除了|去掉|去除|限定|以.*结尾|结尾为|结尾是|以.*开头|开头为|开头是|前缀为|前缀是|后缀为|后缀是|大于|小于|高于|低于|不小于|不大于|超过|在.*之间|between|>=|<=|>|<|==|!=)',
        business_filter_prompt
    ))

    # 8. 谓词优先原则判定：有实体约束或特定字段查询时，绝非全表宏观概括，必须走精准查询
    is_targeted_query = bool(entity_predicates or (has_filters and attribute_targets) or (entity_predicates and attribute_targets))

    browse_summary_patterns = [
        r'(?:查看|浏览|阅读|通读|导读|查阅)',
        r'(?:归纳|总结|概括|简述|介绍|梳理|说明|解读)',
        r'(?:讲了什么|说了什么|写了什么|包含什么内容|有什么内容|主要内容|核心内容|大概内容|基本内容|基本情况|情况说明)',
        r'\b(?:overview|summarize|summary|browse|read|brief|inspect content|what is this about)\b',
    ]
    is_browse_or_summary = (
        not is_targeted_query
        and any(bool(re.search(pat, clean_prompt, re.I)) for pat in browse_summary_patterns)
        and not is_explicit_calc
        and not is_audit
        and not requested_metrics
        and not comparison
        and not has_explicit_agg_verb
        and operation not in ("argmax", "argmin")
    )

    # 9. 确定 TaskType 标准意图
    if is_advisory and not is_explicit_calc:
        task_type = TASK_TYPE_ADVISORY
    elif is_audit or operation in ("argmax", "argmin") or comparison:
        task_type = TASK_TYPE_TABULAR_AUDIT
    elif is_detail_query and not has_explicit_agg_verb and not is_explicit_calc:
        task_type = TASK_TYPE_TABULAR_QUERY
    elif is_explicit_calc or requested_metrics or is_grouped:
        task_type = TASK_TYPE_TABULAR_COMPUTE
    elif is_targeted_query or entity_predicates or has_filters or attribute_targets or is_detail_query:
        task_type = TASK_TYPE_TABULAR_QUERY
    elif is_catalog_only or is_browse_or_summary:
        task_type = TASK_TYPE_TABULAR_OVERVIEW
    else:
        task_type = TASK_TYPE_TABULAR_QUERY

    limit = None
    m_limit = re.search(r'(?:取|排|列出|截取|仅保留|只保留)?\s*前\s*([0-9一二两三四五六七八九十]+)\s*(?:组|项|名|条|个(?!字母|字符)|位(?!字母|字符))|top\s*(\d+)', clean_prompt, re.I)
    if m_limit:
        raw_val = m_limit.group(1) or m_limit.group(2)
        digit_map = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
        if raw_val in digit_map:
            limit = digit_map[raw_val]
        elif raw_val and raw_val.isdigit():
            limit = int(raw_val)

    audit_checks = []
    numbered_parts = re.split(r'\s*(?:[1-9][.、]|\b(?:一|二|三|四|五)[.、])\s*', clean_prompt)
    if len(numbered_parts) > 1:
        audit_checks = []
        for part in numbered_parts[1:]:
            cleaned = re.split(r'[；;\n。]', part)[0].strip()
            if cleaned:
                audit_checks.append(cleaned)
    elif re.search(r'(?:合规性?检查|数据质量核验|质检)[：:]', clean_prompt):
        m_audit = re.search(r'(?:合规性?检查|数据质量核验|质检)[：:]\s*(.+?)(?:。|\n|$)', clean_prompt)
        if m_audit:
            audit_checks = [c.strip() for c in re.split(r'[、；;]', m_audit.group(1)) if c.strip()]
    elif re.search(r'分别列出[：:]', clean_prompt):
        m_audit = re.search(r'分别列出[：:]\s*(.+?)(?:。|\n|$)', clean_prompt)
        if m_audit:
            audit_checks = [c.strip() for c in re.split(r'[；;]', m_audit.group(1)) if c.strip()]

    return AnalysisContract(
        raw_prompt=clean_prompt,
        period=period,
        metrics=requested_metrics,
        is_audit_intent=is_audit,
        is_catalog_only=is_catalog_only,
        is_advisory_intent=is_advisory,
        is_browse_or_summary=is_browse_or_summary,
        is_explicit_calc=is_explicit_calc,
        is_detail_query=is_detail_query,
        is_grouped=is_grouped,
        group_dimension=group_dimension,
        operation=operation,
        dimension=dimension,
        comparison=comparison,
        comparison_basis=comparison_basis,
        ranking=ranking,
        concepts=concepts,
        domain=active_domain,
        has_filters=has_filters,
        task_type=task_type,
        entity_predicates=entity_predicates,
        attribute_targets=attribute_targets,
        limit=limit,
        audit_checks=audit_checks,
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
