"""
LLM as a Judge for Semantic Intent and Skill Routing Disambiguation.
Activates strictly for high-ambiguity prompts (conflicting intents, negated formats, or blurred boundaries),
providing structured JSON verdicts with deterministic heuristic fallbacks and disk caching.
"""

import os
import re
import json
import time
import tempfile
import hashlib
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class IntentJudge:
    """Dedicated LLM-based Judge for multi-intent disambiguation and negative constraint verification."""

    _PRIMARY_CACHE_DIR = Path("/workspace/.cache/intent_judge")
    _FALLBACK_CACHE_DIR = Path(tempfile.gettempdir()) / "dsh_intent_judge_cache"

    @classmethod
    def _resolve_cache_dir(cls) -> Path:
        for p in (cls._PRIMARY_CACHE_DIR, cls._FALLBACK_CACHE_DIR):
            try:
                p.mkdir(parents=True, exist_ok=True)
                return p
            except OSError:
                continue
        return cls._FALLBACK_CACHE_DIR

    @classmethod
    def _cache_path(cls, prompt: str, attached_files: Optional[List[str]] = None, model: Optional[str] = None) -> Path:
        cache_dir = cls._resolve_cache_dir()
        key_data = {
            "prompt": prompt.strip(),
            "attached_files": sorted(attached_files or []),
            "model": model or "default"
        }
        digest = hashlib.sha256(json.dumps(key_data, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        return cache_dir / f"{digest}.json"

    @classmethod
    def should_trigger(
        cls,
        prompt: str,
        is_gen_candidate: bool,
        is_insp_candidate: bool,
        target_formats: Optional[List[str]] = None,
        attached_files: Optional[List[str]] = None
    ) -> bool:
        """
        Determines whether the prompt exhibits high semantic ambiguity requiring LLM arbitration.
        Keeps clear commands on Fast Path and only invokes Judge for true conflicts.
        """
        if not prompt or not prompt.strip():
            return False
        p_lower = prompt.lower().strip()

        # 1. 显式 Slash 命令绝不触发 Judge（快轨绝对优先）
        if p_lower.startswith("/"):
            return False

        # 2. 否定词修饰交付物或动作（如“不要生成ppt”、“别做成word”、“无需落盘表格”）
        has_negated_artifact = bool(re.search(
            r'(?:不要|别|不用|无需|禁止|切勿|不生成|不做|不写)\s*(?:做成|生成|制作|导出|落盘)?\s*(?:ppt|word|pdf|excel|表格|文档|幻灯片|文件|脚本|代码)',
            p_lower
        ))
        if has_negated_artifact:
            return True

        # 3. 双重严重冲突意图（既要求查看/分析，又要求制作/生成/做个报告）
        has_dual_conflict = is_gen_candidate and is_insp_candidate and not target_formats
        if has_dual_conflict:
            return True

        # 4. 复杂自然语言多目标指代（例如“分析采购明细，做个说明但不要导出任何新表格”）
        if any(w in p_lower for w in ["但不要", "但是别", "仅在聊天", "只在正文", "纯文字"]):
            return True

        return False

    @classmethod
    def judge_intent(
        cls,
        prompt: str,
        available_skills: Optional[List[Dict[str, Any]]] = None,
        attached_files: Optional[List[str]] = None,
        model: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Invokes LLM Judge to resolve complex routing conflicts.
        Returns:
            {
                "skill_id": Optional[str],
                "is_generate_intent": bool,
                "is_inspect_intent": bool,
                "primary_intent": str,
                "confidence": float,
                "reason": str
            }
            or None on timeout/failure to trigger safe heuristic fallback.
        """
        if not prompt or not prompt.strip():
            return None

        # 1. 磁盘缓存检查 (0ms)
        cache_file = cls._cache_path(prompt, attached_files, model)
        if cache_file.exists():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(cached, dict) and "is_generate_intent" in cached:
                    return cached
            except Exception as e:
                logger.warning("Failed to read intent judge cache: %s", e)

        # 2. 代理连通性快速探测
        try:
            from .analysis_synthesis import _can_reach_proxy
            if not _can_reach_proxy():
                return None
        except Exception:
            return None

        # 3. 构造极简裁判 Prompt
        try:
            from .llm import call_model_proxy
            from .runtime_policy import RuntimePolicy

            skills_brief = []
            for s in (available_skills or []):
                sid = s.get("id")
                desc = s.get("description", "")
                skills_brief.append(f"- {sid}: {desc[:80]}")

            system_prompt = (
                "你是一个语义意图与技能路由裁判 (Intent & Skill Router Judge)。\n"
                "你的核心职责是识别用户的真实第一意图，特别是在【只读审阅】与【物理生成】存在冲突或带有否定词时做出裁决。\n"
                "原则：\n"
                "1. 否定句判定：若用户明确要求“不要生成PPT/Word/文件”或“仅在正文中解答”，则 is_generate_intent 必须为 false，skill_id 设为 null。\n"
                "2. 真实物理交付：仅当用户明确指示导出、创建或落地特定文件（PPT/Word/Excel/PDF/网页）时，is_generate_intent 才为 true，并指定最匹配的 skill_id。\n"
                "3. 纯文本分析与总结：若用户只是要求对比、分析、解释或列举数据要点，属于 inspect/chat 意图，is_generate_intent 为 false。\n"
                "4. 严格输出标准 JSON，禁止任何多余解释：\n"
                '{"skill_id": "guizang-ppt"|"docx"|"xlsx"|"pdf"|"research"|null, "is_generate_intent": true|false, "is_inspect_intent": true|false, "primary_intent": "inspect"|"generate"|"search"|"knowledge"|"chat", "confidence": 0.95, "reason": "简述理由(30字内)"}'
            )

            user_prompt = (
                f"【用户指令】:\n{prompt}\n\n"
                f"【有效附件】: {', '.join(attached_files or ['无'])}\n\n"
                f"【可用技能】:\n" + "\n".join(skills_brief[:6]) + "\n\n"
                "请给出你的裁决 JSON："
            )

            judge_deadline = min(deadline, time.monotonic() + 4) if deadline is not None else time.monotonic() + 4
            judge_policy = RuntimePolicy.from_env()
            judge_policy.thinking = False
            judge_policy.reasoning_effort = None
            judge_policy.model_max_retries = 0

            res = call_model_proxy(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=model or "default",
                timeout=4,
                deadline=judge_deadline,
                policy=judge_policy,
                stream_deltas=False,
                purpose="intent_judge"
            )

            raw_text = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                parsed = json.loads(match.group(0))
                verdict = {
                    "skill_id": parsed.get("skill_id") if parsed.get("skill_id") != "null" else None,
                    "is_generate_intent": bool(parsed.get("is_generate_intent")),
                    "is_inspect_intent": bool(parsed.get("is_inspect_intent")),
                    "primary_intent": str(parsed.get("primary_intent", "general")),
                    "confidence": float(parsed.get("confidence", 0.9)),
                    "reason": str(parsed.get("reason", ""))[:200]
                }
                try:
                    cache_file.write_text(json.dumps(verdict, ensure_ascii=False), encoding="utf-8")
                except Exception as e:
                    logger.warning("Failed to write intent judge cache: %s", e)
                return verdict

        except Exception as e:
            logger.warning("IntentJudge call failed: %s, falling back to heuristic rules", e)

        return None
