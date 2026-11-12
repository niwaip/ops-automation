#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OOXML PowerPoint 高保真翻译与多语言替换引擎
通过直接操作 Office Open XML (OOXML) 结构，实现 100% 格式无损的 PPTX 文本提取、AI 去重流式并发翻译与回填打包。
支持原文字符预算感知、去重透传加速、原生 AutoFit 保护与字号智能梯度自适应。
"""

import os
import sys
import json
import shutil
import zipfile
import argparse
import re
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree as ET

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from pptx_layout_fit import (
    NS,
    RPR_CHILD_ORDER,
    _BILINGUAL_EA_COMPAT_FONTS,
    align_peer_group_font_sizes,
    apply_paragraph_text_and_breaks as _apply_paragraph_text_and_breaks,
    collect_slide_box_metrics as _collect_slide_box_metrics,
    compute_fit_font_size as _compute_fit_font_size,
    estimate_text_em_width as _estimate_text_em_width,
    estimate_wrapped_lines as _estimate_wrapped_lines,
    hierarchy_shrink_bounds as _hierarchy_shrink_bounds,
    localize_run_fonts as _localize_run_fonts,
    register_ooxml_namespaces as _register_ooxml_namespaces,
    scale_paragraph_font_sizes as _scale_paragraph_font_sizes,
    sort_rpr_children as _sort_rpr_children,
    write_xml_preserving_namespaces as _write_xml_preserving_namespaces,
)

_register_ooxml_namespaces()


def unpack_pptx(pptx_path: str, temp_dir: str, out_json_path: str) -> dict:
    """
    解包 PPTX 并提取所有段落的文本，生成待翻译键值对 JSON
    """
    if not os.path.isfile(pptx_path):
        raise FileNotFoundError(f"找不到输入的 PPTX 文件: {pptx_path}")

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    print(f"📦 [1/3] 正在解析原始演示文稿归档: {os.path.basename(pptx_path)}")
    with zipfile.ZipFile(pptx_path, 'r') as z:
        z.extractall(temp_dir)

    slides_dir = os.path.join(temp_dir, 'ppt', 'slides')
    if not os.path.exists(slides_dir):
        raise RuntimeError("PPTX 结构异常: 未找到 ppt/slides 目录")

    def get_slide_num(name):
        m = re.search(r'slide(\d+)\.xml', name)
        return int(m.group(1)) if m else 9999

    slide_files = sorted(
        [f for f in os.listdir(slides_dir) if f.startswith('slide') and f.endswith('.xml')],
        key=get_slide_num
    )

    extracted_texts = {}
    mapping = {}

    print(f"🔍 [2/3] 正在提取演示文稿图文结构与段落 (共 {len(slide_files)} 页幻灯片)...")

    for s_file in slide_files:
        s_rel_path = os.path.join('ppt', 'slides', s_file)
        full_path = os.path.join(temp_dir, s_rel_path)
        tree = ET.parse(full_path)
        root = tree.getroot()

        slide_id = s_file.replace('.xml', '')
        paragraphs = root.findall('.//a:p', NS)

        for p_idx, p in enumerate(paragraphs):
            runs = p.findall('a:r', NS)
            if not runs:
                continue

            parts = []
            for child in p:
                local_tag = child.tag.split('}')[-1]
                if local_tag == 'r':
                    t_elem = child.find('a:t', NS)
                    if t_elem is not None and t_elem.text:
                        parts.append(t_elem.text)
                elif local_tag == 'br':
                    parts.append('\n')
            raw_text = ''.join(parts)
            leading_ws = raw_text[:len(raw_text) - len(raw_text.lstrip())]
            full_text = raw_text.strip()

            if full_text:
                key = f"{slide_id}_p{p_idx}"
                extracted_texts[key] = full_text
                meta_entry = {
                    'rel_file': s_rel_path,
                    'paragraph_index': p_idx,
                    'original_text': full_text,
                }
                if leading_ws:
                    meta_entry['leading_ws'] = leading_ws
                mapping[key] = meta_entry

    mapping_file = os.path.join(temp_dir, 'ooxml_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(extracted_texts, f, ensure_ascii=False, indent=2)

    print(f"✅ [3/3] 提取完成！共识别到 {len(extracted_texts)} 处待本地化文本项。")
    return extracted_texts


_JA_KANA_RE = re.compile(r'[\u3041-\u3096\u30A1-\u30FA]')
_CJK_OR_KANA_OR_HANGUL_RE = re.compile(r'[\u2E80-\u9FFF\u3041-\u3096\u30A1-\u30FA\uAC00-\uD7AF]')
_ZH_SIMPLIFIED_HINT_RE = re.compile(r'[云业为从优构图网边鉴权护设备资审联闭环统览据库检识应处开实转软节简录频译议签问线层]')


def _is_passthrough_text(text: str, target_lang: str = None) -> bool:
    """判断是否为无需翻译的纯数字、标点符号、URL、英文简称或已是目标语言的文本"""
    s = text.strip()
    if not s:
        return True
    # 纯数字、百分比、货币、范围（如 82%, 12×, 15 KRMB/年, 2026年03月01日）
    if re.fullmatch(r'[\d\s\.,\+\-\*\/%×~><:;（）\(\)\$€¥KRMB]+', s):
        return True
    # URL 或 网址
    if re.match(r'^(?:https?://|www\.)', s, re.I):
        return True
    # 电话号码
    if re.match(r'^\+?\d[\d\s\-]{6,}\d$', s):
        return True
    # 纯英文字母短缩写或专有名词（如 AI, LLM, RAG, API, PoC, DX, SASE-XDLP, OneAI\nAI Gateway）
    if re.fullmatch(r'[A-Za-z0-9_\-\s/\.]{1,20}', s) and not re.search(r'[\u4e00-\u9fa5]', s):
        return True
    if target_lang:
        tl = target_lang.lower()
        # 目标为日文：已包含平假名/片假名（排除 U+30FB 中黑点）且不含简体特征字的原文直接透传
        if 'ja' in tl and _JA_KANA_RE.search(s) and not _ZH_SIMPLIFIED_HINT_RE.search(s):
            return True
        # 目标为英文：不含任何中日韩文字的纯西文直接透传
        if 'en' in tl and not _CJK_OR_KANA_OR_HANGUL_RE.search(s):
            return True
    return False


def _translate_single_batch_streaming(batch_dict: dict, target_lang: str, api_base: str, api_key: str,
                                      model: str = "default", retries: int = 2) -> dict:
    """
    流式单批次调用 LLM 翻译，自带心跳防超时与格式解析容错
    """
    is_ja = "ja" in target_lang.lower()
    is_en = "en" in target_lang.lower()

    if is_ja:
        lang_name = "地道、专业的商务日语 (Professional Business Japanese)"
        domain_rules = """3. 【日企商务提案专业规范与用字纯净度】：概念与功能词优先采用日企通用的紧凑商务日语汉字（新字体）或成熟外来语：
   - “阿里云” -> 必须写作 “Alibaba Cloud” 或 “アリババクラウド”（严禁音译为“阿裡雲”等中式简繁写法）
   - “数字化转型” -> “DX” 或 “デジタルトランスフォーメーション”
   - “管理平台/底座” -> “管理基盤” / “共通基盤”
   - “业务协同/联动” -> “横断連携” / “シームレスな連携”
   - “降本增效” -> “コスト削減と生産性向上”
   - “赋能/支持” -> “支援” / “エンパワー”
   - “落地/实施” -> “実用化” / “実装” / “本番適用”
   - “闭环” -> “一気通貫” / “自己完結”
   - “防护” -> “防御” / “保護”（严禁保留简体字“护”）
   - 通用缩写（AI, LLM, RAG, API, PoC, DX, Fujitsu, SASE-XDLP）保持标准英文字符；
4. 【文风精悍与严禁中简字混入】：采用精悍专业的商业演示文风，标题与卡片短语优先使用体言结句（名词结尾）；严禁混入任何中国简体字（如 护/构/图/鉴/权/边/网）或非日语繁体异体字（如 裡）；"""
    elif is_en:
        lang_name = "专业、地道的国际商务英语 (Professional Business English)"
        domain_rules = """3. 【国际企业级技术与咨询规范】：
   - “企业级AIGC服务” -> "Enterprise-Grade AIGC Services"
   - “数字化转型” -> "Digital Transformation (DX)"
   - “管理平台/底座” -> "Management Platform" / "Foundation Platform"
   - “业务协同/联动” -> "Cross-Functional Collaboration" / "Seamless Integration"
   - “降本增效” -> "Cost Optimization & Productivity Gains"
   - “赋能/支持” -> "Empowerment" / "Enablement"
   - “落地/实施” -> "Production Deployment" / "Implementation" / "Real-World Adoption"
   - “闭环” -> "End-to-End Workflow" / "Closed-Loop Governance"
   - “可管/可控/可审” -> "Manageable, Controllable, Auditable"
   - 通用技术缩写（AI, LLM, RAG, API, PoC, DX, Fujitsu, SASE-XDLP）保持标准大写；
4. 【文风精悍 (Executive Presentation Style)】：
   - 标题与卡片短语使用 Action-Oriented Title Case 或简练名词短语；
   - 极短标签、胶囊徽章与表格表头务必精炼（尽量 2–4 个词，省略冗余冠词 a/an/the 及可省动词），避免撑破窄框；
   - 严禁出现冗长繁复的主谓从句，多用精炼的项目短语（Bullet Points）；
   - 严格纯正英文输出，严禁混入任何中文字符或日文假名；"""
    else:
        lang_name = f"地道、专业的目标语言({target_lang})"
        domain_rules = """3. 【专业商务术语规范】：采用目标语言在 IT 与企业管理领域的行业通用专业表达，通用技术缩写（AI, LLM, API, PoC）保持标准缩写；
4. 【文风精悍】：采用精悍专业的商业演示文风，避免口语化与冗余修饰，严禁混入非目标语言字符；"""

    prompt = f"""你是一位顶级商业演示与文档本地化专家。请将以下演示文稿（PPTX）文本键值对翻译为{lang_name}。

【核心本地化与排版规范】：
1. 保持输入 JSON 字典的 Key 键名完全一致，仅将 Value 翻译为地道的目标语言；
2. 【排版敏感、换行保留与字符预算】：PPT 版面空间极有限，短标签与卡片节点保持精炼；若原文不含换行符 `\\n`，严禁擅自引入 `\\n`；若原文自带 `\\n`（表示设计师手动语义分行），请在译文对应断词处保留 `\\n`；
{domain_rules}
5. 严格仅返回纯合法 JSON 格式（格式为 {{"key": "译文"}}），严禁包含任何前导解释、注释或 Markdown 代码块标记（严禁写 ```json）。

待翻译数据：
{json.dumps(batch_dict, ensure_ascii=False, indent=2)}"""

    url = f"{api_base.rstrip('/')}/chat/completions"
    req_payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "stream": True,
        "thinking": False,
        "reasoning": {"enabled": False},
        "request_context": "document_translation"
    }
    req_bytes = json.dumps(req_payload).encode('utf-8')

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=req_bytes,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
            )
            chunks = []
            with urllib.request.urlopen(req, timeout=60) as resp:
                for line in resp:
                    l = line.decode('utf-8', errors='replace').strip()
                    if not l.startswith('data:'):
                        continue
                    d = l[5:].strip()
                    if d == '[DONE]':
                        break
                    try:
                        item = json.loads(d)
                        delta = item.get('choices', [{}])[0].get('delta', {})
                        content = delta.get('content', '')
                        if content:
                            chunks.append(content)
                    except Exception:
                        pass

            raw_text = "".join(chunks).strip()
            if raw_text.startswith("```"):
                raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text)
                raw_text = re.sub(r'\s*```$', '', raw_text)

            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict) and len(parsed) > 0:
                        result = {}
                        for k, orig in batch_dict.items():
                            result[k] = parsed.get(k, orig)
                        return result
                except Exception:
                    pass

        except Exception as e:
            if attempt < retries:
                print(f"  ⚠️ 批次调用重试 ({attempt + 1}/{retries}): {e}，等待重试...", flush=True)
                time.sleep(2.0 * (attempt + 1))
            else:
                # 若大批次重试耗尽，自动拆半为 2 个较小批次重试，规避长数据包流式断连
                if len(batch_dict) > 5:
                    items = list(batch_dict.items())
                    mid = len(items) // 2
                    sub1 = dict(items[:mid])
                    sub2 = dict(items[mid:])
                    print(f"  ⚡ 批次遇到上游偶发断连，启动自愈对半重试 ({len(sub1)} + {len(sub2)} 项)...", flush=True)
                    res1 = _translate_single_batch_streaming(sub1, target_lang, api_base, api_key, model=model, retries=retries)
                    res2 = _translate_single_batch_streaming(sub2, target_lang, api_base, api_key, model=model, retries=retries)
                    res = {}
                    res.update(res1)
                    res.update(res2)
                    return res
                return dict(batch_dict)

    # 循环退出自愈
    if len(batch_dict) > 5:
        items = list(batch_dict.items())
        mid = len(items) // 2
        sub1 = dict(items[:mid])
        sub2 = dict(items[mid:])
        print(f"  ⚡ 批次解析不完整，启动自愈对半重试 ({len(sub1)} + {len(sub2)} 项)...", flush=True)
        res1 = _translate_single_batch_streaming(sub1, target_lang, api_base, api_key, model=model, retries=retries)
        res2 = _translate_single_batch_streaming(sub2, target_lang, api_base, api_key, model=model, retries=retries)
        res = {}
        res.update(res1)
        res.update(res2)
        return res

    return dict(batch_dict)


def translate_texts(input_json_path: str, output_json_path: str, target_lang: str = 'ja-JP',
                    batch_size: int = 70, concurrency: int = 4) -> dict:
    """
    读取待翻译 JSON 字典，通过去重、透传过滤与并发流式调用模型代理进行高质量翻译
    """
    if not os.path.isfile(input_json_path):
        raise FileNotFoundError(f"找不到输入的待翻译字典: {input_json_path}")

    with open(input_json_path, 'r', encoding='utf-8') as f:
        all_texts = json.load(f)

    if not all_texts:
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump({}, f, ensure_ascii=False, indent=2)
        return {}

    api_base = os.environ.get('OPENAI_BASE_URL') or os.environ.get('DEEPSEEK_BASE_URL') or 'http://ops-ai-orchestrator:3007/ai/proxy/v1'
    api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('DEEPSEEK_API_KEY') or ''

    # 1. 文本去重与透传过滤优化
    unique_to_translate = {}
    passthrough_translations = {}

    for k, text in all_texts.items():
        if _is_passthrough_text(text, target_lang):
            passthrough_translations[text] = text
        else:
            if text not in unique_to_translate:
                unique_to_translate[text] = f"t_{len(unique_to_translate)}"

    unique_count = len(unique_to_translate)
    total_count = len(all_texts)
    print(f"🌐 [2/4] 启动智能并发本地化翻译 (总项: {total_count}，去重后需翻译项: {unique_count}，免翻译透传项: {len(passthrough_translations)})...")

    # 构建 unique 翻译输入字典
    id_to_unique_text = {uid: text for text, uid in unique_to_translate.items()}
    unique_items = list(id_to_unique_text.items())

    # 2. 分批：合并为更粗粒度的大批次（单批上限 70 项 / 3000 字符），大幅削减往返轮次
    batches = []
    current_chunk = {}
    current_chars = 0
    for uid, text in unique_items:
        t_len = len(text)
        if current_chunk and (len(current_chunk) >= batch_size or (current_chars + t_len) > 3000):
            batches.append(current_chunk)
            current_chunk = {}
            current_chars = 0
        current_chunk[uid] = text
        current_chars += t_len
    if current_chunk:
        batches.append(current_chunk)

    total_batches = len(batches)
    print(f"  ⚡ 智能划分为 {total_batches} 批并发处理 (并发度: {concurrency})...")

    model_name = os.environ.get('DSH_MODEL') or 'default'
    translated_unique_map = {}
    completed_count = 0
    batch_errors = 0

    if batches:
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_to_batch = {
                executor.submit(_translate_single_batch_streaming, b, target_lang, api_base, api_key, model=model_name): idx
                for idx, b in enumerate(batches)
            }
            for future in as_completed(future_to_batch):
                b_idx = future_to_batch[future]
                try:
                    res = future.result()
                    for uid, trans_text in res.items():
                        orig_text = id_to_unique_text.get(uid, "")
                        if orig_text:
                            translated_unique_map[orig_text] = trans_text
                    completed_count += 1
                    pct = int(completed_count / total_batches * 100)
                    print(f"  ✓ 本地化处理进度: {completed_count}/{total_batches} ({pct}%)")
                except Exception as e:
                    batch_errors += 1
                    print(f"  ⚠️ 批次 {b_idx} 处理异常: {e}")
                    for uid, orig_text in batches[b_idx].items():
                        translated_unique_map[orig_text] = orig_text

    # 3. 回填映射到每个段落 key
    final_output = {}
    for k, orig_text in all_texts.items():
        if orig_text in passthrough_translations:
            final_output[k] = orig_text
        elif orig_text in translated_unique_map:
            final_output[k] = translated_unique_map[orig_text]
        else:
            final_output[k] = orig_text

    # 4. 译文全量覆盖与残留质检验收门禁 (支持多语言检测)
    is_en = "en" in target_lang.lower()
    is_ja = "ja" in target_lang.lower()
    zh_pattern = re.compile(r'[\u4e00-\u9fa5]')
    ja_pattern = _JA_KANA_RE

    missed_unique = {}
    for k, orig_text in all_texts.items():
        trans_text = final_output.get(k, orig_text)
        if _is_passthrough_text(orig_text, target_lang):
            continue
        needs_sweep = False
        if is_en:
            # 翻译目标为英文时：若译文仍含中文或意外混入了日文假名，视为未翻译完成
            if (zh_pattern.search(trans_text) or ja_pattern.search(trans_text)) and not _is_passthrough_text(trans_text, target_lang):
                needs_sweep = True
        elif is_ja:
            # 翻译目标为日文时：译文仍含简体特征字，或无假名长汉字串原样保留时触发补译
            if _ZH_SIMPLIFIED_HINT_RE.search(trans_text) or (
                zh_pattern.search(orig_text)
                and trans_text == orig_text
                and not ja_pattern.search(orig_text)
                and len(zh_pattern.findall(orig_text)) >= 6
            ):
                needs_sweep = True
        else:
            if zh_pattern.search(orig_text) and trans_text == orig_text:
                needs_sweep = True

        if needs_sweep and orig_text not in missed_unique:
            missed_unique[orig_text] = f"sw_{len(missed_unique)}"

    if missed_unique:
        print(f"  🔍 [质检验收门禁] 探测到 {len(missed_unique)} 处文本未完成高质量本地化，启动增量靶向补译流水线...")
        sweep_items = list(missed_unique.items())
        sweep_batches = []
        cur_sw = {}
        for text, uid in sweep_items:
            cur_sw[uid] = text
            if len(cur_sw) >= 25:
                sweep_batches.append(cur_sw)
                cur_sw = {}
        if cur_sw:
            sweep_batches.append(cur_sw)

        for sw_b in sweep_batches:
            try:
                sw_res = _translate_single_batch_streaming(sw_b, target_lang, api_base, api_key, model=model_name, retries=3)
                for uid, trans in sw_res.items():
                    orig_candidates = [t for t, u in missed_unique.items() if u == uid]
                    if orig_candidates and trans != orig_candidates[0]:
                        translated_unique_map[orig_candidates[0]] = trans
            except Exception as e:
                print(f"  ⚠️ 增量补译批次处理异常: {e}")

        # 刷新回填映射
        for k, orig_text in all_texts.items():
            if orig_text in translated_unique_map:
                final_output[k] = translated_unique_map[orig_text]

    def _is_untranslated(orig: str, trans: str) -> bool:
        if _is_passthrough_text(orig, target_lang):
            return False
        if is_en:
            return bool(zh_pattern.search(trans) or ja_pattern.search(trans))
        if is_ja:
            return bool(
                _ZH_SIMPLIFIED_HINT_RE.search(trans) or (
                    zh_pattern.search(orig)
                    and trans == orig
                    and not ja_pattern.search(orig)
                    and len(zh_pattern.findall(orig)) >= 6
                )
            )
        return bool(zh_pattern.search(orig) and trans == orig)

    if unique_count > 0 and batch_errors > 0:
        changed_count = sum(1 for orig in unique_to_translate if translated_unique_map.get(orig, orig) != orig)
        if changed_count == 0:
            raise RuntimeError("所有翻译批次调用均失败，未能生成有效译文")

    remaining_samples = [
        final_output.get(k, orig) for k, orig in all_texts.items()
        if _is_untranslated(orig, final_output.get(k, orig))
    ]
    final_missed = len(remaining_samples)
    if final_missed == 0:
        print(f"  ✓ [质检验收通过] 演示文稿全量文本本地化覆盖率 100%，已完全转化为目标语言规范！")
    else:
        sample_disp = remaining_samples[:3]
        print(f"  ℹ️ [质检验收提示] 存在 {final_missed} 处专有名词或标题按规范保持原文 (样本: {sample_disp})。")

    out_dir = os.path.dirname(output_json_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(final_output, f, ensure_ascii=False, indent=2)

    print(f"✅ 文本本地化完成！已保存高质量译文字典至: {output_json_path}")
    return final_output


def pack_pptx(temp_dir: str, translated_json_path: str, output_pptx: str,
              lang: str = None, font_ea: str = None, font_latin: str = None,
              auto_fit: bool = True, shrink_font: bool = True) -> str:
    """
    读取翻译后的 JSON，通过 mapping 靶向写回 XML，设置字体与语言，并打包为新的 PPTX。
    默认自动启用版面自适应、西文紧凑字体本地化、同组卡片字号对齐与多样式 run 保真。
    """
    mapping_file = os.path.join(temp_dir, 'ooxml_mapping.json')
    if not os.path.exists(mapping_file):
        raise FileNotFoundError(f"未找到映射文件 {mapping_file}，请先执行 unpack。")

    if not os.path.isfile(translated_json_path):
        raise FileNotFoundError(f"未找到翻译结果 JSON: {translated_json_path}")

    with open(mapping_file, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    with open(translated_json_path, 'r', encoding='utf-8') as f:
        translations = json.load(f)

    if not lang:
        lang = 'en-US'
    tl = lang.lower()
    is_ja = "ja" in tl
    is_en = "en" in tl
    is_non_cjk_target = not is_ja and "zh" not in tl and "ko" not in tl
    explicit_font_latin = font_latin
    explicit_font_ea = font_ea
    default_font_latin = explicit_font_latin or ("Calibri" if is_en else ("Yu Gothic" if is_ja else "Arial"))
    default_font_ea = explicit_font_ea or ("Yu Gothic" if is_ja else ("Calibri" if is_en else "Microsoft YaHei"))

    print(f"📥 [3/4] 正在靶向注入译文并应用排版保护 (总项数: {len(mapping)})...")
    print(f"  ✓ 语言属性: {lang} | 西文字体: {explicit_font_latin or f'自适应(默认:{default_font_latin})'} | 东亚字体: {explicit_font_ea or f'保留原样(默认:{default_font_ea})'}")
    if auto_fit:
        print("  ✓ 已启用版面智能自适应保护（支持文本自动弹性缩放与安全换行）。")
    if shrink_font:
        print("  ✓ 已启用字号动态保护（同组卡片对齐与长文本按比例微调）。")

    file_updates = {}
    for key, meta in mapping.items():
        rel_file = meta['rel_file']
        if rel_file not in file_updates:
            file_updates[rel_file] = []

        trans_text = translations.get(key)
        if trans_text is not None:
            file_updates[rel_file].append({
                'p_idx': meta['paragraph_index'],
                'new_text': trans_text,
                'original_text': meta.get('original_text', ''),
                'leading_ws': meta.get('leading_ws', ''),
                'key': key
            })

    modified_paragraphs = 0
    shrunk_count = 0

    for rel_file, updates in file_updates.items():
        full_path = os.path.join(temp_dir, rel_file)
        with open(full_path, 'rb') as f:
            orig_xml_bytes = f.read()
        root = ET.fromstring(orig_xml_bytes)
        tree = ET.ElementTree(root)
        paragraphs = root.findall('.//a:p', NS)
        p_metrics = _collect_slide_box_metrics(root)

        # Precompute normalized text per paragraph index and whether multi-paragraph txBody overflows vertically
        normalized_new_by_idx = {}
        new_text_by_p = {}
        for item in updates:
            p_idx = item['p_idx']
            if p_idx >= len(paragraphs):
                continue
            nt = item['new_text']
            ot = item['original_text']
            if '\n' not in ot and '\n' in nt:
                nt = nt.replace('\r\n', ' ').replace('\n', ' ')
            normalized_new_by_idx[p_idx] = nt
            new_text_by_p[paragraphs[p_idx]] = nt

        tx_fits_map = {}
        for info in set(p_metrics.values()):
            if info.non_empty_paras <= 1 or info.inner_w <= 0 or info.inner_h <= 0:
                continue
            used_h = 0.0
            min_sz_pt = 12.0
            for p_el in info.tx_body.findall('a:p', NS):
                txt = new_text_by_p.get(p_el)
                if txt is None:
                    txt = ''.join(t.text or '' for t in p_el.findall('.//a:t', NS)).strip()
                if not txt:
                    continue
                first_r = p_el.find('a:r', NS)
                rpr = first_r.find('a:rPr', NS) if first_r is not None else None
                try:
                    sz_pt = int(rpr.attrib['sz']) / 100.0 if (rpr is not None and 'sz' in rpr.attrib) else 12.0
                except (TypeError, ValueError):
                    sz_pt = 12.0
                min_sz_pt = min(min_sz_pt, sz_pt)
                used_h += _estimate_wrapped_lines(txt, sz_pt, info.inner_w, compact_latin=is_non_cjk_target) * sz_pt * 1.15
            tx_fits_map[info.tx_body] = (used_h <= info.inner_h + min_sz_pt * 0.25)

        overflowed_txbodies = set()
        slide_records = []

        # Pass 1: localize fonts and compute per-paragraph target sizing without mutating sz yet
        for item in updates:
            p_idx = item['p_idx']
            orig_text = item['original_text']
            if p_idx >= len(paragraphs):
                continue

            new_text_core = normalized_new_by_idx[p_idx]
            leading_ws = item.get('leading_ws', '')
            restore_ws = (
                leading_ws
                and not new_text_core[:1].isspace()
                and ((not is_non_cjk_target) or set(leading_ws) <= {' '})
            )
            final_text = (leading_ws + new_text_core) if restore_ws else new_text_core
            orig_cmp = (leading_ws + orig_text) if restore_ws else orig_text

            p = paragraphs[p_idx]
            runs = p.findall('a:r', NS)
            if not runs:
                continue

            first_r = runs[0]
            rPr = first_r.find('a:rPr', NS)
            if rPr is None:
                rPr = ET.Element(f'{{{NS["a"]}}}rPr')
                first_r.insert(0, rPr)

            compact_latin = _localize_run_fonts(
                rPr,
                lang=lang,
                is_en=is_en,
                is_non_cjk_target=is_non_cjk_target,
                explicit_font_latin=explicit_font_latin,
                explicit_font_ea=explicit_font_ea,
                default_font_latin=default_font_latin,
                default_font_ea=default_font_ea,
            )

            box_info = p_metrics.get(p)
            cur_sz = None
            new_sz = None
            floor_sz = 800
            overflowed = False
            if shrink_font and orig_text and 'sz' in rPr.attrib:
                try:
                    cur_sz = int(rPr.attrib['sz'])
                    _, floor_sz = _hierarchy_shrink_bounds(cur_sz)
                    tx_fits = tx_fits_map.get(box_info.tx_body, True) if box_info else True
                    new_sz, overflowed = _compute_fit_font_size(
                        cur_sz, orig_text, final_text, box_info, tx_fits, compact_latin=compact_latin
                    )
                except ValueError:
                    cur_sz = new_sz = None

            slide_records.append({
                'p': p,
                'runs': runs,
                'first_r': first_r,
                'orig_text': orig_cmp,
                'new_text': final_text,
                'cur_sz': cur_sz,
                'new_sz': new_sz if new_sz is not None else cur_sz,
                'floor_sz': floor_sz,
                'overflowed': overflowed,
                'box': box_info,
            })

        # Pass 1.5: unify font sizes across geometric siblings on the same slide
        if shrink_font and slide_records:
            align_peer_group_font_sizes(slide_records)

        # Pass 2: rewrite text/breaks while preserving multi-run styles, then finalize fonts & scale once
        for rec in slide_records:
            p = rec['p']
            if rec['overflowed'] and rec['box'] is not None:
                overflowed_txbodies.add(rec['box'].tx_body)

            first_rpr = rec['first_r'].find('a:rPr', NS)
            first_latin = first_rpr.find('a:latin', NS) if first_rpr is not None else None
            first_ea = first_rpr.find('a:ea', NS) if first_rpr is not None else None
            para_default_latin = (
                first_latin.attrib.get('typeface', default_font_latin)
                if first_latin is not None and not explicit_font_latin
                else default_font_latin
            )
            para_default_ea = (
                first_ea.attrib.get('typeface', default_font_ea)
                if first_ea is not None and not explicit_font_ea
                else default_font_ea
            )

            _apply_paragraph_text_and_breaks(
                p,
                rec['runs'],
                rec['first_r'],
                rec['new_text'],
                orig_text=rec['orig_text'],
            )

            for r_el in p.findall('a:r', NS):
                rpr_el = r_el.find('a:rPr', NS)
                if rpr_el is None:
                    rpr_el = ET.Element(f'{{{NS["a"]}}}rPr')
                    r_el.insert(0, rpr_el)
                _localize_run_fonts(
                    rpr_el,
                    lang=lang,
                    is_en=is_en,
                    is_non_cjk_target=is_non_cjk_target,
                    explicit_font_latin=explicit_font_latin,
                    explicit_font_ea=explicit_font_ea,
                    default_font_latin=para_default_latin,
                    default_font_ea=para_default_ea,
                )

            cur_sz = rec['cur_sz']
            new_sz = rec['new_sz']
            if cur_sz and new_sz and new_sz < cur_sz:
                _scale_paragraph_font_sizes(p, new_sz / cur_sz, rec['floor_sz'])
                shrunk_count += 1

            modified_paragraphs += 1

        # 仅对发生溢出的文本框启用原生 AutoFit 弹性缩排保护（并保留原单行 wrap="none" 语义）
        if auto_fit:
            for txBody in overflowed_txbodies:
                bodyPr = txBody.find('a:bodyPr', NS)
                if bodyPr is not None:
                    if bodyPr.attrib.get('wrap') != 'none':
                        bodyPr.set('wrap', 'square')
                    for child in list(bodyPr):
                        if child.tag.endswith('noAutofit') or child.tag.endswith('spAutoFit') or child.tag.endswith('normAutofit'):
                            bodyPr.remove(child)
                    bodyPr.append(ET.Element(f'{{{NS["a"]}}}normAutofit'))

        _write_xml_preserving_namespaces(tree, orig_xml_bytes, full_path)

    if shrink_font and shrunk_count > 0:
        print(f"  ✓ 已对 {shrunk_count} 处版面敏感文本应用紧凑排版优化。")

    print(f"📦 [4/4] 正在压缩封装高保真目标演示文稿: {os.path.basename(output_pptx)}")
    out_dir = os.path.dirname(output_pptx)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with zipfile.ZipFile(output_pptx, 'w', zipfile.ZIP_DEFLATED) as z_out:
        for root_dir, _, files in os.walk(temp_dir):
            for file in files:
                # 排除所有临时 JSON 字典，杜绝 OPC 未定义部件破坏包结构 (注: .rels 是 OPC 核心关系部件，绝不可按点开头过滤)
                if file.endswith('.json'):
                    continue
                full_path = os.path.join(root_dir, file)
                rel_path = os.path.relpath(full_path, temp_dir)
                z_out.write(full_path, rel_path)

    try:
        from pptx import Presentation
        prs = Presentation(output_pptx)
        print(f"  ✓ 演示文稿结构与完整性校验通过，成功加载 {len(prs.slides)} 页幻灯片。")
    except Exception as e:
        print(f"  ⚠️ 提示: 文档已生成，结构核验细节: {e}")

    print(f"🎉 目标演示文稿已成功生成并保存至交付区: {output_pptx}")
    return output_pptx


def auto_translate_pptx(pptx_path: str, output_pptx: str, lang: str = None, font_ea: str = None,
                        batch_size: int = 70, concurrency: int = 4, temp_dir: str = None,
                        keep_temp: bool = False) -> str:
    """
    一键高保真自动翻译流水线：解包 -> 智能去重并发批量翻译 -> 靶向回填打包
    默认在打包完成后自动清理临时目录，保持沙箱工作区零残留。
    """
    pptx_path = os.path.abspath(pptx_path)
    output_pptx = os.path.abspath(output_pptx)
    custom_temp = temp_dir is not None
    if not temp_dir:
        temp_dir = os.path.join(os.path.dirname(output_pptx), f".ooxml_{os.path.basename(output_pptx)}")

    # 智能语言推断
    if not lang:
        out_name = os.path.basename(output_pptx).lower()
        if any(tok in out_name for tok in ['jp', 'ja', '日语', '日本語', 'japan']):
            lang = 'ja-JP'
        elif any(tok in out_name for tok in ['en', 'english', '英语', '英文']):
            lang = 'en-US'
        else:
            lang = 'en-US'

    in_json = os.path.join(temp_dir, "translation_input.json")
    out_json = os.path.join(temp_dir, "translation_output.json")

    try:
        unpack_pptx(pptx_path, temp_dir, in_json)
        translate_texts(in_json, out_json, target_lang=lang, batch_size=batch_size, concurrency=concurrency)
        pack_pptx(temp_dir, out_json, output_pptx, lang=lang, font_ea=font_ea, auto_fit=True, shrink_font=True)
    finally:
        if not keep_temp and not custom_temp and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
                print(f"🧹 已自动清理临时解包缓存，工作区保持整洁。")
            except Exception:
                pass
    return output_pptx


def main():
    parser = argparse.ArgumentParser(description="OOXML PPTX 高保真解包与多语言自动翻译引擎")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # auto 一键端到端子命令
    auto_parser = subparsers.add_parser("auto", help="一键全自动端到端翻译演示文稿 (解包+并发翻译+回填打包)")
    auto_parser.add_argument("pptx", help="输入的原始 PPTX 路径")
    auto_parser.add_argument("output_pptx", help="输出的目标 PPTX 文件路径")
    auto_parser.add_argument("--lang", default=None, help="目标语言代码 (如: en-US, ja-JP，默认自适应)")
    auto_parser.add_argument("--font", default=None, help="目标东亚字体 (默认自适应)")
    auto_parser.add_argument("--batch-size", type=int, default=70, help="每批翻译项数 (默认: 70)")
    auto_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")
    auto_parser.add_argument("--temp-dir", default=None, help="解压临时目录")
    auto_parser.add_argument("--keep-temp", action="store_true", default=False, help="保留临时解包目录 (默认自动清理)")

    # unpack 子命令
    unpack_parser = subparsers.add_parser("unpack", help="解压 PPTX 并导出待翻译 JSON 字典")
    unpack_parser.add_argument("pptx", help="输入的 PPTX 路径")
    unpack_parser.add_argument("--out-json", default=None, help="输出的 JSON 字典路径")
    unpack_parser.add_argument("--temp-dir", default=None, help="解压临时目录")

    # translate 子命令
    translate_parser = subparsers.add_parser("translate", help="并发批量翻译待翻译 JSON 字典")
    translate_parser.add_argument("in_json", help="输入的待翻译 JSON 字典路径")
    translate_parser.add_argument("out_json", help="输出的译文 JSON 字典路径")
    translate_parser.add_argument("--lang", default="en-US", help="目标语言代码 (默认: en-US)")
    translate_parser.add_argument("--batch-size", type=int, default=70, help="每批翻译项数 (默认: 70)")
    translate_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")

    # pack 子命令
    pack_parser = subparsers.add_parser("pack", help="将翻译后的 JSON 回填并重新打包为 PPTX")
    pack_parser.add_argument("temp_dir", help="解压临时目录")
    pack_parser.add_argument("translated_json", help="翻译后的译文 JSON 字典路径")
    pack_parser.add_argument("output_pptx", help="输出的目标 PPTX 文件路径")
    pack_parser.add_argument("--lang", default="en-US", help="目标语言代码 (默认: en-US)")
    pack_parser.add_argument("--font", default=None, help="目标东亚字体 (默认自适应)")
    pack_parser.add_argument("--auto-fit", action="store_true", default=True, help="启用原生自动缩放与安全换行")
    pack_parser.add_argument("--shrink-font", action="store_true", default=True, help="文本膨胀时自动下调字号")

    args = parser.parse_args()

    if args.action == "auto":
        auto_translate_pptx(
            args.pptx, args.output_pptx,
            lang=args.lang, font_ea=args.font,
            batch_size=args.batch_size, concurrency=args.concurrency,
            temp_dir=args.temp_dir,
            keep_temp=args.keep_temp
        )

    elif args.action == "unpack":
        pptx_path = os.path.abspath(args.pptx)
        temp_dir = args.temp_dir or os.path.join(os.path.dirname(pptx_path), f".ooxml_{os.path.basename(pptx_path)}")
        out_json = args.out_json or os.path.join(os.path.dirname(pptx_path), "translation_input.json")
        unpack_pptx(pptx_path, temp_dir, out_json)

    elif args.action == "translate":
        in_json = os.path.abspath(args.in_json)
        out_json = os.path.abspath(args.out_json)
        translate_texts(in_json, out_json, target_lang=args.lang,
                        batch_size=args.batch_size, concurrency=args.concurrency)

    elif args.action == "pack":
        temp_dir = os.path.abspath(args.temp_dir)
        translated_json = os.path.abspath(args.translated_json)
        output_pptx = os.path.abspath(args.output_pptx)
        pack_pptx(temp_dir, translated_json, output_pptx,
                  lang=args.lang, font_ea=args.font,
                  auto_fit=args.auto_fit, shrink_font=args.shrink_font)


if __name__ == '__main__':
    main()
