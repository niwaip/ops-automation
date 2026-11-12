"""Layered skill catalog and section-scoped progressive disclosure helpers."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Optional

DEFAULT_ADMISSION_BODY_BUDGET = 16000
MAX_CATALOG_DETAILED = 12
DEFAULT_DESC_CHARS = 160

_PDF_REF_RULES = (
    (["docx", "word", "合同", "转为pdf", "转成pdf", "转换"], "docx2pdf.md"),
    (["表单", "填报", "填写", "fillable", "acroform"], "forms.md"),
)

_XLSX_REF_RULES = (
    (["翻译", "translate", "译文", "本地化", "日文", "英文", "中文", "多语言", "zh-cn", "en-us", "ja-jp", "ooxml"], "translation.md"),
    (["生成", "新建", "创建", "制作", "导出", "报表", "财务模型", "重算", "recalc", "openpyxl"], "generation.md"),
    (["财务", "资产负债", "利润表", "现金流", "roe", "roa", "毛利率", "净利率", "finance"], "finance-analysis.md"),
    (["审计", "稽核", "查重", "异常", "偏差", "对比", "比较", "极值", "聚合", "汇总", "合计", "均值", "计算", "统计", "核对", "明细", "清单", "公式", "规则", "勾稽"], "audit.md"),
    (["读取", "查看", "工作表", "目录", "结构", "有哪些表", "sheet", "预览", "切片"], "inspection.md"),
)

_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
_TOKEN_RE = re.compile(r"[a-z0-9_.-]{2,}|[\u4e00-\u9fff]{2,}", re.I)


def truncate_text(text: Any, limit: int = DEFAULT_DESC_CHARS) -> str:
    """Collapse internal whitespace and cap length cleanly."""
    clean = " ".join(str(text or "").split())
    if len(clean) <= limit:
        return clean
    return clean[: max(0, limit - 1)].rstrip() + "…"


def _extract_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for token in _TOKEN_RE.findall((text or "").lower()):
        tokens.add(token)
        if any("\u4e00" <= ch <= "\u9fff" for ch in token) and len(token) > 2:
            for idx in range(len(token) - 1):
                tokens.add(token[idx : idx + 2])
    return tokens


def _slugify(title: str) -> str:
    clean = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", (title or "").strip().lower())
    return clean.strip("-")


def parse_markdown_sections(body: str) -> tuple[str, list[dict[str, str]]]:
    """Split markdown body into intro text and top-level heading sections."""
    lines = (body or "").splitlines(keepends=True)
    headings_l2 = 0
    headings_l1 = 0
    in_fence = False
    fence_marker = ""

    def scan_headings(target_level: int) -> tuple[str, list[dict[str, str]]]:
        nonlocal in_fence, fence_marker
        in_fence = False
        fence_marker = ""
        intro_parts: list[str] = []
        sections: list[dict[str, str]] = []
        current_title = ""
        current_lines: list[str] = []

        for line in lines:
            fence = _FENCE_RE.match(line)
            if fence:
                marker = fence.group(1)
                if not in_fence:
                    in_fence = True
                    fence_marker = marker
                elif marker == fence_marker:
                    in_fence = False
                    fence_marker = ""
            elif not in_fence:
                match = _HEADING_RE.match(line)
                if match and len(match.group(1)) == target_level:
                    if current_title:
                        sections.append({
                            "title": current_title,
                            "slug": _slugify(current_title),
                            "content": "".join(current_lines).strip(),
                        })
                    current_title = match.group(2).strip()
                    current_lines = [line]
                    continue

            if current_title:
                current_lines.append(line)
            else:
                intro_parts.append(line)

        if current_title:
            sections.append({
                "title": current_title,
                "slug": _slugify(current_title),
                "content": "".join(current_lines).strip(),
            })
        return "".join(intro_parts).strip(), sections

    in_fence = False
    for line in lines:
        fence = _FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            continue
        if not in_fence:
            match = _HEADING_RE.match(line)
            if match:
                level = len(match.group(1))
                if level == 2:
                    headings_l2 += 1
                elif level == 1:
                    headings_l1 += 1

    if headings_l2 > 0:
        return scan_headings(2)
    if headings_l1 > 1:
        return scan_headings(1)
    return (body or "").strip(), []


def list_skill_sections(target_dir: Optional[Path] = None, body: str = "") -> list[str]:
    """List progressive disclosure section names from references/ and markdown headings."""
    seen: list[str] = []
    seen_lower: set[str] = set()

    if target_dir is not None:
        refs_dir = target_dir / "references"
        if refs_dir.exists() and refs_dir.is_dir():
            for ref_file in sorted(refs_dir.glob("*.md")):
                stem = ref_file.stem
                if stem.lower() not in seen_lower:
                    seen.append(stem)
                    seen_lower.add(stem.lower())

    if body:
        _, sections = parse_markdown_sections(body)
        if not seen or len(body) > 4000:
            for item in sections:
                title = item["title"]
                if title.lower() not in seen_lower:
                    seen.append(title)
                    seen_lower.add(title.lower())
    return seen


def _select_reference_files(
    skill_name: str,
    refs_dir: Path,
    prompt: Optional[str],
    section: Optional[str],
) -> tuple[list[Path], list[Path]]:
    all_refs = sorted(p for p in refs_dir.glob("*.md") if p.is_file())
    if not all_refs:
        return [], []

    clean_name = (skill_name or "").strip().lower()
    if section:
        q = section.strip().lower()
        if q in {"all", "*"}:
            return all_refs, []
        matched = [
            p for p in all_refs
            if q == p.stem.lower() or q == p.name.lower() or q in p.stem.lower()
        ]
        if matched:
            unloaded = [p for p in all_refs if p not in matched]
            return matched, unloaded
        return [], all_refs

    if not prompt:
        return [], all_refs

    p_lower = prompt.lower()
    selected: list[Path] = []
    if clean_name in {"pdf", "pdf report", "导出pdf", "生成pdf"}:
        target_name = "report_pdf.md"
        for keywords, fname in _PDF_REF_RULES:
            if any(k in p_lower for k in keywords):
                target_name = fname
                break
        candidate = refs_dir / target_name
        if candidate.exists():
            selected.append(candidate)
    elif clean_name in {"xlsx", "excel", "表格"}:
        for keywords, fname in _XLSX_REF_RULES:
            if any(k in p_lower for k in keywords):
                candidate = refs_dir / fname
                if candidate.exists() and candidate not in selected:
                    selected.append(candidate)
        if not selected:
            fallback = refs_dir / "inspection.md"
            if fallback.exists():
                selected.append(fallback)
    else:
        prompt_tokens = _extract_tokens(prompt)
        scored: list[tuple[int, Path]] = []
        for ref_file in all_refs:
            try:
                head = ref_file.read_text(encoding="utf-8")[:500]
            except Exception:
                head = ""
            score = len(prompt_tokens & _extract_tokens(f"{ref_file.stem} {head}"))
            if score > 0:
                scored.append((score, ref_file))
        scored.sort(key=lambda item: (-item[0], item[1].name))
        selected = [p for _, p in scored[:2]]

    unloaded = [p for p in all_refs if p not in selected]
    return selected, unloaded


def _clip_to_budget(text: str, budget: int, note: str) -> str:
    if len(text) <= budget:
        return text
    keep = max(200, budget - len(note) - 4)
    cut = text[:keep].rsplit("\n", 1)[0]
    if len(cut) < keep // 2:
        cut = text[:keep]
    return cut.rstrip() + "\n" + note


def _slice_body_sections(
    body: str,
    prompt: Optional[str],
    section: Optional[str],
    max_chars: Optional[int],
) -> tuple[str, list[str], list[str]]:
    intro, sections = parse_markdown_sections(body)
    if not sections:
        if max_chars and len(body) > max_chars:
            note = "…(已按准入预算切片；请使用 section 或 inspect 查阅细节)"
            return _clip_to_budget(body, max_chars, note), ["overview"], []
        return body, [], []

    unloaded_titles: list[str] = []
    loaded_titles: list[str] = []
    chosen: list[dict[str, str]] = []

    if section and section.strip().lower() not in {"all", "*"}:
        q = section.strip().lower()
        chosen = [s for s in sections if q in s["title"].lower() or q == s["slug"]]
        if not chosen:
            unloaded_titles = [s["title"] for s in sections]
            toc = "\n\n【可用未展开章节】:\n" + "\n".join(f"- {t}" for t in unloaded_titles)
            head = intro or truncate_text(body, 1200)
            return f"{head}{toc}".strip(), ["overview"], unloaded_titles
        unloaded_titles = [s["title"] for s in sections if s not in chosen]
    elif max_chars and len(body) > max_chars:
        prompt_tokens = _extract_tokens(prompt or "")
        scored = []
        for idx, item in enumerate(sections):
            haystack = f"{item['title']} {item['content'][:400]}"
            score = len(prompt_tokens & _extract_tokens(haystack)) if prompt_tokens else 0
            scored.append((score, -idx, idx, item))
        scored.sort(reverse=True)

        intro_limit = max(800, min(len(intro), max_chars // 4)) if intro else 0
        intro_piece = (
            _clip_to_budget(intro, intro_limit, "…(概览截断)")
            if intro and len(intro) > intro_limit
            else intro
        )
        toc_reserve = 550
        used = len(intro_piece)
        picked_indices: set[int] = set()
        for _, _, idx, item in scored:
            piece_len = len(item["content"]) + 4
            if used + piece_len <= max_chars - toc_reserve:
                picked_indices.add(idx)
                used += piece_len

        if not picked_indices and scored:
            best_idx = scored[0][2]
            picked_indices.add(best_idx)

        chosen = [s for idx, s in enumerate(sections) if idx in picked_indices]
        unloaded_titles = [s["title"] for idx, s in enumerate(sections) if idx not in picked_indices]
        intro = intro_piece
    else:
        return body, [s["title"] for s in sections], []

    parts: list[str] = []
    if intro:
        parts.append(intro)
    budget_left = (max_chars - len(intro) - 450) if max_chars else None
    for item in chosen:
        content = item["content"]
        if budget_left is not None and len(content) > max(400, budget_left):
            content = _clip_to_budget(
                content,
                max(400, budget_left),
                f"…(章节《{item['title']}》已按预算截断；完整内容请按需指定 section)",
            )
        parts.append(content)
        loaded_titles.append(item["title"])
        if budget_left is not None:
            budget_left = max(0, budget_left - len(content) - 4)

    result = "\n\n".join(p for p in parts if p).strip()
    if unloaded_titles:
        toc_lines = "\n".join(f"- {t}" for t in unloaded_titles[:20])
        result = f"{result}\n\n【可用未展开章节 (调用 inspect / read_skill 指定 section 按需展开)】:\n{toc_lines}"
    return result, loaded_titles, unloaded_titles


def build_layered_skill_body(
    skill_name: str,
    body: str,
    *,
    target_dir: Optional[Path] = None,
    prompt: Optional[str] = None,
    section: Optional[str] = None,
    max_chars: Optional[int] = None,
) -> dict[str, Any]:
    """Assemble skill instructions progressively across Level-1 overview, references, and sections."""
    refs_dir = (target_dir / "references") if target_dir is not None else None
    has_refs_dir = bool(refs_dir and refs_dir.exists() and refs_dir.is_dir())

    selected_refs: list[Path] = []
    unloaded_refs: list[Path] = []
    if has_refs_dir and refs_dir is not None:
        selected_refs, unloaded_refs = _select_reference_files(skill_name, refs_dir, prompt, section)

    # If a section argument matched a reference file, do not filter SKILL.md body headings by it again.
    body_section_filter = None if (section and selected_refs) else section
    body_budget = max_chars
    ref_blocks: list[str] = []
    loaded_sections: list[str] = []
    unloaded_sections: list[str] = [p.stem for p in unloaded_refs]

    for ref_file in selected_refs:
        try:
            ref_text = ref_file.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if not ref_text:
            continue
        ref_blocks.append(f"\n\n---\n【分层按需载入场景规范 ({ref_file.name})】:\n{ref_text}")
        loaded_sections.append(ref_file.stem)

    refs_combined = "".join(ref_blocks)
    if body_budget is not None and refs_combined:
        body_budget = max(1200, body_budget - min(len(refs_combined), body_budget // 2))

    base_text, body_loaded, body_unloaded = _slice_body_sections(
        body,
        prompt=prompt,
        section=body_section_filter,
        max_chars=body_budget,
    )
    loaded_sections.extend(x for x in body_loaded if x not in loaded_sections)
    unloaded_sections.extend(x for x in body_unloaded if x not in unloaded_sections)

    assembled = base_text + refs_combined
    if unloaded_refs and "【可用未展开章节" not in assembled:
        ref_lines = "\n".join(f"- {p.stem}" for p in unloaded_refs)
        toc_block = (
            f"\n\n【可用未展开章节 (调用 read_skill(skill_name=..., section=...) 按需加载)】:\n{ref_lines}"
        )
        if max_chars and len(assembled) + len(toc_block) > max_chars:
            assembled = _clip_to_budget(
                assembled,
                max(600, max_chars - len(toc_block)),
                "…(已按准入预算截断；其余细则请用 section 参数按需展开)",
            )
        assembled = f"{assembled}{toc_block}"
    elif max_chars and len(assembled) > max_chars:
        assembled = _clip_to_budget(
            assembled,
            max_chars,
            "…(已按准入预算截断；其余细则请用 section 参数按需展开)",
        )

    has_unloaded = bool(unloaded_sections)
    if section:
        level = "L2_section"
    elif selected_refs or body_unloaded:
        level = "L2_sliced" if body_unloaded else "L2_ref"
    elif unloaded_refs:
        level = "L1_index"
    else:
        level = "full"

    return {
        "text": assembled.strip(),
        "loaded_sections": loaded_sections,
        "available_sections": list(dict.fromkeys([*loaded_sections, *unloaded_sections])),
        "unloaded_sections": unloaded_sections,
        "has_unloaded": has_unloaded,
        "disclosure_level": level,
    }


def _record_sections(skill: dict[str, Any]) -> list[str]:
    if skill.get("sections"):
        return list(skill["sections"])
    raw_path = skill.get("path")
    if not raw_path:
        return []
    refs_dir = Path(raw_path) / "references"
    if not refs_dir.exists() or not refs_dir.is_dir():
        return []
    return [p.stem for p in sorted(refs_dir.glob("*.md")) if p.is_file()]


def build_admission_catalog(
    skills: list[dict[str, Any]],
    rank: dict[str, int | float],
    *,
    provisional_id: Optional[str] = None,
    max_detailed: int = MAX_CATALOG_DETAILED,
    desc_chars: int = DEFAULT_DESC_CHARS,
) -> list[dict[str, Any]]:
    """Build a compact Level-1 catalog with truncated descriptions and Top-K priority."""
    ordered = sorted(skills, key=lambda s: rank.get(s["id"], 0), reverse=True)
    if len(ordered) <= max_detailed:
        detailed_ids = {s["id"] for s in ordered}
    else:
        detailed_ids = {
            s["id"]
            for s in ordered[:max_detailed]
        }
        for s in ordered:
            sid = s["id"]
            if sid == provisional_id or rank.get(sid, 0) > 0 or s.get("type") == "custom":
                detailed_ids.add(sid)

    catalog_entries: list[dict[str, Any]] = []
    for s in ordered:
        sid = s["id"]
        if sid in detailed_ids:
            entry: dict[str, Any] = {
                "id": sid,
                "name": s.get("name", sid),
                "description": truncate_text(s.get("description", ""), desc_chars),
                "execution_mode": s.get("execution_mode"),
            }
            sections = _record_sections(s)
            if sections:
                entry["sections"] = sections[:10]
        else:
            entry = {
                "id": sid,
                "name": s.get("name", sid),
            }
        catalog_entries.append(entry)
    return catalog_entries
