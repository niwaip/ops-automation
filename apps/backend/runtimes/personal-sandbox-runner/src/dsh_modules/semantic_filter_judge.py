"""
LLM-as-a-Judge semantic filter conformance verifier with deterministic caching.
Enables zero-hardcoding alignment between natural language user prompts and executed spreadsheet filters.
"""

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class SemanticFilterJudge:
    _CACHE_DIR = Path("/workspace/.dsh/cache/filter_judgments")
    _FALLBACK_CACHE_DIR = Path("/tmp/.dsh_filter_judgments")

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
    def _cache_path(cls, prompt: str, candidate_filters: List[Dict[str, Any]]) -> Path:
        cache_dir = cls._resolve_cache_dir()
        norm_prompt = prompt.strip().casefold()
        norm_filters = json.dumps(candidate_filters, sort_keys=True, ensure_ascii=False)
        key_str = f"{norm_prompt}::{norm_filters}"
        digest = hashlib.sha256(key_str.encode("utf-8")).hexdigest()
        return cache_dir / f"{digest}.json"

    @classmethod
    def judge_filter_conformance(
        cls,
        prompt: str,
        candidate_filters: List[Dict[str, Any]],
        headers: Optional[Dict[str, str]] = None,
        model: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[bool]:
        """
        Determines whether the executed candidate_filters faithfully implement the
        filtering requirements requested in the user prompt.

        Returns:
            True if filters match user intent.
            False if filters explicitly contradict or distort user intent.
            None if judge is unavailable (e.g. offline, timeout, network failure),
                 prompting safe fallback to heuristic rules.
        """
        if not candidate_filters:
            return None

        # 1. 检查持久化磁盘缓存 (0ms 开销)
        cache_file = cls._cache_path(prompt, candidate_filters)
        if cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(cached_data, dict) and "matched" in cached_data:
                    return bool(cached_data["matched"])
            except Exception as e:
                logger.warning("Failed to read filter judgment cache: %s", e)

        # 2. 判断网络与代理连通性
        try:
            from .analysis_synthesis import _can_reach_proxy
            if not _can_reach_proxy():
                return None
        except Exception:
            return None

        # 3. 构造极简判定 Prompt 调用大模型裁判
        try:
            from .llm import call_model_proxy

            header_list = list(headers.values()) if headers else []
            system_prompt = (
                "你是一个极其严谨的数据分析审计裁判 (LLM Judge)。\n"
                "你的任务是判断工具实际执行的表格数据筛选条件 (Filters) 是否忠实、准确地符合了用户的自然语言指令。\n"
                "原则：\n"
                "1. 允许自然语言同义词与中英文混用（例如：只包含、只要、仅保留、以XX开头等）。\n"
                "2. 若用户指令要求对比、分别统计或汇总多个类别/维度（如“A和B”、“XX与YY”），针对其中某一类别的子表筛选属于符合指令要求的分类核算切片，应当判定为 matched=true。\n"
                "3. 只要筛选逻辑与用户意图一致即为 matched=true。\n"
                "4. 仅在过滤条件与用户指令明显矛盾（如要求排除却做了包含、过滤了无关字段、无筛选要求却错误截断）时返回 matched=false。\n"
                "5. 严格输出标准 JSON 对象，禁止多余闲聊：{\"matched\": true/false, \"reason\": \"简述理由\"}"
            )

            user_prompt = (
                f"【用户最初提问】:\n{prompt}\n\n"
                f"【执行的筛选条件 Filters】:\n{json.dumps(candidate_filters, ensure_ascii=False, indent=2)}\n\n"
                f"【数据表已知字段 Headers】:\n{json.dumps(header_list, ensure_ascii=False)}\n\n"
                "请输出你的裁判判定 JSON："
            )

            res = call_model_proxy(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=model or "default",
                timeout=12,
                deadline=deadline,
                stream_deltas=False
            )

            raw_text = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            # 提取 JSON 对象
            import re
            json_match = re.search(r'\{[^{}]*"matched"\s*:[^{}]*\}', raw_text)
            if json_match:
                parsed = json.loads(json_match.group(0))
                matched = bool(parsed.get("matched"))
                # 写入缓存
                try:
                    cache_file.write_text(
                        json.dumps({"matched": matched, "reason": parsed.get("reason", "")}, ensure_ascii=False),
                        encoding="utf-8"
                    )
                except Exception as e:
                    logger.warning("Failed to write filter judgment cache: %s", e)
                return matched
        except Exception as e:
            logger.warning("SemanticFilterJudge execution failed: %s, falling back to heuristic", e)

        return None


def judge_filter_conformance(
    prompt: str,
    candidate_filters: List[Dict[str, Any]],
    headers: Optional[Dict[str, str]] = None,
    model: Optional[str] = None,
    deadline: Optional[float] = None
) -> Optional[bool]:
    """Convenience helper for SemanticFilterJudge."""
    return SemanticFilterJudge.judge_filter_conformance(
        prompt=prompt,
        candidate_filters=candidate_filters,
        headers=headers,
        model=model,
        deadline=deadline
    )
