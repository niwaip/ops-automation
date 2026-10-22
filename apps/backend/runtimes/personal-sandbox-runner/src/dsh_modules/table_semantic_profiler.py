"""
Model-driven table semantic & physical dimension profiling with deterministic caching.
Enables zero-hardcoding semantic understanding of table columns across multiple languages and domains.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Standard Physical Dimension Ontology
PHYSICAL_DIMENSIONS = {
    "currency",       # Monetary amounts (元, 千元, K, 万元, 百万元, M, 亿元, USD, EUR, etc.)
    "duration",       # Time duration / work volume (秒, 分钟, 小时, 工时, 人天, FTE, etc.)
    "count",          # Discrete item counts (件, 条, 人, 次, 笔, 台, etc.)
    "percentage",     # Percentage figures (0-100%, 占比, 增长率, 利润率, etc.)
    "ratio",          # Dimensionless ratio (0.0-1.0)
    "identifier",     # Unique code/ID/key (项目编号, 订单号, 员工ID, etc.)
    "datetime",       # Dates, years, months, timestamps (工数年月, 会计年度, 日期, etc.)
    "categorical",    # Dimensions & attributes (成本中心, 部门, 状态, 客户名称, etc.)
    "general_numeric" # Generic continuous numbers
}

# Unit scaling families bound strictly to physical dimensions
DIMENSION_ALLOWED_UNITS: Dict[str, List[str]] = {
    "currency": ["元", "千元", "K", "k", "万元", "百万元", "M", "m", "亿元", "source", "number"],
    "duration": ["秒", "分钟", "小时", "工时", "h", "H", "天", "人天", "d", "source", "number"],
    "percentage": ["%", "百分点", "source", "number"],
    "ratio": ["ratio", "ratio_delta", "source", "number"],
    "count": ["count", "条", "人", "件", "个", "次", "笔", "source", "number"],
    "general_numeric": ["source", "number"],
    "identifier": ["source", "text"],
    "datetime": ["source", "date", "datetime"],
    "categorical": ["source", "text"],
}


@dataclass
class ColumnProfile:
    column_letter: str
    header_name: str
    physical_dimension: str
    declared_unit: Optional[str] = None
    semantic_role: str = "attribute"  # measure | dimension | identifier | attribute
    allowed_units: Optional[List[str]] = None

    def __post_init__(self):
        if not self.allowed_units:
            self.allowed_units = DIMENSION_ALLOWED_UNITS.get(
                self.physical_dimension, ["source", "number"]
            )


class TableSemanticProfiler:
    _CACHE_DIR = Path("/workspace/.dsh/cache/table_profiles")

    @classmethod
    def _cache_path(cls, file_hash: str, sheet_name: str, header_row: int) -> Path:
        cls._CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key_str = f"{file_hash}:{sheet_name}:{header_row}"
        digest = hashlib.sha256(key_str.encode("utf-8")).hexdigest()
        return cls._CACHE_DIR / f"{digest}.json"

    @classmethod
    def profile_columns(
        cls,
        file_hash: str,
        sheet_name: str,
        header_row: int,
        headers: Dict[str, str],
        sample_rows: List[Dict[str, Any]],
        model_name: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Dict[str, ColumnProfile]:
        """
        Profiles the physical dimensions and semantic roles of all table columns
        via LLM with persistent disk cache. Zero hardcoding of business keywords.
        """
        if not headers:
            return {}

        cache_file = cls._cache_path(file_hash, sheet_name, header_row)
        if cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                profiles = {}
                for col_letter, d in cached_data.items():
                    profiles[col_letter] = ColumnProfile(**d)
                return profiles
            except Exception as e:
                logger.warning("Failed to load cached column profiles: %s", e)

        # Call LLM to perform zero-hardcoding semantic classification
        profiles = cls._profile_via_llm(
            sheet_name=sheet_name,
            headers=headers,
            sample_rows=sample_rows,
            model_name=model_name,
            deadline=deadline
        )

        if not profiles:
            profiles = cls._fallback_profile(headers)

        # Cache the profiled result
        try:
            cache_file.write_text(
                json.dumps(
                    {k: v.__dict__ for k, v in profiles.items()},
                    ensure_ascii=False,
                    indent=2
                ),
                encoding="utf-8"
            )
        except Exception as e:
            logger.warning("Failed to write column profile cache: %s", e)

        return profiles

    @classmethod
    def _profile_via_llm(
        cls,
        sheet_name: str,
        headers: Dict[str, str],
        sample_rows: List[Dict[str, Any]],
        model_name: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[Dict[str, ColumnProfile]]:
        try:
            from .llm import call_model_proxy
            from .config import DEFAULT_PROXY_URL
            from urllib.parse import urlparse
            import socket

            parsed = urlparse(DEFAULT_PROXY_URL)
            if not parsed.hostname:
                return None
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            socket.getaddrinfo(parsed.hostname, port)
        except Exception:
            return None

        system_prompt = (
            "你是一位资深数据架构师与统计物理学家。\n"
            "你的任务是依据给定的表格列名及代表性样本数据，准确推断每一列的物理量纲（physical_dimension）、"
            "声明原件单位（declared_unit）以及在数据分析中的语义角色（semantic_role）。\n\n"
            "【合法的 physical_dimension 枚举】:\n"
            "- currency: 货币金额（如金额、成本、单价、费用、营收、Amount、Cost、Price、K、万元、USD等）\n"
            "- duration: 时间跨度/工数时长（如工数、时数、工时、FTE、Hours、Days、Duration等）\n"
            "- count: 离散实体计数（如人数、件数、条数、数量、Qty、Headcount等）\n"
            "- percentage: 百分比（如占比、完成率、毛利率、Rate%等）\n"
            "- ratio: 无量纲比率/系数（0.0 ~ 1.0）\n"
            "- identifier: 业务编号/代码/主键（如项目编号、工号、订单号、ID等）\n"
            "- datetime: 日期、年月或时刻（如工数年月、会计年度、日期、时间戳等）\n"
            "- categorical: 分类与维度属性（如成本中心代码、部门名称、类别、状态等）\n"
            "- general_numeric: 通用连续数值（当无法归属于上述类别时）\n\n"
            "【合法的 semantic_role 枚举】:\n"
            "- measure: 可累加求和/求平均/求极值的业务度量指标\n"
            "- dimension: 用于 group_by 聚合分类的维度列\n"
            "- identifier: 实体唯一性标识\n"
            "- attribute: 辅助文本描述或属性\n\n"
            "【输出格式要求】:\n"
            "请直接输出严格的 JSON 对象，不得包含 Markdown 栅栏或多余说明。\n"
            "根对象包含 columns 数组；每项包含 column_letter、physical_dimension、declared_unit、semantic_role。\n"
            "column_letter 必须取自本次输入 headers 的键；应覆盖所有输入列，不得添加其他列。\n"
            "physical_dimension 和 semantic_role 取上述合法枚举；declared_unit 为该来源明确声明的单位字符串或 null。\n"
            "请依据本次表头和样本逐列推断，不预设任何列位置、字段名称或单位。"

        )

        user_payload = {
            "sheet_name": sheet_name,
            "headers": headers,
            "sample_rows": sample_rows[:5] if sample_rows else []
        }

        try:
            res = call_model_proxy(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}
                ],
                model=model_name or "default",
                timeout=15,
                deadline=deadline,
                stream_deltas=False
            )
            raw = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            parsed = json.loads(raw)

            profiles: Dict[str, ColumnProfile] = {}
            for col_info in parsed.get("columns", []):
                let = col_info.get("column_letter")
                if not let or let not in headers:
                    continue
                dim = col_info.get("physical_dimension")
                if dim not in PHYSICAL_DIMENSIONS:
                    dim = "general_numeric"
                hdr = headers.get(let, "")
                role = col_info.get("semantic_role", "attribute")
                unit = col_info.get("declared_unit")
                profiles[let] = ColumnProfile(
                    column_letter=let,
                    header_name=hdr,
                    physical_dimension=dim,
                    declared_unit=unit,
                    semantic_role=role
                )
            # Ensure every header has an entry
            for let, hdr in headers.items():
                if let not in profiles:
                    profiles[let] = ColumnProfile(
                        column_letter=let,
                        header_name=hdr,
                        physical_dimension="general_numeric",
                        semantic_role="measure"
                    )
            return profiles
        except Exception as e:
            logger.warning("Table profiling via LLM failed, using fallback: %s", e)
            return None

    @classmethod
    def _fallback_profile(cls, headers: Dict[str, str]) -> Dict[str, ColumnProfile]:
        """
        Lightweight fallback profiling when LLM is unavailable.
        Uses structural hints without fragile domain keyword enumerations.
        """
        profiles = {}
        for let, hdr in headers.items():
            dim = "general_numeric"
            role = "measure"
            unit = None

            # Look for unit specified in parenthesis, e.g. "Amount (K)", "Time (hrs)", "Rate (%)"
            import re
            m = re.search(r"[（(]([^()]+)[)）]$", hdr.strip())
            if m:
                cand_u = m.group(1).strip()
                if cand_u in ("%", "百分比"):
                    dim = "percentage"
                    unit = "%"
                elif cand_u in ("K", "k", "千元", "万元", "百万元", "M", "m", "亿元", "元"):
                    dim = "currency"
                    unit = cand_u
                elif cand_u in ("小时", "工时", "h", "H", "天", "人天", "d"):
                    dim = "duration"
                    unit = cand_u

            profiles[let] = ColumnProfile(
                column_letter=let,
                header_name=hdr,
                physical_dimension=dim,
                declared_unit=unit,
                semantic_role=role
            )
        return profiles

    @classmethod
    def format_profiles_for_context(cls, profiles: Dict[str, ColumnProfile]) -> str:
        """Formats the profiled dimensions as readable semantic context for analysis planning."""
        if not profiles:
            return ""
        lines = ["【表格字段物理量纲与语义画像】:"]
        for let in sorted(profiles.keys()):
            p = profiles[let]
            u_str = f"，原件单位: {p.declared_unit}" if p.declared_unit else ""
            lines.append(
                f"- 列 {p.column_letter}【{p.header_name}】: 量纲={p.physical_dimension}{u_str}，"
                f"角色={p.semantic_role}，合法计算输出单位: {', '.join(p.allowed_units[:6])}"
            )
        return "\n".join(lines)
