"""Semantic LLM judge for PDF document parameters and styling contract."""

import hashlib
import json
import logging
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

PDF_CONTRACT_TOOL = {
    'type': 'function',
    'function': {
        'name': 'submit_pdf_contract',
        'description': '记录通过语义理解判定的 PDF 样式、版式、页数与元数据契约。',
        'parameters': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'title': {
                    'type': ['string', 'null'],
                    'description': '文档主标题，提取纯标题文本（去除《》符号）'
                },
                'subtitle': {
                    'type': ['string', 'null'],
                    'description': '副标题，若无则为 null'
                },
                'author': {
                    'type': ['string', 'null'],
                    'description': '署名、作者或编制单位，若无则为 null'
                },
                'template': {
                    'type': 'string',
                    'enum': ['handout', 'report', 'editorial', 'mobile'],
                    'description': '版式模板：handout(讲义/手册/清单/练习卡/打印单/两页小报/紧凑排版), report(正式报告/工作总结/白皮书), editorial(散文/杂志专栏/深度文章), mobile(移动端阅读/卡片图)'
                },
                'theme': {
                    'type': 'string',
                    'enum': ['warm', 'blue', 'emerald', 'slate', 'burgundy'],
                    'description': '主题色调：warm(暖色/橙色/温暖), emerald(绿色/薄荷/自然/清新), slate(灰色/素雅/科技灰), burgundy(酒红/红棕), blue(商务蓝/经典蓝)'
                },
                'min_pages': {
                    'type': ['integer', 'null'],
                    'description': '最小/固定页数。用户无明确数字要求时必须为 null，严禁默认填 1'
                },
                'max_pages': {
                    'type': ['integer', 'null'],
                    'description': '最大/固定页数。用户无明确数字要求时必须为 null，严禁默认填 1'
                },
                'cover': {
                    'type': 'boolean',
                    'description': '是否需要独立封面。用户明确要求不要/无封面时为 false，要求独立封面时为 true，默认 false'
                },
                'output_path': {
                    'type': 'string',
                    'description': '目标 PDF 文件名，例如 "城市自然观察手册.pdf"，必须以 .pdf 结尾'
                }
            },
            'required': ['template', 'theme', 'cover', 'output_path']
        }
    }
}

INSTRUCTIONS = """你是一个专业的 PDF 文档设计与排版契约判定专家（LLM as a Judge）。
根据用户的自然语言输入，准确理解用户在文档结构、版式风格、色彩主题、页数限制与元数据上的意图，输出结构化契约。
不要依赖死记硬背的关键词字面匹配，而应理解用户语义语境：
1. 版式模板 (template)：
   - "handout": 讲义、小册子、手册、学生指南、练习单、清单、卡片、折页、双页/单页适合A4打印的紧凑图文排版。
   - "report": 正式工作报告、调研报告、白皮书、立项企划书、带有正式章节和封面的长篇分析报告。
   - "editorial": 杂志专栏、深度长文、书刊散文、排版优美的叙事长文。
   - "mobile": 适合手机屏幕或移动端长图阅读的垂直版式。
   如果用户未明确指定版式，根据内容形态智能推断（如学生观察手册、活动讲义、清单应判定为 handout；分析总结判定为 report）。
2. 色彩主题 (theme)：
   - "warm": 暖色、橙色、暖棕色、温暖童趣风格。
   - "emerald": 绿色、薄荷绿、森林、自然、环保生态、清新风格。
   - "slate": 灰色、灰色调、科技灰、低调素雅。
   - "burgundy": 酒红色、复古红、典雅。
   - "blue": 商务蓝、科技蓝、经典蓝（默认）。
3. 页数与封面约束（极其重要）：
   - 只有当用户显式指定页数（如"共2页"、"恰好2页"、"单页"、"1页"）时，才设置 min_pages 与 max_pages 对应整数。
   - 若用户未明确指定页数限制（如仅说"生成pdf"、"生成pdf文件"、"导出为pdf"等），min_pages 与 max_pages 必须为 null！严禁擅自脑补或默认填充为 1！
   - 若用户指出"不要独立封面"、"无独立封面"、"直接进入正文"，设置 cover=false。
4. 元数据提取：
   - 提取真实主标题（如《城市自然观察手册》-> "城市自然观察手册"）。
   - 提取副标题（如"观察、记录与分享"）。
   - 提取署名/作者（如"阅读与实践"）。
5. 文件名 (output_path)：
   - 若用户明确要求了文件名（如"文件名 handout.pdf"），优先使用指定文件名。
   - 若用户未指定文件名，根据主标题生成（如"城市自然观察手册.pdf"），必须以 .pdf 结尾。
"""


class PdfContractJudge:
    _CACHE_DIR = Path("/workspace/.dsh/cache/pdf_contract_judgments")
    _FALLBACK_CACHE_DIR = Path("/tmp/.dsh_pdf_contract_judgments")

    @classmethod
    def _resolve_cache_dir(cls) -> Path:
        for path in (cls._CACHE_DIR, cls._FALLBACK_CACHE_DIR):
            try:
                path.mkdir(parents=True, exist_ok=True)
                return path
            except OSError:
                continue
        return cls._FALLBACK_CACHE_DIR

    @classmethod
    def _cache_path(cls, prompt: str) -> Path:
        digest = hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest()
        return cls._resolve_cache_dir() / f"{digest}.json"

    @classmethod
    def judge_pdf_contract(
        cls,
        prompt: str,
        deadline: Optional[float] = None,
        model: Optional[str] = None,
        policy: Optional[Any] = None,
        telemetry: Optional[Any] = None
    ) -> Optional[Dict[str, Any]]:
        """Invokes LLM as a Judge to extract PDF layout, styling, and metadata contract."""
        if not prompt or not prompt.strip():
            return None

        cache_file = cls._cache_path(prompt)
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(data, dict) and "template" in data and "theme" in data:
                    return data
            except Exception as e:
                logger.warning("Failed to read pdf contract judgment cache: %s", e)

        # Attempt structured LLM decision with isolated telemetry
        try:
            from .semantic_decision import structured_decision
            from .telemetry import TelemetryStats, get_active_telemetry, set_active_telemetry

            previous_telemetry = get_active_telemetry()
            judge_telemetry = TelemetryStats()
            try:
                payload = {'prompt': prompt}
                result = structured_decision(
                    INSTRUCTIONS,
                    payload,
                    PDF_CONTRACT_TOOL,
                    model or os.environ.get("DSH_MODEL") or "default",
                    policy,
                    judge_telemetry,
                    deadline,
                    guard="pdf_contract_judge",
                    max_tokens=600
                )
            finally:
                set_active_telemetry(previous_telemetry)

            if isinstance(result, dict) and "template" in result:
                # Basic validation
                template = result.get("template")
                if template in ("handout", "report", "editorial", "mobile"):
                    try:
                        cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
                    except Exception:
                        pass
                    if telemetry is not None:
                        telemetry.record_guard("pdf_contract_judge", "pass", result)
                    return result
        except Exception as e:
            logger.info("PDF contract judge unavailable or fallback required: %s", e)
            if telemetry is not None:
                telemetry.record_guard("pdf_contract_judge", "fallback", str(e))
            return None

        return None
