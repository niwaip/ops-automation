# -*- coding: utf-8 -*-
"""
Layout-aware font localization, box geometry measurement, peer-group sizing alignment,
and inline multi-run style preservation helpers for PPTX translation.
"""

import copy
import math
import re
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET

NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

# ECMA-376 DrawingML CT_TextCharacterProperties 子元素严格序列映射
RPR_CHILD_ORDER = {
    'ln': 1, 'solidFill': 2, 'gradFill': 3, 'blipFill': 4, 'pattFill': 5,
    'grpFill': 6, 'effectLst': 7, 'effectDag': 8, 'highlight': 9,
    'uLnTx': 10, 'uLn': 11, 'uFillTx': 12, 'uFill': 13,
    'latin': 14, 'ea': 15, 'cs': 16, 'sym': 17,
    'hlinkClick': 18, 'hlinkMouseOver': 19, 'rtl': 20, 'extLst': 21,
}

_EMU_PER_PT = 12700.0
_DEFAULT_INSET_H_PT = 91440 / _EMU_PER_PT  # 7.2pt
_DEFAULT_INSET_V_PT = 45720 / _EMU_PER_PT  # 3.6pt
_VERTICAL_MODES = {'vert', 'vert270', 'eaVert', 'mongolianVert', 'wordArtVert'}

_BILINGUAL_EA_COMPAT_FONTS = {
    'meiryo', 'meiryo ui', 'yu gothic', 'yu gothic ui', 'yu mincho',
    'ms gothic', 'ms pgothic', 'ms mincho', 'hiragino sans', 'hiragino kaku gothic pron',
    'noto sans jp', 'noto sans cjk', 'noto sans sc', 'microsoft yahei', 'simhei', 'simsun', 'pingfang sc',
}

_CJK_PRIMARY_FONTS = _BILINGUAL_EA_COMPAT_FONTS | {
    '微软雅黑', '宋体', '黑体', '仿宋', '楷体', 'メイリオ', '游ゴシック', '游ゴシック ui',
    'mspゴシック', 'msゴシック', '+mn-ea', '+mj-ea',
}

_COLON_SPLIT_RE = re.compile(r'^([^:\n：]{1,56}[:：])(\s*.*)$')
_TRAILING_METRIC_RE = re.compile(r'^(.*?)(\s+)([↑↓↗↘><=~+\-]?\s*(?:[><=~]\s*)?\d[\d\.,]*%?(?:\s*\+)?|[↑↓])$')
_TRAILING_CMP_PCT_RE = re.compile(r'^(.+?)(>\s*\d[\d\.,]*%?|<\s*\d[\d\.,]*%?)$')
_SRC_METRIC_TAIL_RE = re.compile(r'^[\s↑↓↗↘><=~+\-\d\.%]+$')


@dataclass(frozen=True)
class BoxMetrics:
    tx_body: ET.Element
    inner_w: float
    inner_h: float
    non_empty_paras: int
    x: float = 0.0
    y: float = 0.0
    raw_w: float = 0.0
    raw_h: float = 0.0
    orig_wrap: str = ''
    is_table: bool = False


def sort_rpr_children(r_pr: ET.Element) -> None:
    """Sorts a:rPr children strictly according to ECMA-376 CT_TextCharacterProperties sequence."""
    children = list(r_pr)
    children.sort(key=lambda el: RPR_CHILD_ORDER.get(el.tag.split('}')[-1], 99))
    for c in list(r_pr):
        r_pr.remove(c)
    for c in children:
        r_pr.append(c)


def localize_run_fonts(
    r_pr: ET.Element,
    *,
    lang: Optional[str],
    is_en: bool,
    is_non_cjk_target: bool,
    explicit_font_latin: Optional[str],
    explicit_font_ea: Optional[str],
    default_font_latin: str,
    default_font_ea: str,
) -> bool:
    """
    Applies target language metadata and maps wide CJK Latin fonts to compact Latin sans-serif
    for non-CJK target languages unless an explicit Latin font was requested.
    Returns True when the effective Latin typeface is compact/proportional.
    """
    if lang:
        r_pr.set('lang', lang)
        r_pr.set('altLang', 'en-US' if not is_en else 'zh-CN')

    latin = r_pr.find('a:latin', NS)
    orig_latin_tf = latin.attrib.get('typeface', '') if latin is not None else ''

    if explicit_font_latin:
        if latin is not None:
            latin.set('typeface', explicit_font_latin)
        else:
            latin = ET.Element(f'{{{NS["a"]}}}latin', {'typeface': explicit_font_latin})
            r_pr.append(latin)
    elif latin is None:
        latin = ET.Element(f'{{{NS["a"]}}}latin', {'typeface': default_font_latin})
        r_pr.append(latin)
    elif is_non_cjk_target and orig_latin_tf.lower() in _CJK_PRIMARY_FONTS:
        latin.set('typeface', default_font_latin)

    cs = r_pr.find('a:cs', NS)
    if cs is not None and is_non_cjk_target and not explicit_font_latin:
        if cs.attrib.get('typeface', '').lower() in _CJK_PRIMARY_FONTS:
            cs.set('typeface', default_font_latin)

    ea = r_pr.find('a:ea', NS)
    if explicit_font_ea:
        if ea is not None:
            ea.set('typeface', explicit_font_ea)
        else:
            r_pr.append(ET.Element(f'{{{NS["a"]}}}ea', {'typeface': explicit_font_ea}))
    elif ea is None:
        fallback_ea = orig_latin_tf if orig_latin_tf.lower() in _BILINGUAL_EA_COMPAT_FONTS else default_font_ea
        r_pr.append(ET.Element(f'{{{NS["a"]}}}ea', {'typeface': fallback_ea}))

    sort_rpr_children(r_pr)
    eff_latin_tf = latin.attrib.get('typeface', default_font_latin) if latin is not None else default_font_latin
    return is_non_cjk_target and eff_latin_tf.lower() not in _CJK_PRIMARY_FONTS


def estimate_text_em_width(text: str, compact_latin: bool = False) -> float:
    """Estimates rendered width in em units distinguishing CJK wide glyphs and compact Latin fonts."""
    space_w, upper_w, narrow_w, normal_w = (
        (0.25, 0.60, 0.30, 0.48) if compact_latin else (0.30, 0.68, 0.35, 0.56)
    )
    width = 0.0
    for ch in text:
        code = ord(ch)
        if (
            (0x2E80 <= code <= 0x9FFF)
            or (0x3000 <= code <= 0x30FF)
            or (0xAC00 <= code <= 0xD7AF)
            or (0xF900 <= code <= 0xFAFF)
            or (0xFF00 <= code <= 0xFFEF)
        ):
            width += 1.0
        elif ch == ' ':
            width += space_w
        elif ch.isupper() or ch in 'MW@#%&':
            width += upper_w
        elif ch in "ilIjtf.,:;'|!1":
            width += narrow_w
        else:
            width += normal_w
    return width


def estimate_wrapped_lines(text: str, font_pt: float, inner_w_pt: float, compact_latin: bool = False) -> int:
    if inner_w_pt <= 0 or font_pt <= 0:
        return 1
    safety = 1.01 if compact_latin else 1.03
    lines = 0
    for segment in (text.split('\n') or [text]):
        req_w = estimate_text_em_width(segment, compact_latin=compact_latin) * font_pt * safety
        lines += max(1, math.ceil(req_w / inner_w_pt))
    return max(1, lines)


def extract_txbody_inner_size(tx_body: ET.Element, raw_w_pt: float, raw_h_pt: float) -> Tuple[float, float, str]:
    """Computes usable inner (width_pt, height_pt, orig_wrap) after subtracting a:bodyPr insets."""
    if raw_w_pt <= 0 or raw_h_pt <= 0:
        body_pr = tx_body.find('a:bodyPr', NS)
        return 0.0, 0.0, (body_pr.attrib.get('wrap', '') if body_pr is not None else '')
    body_pr = tx_body.find('a:bodyPr', NS)
    if body_pr is None:
        return max(0.0, raw_w_pt - 2 * _DEFAULT_INSET_H_PT), max(0.0, raw_h_pt - 2 * _DEFAULT_INSET_V_PT), ''
    try:
        l_ins = int(body_pr.attrib.get('lIns', 91440)) / _EMU_PER_PT
        r_ins = int(body_pr.attrib.get('rIns', 91440)) / _EMU_PER_PT
        t_ins = int(body_pr.attrib.get('tIns', 45720)) / _EMU_PER_PT
        b_ins = int(body_pr.attrib.get('bIns', 45720)) / _EMU_PER_PT
    except (TypeError, ValueError):
        l_ins = r_ins = _DEFAULT_INSET_H_PT
        t_ins = b_ins = _DEFAULT_INSET_V_PT
    iw = max(0.0, raw_w_pt - l_ins - r_ins)
    ih = max(0.0, raw_h_pt - t_ins - b_ins)
    if body_pr.attrib.get('vert', '') in _VERTICAL_MODES:
        iw, ih = ih, iw
    return iw, ih, body_pr.attrib.get('wrap', '')


def collect_slide_box_metrics(root: ET.Element) -> Dict[ET.Element, BoxMetrics]:
    """Maps each a:p element on a slide to BoxMetrics with resolved group scaling."""
    p_metrics: Dict[ET.Element, BoxMetrics] = {}

    def _register_txbody(
        tx_body: Optional[ET.Element],
        raw_w_pt: float,
        raw_h_pt: float,
        x_pt: float = 0.0,
        y_pt: float = 0.0,
        is_table: bool = False,
    ) -> None:
        if tx_body is None:
            return
        iw, ih, orig_wrap = extract_txbody_inner_size(tx_body, raw_w_pt, raw_h_pt)
        paras = tx_body.findall('a:p', NS)
        non_empty = sum(
            1 for p_el in paras if ''.join(t.text or '' for t in p_el.findall('.//a:t', NS)).strip()
        )
        info = BoxMetrics(
            tx_body=tx_body,
            inner_w=iw,
            inner_h=ih,
            non_empty_paras=max(1, non_empty),
            x=x_pt,
            y=y_pt,
            raw_w=raw_w_pt,
            raw_h=raw_h_pt,
            orig_wrap=orig_wrap,
            is_table=is_table,
        )
        for p_el in paras:
            p_metrics[p_el] = info

    def _walk(elem: ET.Element, sx: float = 1.0, sy: float = 1.0, ox: float = 0.0, oy: float = 0.0) -> None:
        tag = elem.tag.split('}')[-1]
        if tag == 'grpSp':
            nsx, nsy, nox, noy = sx, sy, ox, oy
            xfrm = elem.find('p:grpSpPr/a:xfrm', NS)
            if xfrm is not None:
                off = xfrm.find('a:off', NS)
                ch_off = xfrm.find('a:chOff', NS)
                ext = xfrm.find('a:ext', NS)
                ch_ext = xfrm.find('a:chExt', NS)
                try:
                    if off is not None:
                        nox += int(off.attrib.get('x', 0)) * sx / _EMU_PER_PT
                        noy += int(off.attrib.get('y', 0)) * sy / _EMU_PER_PT
                    if ext is not None and ch_ext is not None:
                        ecx, ecy = int(ext.attrib.get('cx', 0)), int(ext.attrib.get('cy', 0))
                        ccx, ccy = int(ch_ext.attrib.get('cx', 0)), int(ch_ext.attrib.get('cy', 0))
                        if ccx > 0 and ecx > 0:
                            nsx *= ecx / ccx
                        if ccy > 0 and ecy > 0:
                            nsy *= ecy / ccy
                    if ch_off is not None:
                        nox -= int(ch_off.attrib.get('x', 0)) * nsx / _EMU_PER_PT
                        noy -= int(ch_off.attrib.get('y', 0)) * nsy / _EMU_PER_PT
                except (TypeError, ValueError):
                    pass
            for child in elem:
                _walk(child, nsx, nsy, nox, noy)
            return
        if tag == 'sp':
            xfrm = elem.find('p:spPr/a:xfrm', NS)
            off = xfrm.find('a:off', NS) if xfrm is not None else None
            ext = xfrm.find('a:ext', NS) if xfrm is not None else None
            bw = bh = bx = by = 0.0
            try:
                if off is not None:
                    bx = ox + int(off.attrib.get('x', 0)) * sx / _EMU_PER_PT
                    by = oy + int(off.attrib.get('y', 0)) * sy / _EMU_PER_PT
                if ext is not None:
                    bw = int(ext.attrib.get('cx', 0)) * sx / _EMU_PER_PT
                    bh = int(ext.attrib.get('cy', 0)) * sy / _EMU_PER_PT
            except (TypeError, ValueError):
                bw = bh = 0.0
            _register_txbody(elem.find('p:txBody', NS), bw, bh, bx, by, is_table=False)
            return
        if tag == 'tbl':
            grid = []
            for col in elem.findall('./a:tblGrid/a:gridCol', NS):
                try:
                    grid.append(int(col.attrib.get('w', 0)) * sx / _EMU_PER_PT)
                except (TypeError, ValueError):
                    grid.append(0.0)
            for row in elem.findall('./a:tr', NS):
                try:
                    rh = int(row.attrib.get('h', 0)) * sy / _EMU_PER_PT
                except (TypeError, ValueError):
                    rh = 0.0
                cidx = 0
                for tc in row.findall('./a:tc', NS):
                    try:
                        span = max(1, int(tc.attrib.get('gridSpan', 1)))
                    except (TypeError, ValueError):
                        span = 1
                    cw = sum(grid[cidx:cidx + span]) if grid else 0.0
                    cidx += span
                    _register_txbody(tc.find('./a:txBody', NS), cw, rh, ox, oy, is_table=True)
            return
        for child in elem:
            _walk(child, sx, sy, ox, oy)

    _walk(root)
    return p_metrics


def hierarchy_shrink_bounds(cur_sz: int) -> Tuple[float, int]:
    """Returns (min_scale, floor_sz_hundredths) preserving heading hierarchy tiers."""
    if cur_sz >= 2000:
        return 0.86, 1600
    if cur_sz >= 1600:
        return 0.82, 1300
    if cur_sz >= 1200:
        return 0.80, 1000
    return 0.80, min(cur_sz, 800)


def _unpack_box_info(box_info) -> Tuple[float, float, int]:
    if isinstance(box_info, BoxMetrics):
        return box_info.inner_w, box_info.inner_h, box_info.non_empty_paras
    if box_info:
        return box_info[1], box_info[2], box_info[3]
    return 0.0, 0.0, 1


def compute_fit_font_size(
    cur_sz: int,
    orig_text: str,
    new_text: str,
    box_info,
    tx_total_lines_fit: bool,
    compact_latin: bool = False,
) -> Tuple[int, bool]:
    """
    Computes gentle hierarchy-preserving font size only when translated text overflows box bounds.
    Returns (new_sz_hundredths, overflowed_bool).
    """
    if not orig_text or not new_text or new_text == orig_text:
        return cur_sz, False

    min_scale, floor_sz = hierarchy_shrink_bounds(cur_sz)
    iw, ih, non_empty_paras = _unpack_box_info(box_info)

    if iw <= 0 or ih <= 0:
        em_ratio = estimate_text_em_width(new_text, compact_latin=compact_latin) / max(
            1.0, estimate_text_em_width(orig_text, compact_latin=False)
        )
        if em_ratio <= 1.35:
            return cur_sz, False
        scale = max(min_scale, min(1.0, (1.15 / em_ratio) ** 0.5))
        if scale >= 0.96:
            return cur_sz, True
        new_sz = max(floor_sz, int(cur_sz * scale))
        return (new_sz if new_sz < cur_sz else cur_sz), True

    if non_empty_paras > 1 and tx_total_lines_fit:
        return cur_sz, False

    sz_pt = cur_sz / 100.0
    max_lines_box = max(1, int((ih + sz_pt * 0.2) / (sz_pt * 1.15)))
    lines_needed = estimate_wrapped_lines(new_text, sz_pt, iw, compact_latin=compact_latin)
    per_para_budget = max(1, max_lines_box // max(1, non_empty_paras)) if non_empty_paras > 1 else max_lines_box

    if lines_needed <= per_para_budget:
        return cur_sz, False

    safety = 1.01 if compact_latin else 1.03
    if max_lines_box == 1:
        max_seg_em = max(
            (estimate_text_em_width(seg, compact_latin=compact_latin) for seg in (new_text.split('\n') or [new_text])),
            default=0.0,
        )
        req_w = max(1.0, max_seg_em * sz_pt * safety)
        needed_scale = min(1.0, iw / req_w)
    else:
        needed_scale = min_scale
        target_cap_h = ih * (0.98 / max(1, non_empty_paras) if non_empty_paras > 1 else 1.02)
        for step in range(98, int(min_scale * 100) - 1, -2):
            sc = step / 100.0
            scaled_pt = sz_pt * sc
            ln_need = estimate_wrapped_lines(new_text, scaled_pt, iw, compact_latin=compact_latin)
            if ln_need * scaled_pt * 1.15 <= target_cap_h:
                needed_scale = sc
                break

    eff_scale = max(min_scale, needed_scale)
    if eff_scale >= 0.96:
        return cur_sz, True
    new_sz = max(floor_sz, int(cur_sz * eff_scale))
    return (new_sz if new_sz < cur_sz else cur_sz), True


def align_peer_group_font_sizes(records: List[dict]) -> None:
    """
    Synchronizes shrunk font sizes across same-tier geometric siblings (KPI cards, row pills,
    column items, and compact diagram badges) on a single slide so side-by-side labels stay uniform.
    Each record requires keys: 'cur_sz', 'new_sz', 'box' (BoxMetrics or None).
    """
    candidates = [
        idx for idx, rec in enumerate(records)
        if isinstance(rec.get('box'), BoxMetrics)
        and not rec['box'].is_table
        and rec['box'].raw_w > 0
        and rec['box'].raw_h > 0
        and rec['box'].non_empty_paras == 1
        and rec.get('cur_sz')
    ]
    n = len(candidates)
    if n < 2:
        return

    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    def _are_peers(ri: dict, rj: dict) -> bool:
        if ri['cur_sz'] != rj['cur_sz']:
            return False
        bi, bj = ri['box'], rj['box']
        min_h, max_h = min(bi.raw_h, bj.raw_h), max(bi.raw_h, bj.raw_h)
        if max_h - min_h > max(3.5, min_h * 0.25):
            return False
        same_row = abs(bi.y - bj.y) <= 8.0 and (min(bi.raw_w, bj.raw_w) / max(bi.raw_w, bj.raw_w)) >= 0.35
        same_col = abs(bi.x - bj.x) <= 8.0 and (min(bi.raw_w, bj.raw_w) / max(bi.raw_w, bj.raw_w)) >= 0.45
        compact_tags = (
            max_h <= 24.0
            and abs(bi.raw_h - bj.raw_h) <= 1.5
            and max(bi.raw_w, bj.raw_w) <= 260.0
        )
        return same_row or same_col or compact_tags

    for i in range(n):
        ri = records[candidates[i]]
        for j in range(i + 1, n):
            if _are_peers(ri, records[candidates[j]]):
                union(i, j)

    groups: Dict[int, List[int]] = {}
    for pos, rec_idx in enumerate(candidates):
        groups.setdefault(find(pos), []).append(rec_idx)

    for member_indices in groups.values():
        if len(member_indices) < 2:
            continue
        min_sz = min(records[idx]['new_sz'] for idx in member_indices)
        orig_sz = records[member_indices[0]]['cur_sz']
        if min_sz < orig_sz:
            for idx in member_indices:
                records[idx]['new_sz'] = min(records[idx]['new_sz'], min_sz)


def _run_style_sig(run_el: ET.Element):
    rpr = run_el.find('a:rPr', NS)
    if rpr is None:
        return (None, None, False)
    return (
        rpr.attrib.get('sz'),
        rpr.attrib.get('b'),
        rpr.find('a:solidFill', NS) is not None,
    )


def _replace_runs_single_line(
    p: ET.Element,
    runs: List[ET.Element],
    pairs: List[Tuple[ET.Element, str]],
) -> None:
    first_idx = list(p).index(runs[0])
    for old_r in runs:
        p.remove(old_r)
    for offset, (tmpl_r, seg_text) in enumerate(pairs):
        cloned = copy.deepcopy(tmpl_r)
        t_el = cloned.find('a:t', NS)
        if t_el is None:
            t_el = ET.Element(f'{{{NS["a"]}}}t')
            cloned.append(t_el)
        t_el.text = seg_text
        p.insert(first_idx + offset, cloned)


def scale_paragraph_font_sizes(p: ET.Element, scale_ratio: float, floor_sz: int) -> None:
    """Applies a uniform single-pass scale ratio to every a:r and a:br in a paragraph."""
    if scale_ratio >= 0.999:
        return
    for elem in list(p):
        tag = elem.tag.split('}')[-1]
        if tag not in ('r', 'br'):
            continue
        rpr = elem.find('a:rPr', NS)
        if rpr is not None and 'sz' in rpr.attrib:
            try:
                cur = int(rpr.attrib['sz'])
                rpr.set('sz', str(max(min(cur, floor_sz), int(cur * scale_ratio))))
            except ValueError:
                pass


def apply_paragraph_text_and_breaks(
    p: ET.Element,
    runs: List[ET.Element],
    first_r: ET.Element,
    new_text: str,
    *,
    orig_text: str = '',
) -> None:
    """
    Writes text into paragraph XML while preserving:
    1. Multi-run styles intact when text is unchanged (e.g., styled '82 %'),
    2. Dual-run heading/metric contrast (e.g., bold 'Prefix:' + body, label + small '>90%'),
    3. Semantic <a:br/> line breaks on multiline translations.
    """
    normalized = new_text.replace('\r\n', '\n')

    # Verbatim passthrough multi-run paragraphs: keep every run & break intact
    if orig_text and normalized == orig_text and len(runs) > 1:
        return

    non_empty_runs = [
        (r_el, ''.join(t.text or '' for t in r_el.findall('a:t', NS)))
        for r_el in runs
        if ''.join(t.text or '' for t in r_el.findall('a:t', NS))
    ]
    if '\n' not in normalized and '\n' not in orig_text and len(non_empty_runs) > 1:
        distinct_sigs = {_run_style_sig(r_el) for r_el, _ in non_empty_runs}
        if len(distinct_sigs) > 1:
            for child in list(p):
                if child.tag.split('}')[-1] == 'br':
                    p.remove(child)

            m_colon = _COLON_SPLIT_RE.match(normalized)
            if m_colon:
                prefix_end = -1
                acc = ''
                for i, (_, rt) in enumerate(non_empty_runs[:-1]):
                    acc += rt
                    if acc.rstrip().endswith((':', '：')) and len(acc) <= len(orig_text) * 0.45:
                        prefix_end = i
                        break
                if prefix_end >= 0:
                    prefix_sig = _run_style_sig(non_empty_runs[0][0])
                    tail_runs = [r for r, rt in non_empty_runs[prefix_end + 1:] if rt.strip()]
                    if tail_runs and any(_run_style_sig(r) != prefix_sig for r in tail_runs):
                        body_tmpl = next(
                            (r for r in tail_runs if _run_style_sig(r) != prefix_sig),
                            tail_runs[0],
                        )
                        _replace_runs_single_line(
                            p,
                            runs,
                            [(non_empty_runs[0][0], m_colon.group(1)), (body_tmpl, m_colon.group(2))],
                        )
                        return

            last_r, last_rt = non_empty_runs[-1]
            if _SRC_METRIC_TAIL_RE.match(last_rt.strip()) and _run_style_sig(last_r) != _run_style_sig(non_empty_runs[0][0]):
                m_tail = _TRAILING_METRIC_RE.match(normalized) or _TRAILING_CMP_PCT_RE.match(normalized)
                if m_tail:
                    if m_tail.re is _TRAILING_METRIC_RE:
                        head_part, metric_part = m_tail.group(1), m_tail.group(2) + m_tail.group(3)
                    else:
                        head_part, metric_part = m_tail.group(1), m_tail.group(2)
                    _replace_runs_single_line(
                        p,
                        runs,
                        [(non_empty_runs[0][0], head_part), (last_r, metric_part)],
                    )
                    return

    for child in list(p):
        if child.tag.split('}')[-1] == 'br':
            p.remove(child)

    first_t = first_r.find('a:t', NS)
    if '\n' not in normalized:
        if first_t is not None:
            first_t.text = normalized
        for other_r in runs[1:]:
            other_t = other_r.find('a:t', NS)
            if other_t is not None:
                other_t.text = ''
        return

    segments = normalized.split('\n')
    if first_t is not None:
        first_t.text = segments[0]

    for other_r in runs[1:]:
        p.remove(other_r)

    end_para_idx = None
    for idx, child in enumerate(list(p)):
        if child.tag.split('}')[-1] == 'endParaRPr':
            end_para_idx = idx
            break
    insert_at = end_para_idx if end_para_idx is not None else len(list(p))

    first_rpr = first_r.find('a:rPr', NS)
    for seg in segments[1:]:
        br_el = ET.Element(f'{{{NS["a"]}}}br')
        if first_rpr is not None:
            br_rpr_attrib = {k: v for k, v in first_rpr.attrib.items() if k in ('lang', 'altLang', 'sz')}
            if br_rpr_attrib:
                br_el.append(ET.Element(f'{{{NS["a"]}}}rPr', br_rpr_attrib))
        p.insert(insert_at, br_el)
        insert_at += 1

        seg_run = copy.deepcopy(first_r)
        seg_t = seg_run.find('a:t', NS)
        if seg_t is None:
            seg_t = ET.Element(f'{{{NS["a"]}}}t')
            seg_run.append(seg_t)
        seg_t.text = seg
        p.insert(insert_at, seg_run)
        insert_at += 1


STANDARD_OOXML_NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
    'p15': 'http://schemas.microsoft.com/office/powerpoint/2012/main',
    'p16': 'http://schemas.microsoft.com/office/powerpoint/2015/main',
    'a14': 'http://schemas.microsoft.com/office/drawing/2010/main',
    'a15': 'http://schemas.microsoft.com/office/drawing/2012/main',
    'a16': 'http://schemas.microsoft.com/office/drawing/2014/main',
    'a1611': 'http://schemas.microsoft.com/office/drawing/2016/11/main',
    'asvg': 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    'dgm': 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
    'dsp': 'http://schemas.microsoft.com/office/drawing/2008/diagram',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    'wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'o': 'urn:schemas-microsoft-com:office:office',
    'v': 'urn:schemas-microsoft-com:vml',
}

_XMLNS_DECL_RE = re.compile(r'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"')
_PREFIX_REF_ATTR_RE = re.compile(r'(?:Requires|Ignorable|MustUnderstand)="([^"]+)"')


def register_ooxml_namespaces(extra_pairs: Optional[List[Tuple[str, str]]] = None) -> Dict[str, str]:
    """Registers OOXML prefixes cleanly (preserving p: and Office extension prefixes like p14/mc)."""
    merged = dict(STANDARD_OOXML_NS)
    for prefix, uri in (extra_pairs or []):
        if prefix and uri:
            merged[prefix] = uri
    for prefix, uri in merged.items():
        ET.register_namespace(prefix, uri)
    return merged


def write_xml_preserving_namespaces(tree: ET.ElementTree, orig_xml_bytes: bytes, dest_path: str) -> None:
    """
    Serializes slide XML preserving source namespace prefixes (preventing ET ns0/ns5 mangling
    that leaves mc:Choice Requires='p14' or Ignorable='...' with undeclared prefixes).
    """
    orig_text = orig_xml_bytes.decode('utf-8', errors='replace')
    orig_pairs = _XMLNS_DECL_RE.findall(orig_text)
    ns_map = register_ooxml_namespaces(orig_pairs)

    xml_str = ET.tostring(tree.getroot(), encoding='unicode')

    referenced_prefixes: List[str] = []
    for attr_val in _PREFIX_REF_ATTR_RE.findall(xml_str):
        for tok in attr_val.split():
            if tok and tok not in referenced_prefixes:
                referenced_prefixes.append(tok)

    root_match = re.match(r'^<([^\s/>]+)([^>]*)>', xml_str)
    if root_match:
        root_tag, root_attrs = root_match.group(1), root_match.group(2)
        declared = {p for p, _ in _XMLNS_DECL_RE.findall(root_attrs)}
        missing_decls = []
        for pref in referenced_prefixes:
            if pref not in declared and pref in ns_map:
                missing_decls.append(f' xmlns:{pref}="{ns_map[pref]}"')
                declared.add(pref)
        if missing_decls:
            end_pos = root_match.end() - 1
            xml_str = xml_str[:end_pos] + ''.join(missing_decls) + xml_str[end_pos:]

    with open(dest_path, 'w', encoding='utf-8', newline='') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n')
        f.write(xml_str)
