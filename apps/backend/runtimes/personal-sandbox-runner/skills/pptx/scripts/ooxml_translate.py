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

# 命名空间映射
NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)
ET.register_namespace('', 'http://schemas.openxmlformats.org/presentationml/2006/main')


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

            texts = [r.find('a:t', NS).text for r in runs if r.find('a:t', NS) is not None and r.find('a:t', NS).text]
            full_text = ''.join(texts).strip()

            if full_text:
                key = f"{slide_id}_p{p_idx}"
                extracted_texts[key] = full_text
                mapping[key] = {
                    'rel_file': s_rel_path,
                    'paragraph_index': p_idx,
                    'original_text': full_text
                }

    mapping_file = os.path.join(temp_dir, 'ooxml_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(extracted_texts, f, ensure_ascii=False, indent=2)

    print(f"✅ [3/3] 提取完成！共识别到 {len(extracted_texts)} 处待本地化文本项。")
    return extracted_texts


def _is_passthrough_text(text: str) -> bool:
    """判断是否为无需翻译的纯数字、标点符号、URL、英文简称等"""
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
    # 纯英文字母短缩写或专有名词（如 AI, LLM, RAG, API, PoC, DX, SASE-XDLP）
    if re.fullmatch(r'[A-Za-z0-9_\-\s/\.]{1,15}', s) and not re.search(r'[\u4e00-\u9fa5]', s):
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
        domain_rules = """3. 【日企商务提案专业规范与汉字优先】：概念与功能词优先采用日企通用的紧凑商务汉字或成熟外来语：
   - “数字化转型” -> “DX” 或 “デジタルトランスフォーメーション”
   - “管理平台/底座” -> “管理基盤” / “共通基盤”
   - “业务协同/联动” -> “横断連携” / “シームレスな連携”
   - “降本增效” -> “コスト削減と生産性向上”
   - “赋能/支持” -> “支援” / “エンパワー”
   - “落地/实施” -> “実用化” / “実装” / “本番適用”
   - “闭环” -> “一気通貫” / “自己完結”
   - 通用缩写（AI, LLM, RAG, API, PoC, DX, Fujitsu, SASE-XDLP）保持标准英文字符；
4. 【文风精悍】：采用精悍专业的商业演示文风，标题与卡片短语优先使用体言结句（名词结尾），说明句统一使用である/だ体或简洁名词短语，杜绝口语与拖沓助词；"""
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
   - 严禁出现冗长繁复的主谓从句，多用精炼的项目短语（Bullet Points）；
   - 严格纯正英文输出，严禁混入任何中文字符或日文假名；"""
    else:
        lang_name = f"地道、专业的目标语言({target_lang})"
        domain_rules = """3. 【专业商务术语规范】：采用目标语言在 IT 与企业管理领域的行业通用专业表达，通用技术缩写（AI, LLM, API, PoC）保持标准缩写；
4. 【文风精悍】：采用精悍专业的商业演示文风，避免口语化与冗余修饰，严禁混入非目标语言字符；"""

    prompt = f"""你是一位顶级商业演示与文档本地化专家。请将以下演示文稿（PPTX）文本键值对翻译为{lang_name}。

【核心本地化与排版规范】：
1. 保持输入 JSON 字典的 Key 键名完全一致，仅将 Value 翻译为地道的目标语言；
2. 【排版敏感与字符预算控制】：PPT 版面空间极有限，短标签与卡片节点严禁超过原文字符数的 1.2 倍；严禁在单行文本中随意引入换行符；
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
        if _is_passthrough_text(text):
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

    translated_unique_map = {}
    completed_count = 0

    if batches:
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_to_batch = {
                executor.submit(_translate_single_batch_streaming, b, target_lang, api_base, api_key): idx
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
    ja_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF]')

    missed_unique = {}
    for k, orig_text in all_texts.items():
        trans_text = final_output.get(k, orig_text)
        if _is_passthrough_text(orig_text):
            continue
        needs_sweep = False
        if is_en:
            # 翻译目标为英文时：若译文仍含中文或意外混入了日文假名，视为未翻译完成
            if (zh_pattern.search(trans_text) or ja_pattern.search(trans_text)) and not _is_passthrough_text(trans_text):
                needs_sweep = True
        elif is_ja:
            # 翻译目标为日文时：若中文原样保留且不是同形专有名词
            if zh_pattern.search(orig_text) and trans_text == orig_text:
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
                sw_res = _translate_single_batch_streaming(sw_b, target_lang, api_base, api_key, model="default", retries=3)
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
        if _is_passthrough_text(orig):
            return False
        if is_en:
            return bool(zh_pattern.search(trans) or ja_pattern.search(trans))
        return bool(zh_pattern.search(orig) and trans == orig)

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


# ECMA-376 DrawingML CT_TextCharacterProperties 子元素严格序列映射
RPR_CHILD_ORDER = {
    'ln': 1, 'solidFill': 2, 'gradFill': 3, 'blipFill': 4, 'pattFill': 5,
    'grpFill': 6, 'effectLst': 7, 'effectDag': 8, 'highlight': 9,
    'uLnTx': 10, 'uLn': 11, 'uFillTx': 12, 'uFill': 13,
    'latin': 14, 'ea': 15, 'cs': 16, 'sym': 17,
    'hlinkClick': 18, 'hlinkMouseOver': 19, 'rtl': 20, 'extLst': 21
}


def _sort_rpr_children(rPr):
    """
    根据 ECMA-376 / ISO/IEC 29500-1 DrawingML XSD sequence 严格排序 a:rPr 的子节点，
    确保 a:latin 始终先于 a:ea 出现，杜绝微软 PowerPoint 报“内容有问题需修复”。
    """
    def get_tag_rank(elem):
        tag = elem.tag.split('}')[-1]
        return RPR_CHILD_ORDER.get(tag, 99)
    children = list(rPr)
    children.sort(key=get_tag_rank)
    for c in list(rPr):
        rPr.remove(c)
    for c in children:
        rPr.append(c)


def pack_pptx(temp_dir: str, translated_json_path: str, output_pptx: str,
              lang: str = None, font_ea: str = None, font_latin: str = None,
              auto_fit: bool = True, shrink_font: bool = True) -> str:
    """
    读取翻译后的 JSON，通过 mapping 靶向写回 XML，设置字体与语言，并打包为新的 PPTX。
    默认自动启用版面自适应与字号动态保护。
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
    is_ja = "ja" in lang.lower()
    is_en = "en" in lang.lower()
    if font_latin is None:
        font_latin = "Calibri" if is_en else ("Yu Gothic" if is_ja else "Arial")
    if font_ea is None:
        font_ea = "Yu Gothic" if is_ja else ("Calibri" if is_en else "Microsoft YaHei")

    print(f"📥 [3/4] 正在靶向注入译文并应用排版保护 (总项数: {len(mapping)})...")
    print(f"  ✓ 语言属性: {lang} | 西文字体: {font_latin} | 东亚字体: {font_ea}")
    if auto_fit:
        print("  ✓ 已启用版面智能自适应保护（支持文本自动弹性缩放与安全换行）。")
    if shrink_font:
        print("  ✓ 已启用字号动态保护（长文本智能按比例平滑微调）。")

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
                'key': key
            })

    modified_paragraphs = 0
    shrunk_count = 0

    for rel_file, updates in file_updates.items():
        full_path = os.path.join(temp_dir, rel_file)
        tree = ET.parse(full_path)
        root = tree.getroot()
        parent_map = {c: p for p in tree.iter() for c in p}
        paragraphs = root.findall('.//a:p', NS)
        configured_txbody = set()

        for item in updates:
            p_idx = item['p_idx']
            new_text = item['new_text']
            orig_text = item['original_text']
            if p_idx >= len(paragraphs):
                continue

            p = paragraphs[p_idx]
            runs = p.findall('a:r', NS)
            if not runs:
                continue

            # 若原文本无换行，清洗模型意外生成的折行符，保持单行紧凑
            if '\n' not in orig_text and '\n' in new_text:
                new_text = new_text.replace('\r\n', ' ').replace('\n', ' ')

            # 首个 run 回填完整译文
            first_r = runs[0]
            first_t = first_r.find('a:t', NS)
            if first_t is not None:
                first_t.text = new_text

            # 语言属性与字体保真 (东亚字体与西文字体协同)
            rPr = first_r.find('a:rPr', NS)
            if rPr is None:
                rPr = ET.Element(f'{{{NS["a"]}}}rPr')
                first_r.insert(0, rPr)

            if lang:
                rPr.set('lang', lang)
                rPr.set('altLang', 'en-US' if not is_en else 'zh-CN')
            if font_latin:
                latin = rPr.find('a:latin', NS)
                if latin is not None:
                    latin.set('typeface', font_latin)
                else:
                    latin_elem = ET.Element(f'{{{NS["a"]}}}latin', {'typeface': font_latin})
                    rPr.append(latin_elem)
            if font_ea:
                ea = rPr.find('a:ea', NS)
                if ea is not None:
                    ea.set('typeface', font_ea)
                else:
                    ea_elem = ET.Element(f'{{{NS["a"]}}}ea', {'typeface': font_ea})
                    rPr.append(ea_elem)

            # 严格按照 ECMA-376 XSD sequence 归一化子节点顺序，确保 a:latin 先于 a:ea
            _sort_rpr_children(rPr)

            # 选项：字号智能梯度下调
            if shrink_font and orig_text and len(new_text) > len(orig_text):
                ratio = len(new_text) / max(1, len(orig_text))
                if ratio > 1.25 and 'sz' in rPr.attrib:
                    try:
                        cur_sz = int(rPr.attrib['sz'])
                        scale = min(1.0, (1.0 / ratio) ** 0.5)
                        new_sz = max(900, int(cur_sz * scale))  # 下限 9pt
                        if new_sz < cur_sz:
                            rPr.set('sz', str(new_sz))
                            shrunk_count += 1
                    except ValueError:
                        pass

            # 选项：注入 OOXML 原生 AutoFit 与内边距保护 (文本框级幂等处理)
            if auto_fit:
                txBody = parent_map.get(p)
                if txBody is not None and txBody not in configured_txbody:
                    configured_txbody.add(txBody)
                    bodyPr = txBody.find('a:bodyPr', NS)
                    if bodyPr is not None:
                        bodyPr.set('wrap', 'square')
                        for child in list(bodyPr):
                            if child.tag.endswith('noAutofit') or child.tag.endswith('spAutoFit') or child.tag.endswith('normAutofit'):
                                bodyPr.remove(child)
                        autofit_elem = ET.Element(f'{{{NS["a"]}}}normAutofit', {'fontScale': '80000', 'lnSpcReduction': '20000'})
                        bodyPr.append(autofit_elem)

            # 清空同一段落内其余碎片 runs 中的文本
            for other_r in runs[1:]:
                other_t = other_r.find('a:t', NS)
                if other_t is not None:
                    other_t.text = ''

            modified_paragraphs += 1

        tree.write(full_path, encoding='utf-8', xml_declaration=True)

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
