"""
Source attribution and citation formatting for DeepSeek Harness (dsh).
Formats and appends localized/web retrieval sources to final answers.
"""

import re
from pathlib import Path
from typing import List, Dict, Optional, Any


KNOWLEDGE_CITATION_THRESHOLD = 200  # 判定成果/知识库文件可作为最终引用的最低相关性得分阈值
MAX_LOCAL_CITATION_COUNT = 3        # 本地成果/知识库最多引用的文件条目数


def is_file_negated_in_text(file_identifier: str, text: str) -> bool:
    """
    Checks if a file is explicitly negated, ruled out, or declared irrelevant within text.
    Handles filename basenames, stems (without extension), and common negation patterns:
    e.g. 'xxx.md 与 harness 无关', '另一份 xxx 与本次内容无关', '排除 xxx', 'xxx 属于...不包含...'
    """
    if not file_identifier or not text:
        return False

    clean_id = str(file_identifier).strip()
    raw_name = Path(clean_id).name
    stem = Path(clean_id).stem

    # 提取用于在正文中匹配的候选标识符（文件名与去除扩展名的主体名）
    candidates = []
    if raw_name:
        candidates.append(raw_name)
    if stem and len(stem) >= 3 and stem != raw_name:
        candidates.append(stem)

    if not candidates:
        return False

    # 常见否定/排除语义特征正则
    negation_patterns = [
        re.compile(r'(?:与|和)?\s*[\w\u4e00-\u9fa5\s]{0,25}?(?:无关|不相关|未涉及|不包含|不符合|未包含|未提及|无关联|无任何关联)', re.I),
        re.compile(r'(?:排除|忽略|非相关|并无相关|没有相关|不属于当前)', re.I),
        re.compile(r'(?:属于[\w\u4e00-\u9fa5\s]{0,25}?[，,]\s*(?:不包含|不涉及|非|不属于))', re.I),
        re.compile(r'(?:并非[\w\u4e00-\u9fa5\s]{0,25}?相关)', re.I),
    ]

    sentence_delimiters = set("\n\r。；;!?！？")

    for cand in candidates:
        escaped_cand = re.escape(cand)
        for match in re.finditer(escaped_cand, text, flags=re.I):
            start = match.start()
            end = match.end()

            # 向前寻找本句/本行起始，严格限定否定语义作用域
            clause_start = start
            while clause_start > 0 and text[clause_start - 1] not in sentence_delimiters:
                clause_start -= 1

            # 向后寻找本句/本行结束
            clause_end = end
            while clause_end < len(text) and text[clause_end] not in sentence_delimiters:
                clause_end += 1

            clause = text[clause_start:clause_end].strip()

            # 仅在本句/本行作用域内进行否定匹配，彻底杜绝跨段落或跨句误伤
            for pat in negation_patterns:
                if pat.search(clause):
                    return True

    return False


def extract_search_sources(search_context: str, max_items: int = 5) -> List[Dict[str, str]]:
    """Extracts deduplicated (title, url) links from raw search context."""
    if not search_context or not search_context.strip():
        return []

    link_pattern = re.compile(r'(?:^|\n)(?:\d+\.\s*)?\[([^\]]+)\]\((https?://[^)]+)\)')
    seen_urls = set()
    sources = []

    for title, url in link_pattern.findall(search_context):
        clean_url = url.rstrip('/')
        url_lower = clean_url.casefold()
        if url_lower in seen_urls:
            continue
        # 排除内部非检索跳转
        if any(skip in url_lower for skip in ['localhost', '127.0.0.1', 'github.com/features', 'github.com/solutions']):
            continue
        seen_urls.add(url_lower)
        clean_title = re.sub(r'[\r\n\t]+', ' ', title).strip()
        # 清理多余标签
        clean_title = re.sub(r'\s*\|\s*GitHub$', '', clean_title, flags=re.I)
        sources.append({
            "title": clean_title or clean_url,
            "url": clean_url
        })
        if len(sources) >= max_items:
            break

    return sources


def format_retrieval_sources_footer(
    local_files: Optional[List[Dict[str, Any]]] = None,
    web_sources: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Formats markdown footer section for local files and web citations."""
    deliverable_items = []
    knowledge_items = []
    seen_stems = set()

    if local_files:
        for f in local_files:
            fname = str(f.get("name") or f.get("fileName") or "").strip()
            if not fname or fname.startswith("."):
                continue
            # 严格过滤 skills 目录及定义文件
            if "skills" in fname.split("/") or "skills" in fname.split("\\"):
                continue
            # 过滤内部派生/文本缓存文件
            if re.search(r'\.(docx|pdf|xlsx|pptx)\.txt$', fname, re.I):
                continue
            # 按文件名主干去重，同主干仅保留最高优先级文件
            stem = re.sub(r'\.[a-zA-Z0-9]+$', '', fname).lower()
            if stem in seen_stems:
                continue
            seen_stems.add(stem)

            is_deliverable = (
                f.get("source_category") == "deliverable"
                or fname.startswith("deliverables/")
                or fname.startswith("outputs/")
            )
            clean_display = re.sub(r'^(?:deliverables|outputs)/', '', fname)

            if is_deliverable:
                deliverable_items.append(clean_display)
            else:
                knowledge_items.append(clean_display)

            if len(deliverable_items) + len(knowledge_items) >= MAX_LOCAL_CITATION_COUNT:
                break

    has_local = bool(deliverable_items or knowledge_items)
    has_web = bool(web_sources)

    if not has_local and not has_web:
        return ""

    lines = [
        "---",
        "### 📚 资料与引用来源",
        ""
    ]

    if deliverable_items:
        lines.append("**产出成果库：**")
        for fname in deliverable_items:
            lines.append(f"- `{fname}`")
        lines.append("")

    if knowledge_items:
        lines.append("**本地知识库 / 个人空间：**")
        for fname in knowledge_items:
            lines.append(f"- `{fname}`")
        lines.append("")

    if has_web:
        lines.append("**网络检索来源：**")
        for idx, src in enumerate(web_sources, 1):
            title = src.get("title") or src.get("url")
            url = src.get("url")
            lines.append(f"{idx}. [{title}]({url})")
        lines.append("")

    return "\n".join(lines).strip()


def append_retrieval_sources_footer(
    final_text: str,
    prompt: str = "",
    search_context: str = "",
    local_knowledge_files: Optional[List[Dict[str, Any]]] = None,
    is_verbatim: bool = False,
) -> str:
    """
    Appends retrieval sources footer to final_text if applicable and not already present.
    """
    if not final_text or not final_text.strip():
        return final_text

    # 1. 规避纯逐字输出或错误拦截
    if is_verbatim:
        return final_text

    # 2. 检查是否已经存在来源声明（避免重复追加）
    existing_source_header = bool(re.search(
        r'(?:###?\s*(?:📚\s*)?(?:资料与引用来源|参考与来源|资料来源|参考来源|引用来源|信息来源|来源说明|联网检索结果)|'
        r'\*\*资料来源\*\*|\*\*参考来源\*\*)',
        final_text,
        re.I
    ))
    if existing_source_header:
        return final_text

    # 3. 检查是否为纯代码/单文件输出（如完整的 ```html ... ```），此时不要在正文中破坏代码
    stripped = final_text.strip()
    if (stripped.startswith("```html") and stripped.endswith("```")) or (stripped.startswith("<!DOCTYPE html>")):
        return final_text

    # 4. 筛选本地知识库匹配文件（四重严格门禁：明确命中 + 得分达标 + 正文无否定排斥 + 数量受限）
    filtered_local = []
    if local_knowledge_files:
        for f in local_knowledge_files:
            # 门禁 1: 必须有明确关键词命中标记
            if not f.get("matched", False):
                continue

            # 门禁 2: 相关性总分必须达到引用来源门禁阈值
            score = f.get("score")
            if score is not None and score < KNOWLEDGE_CITATION_THRESHOLD:
                continue

            fname = str(f.get("name") or f.get("fileName") or "").strip()
            # 门禁 3: 正文中明确被判定为无关/排斥的文档绝对剔除
            if is_file_negated_in_text(fname, final_text):
                continue

            filtered_local.append(f)
            if len(filtered_local) >= MAX_LOCAL_CITATION_COUNT:
                break
        # 严格杜绝无脑 fallback：无达标命中项时绝不强行展示不相关成果库条目

    # 5. 提取网络检索来源
    web_sources = extract_search_sources(search_context, max_items=5) if search_context else []

    footer = format_retrieval_sources_footer(
        local_files=filtered_local,
        web_sources=web_sources
    )

    if not footer:
        return final_text

    return f"{final_text.rstrip()}\n\n{footer}"
