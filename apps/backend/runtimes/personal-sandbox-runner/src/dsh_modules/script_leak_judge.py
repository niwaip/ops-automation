"""
LLM-as-a-Judge script leak verification with deterministic caching.
Distinguishes unexecuted deliverable scripts from legitimate explanatory code examples,
tutorials, and reference snippets.
"""

import hashlib
import json
import logging
from pathlib import Path
import re
import tempfile
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class ScriptLeakJudge:
    _CACHE_DIR = Path("/workspace/.dsh/cache/script_leak_judgments")
    _FALLBACK_CACHE_DIR = Path(tempfile.gettempdir()) / "dsh_script_leak_judgments"

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
    def _cache_path(cls, prompt: str, reply_text: str) -> Path:
        cache_dir = cls._resolve_cache_dir()
        norm_prompt = prompt.strip().casefold()
        norm_reply = reply_text.strip()
        payload = {
            "prompt": norm_prompt,
            "reply": norm_reply,
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        ).hexdigest()
        return cache_dir / f"{digest}.json"

    @classmethod
    def judge_script_leak(
        cls,
        prompt: str,
        reply_text: str,
        model: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Determines whether reply_text contains unexecuted deliverable scripts that should have been
        executed to create physical files, or whether the code blocks are legitimate explanatory examples.

        Returns:
            {"is_unexecuted_script_leak": bool, "reason": str}
            None if judge is unavailable.
        """
        if not reply_text:
            return {"is_unexecuted_script_leak": False, "reason": "Empty reply text"}

        # 1. 检查持久化磁盘缓存 (0ms 开销)
        cache_file = cls._cache_path(prompt, reply_text)
        if cache_file.exists():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(cached, dict) and "is_unexecuted_script_leak" in cached:
                    return cached
            except Exception as e:
                logger.warning("Failed to read script leak cache: %s", e)

        # 2. 判断网络与代理连通性
        try:
            from .analysis_synthesis import _can_reach_proxy
            if not _can_reach_proxy():
                return cls._fallback_verdict(reply_text)
        except Exception:
            return cls._fallback_verdict(reply_text)

        # 3. 构造裁判 Prompt
        try:
            from .llm import call_model_proxy
            from .runtime_policy import RuntimePolicy

            system_prompt = (
                "你是一个极其严谨的代码交付物意图裁判 (Script Leak Judge)。\n"
                "你的任务是审查助手的回复文本中包含的代码块，是属于【未执行的生产脚本泄露】还是【说明性技术示例/问答正文】。\n\n"
                "判定准则：\n"
                "1. 【说明性技术示例/问答正文】(is_unexecuted_script_leak = false)：\n"
                "   - 代码块是作为教程、使用方法、命令行演示、API 说明、配置参考或文档摘录呈现给用户的；\n"
                "   - 回复中包含详尽的自然语言解释、背景介绍或步骤拆解；\n"
                "   - 用户提问本身是咨询、查阅、解释、学习或分析代码；\n"
                "   - 代码片段属于第三方文档的引用（例如 GitHub 规范说明、库函数使用示例）。\n\n"
                "2. 【未执行的生产脚本泄露】(is_unexecuted_script_leak = true)：\n"
                "   - 用户的目标是直接获取一个物理文件（如 Excel、Word、PDF 等），而助手偷懒未在沙箱中运行脚本生成该文件，仅将整段脚本代码直接吐给用户，且未完成实际落盘交付；\n"
                "   - 代码块包含文件写入操作（如 write_file << EOF, cat > /workspace/...）且缺少对应的物理产物。\n\n"
                "3. 严格输出标准 JSON，禁止任何多余文字：\n"
                '{"is_unexecuted_script_leak": false, "reason": "简明裁决理由（50字内）"}'
            )

            user_prompt = (
                f"【用户原始指令】:\n{prompt}\n\n"
                f"【助手回复文本】:\n{reply_text[:4000]}\n\n"
                "请给出你的裁判裁决 JSON："
            )

            review_deadline = min(deadline, time.monotonic() + 10) if deadline is not None else time.monotonic() + 10
            review_policy = RuntimePolicy.from_env()
            review_policy.thinking = False
            review_policy.reasoning_effort = None
            review_policy.model_max_retries = 0

            res = call_model_proxy(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=model or "default",
                timeout=10,
                deadline=review_deadline,
                policy=review_policy,
                stream_deltas=False,
                purpose="script_leak_judge"
            )

            raw_text = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                parsed = json.loads(match.group(0))
                is_leak = bool(parsed.get("is_unexecuted_script_leak"))
                verdict = {
                    "is_unexecuted_script_leak": is_leak,
                    "reason": str(parsed.get("reason", ""))[:500]
                }
                try:
                    cache_file.write_text(json.dumps(verdict, ensure_ascii=False), encoding="utf-8")
                except Exception as e:
                    logger.warning("Failed to write script leak cache: %s", e)
                return verdict

        except Exception as e:
            logger.warning("ScriptLeakJudge failed: %s, falling back to heuristic", e)

        return cls._fallback_verdict(reply_text)

    @classmethod
    def _fallback_verdict(cls, reply_text: str) -> Dict[str, Any]:
        """Safe deterministic fallback when LLM proxy is unreachable."""
        # 若包含充实的自然语言正文（代码块之外的文字长度大于80字），默认保护用户回答
        clean_no_code = re.sub(r'```[\s\S]*?```', '', reply_text).strip()
        if len(clean_no_code) >= 80:
            return {
                "is_unexecuted_script_leak": False,
                "reason": "Deterministic fallback: substantive text accompanied code"
            }
        return {
            "is_unexecuted_script_leak": True,
            "reason": "Deterministic fallback: raw unexecuted code block without substantive text"
        }


def judge_script_leak(
    prompt: str,
    reply_text: str,
    model: Optional[str] = None,
    deadline: Optional[float] = None
) -> Dict[str, Any]:
    """Convenience helper for ScriptLeakJudge."""
    res = ScriptLeakJudge.judge_script_leak(
        prompt=prompt,
        reply_text=reply_text,
        model=model,
        deadline=deadline
    )
    if res is None:
        return {"is_unexecuted_script_leak": False, "reason": "Judge unavailable"}
    return res
