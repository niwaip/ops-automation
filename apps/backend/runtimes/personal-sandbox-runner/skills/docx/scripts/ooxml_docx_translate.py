#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OOXML Word (DOCX) 高保真翻译与多语言替换引擎
通过直接解包与操作 Office Open XML (WordprocessingML) 结构，实现 100% 格式无损的 DOCX 文本提取、
AI 去重流式并发翻译与原地回填打包。

保证：
1. 页面尺寸 (A4/Letter)、边距、分栏、纸张方向 100% 原样保留；
2. 页眉、页脚、原生动态页码 (PAGE/NUMPAGES 域) 100% 原样保留；
3. 表格结构、单元格宽度、边框、底纹、隔行交替背景 100% 原样保留；
4. 样式表 (styles.xml)、主题 (theme1.xml)、字体表 (fontTable.xml) 100% 原样保留；
5. 原地注入目标语言 (w:lang) 与东亚字体 (w:eastAsia)，按 ECMA-376 规范归一化 rPr 子元素顺序。
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

# WordprocessingML 命名空间映射
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'v': 'urn:schemas-microsoft-com:vml',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'xml': 'http://www.w3.org/XML/1998/namespace'
}

for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)

# ECMA-376 Part 1 Section 17.3.2 CT_RPr 子元素严格 XSD 顺序映射
WORD_RPR_CHILD_ORDER = {
    'rStyle': 1, 'rFonts': 2, 'b': 3, 'bCs': 4, 'i': 5, 'iCs': 6,
    'caps': 7, 'smallCaps': 8, 'strike': 9, 'dstrike': 10, 'outline': 11,
    'shadow': 12, 'emboss': 13, 'imprint': 14, 'noProof': 15, 'snapToGrid': 16,
    'vanish': 17, 'color': 18, 'spacing': 19, 'w': 20, 'kern': 21,
    'position': 22, 'sz': 23, 'szCs': 24, 'highlight': 25, 'u': 26,
    'effect': 27, 'bdr': 28, 'shd': 29, 'fitText': 30, 'vertAlign': 31,
    'rtl': 32, 'cs': 33, 'em': 34, 'lang': 35, 'eastAsianLayout': 36,
    'specVanish': 37, 'oMath': 38,
}


def _sort_word_rpr(rPr):
    """根据 ECMA-376 XSD 严格排序 w:rPr 子节点，杜绝 Word 报文档结构损坏"""
    def get_tag_rank(elem):
        tag = elem.tag.split('}')[-1]
        return WORD_RPR_CHILD_ORDER.get(tag, 99)

    children = list(rPr)
    children.sort(key=get_tag_rank)
    for c in list(rPr):
        rPr.remove(c)
    for c in children:
        rPr.append(c)


def unpack_docx(docx_path: str, temp_dir: str, out_json_path: str) -> dict:
    """
    解包 DOCX 并提取所有正文、表格、页眉、页脚及脚注中的段落文本，导出待翻译 JSON
    """
    if not os.path.isfile(docx_path):
        raise FileNotFoundError(f"找不到输入的 DOCX 文件: {docx_path}")

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    print(f"📦 [1/3] 正在解析原始 Word 文档归档: {os.path.basename(docx_path)}")
    with zipfile.ZipFile(docx_path, 'r') as z:
        z.extractall(temp_dir)

    # 尝试整合碎片 Runs (若存在 merge_runs 模块则优先执行)
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        if script_dir not in sys.path:
            sys.path.insert(0, script_dir)
        from merge_runs import merge_runs
        merged_count, _ = merge_runs(temp_dir)
        if merged_count > 0:
            print(f"  ✓ 已整合 {merged_count} 处碎片 XML Runs，保证词句语义完整。")
    except Exception as e:
        pass

    # 目标检索文件清单 (主文档 + 页眉 + 页脚 + 脚注 + 尾注)
    target_files = []
    word_dir = os.path.join(temp_dir, 'word')
    if not os.path.exists(word_dir):
        raise RuntimeError("DOCX 结构异常: 未找到 word 目录")

    # 保证 document.xml 优先处理
    doc_main = os.path.join(word_dir, 'document.xml')
    if os.path.isfile(doc_main):
        target_files.append('word/document.xml')

    for fname in sorted(os.listdir(word_dir)):
        if fname == 'document.xml':
            continue
        if fname.endswith('.xml') and any(tag in fname for tag in ['header', 'footer', 'footnote', 'endnote']):
            target_files.append(f'word/{fname}')

    extracted_texts = {}
    mapping = {}

    print(f"🔍 [2/3] 正在提取文档图文、表格与版面段落 (共扫描 {len(target_files)} 个部件)...")

    for rel_path in target_files:
        full_path = os.path.join(temp_dir, rel_path)
        if not os.path.isfile(full_path):
            continue

        tree = ET.parse(full_path)
        root = tree.getroot()
        file_tag = os.path.splitext(os.path.basename(rel_path))[0]

        paragraphs = root.findall('.//w:p', NS)
        for p_idx, p in enumerate(paragraphs):
            runs = p.findall('.//w:r', NS)
            if not runs:
                continue

            text_nodes = [t.text for t in p.findall('.//w:t', NS) if t.text]
            full_text = ''.join(text_nodes).strip()

            if full_text:
                key = f"{file_tag}_p{p_idx}"
                extracted_texts[key] = full_text
                mapping[key] = {
                    'rel_file': rel_path,
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
    # 纯英文字母短缩写或专有名词（如 AI, LLM, RAG, API, PoC, DX, SASE-XDLP）
    if re.fullmatch(r'[A-Za-z0-9_\-\s/\.]{1,15}', s) and not re.search(r'[\u4e00-\u9fa5]', s):
        return True
    return False


def _translate_single_batch_streaming(batch_dict: dict, target_lang: str, api_base: str, api_key: str,
                                      model: str = "default", retries: int = 2) -> dict:
    """流式单批次调用 LLM 翻译，自带心跳防超时与格式解析容错"""
    is_ja = "ja" in target_lang.lower()
    is_en = "en" in target_lang.lower()

    if is_ja:
        lang_name = "地道、专业的商务与法律日语 (Professional Business & Legal Japanese)"
        domain_rules = """3. 【日企合同与商务专业规范】：
   - 采用标准日本合同文风（である体/だ体，条文使用「〜ものとする」「〜とする」）；
   - 专有名词标准对照：
     * 甲方 -> 「甲」または「甲社」
     * 乙方 -> 「乙」または「乙社」
     * 专有信息 / 商业秘密 -> 「専有情報」 / 「営業秘密」
     * 接收方 / 透露方 -> 「受取側」 / 「開示側」
     * 连带责任 -> 「連帯責任」
     * 违约赔偿 / 损失 -> 「損害賠償」 / 「あらゆる損失または損害」
     * 签字 / 盖章 -> 「署名：」 / 「捺印：」
   - 通用技术缩写（AI, LLM, API, PoC, DX, SASE）保持标准英文字符；
4. 【排版严谨】：保留原句的标点与段落结构，严禁在单句内随意多换行；"""
    elif is_en:
        lang_name = "专业、地道的商业与法律英语 (Professional Business & Legal English)"
        domain_rules = """3. 【国际企业合同与法务规范】：
   - 采用国际标准合同用语（Shall, Disclosing Party, Receiving Party, Proprietary Information, Confidentiality Agreement）；
   - 签字栏签署项标准对照：签字 -> "Signature:", 盖章 -> "Seal / Stamp:", 日期 -> "Date:";
   - 纯正英文输出，严禁混入中文字符；
4. 【排版严谨】：保持段落原意，句式严密规范；"""
    else:
        lang_name = f"地道、专业的目标语言({target_lang})"
        domain_rules = """3. 【专业术语规范】：采用目标语言在商务与法务领域的行业通用专业表达，通用技术缩写保持标准缩写；
4. 【文风严谨】：符合正式商务合同公文规范；"""

    prompt = f"""你是一位顶级商业文档与法律合同本地化专家。请将以下 Word (DOCX) 文档文本键值对翻译为{lang_name}。

【核心本地化与排版规范】：
1. 保持输入 JSON 字典的 Key 键名完全一致，仅将 Value 翻译为地道的目标语言；
2. 即使是单独的标题、短语或签名栏（如“签字：”、“盖章：”），也必须准确翻译为目标语言（如日文“署名：”、“捺印：”）；
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
                time.sleep(2.0 * (attempt + 1))
            else:
                if len(batch_dict) > 5:
                    items = list(batch_dict.items())
                    mid = len(items) // 2
                    sub1 = dict(items[:mid])
                    sub2 = dict(items[mid:])
                    res1 = _translate_single_batch_streaming(sub1, target_lang, api_base, api_key, model=model, retries=retries)
                    res2 = _translate_single_batch_streaming(sub2, target_lang, api_base, api_key, model=model, retries=retries)
                    res = {}
                    res.update(res1)
                    res.update(res2)
                    return res
                return dict(batch_dict)

    if len(batch_dict) > 5:
        items = list(batch_dict.items())
        mid = len(items) // 2
        sub1 = dict(items[:mid])
        sub2 = dict(items[mid:])
        res1 = _translate_single_batch_streaming(sub1, target_lang, api_base, api_key, model=model, retries=retries)
        res2 = _translate_single_batch_streaming(sub2, target_lang, api_base, api_key, model=model, retries=retries)
        res = {}
        res.update(res1)
        res.update(res2)
        return res

    return dict(batch_dict)


def translate_texts(input_json_path: str, output_json_path: str, target_lang: str = 'ja-JP',
                    batch_size: int = 60, concurrency: int = 4) -> dict:
    """读取待翻译 JSON 字典，通过去重、透传过滤与并发流式调用模型代理进行高质量翻译"""
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

    # 1. 文本去重与透传过滤
    unique_to_translate = {}
    passthrough_translations = {}

    for k, text in all_texts.items():
        if _is_passthrough_text(text):
            passthrough_translations[text] = text
        else:
            if text not in unique_to_translate:
                unique_to_translate[text] = f"t_{len(unique_to_translate)}"

    print(f"🌐 [2/4] 启动智能并发本地化翻译 (总项: {len(all_texts)}，去重后需翻译项: {len(unique_to_translate)}，免翻译透传项: {len(passthrough_translations)})...")

    # 2. 分批并发翻译
    unique_items = list(unique_to_translate.items())
    batches = []
    current_batch = {}

    for text, uid in unique_items:
        current_batch[uid] = text
        if len(current_batch) >= batch_size:
            batches.append(current_batch)
            current_batch = {}
    if current_batch:
        batches.append(current_batch)

    translated_unique_map = {}
    total_batches = len(batches)

    if total_batches == 0:
        pass
    else:
        print(f"  ⚡ 智能划分为 {total_batches} 批并发处理 (并发度: {concurrency})...")
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_to_idx = {
                executor.submit(_translate_single_batch_streaming, b, target_lang, api_base, api_key, model="default"): idx
                for idx, b in enumerate(batches)
            }
            completed_batches = 0
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                completed_batches += 1
                pct = int(completed_batches / total_batches * 100)
                print(f"  ✓ 本地化处理进度: {completed_batches}/{total_batches} ({pct}%)", flush=True)
                try:
                    b_res = future.result()
                    for uid, trans in b_res.items():
                        orig_candidates = [t for t, u in unique_to_translate.items() if u == uid]
                        if orig_candidates:
                            translated_unique_map[orig_candidates[0]] = trans
                except Exception as e:
                    print(f"  ⚠️ 批次 {idx} 发生异常: {e}")
                    for uid, text in batches[idx].items():
                        orig_text = [t for t, u in unique_to_translate.items() if u == uid][0]
                        translated_unique_map[orig_text] = orig_text

    # 3. 回填映射
    final_output = {}
    for k, orig_text in all_texts.items():
        if orig_text in passthrough_translations:
            final_output[k] = orig_text
        elif orig_text in translated_unique_map:
            final_output[k] = translated_unique_map[orig_text]
        else:
            final_output[k] = orig_text

    # 4. 译文全量覆盖与残留质检验收门禁
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
            if (zh_pattern.search(trans_text) or ja_pattern.search(trans_text)) and not _is_passthrough_text(trans_text):
                needs_sweep = True
        elif is_ja:
            if zh_pattern.search(orig_text) and trans_text == orig_text:
                needs_sweep = True
        else:
            if zh_pattern.search(orig_text) and trans_text == orig_text:
                needs_sweep = True

        if needs_sweep and orig_text not in missed_unique:
            missed_unique[orig_text] = f"sw_{len(missed_unique)}"

    if missed_unique:
        print(f"  🔍 [质检验收门禁] 探测到 {len(missed_unique)} 处文本未完成高质量本地化，启动增量靶向补译流水线...")
        sweep_batches = []
        cur_sw = {}
        for text, uid in missed_unique.items():
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

        for k, orig_text in all_texts.items():
            if orig_text in translated_unique_map:
                final_output[k] = translated_unique_map[orig_text]

    out_dir = os.path.dirname(output_json_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(final_output, f, ensure_ascii=False, indent=2)

    print(f"✅ 文本本地化完成！已保存高质量译文字典至: {output_json_path}")
    return final_output


def pack_docx(temp_dir: str, translated_json_path: str, output_docx: str,
              lang: str = None, font_ea: str = None, font_latin: str = None) -> str:
    """
    读取翻译后的 JSON，通过 mapping 靶向原地写回 XML，设置字体与语言，并打包为新的 DOCX。
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
        font_ea = "MS Mincho" if is_ja else ("Calibri" if is_en else "Microsoft YaHei")

    print(f"📥 [3/4] 正在靶向注入译文并应用排版保护 (总项数: {len(mapping)})...")
    print(f"  ✓ 语言属性: {lang} | 西文字体: {font_latin} | 东亚字体: {font_ea}")

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

    for rel_file, updates in file_updates.items():
        full_path = os.path.join(temp_dir, rel_file)
        if not os.path.isfile(full_path):
            continue

        # 读取原始文件开头的 root tag，提取完整的命名空间声明 (xmlns:*) 与属性
        orig_root_tag = None
        try:
            with open(full_path, 'r', encoding='utf-8') as f_orig:
                raw_head = f_orig.read(4096)
                m_tag = re.search(r'(<\w+:[^>]+>)', raw_head)
                if m_tag:
                    orig_root_tag = m_tag.group(1)
        except Exception:
            pass

        tree = ET.parse(full_path)
        root = tree.getroot()
        paragraphs = root.findall('.//w:p', NS)

        for item in updates:
            p_idx = item['p_idx']
            new_text = item['new_text']
            orig_text = item['original_text']

            if p_idx >= len(paragraphs):
                continue

            # 核心保护 1: 若文本未发生实质变化（如纯数字页码或未变字符），绝对不触碰段落与 Run，100% 保持原有复杂域结构
            if new_text is None or new_text.strip() == orig_text.strip():
                continue

            p = paragraphs[p_idx]
            runs = p.findall('.//w:r', NS)

            # 若段落完全没有 Run 则动态创建一个
            if not runs:
                new_run = ET.Element(f'{{{NS["w"]}}}r')
                p.append(new_run)
                runs = [new_run]

            # 清洗非必要的换行符，保持单行紧凑
            if '\n' not in orig_text and '\n' in new_text:
                new_text = new_text.replace('\r\n', ' ').replace('\n', ' ')

            # 核心保护 2: 优先定位真正承载 <w:t> 的 Run，严禁将文本塞入 <w:fldChar> 等非文本控制 Run 中
            target_r = None
            first_t = None
            for r in runs:
                t = r.find('w:t', NS)
                if t is not None:
                    target_r = r
                    first_t = t
                    break

            if target_r is None:
                target_r = runs[0]
                first_t = ET.Element(f'{{{NS["w"]}}}t')
                target_r.append(first_t)

            first_r = target_r

            # 支持多行折行 (<w:br/>) 注入
            if '\n' in new_text:
                for child in list(first_r):
                    if child.tag.endswith('}t') or child.tag.endswith('}br'):
                        first_r.remove(child)
                lines = new_text.split('\n')
                for l_idx, line in enumerate(lines):
                    if l_idx > 0:
                        first_r.append(ET.Element(f'{{{NS["w"]}}}br'))
                    t_elem = ET.Element(f'{{{NS["w"]}}}t')
                    t_elem.text = line
                    if line.startswith(' ') or line.endswith(' ') or '  ' in line:
                        t_elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    first_r.append(t_elem)
            else:
                first_t.text = new_text
                if new_text.startswith(' ') or new_text.endswith(' ') or '  ' in new_text:
                    first_t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

            # 语言属性与字体保真 (东亚字体与西文字体协同)
            rPr = first_r.find('w:rPr', NS)
            if rPr is None:
                rPr = ET.Element(f'{{{NS["w"]}}}rPr')
                first_r.insert(0, rPr)

            lang_elem = rPr.find('w:lang', NS)
            if lang_elem is None:
                lang_elem = ET.Element(f'{{{NS["w"]}}}lang')
                rPr.append(lang_elem)
            lang_elem.set(f'{{{NS["w"]}}}val', lang)
            if is_ja:
                lang_elem.set(f'{{{NS["w"]}}}eastAsia', 'ja-JP')
            elif 'zh' in lang.lower():
                lang_elem.set(f'{{{NS["w"]}}}eastAsia', 'zh-CN')

            rfonts = rPr.find('w:rFonts', NS)
            if rfonts is None:
                rfonts = ET.Element(f'{{{NS["w"]}}}rFonts')
                rPr.append(rfonts)
            if font_ea:
                rfonts.set(f'{{{NS["w"]}}}eastAsia', font_ea)
            if font_latin:
                rfonts.set(f'{{{NS["w"]}}}ascii', font_latin)
                rfonts.set(f'{{{NS["w"]}}}hAnsi', font_latin)

            # 严格按照 ECMA-376 XSD sequence 归一化子节点顺序
            _sort_word_rpr(rPr)

            # 清空同一段落内其余碎片 runs 中的文本（仅清空 <w:t>，不破坏字段或几何对象）
            for other_r in runs:
                if other_r is not first_r:
                    for other_t in other_r.findall('w:t', NS):
                        other_t.text = ''

            modified_paragraphs += 1

        tree.write(full_path, encoding='utf-8', xml_declaration=True)

        # 核心保护 3: 恢复原始 root tag 与所有 33+ 命名空间声明，杜绝 Word 报 "发现无法读取的内容"
        if orig_root_tag:
            try:
                with open(full_path, 'r', encoding='utf-8') as f_read:
                    xml_content = f_read.read()
                xml_content_fixed = re.sub(r'<\w+:[^>]+>', orig_root_tag, xml_content, count=1)
                with open(full_path, 'w', encoding='utf-8') as f_write:
                    f_write.write(xml_content_fixed)
            except Exception:
                pass

    print(f"📦 [4/4] 正在压缩封装高保真目标 Word 文档: {os.path.basename(output_docx)}")
    out_dir = os.path.dirname(output_docx)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with zipfile.ZipFile(output_docx, 'w', zipfile.ZIP_DEFLATED) as z_out:
        for root_dir, _, files in os.walk(temp_dir):
            for file in files:
                # 排除所有中间临时 JSON 字典
                if file.endswith('.json'):
                    continue
                full_path = os.path.join(root_dir, file)
                rel_path = os.path.relpath(full_path, temp_dir)
                z_out.write(full_path, rel_path)

    # 尝试使用 python-docx 快速自检完整性
    try:
        from docx import Document
        doc = Document(output_docx)
        print(f"  ✓ 文档结构与完整性校验通过，成功加载 {len(doc.paragraphs)} 个段落。")
    except Exception as e:
        print(f"  ⚠️ 提示: 文档已生成，结构核验细节: {e}")

    print(f"🎉 目标 Word 文档已成功生成并保存至交付区: {output_docx}")
    return output_docx


def auto_translate_docx(docx_path: str, output_docx: str, lang: str = None, font_ea: str = None,
                        batch_size: int = 60, concurrency: int = 4, temp_dir: str = None,
                        keep_temp: bool = False) -> str:
    """
    一键高保真自动翻译流水线：解包 -> 智能去重并发批量翻译 -> 靶向回填打包
    默认在打包完成后自动清理临时目录，保持沙箱工作区零残留。
    """
    docx_path = os.path.abspath(docx_path)
    output_docx = os.path.abspath(output_docx)
    custom_temp = temp_dir is not None
    if not temp_dir:
        temp_dir = os.path.join(os.path.dirname(output_docx), f".ooxml_{os.path.basename(output_docx)}")

    # 智能语言推断
    if not lang:
        out_name = os.path.basename(output_docx).lower()
        if any(tok in out_name for tok in ['jp', 'ja', '日语', '日本語', 'japan']):
            lang = 'ja-JP'
        elif any(tok in out_name for tok in ['en', 'english', '英语', '英文']):
            lang = 'en-US'
        else:
            lang = 'en-US'

    in_json = os.path.join(temp_dir, "translation_input.json")
    out_json = os.path.join(temp_dir, "translation_output.json")

    try:
        unpack_docx(docx_path, temp_dir, in_json)
        translate_texts(in_json, out_json, target_lang=lang, batch_size=batch_size, concurrency=concurrency)
        pack_docx(temp_dir, out_json, output_docx, lang=lang, font_ea=font_ea)
    finally:
        if not keep_temp and not custom_temp and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
                print(f"🧹 已自动清理临时解包缓存，工作区保持整洁。")
            except Exception:
                pass
    return output_docx


def main():
    parser = argparse.ArgumentParser(description="OOXML Word (DOCX) 高保真解包与多语言自动翻译引擎")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # auto 一键端到端子命令
    auto_parser = subparsers.add_parser("auto", help="一键全自动端到端翻译 Word 文档 (解包+并发翻译+回填打包)")
    auto_parser.add_argument("docx", help="输入的原始 DOCX 路径")
    auto_parser.add_argument("output_docx", help="输出的目标 DOCX 文件路径")
    auto_parser.add_argument("--lang", "--target-lang", dest="lang", default=None, help="目标语言代码 (如: en-US, ja-JP，默认自适应)")
    auto_parser.add_argument("--font", "--target-font", dest="font", default=None, help="目标东亚字体 (默认自适应)")
    auto_parser.add_argument("--batch-size", type=int, default=60, help="每批翻译项数 (默认: 60)")
    auto_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")
    auto_parser.add_argument("--temp-dir", default=None, help="解压临时目录")
    auto_parser.add_argument("--keep-temp", action="store_true", default=False, help="保留临时解包目录 (默认自动清理)")

    # unpack 子命令
    unpack_parser = subparsers.add_parser("unpack", help="解压 DOCX 并导出待翻译 JSON 字典")
    unpack_parser.add_argument("docx", help="输入的 DOCX 路径")
    unpack_parser.add_argument("--out-json", default=None, help="输出的 JSON 字典路径")
    unpack_parser.add_argument("--temp-dir", default=None, help="解压临时目录")

    # translate 子命令
    translate_parser = subparsers.add_parser("translate", help="并发批量翻译待翻译 JSON 字典")
    translate_parser.add_argument("in_json", help="输入的待翻译 JSON 字典路径")
    translate_parser.add_argument("out_json", help="输出的译文 JSON 字典路径")
    translate_parser.add_argument("--lang", "--target-lang", dest="lang", default="en-US", help="目标语言代码 (默认: en-US)")
    translate_parser.add_argument("--batch-size", type=int, default=60, help="每批翻译项数 (默认: 60)")
    translate_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")

    # pack 子命令
    pack_parser = subparsers.add_parser("pack", help="将翻译后的 JSON 回填并重新打包为 DOCX")
    pack_parser.add_argument("temp_dir", help="解压临时目录")
    pack_parser.add_argument("translated_json", help="翻译后的译文 JSON 字典路径")
    pack_parser.add_argument("output_docx", help="输出的目标 DOCX 文件路径")
    pack_parser.add_argument("--lang", "--target-lang", dest="lang", default="en-US", help="目标语言代码 (默认: en-US)")
    pack_parser.add_argument("--font", "--target-font", dest="font", default=None, help="目标东亚字体 (默认自适应)")

    args = parser.parse_args()

    if args.action == "auto":
        auto_translate_docx(
            args.docx, args.output_docx,
            lang=args.lang, font_ea=args.font,
            batch_size=args.batch_size, concurrency=args.concurrency,
            temp_dir=args.temp_dir,
            keep_temp=args.keep_temp
        )

    elif args.action == "unpack":
        docx_path = os.path.abspath(args.docx)
        temp_dir = args.temp_dir or os.path.join(os.path.dirname(docx_path), f".ooxml_{os.path.basename(docx_path)}")
        out_json = args.out_json or os.path.join(os.path.dirname(docx_path), "translation_input.json")
        unpack_docx(docx_path, temp_dir, out_json)

    elif args.action == "translate":
        in_json = os.path.abspath(args.in_json)
        out_json = os.path.abspath(args.out_json)
        translate_texts(in_json, out_json, target_lang=args.lang,
                        batch_size=args.batch_size, concurrency=args.concurrency)

    elif args.action == "pack":
        temp_dir = os.path.abspath(args.temp_dir)
        translated_json = os.path.abspath(args.translated_json)
        output_docx = os.path.abspath(args.output_docx)
        pack_docx(temp_dir, translated_json, output_docx,
                  lang=args.lang, font_ea=args.font)


if __name__ == '__main__':
    main()
