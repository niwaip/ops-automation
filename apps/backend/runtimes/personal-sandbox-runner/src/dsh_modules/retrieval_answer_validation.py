"""Conservative structural acceptance for answers backed by this turn's retrieval.

This is not a factual verifier or a minimum-length rule. A concise fact or a
clarifying question is valid; a topic heading alone cannot deliver search results.
"""
import re
from dataclasses import dataclass
from typing import Iterable

from .tool_result import ToolResult


RETRIEVAL_TOOLS = frozenset({"web_search", "search_web", "fetch_page"})
_TITLE_ENDING = re.compile(
    r"(?:速览|一览|概览|汇总|摘要|简报|热点|快讯|赛程|赛果|赛事|新闻|动态|天气|预报|"
    r"总结|对比|比较|报告|分析|结果|清单|目录|简介|指南|进展|"
    r"\b(?:overview|summary|roundup|highlights|headlines|schedule|results|news|forecast))"
    r"\s*(?:[（(][^（）()]*[）)])?\s*[:：。.!！]?\s*$", re.I,
)
_CLARIFICATION = re.compile(
    r"(?:您想|你想|请问|哪(?:个|些|类|场|项)|要看|是否|which\b|would you\b|could you\b)", re.I,
)
_TITLE_REQUEST = re.compile(
    r"(?:只(?:要|需|输出|给|写)|仅(?:需|输出|给|写)).{0,12}(?:标题|题目)|"
    r"(?:起|拟|取|生成|写|提供|给出|设计).{0,12}(?:标题|题目)|"
    r"\b(?:only|just)\b.{0,20}\b(?:title|headline)\b|"
    r"\b(?:write|give|suggest|create)\b.{0,12}\b(?:title|headline)\b", re.I,
)


@dataclass(frozen=True)
class AnswerAssessment:
    status: str  # completed | needs_input | incomplete
    reason: str


def has_retrieval_evidence(evidence: Iterable[ToolResult]) -> bool:
    return any(
        item.is_success and (item.provenance or {}).get("tool") in RETRIEVAL_TOOLS
        and bool(item.render_text().strip()) for item in evidence
    )


def render_retrieval_context(evidence: Iterable[ToolResult], max_chars: int) -> str:
    texts = [item.render_text().strip() for item in evidence
             if item.is_success and (item.provenance or {}).get("tool") in RETRIEVAL_TOOLS
             and item.render_text().strip()]
    if not texts or max_chars <= 0:
        return ""
    per_source = max(1, (max_chars - 2 * (len(texts) - 1)) // len(texts))
    return "\n\n".join(text[:per_source] for text in texts)[:max_chars]


def requests_title(prompt: str) -> bool:
    for match in _TITLE_REQUEST.finditer(prompt):
        prefix = prompt[max(0, match.start() - 12):match.start()]
        if not re.search(r"(?:不要|不能|不许|别|勿|not|don't)\s*$", prefix, re.I):
            return True
    return False


def assess_retrieval_answer(text: str, prompt: str) -> AnswerAssessment:
    if not text.strip():
        return AnswerAssessment("incomplete", "empty_answer")
    if requests_title(prompt):
        return AnswerAssessment("completed", "requested_title")
    if ((re.search(r"[？?]\s*$", text) and _CLARIFICATION.search(text))
            or re.search(r"(?:请提供|请指定|需要您提供|请补充)", text)):
        return AnswerAssessment("needs_input", "clarification")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    headings = []
    for line in lines:
        if re.fullmatch(r"[-=]{3,}", line):  # setext underline / separator
            continue
        if re.match(r"^(?:来源|参考资料|资料来源|sources?)\s*[:：]", line, re.I):
            continue
        marked_heading = bool(re.match(r"^#{1,6}\s+", line))
        plain = re.sub(r"^#{1,6}\s+|[*_`]", "", line).strip()
        # A heading can itself contain the requested fact. Do not confuse an
        # honest negative result or a complete short statement with a topic.
        statement = bool(re.search(
            r"(?:尚未|尚无|暂无|没有|未公布|无法确认|未能确认|已取消|已延期|已结束|将于|开赛)|"
            r"(?:结果|冠军|比分|温度|气温|天气|获胜者|答案)(?:是|为)|"
            r"\d\s*(?:℃|°[CF]|%)|[。.!！].+", plain, re.I,
        ))
        if not _TITLE_ENDING.search(plain):
            without_dates = re.sub(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b", "", plain)
            statement = statement or bool(re.search(r"(?<!\d)\d{1,3}\s*[:：比-]\s*\d{1,3}(?!\d)", without_dates))
        headings.append(not statement and (marked_heading or bool(_TITLE_ENDING.search(plain))))
    if headings and all(headings):
        return AnswerAssessment("incomplete", "title_only")
    return AnswerAssessment("completed", "substantive_answer")
