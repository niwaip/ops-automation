"""LLM-as-a-Judge semantic contract and intent verifier with deterministic disk caching.

Provides zero-hardcoding semantic adjudication for natural language spreadsheet prompts,
distinguishing dimensional breakdowns (Group By) from formula/method explanations,
and distinguishing column quality conditions (e.g. '部门为空') from named business entities.
"""

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class SemanticContractJudge:
    _CACHE_DIR = Path("/workspace/.dsh/cache/contract_judgments")
    _FALLBACK_CACHE_DIR = Path("/tmp/.dsh_contract_judgments")
    _CACHE_VERSION = "v5"

    @classmethod
    def _resolve_cache_dir(cls) -> Path:
        for p in (cls._CACHE_DIR, cls._FALLBACK_CACHE_DIR):
            try:
                p.mkdir(parents=True, exist_ok=True)
                return p
            except OSError:
                continue
        return cls._FALLBACK_CACHE_DIR

    @classmethod
    def _cache_path(cls, prompt: str, headers: Optional[List[str]] = None) -> Path:
        cache_dir = cls._resolve_cache_dir()
        norm_prompt = prompt.strip().casefold()
        h_str = ",".join(sorted(str(h) for h in headers)) if headers else ""
        digest = hashlib.sha256(f"{cls._CACHE_VERSION}::{norm_prompt}::{h_str}".encode("utf-8")).hexdigest()
        return cache_dir / f"{digest}.json"

    @classmethod
    def judge_contract_intent(
        cls,
        prompt: str,
        headers: Optional[List[str]] = None,
        domain: Optional[str] = None,
        model: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """Judges the semantic intent of a user prompt for spreadsheet analysis.

        Returns:
            Dict containing:
                task_type (str): tabular_compute | tabular_query | tabular_audit | tabular_overview | advisory
                is_grouped (bool): whether query requires breakdown by a categorical dimension.
                group_dimension (Optional[str]): the categorical column/dimension to group by.
                is_audit (bool): whether query is an audit/anomaly/quality check on table rows.
                entity_predicates (List[str]): specific named business entity targets (e.g. employee names, entity IDs).
                metrics (List[str]): requested measurement columns or metrics.
                filter_conditions (List[str]): filtering conditions or data quality criteria.
                audit_checks (List[str]): discrete items to check if an audit task.
                period (Optional[str]): year/period filter.
                limit (Optional[int]): top N limit.
            None if judge is unavailable (e.g. offline, timeout), prompting structural heuristic fallback.
        """
        if not prompt or not prompt.strip():
            return None

        # 1. 检查持久化磁盘缓存 (0ms 开销)
        cache_file = cls._cache_path(prompt, headers)
        if cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(cached_data, dict) and "is_grouped" in cached_data:
                    return cached_data
            except Exception as e:
                logger.warning("Failed to read contract judgment cache: %s", e)

        # 2. 判断网络与代理连通性
        try:
            from .analysis_synthesis import _can_reach_proxy
            if not _can_reach_proxy():
                return None
        except Exception:
            return None

        # 3. 构造判定 Prompt 调用大模型裁判
        try:
            from .llm import call_model_proxy
            from .runtime_policy import RuntimePolicy
            from dataclasses import replace

            judge_policy = replace(RuntimePolicy.from_env(), model_max_retries=0, thinking=False,
                                   reasoning_effort=None, max_tokens=1200)

            system_prompt = (
                "你是一个专业的数据分析任务意图与契约审计裁判 (LLM Contract Judge)。\n"
                "根据用户的自然语言指令以及关联数据表的真实表头字段（Headers），准确分析用户的计算分析意图，输出严格的标准 JSON：\n\n"
                "【判断准则】:\n"
                "1. 任务类型 (task_type):\n"
                "   - 'tabular_compute': 数据聚合计算（如求和、计数、计算率值、极值、对比）。注意：若指令涉及基于明细数据进行统计核算以更新表格、回填预测、复制Sheet写盘（如'更新工数管理'、'复制sheet生成新sheet更新预测'），其分析核算核心属于 'tabular_compute'，严禁误判为 'advisory'！\n"
                "   - 'tabular_query': 查询/列出具体明细行记录（如某人的全部工时、某类订单明细）。\n"
                "   - 'tabular_audit': 查重、找空值、数据校验、异常排查、勾稽核对。\n"
                "   - 'tabular_overview': 工作表目录、结构概览。\n"
                "   - 'advisory': 纯定性咨询、管理建议（完全不需要表格取数或数据核算，如'如何提升项目交付质量'、'给管理层的建议'）。\n"
                "2. 分组聚合 (is_grouped & group_dimension):\n"
                "   - 当用户要求按分类字段拆分统计，或提问'有哪些部门/哪些员工/哪些项目'并伴随'合计/总计/平均/超过XX'时，is_grouped 为 true，group_dimension 填对应的真实表头字段（例如'部门名称'、'员工姓名'）。\n"
                "   - 用户描述全局算式（如'按全年利润除以全年收入计算'）不是按维度分组，is_grouped 必须为 false，group_dimension 必须为 null。\n"
                "3. 实体目标 (entity_predicates):\n"
                "   - 用户明确指定查询的特定业务个体（如人名'杨烨'、特定机构'華東MIS'、特定单号'V2026-0001'）。\n"
                "   - 疑问代词（'有哪些'、'哪几个'、'谁'、'什么'、'哪些'）绝对不是实体！必须返回空列表 []。\n"
                "4. 计算指标 (metrics):\n"
                "   - 保留用户点名的全部业务度量。仅在业务含义相同时映射为表头列名；不要把取值列或期间列替代业务指标。\n"
                "   - 严禁将表头中的全部候选列（如'收入预算','收入实际','收入差异'）一股脑全量塞入metrics！metrics只提取用户明确询问的核心业务指标（如'收入','净利润'）。\n"
                "   - 报表可能是行式结构：业务指标写在行标签中，列名仅表示期间或实际/预算。"
                "这时metrics仍返回用户要求的业务指标，不返回年度金额列名，也不因表头未出现该指标就删除它。\n"
                "   - 同一请求可以包含直接取值与派生计算；需要比率或算术计算时属于tabular_compute，不能整体降成明细查询。\n"
                "   - 严格忠实于用户明确指名的指标名词（例如用户说'工数'，即使附带了'500K'等单位或阈值口径，也绝不能将'工数(小时)'丢弃！若指名'工数'则指标必含'工数(小时)'；若指名'金额'则指标必含'金额(K)'）。\n"
                "5. 极值对比 (operation, dimension, comparison, comparison_basis, ranking):\n"
                "   - 若寻找最大/最小/极值（如'偏差最大的月份'），operation 填 'argmax' 或 'argmin'，dimension 填 'month'，comparison 填 'variance'。\n"
                "   - 对财务/经营预算对比任务，'偏差'默认指实际与预算的偏差（comparison_basis填'budget'），ranking默认填'absolute'（绝对偏差最大）；仅当用户明确指示'A减B'或'A与B两者的差额'且无预算背景时才填'cross_metric'。\n"
                "6. 过滤与审计条件 (filter_conditions & audit_checks):\n"
                "   - 包含的行过滤条件（WHERE）或聚合过滤条件（HAVING）。\n"
                "   - 若为查重/质检任务，列出具体各项检查项目。\n\n"
                "7. 期间(period)：独立识别用户要求的业务期间，即使它已经由取值列限定，也必须保留period。"
                "期间属于来源口径，可以通过列或行条件实现，不要强制臆造一个月份WHERE条件。\n\n"
                "输出严格的标准 JSON 对象，禁止多余闲聊：\n"
                "{\n"
                "  \"task_type\": \"tabular_compute|tabular_query|tabular_audit|tabular_overview|advisory\",\n"
                "  \"is_grouped\": true/false,\n"
                "  \"group_dimension\": \"表头列名或null\",\n"
                "  \"entity_predicates\": [\"特定业务个体名，无则为空列表[]\"],\n"
                "  \"metrics\": [\"度量名称列表\"],\n"
                "  \"filter_conditions\": [\"过滤条件列表\"],\n"
                "  \"audit_checks\": [\"质检检查项列表\"],\n"
                "  \"operation\": \"argmax|argmin|null\",\n"
                "  \"dimension\": \"month|null\",\n"
                "  \"comparison\": \"variance|null\",\n"
                "  \"comparison_basis\": \"budget|cross_metric|yoy|mom|null\",\n"
                "  \"ranking\": \"absolute|signed|rate\",\n"
                "  \"period\": \"年份或期间，无则null\",\n"
                "  \"limit\": null或正整数,\n"
                "  \"reason\": \"简述判断理由\"\n"
                "}"
            )

            user_msg = f"【用户指令】:\n{prompt}"
            if headers:
                user_msg += f"\n\n【表格真实字段 Headers】:\n{json.dumps(headers, ensure_ascii=False)}"

            res = call_model_proxy(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg}
                ],
                model=model or os.environ.get("DSH_MODEL") or "default",
                timeout=20,
                deadline=deadline,
                policy=judge_policy,
                stream_deltas=False
            )

            raw_text = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            import re
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if json_match:
                parsed = json.loads(json_match.group(0))
                if isinstance(parsed, dict) and "is_grouped" in parsed:
                    task_type = str(parsed.get("task_type", "tabular_compute"))
                    if task_type not in ("tabular_compute", "tabular_query", "tabular_audit", "tabular_overview", "advisory"):
                        task_type = "tabular_audit" if parsed.get("is_audit") else ("tabular_compute" if parsed.get("is_grouped") else "tabular_query")
                    verdict = {
                        "task_type": task_type,
                        "is_grouped": bool(parsed.get("is_grouped")),
                        "group_dimension": parsed.get("group_dimension") if parsed.get("group_dimension") not in (None, "null", "") else None,
                        "is_audit": bool(parsed.get("is_audit")) or task_type == "tabular_audit",
                        "entity_predicates": [str(e) for e in parsed.get("entity_predicates", []) if e and str(e).strip()],
                        "metrics": [str(m) for m in parsed.get("metrics", []) if m and str(m).strip()],
                        "filter_conditions": [str(f) for f in parsed.get("filter_conditions", []) if f and str(f).strip()],
                        "audit_checks": [str(c) for c in parsed.get("audit_checks", []) if c and str(c).strip()],
                        "period": parsed.get("period") if parsed.get("period") not in (None, "null", "") else None,
                        "operation": parsed.get("operation") if parsed.get("operation") in ("argmax", "argmin") else None,
                        "dimension": parsed.get("dimension") if parsed.get("dimension") not in (None, "null", "") else None,
                        "comparison": parsed.get("comparison") if parsed.get("comparison") not in (None, "null", "") else None,
                        "comparison_basis": parsed.get("comparison_basis") if parsed.get("comparison_basis") not in (None, "null", "") else None,
                        "ranking": parsed.get("ranking", "absolute"),
                        "limit": parsed.get("limit") if isinstance(parsed.get("limit"), int) else None,
                        "reason": str(parsed.get("reason", ""))[:500]
                    }
                    try:
                        cache_file.write_text(json.dumps(verdict, ensure_ascii=False), encoding="utf-8")
                    except Exception as e:
                        logger.warning("Failed to write contract judgment cache: %s", e)
                    return verdict
        except Exception as e:
            logger.warning("SemanticContractJudge execution failed: %s, falling back to heuristic", e)

        return None


def judge_contract_intent(
    prompt: str,
    headers: Optional[List[str]] = None,
    domain: Optional[str] = None,
    model: Optional[str] = None,
    deadline: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """Convenience helper for SemanticContractJudge."""
    return SemanticContractJudge.judge_contract_intent(
        prompt=prompt,
        headers=headers,
        domain=domain,
        model=model,
        deadline=deadline
    )
