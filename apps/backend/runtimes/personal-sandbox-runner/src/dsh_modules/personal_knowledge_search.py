"""
Personal knowledge base and deliverables intelligent retrieval module.
Provides:
- Multi-keyword entity extraction from user prompt.
- Dual-space scanning (/knowledge and /workspace/deliverables).
- Multi-tier file format prioritization and freshness decay boosting.
- Deep full-text content grep with contextual window snippet extraction.
- Strict sandbox boundary security confinement.
"""

import os
import re
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from .office_tools import (
    extract_docx_text,
    extract_pdf_text,
    extract_xlsx_text,
    extract_pptx_text,
)

_LAST_SCANNED_KNOWLEDGE_FILES: List[Dict[str, Any]] = []

KNOWLEDGE_STOP_WORDS = {
    "个人", "空间", "知识", "知识库", "文档", "文件", "方法", "安装", "教程",
    "怎么", "如何", "查看", "查询", "使用", "指南", "搜索", "检索", "阅读",
    "浏览", "看一下", "查一下", "找一下", "内容", "关于", "有关", "相关",
    "的", "了", "在", "是", "中", "里", "内", "上", "有", "有啥", "包含",
    "是什么", "总结", "归纳", "分析", "报告", "资料", "库", "请问", "帮我"
}


RELEVANCE_SCORE_THRESHOLD = 200  # 判定为有效引用候选的最低相关性综合分阈值


def get_last_scanned_knowledge_files() -> List[Dict[str, Any]]:
    """Returns the metadata list of knowledge and deliverable files discovered during the last scan."""
    global _LAST_SCANNED_KNOWLEDGE_FILES
    return list(_LAST_SCANNED_KNOWLEDGE_FILES)


def _extract_knowledge_query_keywords(prompt: Optional[str]) -> List[str]:
    """
    Extracts multiple entity keywords from user prompt for personal knowledge retrieval.
    Strips noise preambles and stop words, extracting both ASCII and Chinese keyword entities.
    """
    if not prompt or not isinstance(prompt, str):
        return []
    p = prompt.strip().lower()
    
    # 剥离无意义前缀与空间限定词
    p = re.sub(r'^(?:请问|请帮我|帮我|麻烦|查看|查询|看一下|查一下|找一下|检索|搜索|阅读|浏览)\s*', '', p)
    p = re.sub(r'(?:在|从)?(?:个人空间|知识库|知识空间|我的个人文档|工作区|我的文档)(?:中|里|内|上的?)?\s*', ' ', p)
    p = re.sub(r'(?:关于|有关|相关(?:的)?)\s*', ' ', p)
    p = re.sub(r'(?:的)?(?:安装方法|安装教程|安装指南|部署方法|使用方法|使用教程|怎么用|如何用|怎么做|是什么|有啥|内容)\b', ' ', p)

    # 提取英文/数字词汇
    ascii_words = [w.lower() for w in re.findall(r'[a-zA-Z0-9_\-\.]{2,}', p)]
    
    # 中文多关键词分词提取
    chinese_blocks = re.findall(r'[\u4e00-\u9fa5]+', p)
    chinese_words = []
    for blk in chinese_blocks:
        if blk in KNOWLEDGE_STOP_WORDS:
            continue
        if len(blk) <= 4:
            chinese_words.append(blk)
        else:
            # 较长中文短语拆解为 2~3 字的子词
            for i in range(len(blk) - 1):
                sub = blk[i:i+2]
                if sub not in KNOWLEDGE_STOP_WORDS:
                    chinese_words.append(sub)
            if len(blk) >= 3:
                for i in range(len(blk) - 2):
                    sub3 = blk[i:i+3]
                    if sub3 not in KNOWLEDGE_STOP_WORDS:
                        chinese_words.append(sub3)

    keywords: List[str] = []
    for w in (ascii_words + chinese_words):
        if w not in KNOWLEDGE_STOP_WORDS and len(w) >= 2 and w not in keywords:
            keywords.append(w)

    # 从原始 prompt 中补充提取关键英文字词（如 harness, dsh 等）
    raw_ascii = re.findall(r'[a-zA-Z0-9_\-]{2,}', prompt.lower())
    for a in raw_ascii:
        if a not in keywords and a not in {"http", "https", "url"}:
            keywords.append(a)

    return list(dict.fromkeys(keywords))


def _get_file_type_tier_and_score(suffix: str) -> Tuple[int, int]:
    """
    Returns (tier, base_score) for file type prioritization.
    Tier 1: .md (最高优先级文档, 110), .txt (100)
    Tier 2: .pdf (60)
    Tier 3: .docx, .doc (50)
    Tier 4: .json, .csv, .py, .yaml, .yml, .html (30)
    Tier 5: .xlsx, .pptx (20)
    Tier 6: others (5)
    """
    ext = suffix.lower()
    if ext == ".md":
        return (1, 110)
    elif ext == ".txt":
        return (1, 100)
    elif ext == ".pdf":
        return (2, 60)
    elif ext in [".docx", ".doc"]:
        return (3, 50)
    elif ext in [".json", ".csv", ".py", ".yaml", ".yml", ".html"]:
        return (4, 30)
    elif ext in [".xlsx", ".pptx"]:
        return (5, 20)
    return (6, 5)


def _extract_grep_snippet(text: str, keywords: List[str], max_chars: int = 1200) -> Tuple[str, bool]:
    """
    Performs full-text content grep against text.
    If keywords are found, returns a focused window snippet centered around the best match.
    """
    if not text or not keywords:
        return text[:max_chars].strip(), False

    lower_text = text.lower()
    best_pos = -1
    matched_any = False

    for kw in keywords:
        pos = lower_text.find(kw)
        if pos != -1:
            matched_any = True
            if best_pos == -1 or pos < best_pos:
                best_pos = pos

    if not matched_any or best_pos == -1:
        return text[:max_chars].strip(), False

    # 提取以命中位置为中心的上下文窗口
    half_window = max_chars // 2
    start = max(0, best_pos - 150)
    end = min(len(text), start + max_chars)
    if end - start < max_chars:
        start = max(0, end - max_chars)

    snippet = text[start:end].strip()
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return f"{prefix}{snippet}{suffix}", True


def _calculate_freshness_boost(mtime: float) -> int:
    """
    Calculates freshness boost for recently modified deliverables/documents.
    Prioritizes files updated in the last few days.
    """
    if mtime <= 0:
        return 0
    now = time.time()
    age_seconds = max(0.0, now - mtime)
    age_days = age_seconds / 86400.0

    if age_days <= 3.0:
        return 80  # 最近 3 天修改的最新产出物高权加分
    elif age_days <= 7.0:
        return 40  # 最近 1 周修改
    elif age_days <= 30.0:
        return 15  # 最近 1 个月修改
    return 0


def scan_personal_knowledge(prompt: Optional[str] = None) -> str:
    """
    Scans personal knowledge space and saved deliverables for reference material.
    Performs:
    1. Multi-keyword extraction from prompt.
    2. Deep content grep for plain text and office documents.
    3. Multi-tier format weighting and recent freshness decay ranking.
    4. Windowed snippet preview extraction.
    Strictly excludes execution skills (/knowledge/skills) from retrieval.
    """
    global _LAST_SCANNED_KNOWLEDGE_FILES
    prior_matched_files = [f for f in _LAST_SCANNED_KNOWLEDGE_FILES if f.get("matched")]
    _LAST_SCANNED_KNOWLEDGE_FILES = []

    from . import config as cfg
    from .file_tools import resolve_sandboxed_path, is_path_within, KNOWLEDGE_DIR, WORKSPACE_DIR

    kn_dir = getattr(cfg, "KNOWLEDGE_DIR", KNOWLEDGE_DIR)
    kn_path = Path(kn_dir)
    ws_dir = getattr(cfg, "WORKSPACE_DIR", WORKSPACE_DIR)

    valid_entries = []

    # 1. 扫描个人知识底库 (/knowledge)，但严格排除 skills 目录
    if kn_path.exists():
        try:
            kn_resolved = kn_path.resolve()
            for f in kn_path.glob("**/*"):
                if f.name.startswith("."):
                    continue
                # 严格过滤 skills 目录及版本控制文件，skills 为执行技能，不作为检索访问
                rel_parts = f.relative_to(kn_path).parts
                if "skills" in rel_parts or any(p.startswith(".skill") for p in rel_parts):
                    continue
                try:
                    resolved, err = resolve_sandboxed_path(str(f), for_write=False, for_outbound=False)
                    if err or not resolved or not resolved.is_file():
                        continue
                    if not is_path_within(resolved, [kn_resolved]):
                        continue
                    valid_entries.append((f, resolved, "knowledge", f.relative_to(kn_path)))
                except Exception:
                    continue
        except Exception:
            pass

    # 2. 扫描产出成果库 (/workspace/deliverables 与 /workspace/outputs)
    deliverables_dirs = [
        Path(ws_dir) / "deliverables",
        Path(ws_dir) / "outputs",
    ]
    for d_candidate in deliverables_dirs:
        if not d_candidate.exists():
            continue
        try:
            d_resolved = d_candidate.resolve()
            for f in d_candidate.glob("**/*"):
                if f.name.startswith("."):
                    continue
                try:
                    resolved, err = resolve_sandboxed_path(str(f), for_write=False, for_outbound=False)
                    if err or not resolved or not resolved.is_file():
                        continue
                    if not is_path_within(resolved, [d_resolved]):
                        continue
                    rel = f.relative_to(Path(ws_dir))
                    valid_entries.append((f, resolved, "deliverable", rel))
                except Exception:
                    continue
        except Exception:
            pass

    if not valid_entries:
        return "个人知识库 (/knowledge) 与 产出成果库 (/workspace/deliverables) 目前均为空。"

    keywords = _extract_knowledge_query_keywords(prompt)

    # 评分与多级深度排序（文件名 + 正文 grep + 格式 Tier + 新鲜度加权）
    scored_entries = []
    for f, resolved, source_cat, rel in valid_entries:
        fname_lower = resolved.name.lower()
        rel_str = str(rel).lower()
        suffix = resolved.suffix.lower()

        tier, base_score = _get_file_type_tier_and_score(suffix)
        kw_score = 0
        matched_name_kw = False
        matched_content_kw = False
        content_preview_cached = ""

        # 1. 文件名与路径匹配
        if keywords:
            for kw in keywords:
                if kw in fname_lower:
                    matched_name_kw = True
                    kw_score += 500  # 文件名完全包含关键词
                elif kw in rel_str:
                    matched_name_kw = True
                    kw_score += 200

        # 2. 正文 Grep 全文检索（针对纯文本与轻量文档预读）
        if keywords and suffix in [".md", ".txt", ".json", ".csv", ".py", ".yaml", ".yml", ".html"]:
            try:
                # 快速读取前 64KB 内容用于 grep
                raw_head = resolved.read_text(encoding="utf-8", errors="ignore")[:65536]
                lower_head = raw_head.lower()
                for kw in keywords:
                    if kw in lower_head:
                        matched_content_kw = True
                        kw_score += 180  # 正文命中关键词加分
                if matched_content_kw:
                    snippet, _ = _extract_grep_snippet(raw_head, keywords, max_chars=2500)
                    content_preview_cached = snippet
            except Exception:
                pass

        # 必须有实际关键词命中且关键词分 >= 180，杜绝纯靠时间/格式虚高
        matched_kw = bool((matched_name_kw or matched_content_kw) and kw_score >= 180)

        # 产出成果库加权
        if source_cat == "deliverable" and matched_kw:
            kw_score += 50

        # 时间与新鲜度加权
        try:
            mtime = resolved.stat().st_mtime
            size = resolved.stat().st_size
        except Exception:
            mtime = 0.0
            size = 0

        freshness_boost = _calculate_freshness_boost(mtime)
        total_score = kw_score + base_score + freshness_boost

        scored_entries.append({
            "f": f,
            "resolved": resolved,
            "rel": rel,
            "suffix": suffix,
            "total_score": total_score,
            "matched_kw": matched_kw,
            "matched_content_kw": matched_content_kw,
            "mtime": mtime,
            "size": size,
            "tier": tier,
            "source_category": source_cat,
            "cached_preview": content_preview_cached,
        })

    # 排序策略：综合得分高优先 -> Tier 格式优先 -> 最近修改时间优先 -> 字典序
    scored_entries.sort(key=lambda x: (-x["total_score"], x["tier"], -x["mtime"], str(x["rel"])))

    # 记录本次扫描发现的全部文件元数据（保持得分与匹配状态供状态机与安全审计追踪）
    _LAST_SCANNED_KNOWLEDGE_FILES = []
    for item in scored_entries:
        resolved = item["resolved"]
        rel = item["rel"]
        source_cat = item["source_category"]
        prefix_tag = "[产出成果库] " if source_cat == "deliverable" else ""
        _LAST_SCANNED_KNOWLEDGE_FILES.append({
            "name": str(rel),
            "displayName": f"{prefix_tag}{rel}",
            "path": str(resolved),
            "size": item["size"],
            "matched": item["matched_kw"],
            "score": item.get("total_score", 0),
            "kw_score": item.get("kw_score", 0),
            "type": item["suffix"],
            "source_category": source_cat,
        })

    # 当存在明确查询关键词且有达到相关性阈值的高相关文件时，只注入高相关文档，防止注入低分无关文档导致模型发散与自作多情
    has_matched = any(x["matched_kw"] and x["total_score"] >= RELEVANCE_SCORE_THRESHOLD for x in scored_entries)
    if keywords and has_matched:
        selected = [x for x in scored_entries if x["matched_kw"] and x["total_score"] >= RELEVANCE_SCORE_THRESHOLD][:8]
        summary = ["Personal Knowledge Base & Deliverables contents (filtered by high relevance):"]
    elif keywords and not has_matched:
        # 有关键词但未直接命中：提示未匹配，附带最近的若干文档供参考
        selected = scored_entries[:5]
        summary = [f"Personal Knowledge Base & Deliverables contents (no direct match for keywords {keywords}, recent files shown):"]
    else:
        # 探索性/全量概览查询：展示最近前 8 个文档
        selected = scored_entries[:8]
        summary = ["Personal Knowledge Base & Deliverables contents:"]

    for item in selected:
        resolved = item["resolved"]
        rel = item["rel"]
        suffix = item["suffix"]
        matched_kw = item["matched_kw"]
        size = item["size"]
        source_cat = item["source_category"]
        prefix_tag = "[产出成果库] " if source_cat == "deliverable" else ""

        content_preview = item.get("cached_preview", "")
        if not content_preview:
            try:
                # 1. 纯文本文件（.md, .txt, .json 等）
                if suffix in [".md", ".txt", ".json", ".csv", ".py", ".yaml", ".yml", ".html"]:
                    max_chars = 2500 if matched_kw else 600
                    raw_text = resolved.read_text(encoding="utf-8", errors="ignore")
                    snippet, _ = _extract_grep_snippet(raw_text, keywords, max_chars=max_chars)
                    content_preview = snippet

                # 2. Word 文档 (.docx)
                elif suffix == ".docx":
                    max_chars = 2000 if matched_kw else 500
                    extracted = extract_docx_text(resolved, max_chars=max_chars * 2)
                    if extracted and not extracted.startswith("【文件受企业安全加密保护无法解析】"):
                        snippet, _ = _extract_grep_snippet(extracted, keywords, max_chars=max_chars)
                        content_preview = snippet
                    else:
                        content_preview = extracted or "[Word 文档解析内容为空]"

                # 3. PDF 文档 (.pdf)
                elif suffix == ".pdf":
                    max_chars = 2000 if matched_kw else 500
                    extracted = extract_pdf_text(resolved, max_chars=max_chars * 2)
                    if extracted:
                        snippet, _ = _extract_grep_snippet(extracted, keywords, max_chars=max_chars)
                        content_preview = snippet
                    else:
                        content_preview = "[PDF 文档解析内容为空]"

                # 4. Excel 工作簿 (.xlsx)
                elif suffix == ".xlsx":
                    extracted = extract_xlsx_text(resolved, max_chars=600)
                    content_preview = (extracted or "[Excel 表格内容为空]").strip()

                # 5. PPT 演示文稿 (.pptx)
                elif suffix == ".pptx":
                    extracted = extract_pptx_text(resolved, max_chars=600)
                    content_preview = (extracted or "[PPT 演示文稿内容为空]").strip()

                else:
                    content_preview = f"[非纯文本/多媒体文件: {resolved.name}]"
            except Exception as e:
                content_preview = f"[读取预览失败: {e}]"

        # 过滤可能存在的 ZIP/二进制头部乱码
        if content_preview.startswith("PK\x03\x04") or content_preview.startswith("%PDF"):
            content_preview = "[二进制格式暂无法直接显示]"

        summary.append(f"- File: {prefix_tag}{rel} ({size} bytes)\n  Preview: {content_preview}")

    # 若本次为无关键词概览扫描，但前序已有带关键词命中的有效项，合并保留高分项
    if not keywords and prior_matched_files:
        for pm in prior_matched_files:
            if pm.get("name") not in [x.get("name") for x in _LAST_SCANNED_KNOWLEDGE_FILES if x.get("matched")]:
                _LAST_SCANNED_KNOWLEDGE_FILES.insert(0, pm)

    return "\n".join(summary)
