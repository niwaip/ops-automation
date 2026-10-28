"""
LLM-as-a-Judge deliverable claim verification with deterministic caching.
Distinguishes genuine missing artifact claims from natural language referential terms
(e.g. '目标工作表', '对应表格') without relying on open-ended stopword dictionaries.
"""

import hashlib
import json
import logging
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DeliveryClaimJudge:
    _CACHE_DIR = Path("/workspace/.dsh/cache/delivery_claim_judgments")
    _FALLBACK_CACHE_DIR = Path("/tmp/.dsh_delivery_claim_judgments")

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
    def _cache_path(
        cls,
        prompt: str,
        reply_text: str,
        candidate_missing: List[str],
        workspace_summary: Dict[str, Any]
    ) -> Path:
        cache_dir = cls._resolve_cache_dir()
        norm_prompt = prompt.strip().casefold()
        norm_reply = reply_text.strip()
        payload = {
            "prompt": norm_prompt,
            "reply": norm_reply,
            "missing": sorted(candidate_missing),
            "workspace": workspace_summary
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        ).hexdigest()
        return cache_dir / f"{digest}.json"

    @classmethod
    def build_workspace_summary(
        cls,
        workspace_dir: str,
        turn_start_time: Optional[float] = None
    ) -> Dict[str, Any]:
        """Collects ground-truth facts on disk about generated/modified files and sheets."""
        ws = Path(workspace_dir)
        if not ws.exists():
            return {"recent_files": [], "workbooks": {}, "receipts": []}

        recent_files = []
        workbooks: Dict[str, List[str]] = {}

        try:
            for p in ws.iterdir():
                if not p.is_file() or p.name.startswith((".", "~$")):
                    continue
                is_recent = True
                if turn_start_time is not None:
                    try:
                        is_recent = p.stat().st_mtime >= (turn_start_time - 2.0)
                    except OSError:
                        is_recent = True
                if is_recent and p.stat().st_size > 0:
                    recent_files.append(p.name)
                    if p.suffix.lower() in (".xlsx", ".xlsm"):
                        try:
                            import openpyxl
                            wb = openpyxl.load_workbook(p, read_only=True)
                            workbooks[p.name] = list(wb.sheetnames)
                            wb.close()
                        except Exception:
                            pass
        except Exception as e:
            logger.warning("Error inspecting workspace files for judge: %s", e)

        # 收集本轮结构化更新凭据
        receipts = []
        try:
            runs_dir = ws / ".dsh" / "spreadsheet-runs"
            if runs_dir.exists():
                for r_path in sorted(runs_dir.glob("*/receipt.json"), key=lambda x: x.stat().st_mtime, reverse=True)[:5]:
                    try:
                        r_data = json.loads(r_path.read_text(encoding="utf-8"))
                        receipts.append({
                            "status": r_data.get("status"),
                            "published_file": r_data.get("published_path") or r_data.get("output_path"),
                            "summary": r_data.get("summary") or r_data.get("message")
                        })
                    except Exception:
                        pass
        except Exception:
            pass

        return {
            "recent_files": recent_files,
            "workbooks": workbooks,
            "receipts": receipts
        }

    @classmethod
    def judge_delivery_claims(
        cls,
        prompt: str,
        reply_text: str,
        candidate_missing: List[str],
        workspace_dir: str,
        turn_start_time: Optional[float] = None,
        model: Optional[str] = None,
        deadline: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Determines whether candidate_missing contains true unfulfilled delivery claims,
        or if the claims are satisfied by actual files/sheets or natural language referential terms.

        Returns:
            {"phantom_claim": bool, "missing_items": List[str], "reason": str}
            None if judge is unavailable, prompting safe fallback.
        """
        if not candidate_missing:
            return {"phantom_claim": False, "missing_items": [], "reason": "No missing claims"}

        workspace_summary = cls.build_workspace_summary(workspace_dir, turn_start_time)

        # 1. 检查持久化磁盘缓存 (0ms 开销)
        cache_file = cls._cache_path(prompt, reply_text, candidate_missing, workspace_summary)
        if cache_file.exists():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(cached, dict) and "phantom_claim" in cached:
                    return cached
            except Exception as e:
                logger.warning("Failed to read delivery claim cache: %s", e)

        # 2. 判断网络与代理连通性
        try:
            from .analysis_synthesis import _can_reach_proxy
            if not _can_reach_proxy():
                return cls._fallback_verdict(candidate_missing, workspace_summary)
        except Exception:
            return cls._fallback_verdict(candidate_missing, workspace_summary)

        # 3. 构造大模型裁判 Prompt
        try:
            from .llm import call_model_proxy
            from .runtime_policy import RuntimePolicy

            system_prompt = (
                "你是一个极其严谨的产物交付真实性审计裁判 (Delivery Claim Judge)。\n"
                "你的任务是审查助手的回复文本中是否存在【虚假生成声称】（即助手宣称已生成或输出，但工作区物理文件或工作表中实际完全不存在的产物）。\n"
                "原则：\n"
                "1. 自然语言指代保护：助手中使用的代词或泛指修饰语（例如“目标工作表”、“对应表格”、“已在原表中更新”、“新工作表”等），只要工作区内实际存在对应的新增或更新好的工作簿/工作表，属于自然语言引用，绝不是虚假交付物（phantom_claim = false）。\n"
                "2. 真实缺失判定：仅当助手在回复中明确宣称已生成、落盘或输出了某个具体独立文件或特定工作表，而该交付物在工作区真实文件列表中根本不存在，且无任何有效执行凭据时，才判定为虚假交付（phantom_claim = true），并在 missing_items 中列出真正缺失的名称。\n"
                "3. 引用与前置说明保护：提及用户上传的源文件、输入数据、中间临时脚本或讨论参考资料，不属于新产物生成声称。\n"
                "4. 严格输出标准 JSON，禁止任何闲聊或多余文字：\n"
                '{"phantom_claim": false, "missing_items": [], "reason": "简明裁决理由（50字内）"}'
            )

            user_prompt = (
                f"【用户原始指令】:\n{prompt}\n\n"
                f"【助手回复文本】:\n{reply_text}\n\n"
                f"【工作区实际存在的落盘文件与工作表】:\n{json.dumps(workspace_summary, ensure_ascii=False, indent=2)}\n\n"
                f"【规则引擎疑似缺失项】:\n{json.dumps(candidate_missing, ensure_ascii=False)}\n\n"
                "请给出你的裁判裁决 JSON："
            )

            review_deadline = min(deadline, time.monotonic() + 12) if deadline is not None else time.monotonic() + 12
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
                timeout=12,
                deadline=review_deadline,
                policy=review_policy,
                stream_deltas=False,
                purpose="delivery_claim"
            )

            raw_text = (res.get("content") or "").strip() if isinstance(res, dict) else str(res or "").strip()
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                parsed = json.loads(match.group(0))
                phantom_claim = bool(parsed.get("phantom_claim"))
                missing_items = parsed.get("missing_items", [])
                if not isinstance(missing_items, list):
                    missing_items = [str(missing_items)]
                verdict = {
                    "phantom_claim": phantom_claim,
                    "missing_items": [str(x) for x in missing_items if x],
                    "reason": str(parsed.get("reason", ""))[:500]
                }
                try:
                    cache_file.write_text(json.dumps(verdict, ensure_ascii=False), encoding="utf-8")
                except Exception as e:
                    logger.warning("Failed to write delivery claim cache: %s", e)
                return verdict

        except Exception as e:
            logger.warning("DeliveryClaimJudge failed: %s, falling back to deterministic check", e)

        return cls._fallback_verdict(candidate_missing, workspace_summary)

    @classmethod
    def _fallback_verdict(
        cls,
        candidate_missing: List[str],
        workspace_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Safe deterministic fallback when LLM proxy is unreachable."""
        recent_files = set(workspace_summary.get("recent_files", []))
        truly_missing = []
        for item in candidate_missing:
            # 过滤任何由旧启发式生成的虚拟 "新工作表_*.xlsx"
            if item.startswith("新工作表_"):
                continue
            if item not in recent_files:
                truly_missing.append(item)
        return {
            "phantom_claim": bool(truly_missing),
            "missing_items": truly_missing,
            "reason": "Deterministic fallback verification without LLM judge"
        }


def judge_delivery_claims(
    prompt: str,
    reply_text: str,
    candidate_missing: List[str],
    workspace_dir: str,
    turn_start_time: Optional[float] = None,
    model: Optional[str] = None,
    deadline: Optional[float] = None
) -> Dict[str, Any]:
    """Convenience helper for DeliveryClaimJudge."""
    res = DeliveryClaimJudge.judge_delivery_claims(
        prompt=prompt,
        reply_text=reply_text,
        candidate_missing=candidate_missing,
        workspace_dir=workspace_dir,
        turn_start_time=turn_start_time,
        model=model,
        deadline=deadline
    )
    if res is None:
        return {"phantom_claim": False, "missing_items": [], "reason": "Judge unavailable"}
    return res
