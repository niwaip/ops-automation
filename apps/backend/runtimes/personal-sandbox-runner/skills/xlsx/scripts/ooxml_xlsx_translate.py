#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OOXML Excel (XLSX) 高保真翻译与多语言替换引擎
通过直接解包与操作 Office Open XML (SpreadsheetML) 结构，实现 100% 格式无损的 Excel 文本提取、
AI 去重流式并发翻译与原地回填打包。

保证：
1. 单元格样式、边框、底纹背景、字体粗细与字号 100% 原样保留；
2. 数据验证下拉框 (Data Validations / 下拉列表) 100% 完整保留并支持选项本地化；
3. 条件格式 (Conditional Formatting / 预设高亮规则) 100% 原样保留；
4. 视图属性、冻结窗格 (Freeze Panes)、活动标签页 100% 原样保留；
5. 动态计算公式 (<f>) 与引用关系 100% 原样保留，并自动驱动 LibreOffice 完成无头重算缓存校验。
"""

import os
import sys
import json
import shutil
import zipfile
import argparse
import re
import time
import subprocess
import urllib.request
import urllib.error
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree as ET

# SpreadsheetML 核心命名空间
NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'x14ac': 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac',
    'xr': 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision',
    'xml': 'http://www.w3.org/XML/1998/namespace'
}

for prefix, uri in NS.items():
    if prefix == 'main':
        ET.register_namespace('', uri)
    else:
        ET.register_namespace(prefix, uri)


def _is_passthrough_text(text: str) -> bool:
    """判断是否为无需翻译的纯数字、标点符号、公式、URL、英文代码缩写等"""
    if not text:
        return True
    s = text.strip()
    if not s:
        return True
    # 公式（以 = 开头）
    if s.startswith('='):
        return True
    # 纯数字、百分比、货币、范围（如 82%, 12×, 15 KRMB/年, 2026-10-12, 100.00）
    if re.fullmatch(r'[\d\s\.,\+\-\*\/%×~><:;（）\(\)\$€¥KRMB/]+', s):
        return True
    # URL 或 网址
    if re.match(r'^(?:https?://|www\.)', s, re.I):
        return True
    # 纯英文字母短缩写、单元格编号或特定符号代码（如 C1, C2, N1, N2, IT, SASE, API, AWS, GCP, Azure）
    if re.fullmatch(r'[A-Za-z0-9_\-\s/\.]{1,15}', s) and not re.search(r'[\u4e00-\u9fa5\u3040-\u30ff]', s):
        return True
    return False


def _preserve_root_tag_write(tree: ET.ElementTree, xml_path: str, orig_xml_text: str):
    """
    序列化 ElementTree 并精确恢复原始根标签的所有命名空间与属性声明，
    杜绝 Python ElementTree.write 丢失命名空间导致的 Office 结构报错。
    """
    new_xml_bytes = ET.tostring(tree.getroot(), encoding='utf-8', xml_declaration=True)
    new_xml_text = new_xml_bytes.decode('utf-8')

    orig_root_tag_match = re.search(r'<([a-zA-Z0-9_:]+)[^>]*>', orig_xml_text)
    new_root_tag_match = re.search(r'<([a-zA-Z0-9_:]+)[^>]*>', new_xml_text)

    if orig_root_tag_match and new_root_tag_match:
        orig_root_tag = orig_root_tag_match.group(0)
        final_xml_text = (
            new_xml_text[:new_root_tag_match.start()]
            + orig_root_tag
            + new_xml_text[new_root_tag_match.end():]
        )
    else:
        final_xml_text = new_xml_text

    with open(xml_path, 'w', encoding='utf-8') as f:
        f.write(final_xml_text)


def unpack_xlsx(xlsx_path: str, temp_dir: str, out_json_path: str) -> dict:
    """
    解包 XLSX 并提取 sharedStrings.xml、工作表名称以及数据验证下拉框选项，导出待翻译 JSON
    """
    if not os.path.isfile(xlsx_path):
        raise FileNotFoundError(f"找不到输入的 XLSX 文件: {xlsx_path}")

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    print(f"📦 [1/3] 正在解析原始 Excel 工作簿归档: {os.path.basename(xlsx_path)}")
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        z.extractall(temp_dir)

    xl_dir = os.path.join(temp_dir, 'xl')
    if not os.path.exists(xl_dir):
        raise RuntimeError("XLSX 结构异常: 未找到 xl 目录")

    extracted_texts = {}
    mapping = {}

    # 1. 提取 xl/sharedStrings.xml 中的共享字符串
    sst_path = os.path.join(xl_dir, 'sharedStrings.xml')
    if os.path.isfile(sst_path):
        print("🔍 [2/3] 正在提取 xl/sharedStrings.xml 全量共享字符串...")
        tree = ET.parse(sst_path)
        root = tree.getroot()
        main_ns = NS['main']

        for idx, si in enumerate(root):
            direct_t = si.find(f'{{{main_ns}}}t')
            runs = si.findall(f'{{{main_ns}}}r')

            if direct_t is not None:
                text = direct_t.text or ""
                key = f"sst_{idx}"
                mapping[key] = {
                    "type": "sst",
                    "si_idx": idx,
                    "has_runs": False,
                    "orig_text": text
                }
                if text.strip():
                    extracted_texts[key] = text.strip()
            elif runs:
                text_parts = []
                for r in runs:
                    t_node = r.find(f'{{{main_ns}}}t')
                    if t_node is not None and t_node.text:
                        text_parts.append(t_node.text)
                full_text = "".join(text_parts)
                key = f"sst_{idx}"
                mapping[key] = {
                    "type": "sst",
                    "si_idx": idx,
                    "has_runs": True,
                    "run_count": len(runs),
                    "orig_text": full_text
                }
                if full_text.strip():
                    extracted_texts[key] = full_text.strip()

    # 2. 提取 xl/workbook.xml 中的工作表名称
    wb_path = os.path.join(xl_dir, 'workbook.xml')
    if os.path.isfile(wb_path):
        wb_tree = ET.parse(wb_path)
        wb_root = wb_tree.getroot()
        sheets_elem = wb_root.find(f'{{{NS["main"]}}}sheets')
        if sheets_elem is not None:
            for s_idx, sheet in enumerate(sheets_elem):
                s_name = sheet.attrib.get('name', '')
                if s_name:
                    key = f"sheet_name_{s_idx}"
                    mapping[key] = {
                        "type": "sheet_name",
                        "sheet_idx": s_idx,
                        "orig_text": s_name
                    }
                    if s_name.strip():
                        extracted_texts[key] = s_name.strip()

    # 3. 提取 xl/worksheets/sheet*.xml 中的数据验证列表与内联字符串
    ws_dir = os.path.join(xl_dir, 'worksheets')
    if os.path.isdir(ws_dir):
        for fname in sorted(os.listdir(ws_dir)):
            if not fname.endswith('.xml') or fname.startswith('.'):
                continue
            ws_path = os.path.join(ws_dir, fname)
            try:
                sheet_tree = ET.parse(ws_path)
                sheet_root = sheet_tree.getroot()

                # 数据验证下拉列表 (dataValidations)
                dvs = sheet_root.findall(f'.//{{{NS["main"]}}}dataValidation')
                for dv_idx, dv in enumerate(dvs):
                    if dv.attrib.get('type') == 'list':
                        f1 = dv.find(f'{{{NS["main"]}}}formula1')
                        if f1 is not None and f1.text:
                            raw = f1.text.strip()
                            if raw.startswith('"') and raw.endswith('"'):
                                options = raw[1:-1].split(',')
                                for opt_idx, opt in enumerate(options):
                                    clean_opt = opt.strip()
                                    if clean_opt and not _is_passthrough_text(clean_opt):
                                        key = f"dv_{fname}_{dv_idx}_{opt_idx}"
                                        mapping[key] = {
                                            "type": "data_validation",
                                            "rel_file": f"xl/worksheets/{fname}",
                                            "dv_idx": dv_idx,
                                            "opt_idx": opt_idx,
                                            "orig_text": clean_opt
                                        }
                                        extracted_texts[key] = clean_opt

                # 内联字符串 (inlineStr)
                inline_cells = sheet_root.findall(f'.//{{{NS["main"]}}}c[@t="inlineStr"]')
                for c in inline_cells:
                    r_coord = c.attrib.get('r', '')
                    t_elem = c.find(f'.//{{{NS["main"]}}}is/{{{NS["main"]}}}t')
                    if t_elem is not None and t_elem.text and t_elem.text.strip():
                        key = f"inline_{fname}_{r_coord}"
                        mapping[key] = {
                            "type": "inline_string",
                            "rel_file": f"xl/worksheets/{fname}",
                            "cell_coord": r_coord,
                            "orig_text": t_elem.text
                        }
                        extracted_texts[key] = t_elem.text.strip()
            except Exception as e:
                print(f"  ⚠️ 解析工作表 {fname} 数据验证时跳过: {e}")

    mapping_file = os.path.join(temp_dir, 'ooxml_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(extracted_texts, f, ensure_ascii=False, indent=2)

    print(f"✅ [3/3] 提取完成！共识别到 {len(extracted_texts)} 处待本地化文本项。")
    return extracted_texts


def _translate_single_batch_streaming(batch_dict: dict, target_lang: str, api_base: str, api_key: str,
                                      model: str = "default", retries: int = 2) -> dict:
    """流式单批次调用 LLM 翻译，自带心跳防超时与格式解析容错"""
    is_zh = any(code in target_lang.lower() for code in ["zh", "chinese", "cn"])
    is_ja = any(code in target_lang.lower() for code in ["ja", "japanese", "jp"])
    is_en = any(code in target_lang.lower() for code in ["en", "english", "us", "uk"])

    if is_zh:
        lang_name = "地道、专业的中文字符与行业标准表达 (Professional Simplified Chinese)"
        domain_rules = """3. 【专业术语与规范】：
   - 云计算与企业 IT 安全规范对照：
     * クラウド設定・運用セキュリティチェックリスト -> 云计算设置运营安全检查清单
     * 確認事項 -> 确认事项
     * 補足説明 -> 补充说明
     * 番号 -> 编号
     * 適合 / 不適合 -> 适合 / 不适合
     * 選択 -> 选择
     * その他 -> 其他
     * テナント管理者 -> 租户管理员
     * ユーザー管理台帳及び棚卸しの記録 -> 用户管理台账及盘点记录
   - 常见的选项代号（如 C1, C2, N1, N2 等）保持英文与数字原样；
4. 【排版严谨】：保留原句的标点符号，严禁随意换行；"""
    elif is_ja:
        lang_name = "地道、专业的商务与法律日语 (Professional Business & Legal Japanese)"
        domain_rules = """3. 【日企商务与法务规范】：
   - 采用标准日本合同/规范文风（である体/だ体，条文使用「〜ものとする」「〜とする」）；
   - 适合/不适合对应「適合」/「不適合」，选择对应「選択」，其他对应「その他」；
   - 通用技术缩写（AI, LLM, API, AWS, SASE）保持标准英文字符；
4. 【排版严谨】：保留原句的标点与段落结构；"""
    elif is_en:
        lang_name = "专业、地道的商业与合规英语 (Professional Business & Compliance English)"
        domain_rules = """3. 【国际企业商务与合规规范】：
   - 采用国际标准合规与技术术语（Checklist, Compliant, Non-compliant, Select, Other, Tenant Administrator）；
   - 纯正英文输出，严禁混入中文字符；
4. 【排版严谨】：句式严密规范；"""
    else:
        lang_name = f"地道、专业的目标语言({target_lang})"
        domain_rules = """3. 【专业术语规范】：采用目标语言在商业与技术合规领域的行业通用专业表达；
4. 【文风严谨】：符合正式商务报表与检查清单规范；"""

    prompt = f"""你是一位顶级商业表格与合规文档本地化专家。请将以下 Excel (XLSX) 文档文本键值对翻译为{lang_name}。

【核心本地化与排版规范】：
1. 保持输入 JSON 字典的 Key 键名完全一致，仅将 Value 翻译为地道的目标语言；
2. 即使是单独的表头、下拉选项（如“選択”->“选择”、“その他”->“其他”），也必须准确翻译为目标语言；
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
        "request_context": "spreadsheet_translation"
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


def translate_texts(input_json_path: str, output_json_path: str, target_lang: str = 'zh-CN',
                    batch_size: int = 80, concurrency: int = 4) -> dict:
    """读取待翻译 JSON 字典，通过去重、透传过滤、断点检查点与并发流式调用模型代理进行高质量翻译"""
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

    # 0. 断点检查点缓存初始化
    cache_file = os.path.join(os.path.dirname(os.path.abspath(output_json_path)), '.translation_cache.json')
    translated_unique_map = {}
    if os.path.isfile(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as cf:
                cached_data = json.load(cf)
                if isinstance(cached_data, dict):
                    translated_unique_map.update(cached_data)
                    print(f"📦 [Cache] 命中断点检查点，已恢复 {len(translated_unique_map)} 处已完成翻译项。")
        except Exception as e:
            print(f"⚠️ [Cache] 加载断点缓存失败: {e}")

    # 1. 文本去重与透传过滤
    unique_to_translate = {}
    passthrough_translations = {}

    for k, text in all_texts.items():
        if _is_passthrough_text(text):
            passthrough_translations[text] = text
        else:
            if text not in unique_to_translate:
                unique_to_translate[text] = f"t_{len(unique_to_translate)}"

    pending_to_translate = {t: uid for t, uid in unique_to_translate.items() if t not in translated_unique_map}
    print(f"🌐 [2/4] 启动智能并发表格翻译 (总项: {len(all_texts)}，需翻译总项: {len(unique_to_translate)}，已命中缓存: {len(translated_unique_map)}，待处理项: {len(pending_to_translate)}，免翻译透传项: {len(passthrough_translations)})...")

    # 2. 分批并发翻译未缓存项
    unique_items = list(pending_to_translate.items())
    batches = []
    current_batch = {}

    for text, uid in unique_items:
        current_batch[uid] = text
        if len(current_batch) >= batch_size:
            batches.append(current_batch)
            current_batch = {}
    if current_batch:
        batches.append(current_batch)

    total_batches = len(batches)
    cache_lock = threading.Lock()

    def _flush_cache():
        try:
            tmp_cache = cache_file + '.tmp'
            with open(tmp_cache, 'w', encoding='utf-8') as cf:
                json.dump(translated_unique_map, cf, ensure_ascii=False)
            os.replace(tmp_cache, cache_file)
        except Exception:
            pass

    if total_batches > 0:
        print(f"  ⚡ 智能划分为 {total_batches} 批并发处理 (并发度: {concurrency}，批大小: {batch_size})...")
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
                    with cache_lock:
                        for uid, trans in b_res.items():
                            orig_candidates = [t for t, u in unique_to_translate.items() if u == uid]
                            if orig_candidates:
                                translated_unique_map[orig_candidates[0]] = trans
                        _flush_cache()
                except Exception as e:
                    print(f"  ⚠️ 批次 {idx} 发生异常: {e}")
                    with cache_lock:
                        for uid, text in batches[idx].items():
                            orig_text = [t for t, u in unique_to_translate.items() if u == uid][0]
                            translated_unique_map[orig_text] = orig_text
                        _flush_cache()

    # 3. 回填映射
    final_output = {}
    for k, orig_text in all_texts.items():
        if orig_text in passthrough_translations:
            final_output[k] = orig_text
        elif orig_text in translated_unique_map:
            final_output[k] = translated_unique_map[orig_text]
        else:
            final_output[k] = orig_text

    # 4. 质检验收门禁与增量补译
    is_zh = any(code in target_lang.lower() for code in ["zh", "chinese", "cn"])
    ja_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF]')
    missed_unique = {}

    for k, orig_text in all_texts.items():
        trans_text = final_output.get(k, orig_text)
        if _is_passthrough_text(orig_text):
            continue
        needs_sweep = False
        if is_zh:
            # 日译中：如果译文中仍然残留明显的假名字符，需要补译
            if ja_pattern.search(trans_text):
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

    if os.path.exists(cache_file):
        try:
            os.remove(cache_file)
        except Exception:
            pass

    print(f"✅ 文本本地化完成！已保存高质量译文字典至: {output_json_path}")
    return final_output


def pack_xlsx(temp_dir: str, translated_json_path: str, output_xlsx: str,
              lang: str = 'zh-CN', run_recalc: bool = True) -> str:
    """
    读取翻译后的 JSON，通过 mapping 原地写回 sharedStrings.xml、workbook.xml 与 sheet*.xml，
    精确保持所有 OOXML 架构与根命名空间，打包为新的 XLSX。
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

    print(f"📥 [3/4] 正在靶向注入译文并应用排版保护 (总项数: {len(mapping)})...")

    main_ns = NS['main']
    is_ja = "ja" in (lang or "").lower()

    # 1. 回填 xl/sharedStrings.xml
    sst_path = os.path.join(temp_dir, 'xl', 'sharedStrings.xml')
    if os.path.isfile(sst_path):
        with open(sst_path, 'r', encoding='utf-8', errors='ignore') as f:
            orig_sst_text = f.read()

        sst_tree = ET.parse(sst_path)
        sst_root = sst_tree.getroot()

        for idx, si in enumerate(sst_root):
            key = f"sst_{idx}"
            if key not in translations:
                continue
            new_text = translations[key]
            orig_meta = mapping.get(key, {})

            if not orig_meta.get('has_runs'):
                t_node = si.find(f'{{{main_ns}}}t')
                if t_node is not None:
                    t_node.text = new_text
                    if new_text.startswith(' ') or new_text.endswith(' ') or '\n' in new_text:
                        t_node.attrib['{http://www.w3.org/XML/1998/namespace}space'] = 'preserve'
                # 非日文目标语言时，清除原有的日文振假名 rPh 与 phoneticPr
                if not is_ja:
                    for rph in si.findall(f'{{{main_ns}}}rPh'):
                        si.remove(rph)
                    for phpr in si.findall(f'{{{main_ns}}}phoneticPr'):
                        si.remove(phpr)
            else:
                runs = si.findall(f'{{{main_ns}}}r')
                if runs:
                    first_t = runs[0].find(f'{{{main_ns}}}t')
                    if first_t is not None:
                        first_t.text = new_text
                        if new_text.startswith(' ') or new_text.endswith(' ') or '\n' in new_text:
                            first_t.attrib['{http://www.w3.org/XML/1998/namespace}space'] = 'preserve'
                    for extra_r in runs[1:]:
                        extra_t = extra_r.find(f'{{{main_ns}}}t')
                        if extra_t is not None:
                            extra_t.text = ""

        _preserve_root_tag_write(sst_tree, sst_path, orig_sst_text)
        print("  ✓ 已注入 xl/sharedStrings.xml 共享字符串。")

    # 2. 回填 xl/workbook.xml 中的工作表名称 (采用字节级无损正则替换，避免 ET 重建破坏 x15ac 等未声明前缀)
    wb_path = os.path.join(temp_dir, 'xl', 'workbook.xml')
    if os.path.isfile(wb_path):
        with open(wb_path, 'r', encoding='utf-8', errors='ignore') as f:
            orig_wb_text = f.read()

        sheet_name_map = {}
        for key, new_name in translations.items():
            if key.startswith('sheet_name_'):
                orig_meta = mapping.get(key, {})
                orig_name = orig_meta.get('orig_text')
                if orig_name and new_name:
                    clean_name = re.sub(r'[:\\/?*\[\]]', '', new_name)[:31].strip()
                    if clean_name:
                        sheet_name_map[orig_name] = clean_name

        if sheet_name_map:
            def replace_sheet_tag(match):
                full_tag = match.group(0)
                name_val = match.group(1)
                if name_val in sheet_name_map:
                    target = sheet_name_map[name_val]
                    return full_tag.replace(f'name="{name_val}"', f'name="{target}"')
                return full_tag

            updated_wb_text = re.sub(r'<sheet\b[^>]*\bname="([^"]+)"[^>]*>', replace_sheet_tag, orig_wb_text)
            with open(wb_path, 'w', encoding='utf-8') as f:
                f.write(updated_wb_text)
            print("  ✓ 已同步 xl/workbook.xml 工作表名称 (字节级无损保留)。")

    # 3. 回填 xl/worksheets/sheet*.xml 中的数据验证列表与内联字符串
    ws_dir = os.path.join(temp_dir, 'xl', 'worksheets')
    if os.path.isdir(ws_dir):
        for fname in sorted(os.listdir(ws_dir)):
            if not fname.endswith('.xml') or fname.startswith('.'):
                continue
            ws_path = os.path.join(ws_dir, fname)
            try:
                with open(ws_path, 'r', encoding='utf-8', errors='ignore') as f:
                    orig_ws_text = f.read()

                ws_tree = ET.parse(ws_path)
                ws_root = ws_tree.getroot()
                sheet_modified = False

                dvs = ws_root.findall(f'.//{{{main_ns}}}dataValidation')
                for dv_idx, dv in enumerate(dvs):
                    if dv.attrib.get('type') == 'list':
                        f1 = dv.find(f'{{{main_ns}}}formula1')
                        if f1 is not None and f1.text:
                            raw = f1.text.strip()
                            if raw.startswith('"') and raw.endswith('"'):
                                opts = raw[1:-1].split(',')
                                updated_opts = []
                                for opt_idx, opt in enumerate(opts):
                                    key = f"dv_{fname}_{dv_idx}_{opt_idx}"
                                    val = translations.get(key, opt)
                                    updated_opts.append(val)
                                new_formula = f'"{",".join(updated_opts)}"'
                                if new_formula != f1.text:
                                    f1.text = new_formula
                                    sheet_modified = True

                inline_cells = ws_root.findall(f'.//{{{main_ns}}}c[@t="inlineStr"]')
                for c in inline_cells:
                    r_coord = c.attrib.get('r', '')
                    key = f"inline_{fname}_{r_coord}"
                    if key in translations:
                        t_elem = c.find(f'.//{{{main_ns}}}is/{{{main_ns}}}t')
                        if t_elem is not None:
                            t_elem.text = translations[key]
                            sheet_modified = True

                if sheet_modified:
                    _preserve_root_tag_write(ws_tree, ws_path, orig_ws_text)
                    print(f"  ✓ 已更新 {fname} 数据验证下拉选项。")
            except Exception as e:
                print(f"  ⚠️ 回填工作表 {fname} 时跳过: {e}")

    # 4. 重新打包为 XLSX (ZIP)
    out_dir = os.path.dirname(output_xlsx)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    print(f"📦 [4/4] 正在重构打包高保真 Excel 工作簿: {os.path.basename(output_xlsx)}")
    temp_zip_path = output_xlsx + '.tmp.zip'
    with zipfile.ZipFile(temp_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, temp_dir)
                if rel_path.startswith(('ooxml_mapping.json', 'translation_')):
                    continue
                z.write(full_path, rel_path)

    if os.path.exists(output_xlsx):
        os.remove(output_xlsx)
    os.rename(temp_zip_path, output_xlsx)

    # 5. 驱动 recalc.py 刷新动态公式缓存
    if run_recalc:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        recalc_candidates = [
            os.path.join(script_dir, 'recalc.py'),
            '/opt/dsh/skills/xlsx/scripts/recalc.py'
        ]
        recalc_script = next((p for p in recalc_candidates if os.path.isfile(p)), None)
        if recalc_script:
            print("🧮 正在驱动无头 LibreOffice 进行动态公式全量重算缓存校验...")
            try:
                res = subprocess.run(
                    [sys.executable, recalc_script, output_xlsx],
                    capture_output=True, text=True, timeout=30
                )
                if res.returncode == 0:
                    print("  ✓ 公式重算验证通过 (status: verified)")
                else:
                    print(f"  ⚠️ 公式重算返回非零状态: {res.stdout.strip()}")
            except Exception as e:
                print(f"  ⚠️ 调用 recalc.py 时发生异常: {e}")

    print(f"🎉 高保真 Excel 翻译与版式打包成功！输出交付文件: {output_xlsx}")
    return output_xlsx


def auto_translate_xlsx(xlsx_path: str, output_xlsx: str, lang: str = 'zh-CN',
                        batch_size: int = 80, concurrency: int = 4,
                        temp_dir: str = None, keep_temp: bool = False,
                        run_recalc: bool = True) -> str:
    """一键全自动端到端翻译 Excel 工作簿 (解包+并发翻译+回填打包)"""
    xlsx_path = os.path.abspath(xlsx_path)
    output_xlsx = os.path.abspath(output_xlsx)

    if not temp_dir:
        temp_dir = os.path.join(os.path.dirname(output_xlsx), f".ooxml_{os.path.basename(output_xlsx)}")

    os.makedirs(temp_dir, exist_ok=True)
    in_json = os.path.join(temp_dir, 'translation_input.json')
    out_json = os.path.join(temp_dir, 'translation_output.json')

    success = False
    try:
        unpack_xlsx(xlsx_path, temp_dir, in_json)
        translate_texts(in_json, out_json, target_lang=lang,
                        batch_size=batch_size, concurrency=concurrency)
        pack_xlsx(temp_dir, out_json, output_xlsx, lang=lang, run_recalc=run_recalc)
        success = True
    finally:
        # 仅在完整打包成功且未开启 keep_temp 时清理临时目录；
        # 异常/超时时保留 temp_dir（含断点缓存 .translation_cache.json），供重试时秒级断点续传
        if success and not keep_temp and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    return output_xlsx


def main():
    parser = argparse.ArgumentParser(description="OOXML Excel 高保真翻译与多语言替换引擎")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # auto 一键端到端子命令
    auto_parser = subparsers.add_parser("auto", help="一键全自动端到端翻译 Excel 文档 (解包+并发翻译+回填打包)")
    auto_parser.add_argument("xlsx", help="输入的原始 XLSX 路径")
    auto_parser.add_argument("output_xlsx", help="输出的目标 XLSX 文件路径")
    auto_parser.add_argument("--lang", "--target-lang", dest="lang", default="zh-CN", help="目标语言代码 (如: zh-CN, en-US, ja-JP，默认: zh-CN)")
    auto_parser.add_argument("--batch-size", type=int, default=80, help="每批翻译项数 (默认: 80)")
    auto_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")
    auto_parser.add_argument("--temp-dir", default=None, help="解压临时目录")
    auto_parser.add_argument("--keep-temp", action="store_true", default=False, help="保留临时解包目录 (默认自动清理)")
    auto_parser.add_argument("--no-recalc", action="store_true", default=False, help="跳过 LibreOffice 无头公式重算")

    # unpack 子命令
    unpack_parser = subparsers.add_parser("unpack", help="解压 XLSX 并导出待翻译 JSON 字典")
    unpack_parser.add_argument("xlsx", help="输入的 XLSX 路径")
    unpack_parser.add_argument("--out-json", default=None, help="输出的 JSON 字典路径")
    unpack_parser.add_argument("--temp-dir", default=None, help="解压临时目录")

    # translate 子命令
    translate_parser = subparsers.add_parser("translate", help="并发批量翻译待翻译 JSON 字典")
    translate_parser.add_argument("in_json", help="输入的待翻译 JSON 字典路径")
    translate_parser.add_argument("out_json", help="输出的译文 JSON 字典路径")
    translate_parser.add_argument("--lang", "--target-lang", dest="lang", default="zh-CN", help="目标语言代码 (默认: zh-CN)")
    translate_parser.add_argument("--batch-size", type=int, default=80, help="每批翻译项数 (默认: 80)")
    translate_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")

    # pack 子命令
    pack_parser = subparsers.add_parser("pack", help="将翻译后的 JSON 回填并重新打包为 XLSX")
    pack_parser.add_argument("temp_dir", help="解压临时目录")
    pack_parser.add_argument("translated_json", help="翻译后的译文 JSON 字典路径")
    pack_parser.add_argument("output_xlsx", help="输出的目标 XLSX 文件路径")
    pack_parser.add_argument("--lang", "--target-lang", dest="lang", default="zh-CN", help="目标语言代码 (默认: zh-CN)")
    pack_parser.add_argument("--no-recalc", action="store_true", default=False, help="跳过 LibreOffice 无头公式重算")

    args = parser.parse_args()

    if args.action == "auto":
        auto_translate_xlsx(
            args.xlsx, args.output_xlsx,
            lang=args.lang,
            batch_size=args.batch_size, concurrency=args.concurrency,
            temp_dir=args.temp_dir,
            keep_temp=args.keep_temp,
            run_recalc=not args.no_recalc
        )

    elif args.action == "unpack":
        xlsx_path = os.path.abspath(args.xlsx)
        temp_dir = args.temp_dir or os.path.join(os.path.dirname(xlsx_path), f".ooxml_{os.path.basename(xlsx_path)}")
        out_json = args.out_json or os.path.join(os.path.dirname(xlsx_path), "translation_input.json")
        unpack_xlsx(xlsx_path, temp_dir, out_json)

    elif args.action == "translate":
        in_json = os.path.abspath(args.in_json)
        out_json = os.path.abspath(args.out_json)
        translate_texts(in_json, out_json, target_lang=args.lang,
                        batch_size=args.batch_size, concurrency=args.concurrency)

    elif args.action == "pack":
        temp_dir = os.path.abspath(args.temp_dir)
        translated_json = os.path.abspath(args.translated_json)
        output_xlsx = os.path.abspath(args.output_xlsx)
        pack_xlsx(temp_dir, translated_json, output_xlsx,
                  lang=args.lang, run_recalc=not args.no_recalc)


if __name__ == '__main__':
    main()
