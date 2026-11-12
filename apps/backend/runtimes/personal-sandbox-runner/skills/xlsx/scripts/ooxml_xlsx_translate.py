#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Translate native XLSX text while preserving workbook package structure.

Shared and inline strings, styled runs, editable drawing/comment text and formula
literals are translated in place. The owned workflow validates content coverage
and native structures before publishing. Formula caches remain from the source;
Excel refreshes them on open. Images and visual/semantic fidelity need separate review.
"""

import os
import sys
import json
import shutil
import zipfile
import argparse
import re
import subprocess
import hashlib
import html
from xml.sax.saxutils import escape
from xml.etree import ElementTree as ET
from pathlib import Path
from xlsx_font_normalization import apply_font_localization
from xlsx_formula_references import (
    apply_protected_prefix,
    extract_referenced_prefixes,
    extract_validation_code_prefixes,
    split_protected_prefix,
    update_package_references,
)
from xlsx_translation_client import translate_batch as _translate_single_batch_streaming
from xlsx_native_text import extract_native_text, pack_native_text

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
    # 纯英文字母短缩写、单元格编号或带通配符的特定符号代码（如 C1, C2, N1, N*, Y*, IT, SASE, API）
    if re.fullmatch(r'[A-Za-z0-9_\-\s/\.\*\?]{1,15}', s) and not re.search(r'[\u4e00-\u9fa5\u3040-\u30ff]', s):
        return True
    return False


def _register_all_namespaces(xml_text: str):
    """提取 XML 文本中的所有命名空间声明并注册，防止 ElementTree 序列化生成未声明的 nsX 前缀"""
    for match in re.finditer(r'xmlns:([a-zA-Z0-9_\-]+)="([^"]+)"', xml_text):
        try:
            ET.register_namespace(match.group(1), match.group(2))
        except Exception:
            pass


def _preserve_root_tag_write(tree: ET.ElementTree, xml_path: str, orig_xml_text: str):
    """
    序列化 ElementTree 并精确恢复原始根标签的所有命名空间与属性声明，
    同时保留任何 ElementTree 新生成的命名空间，杜绝 Office 结构与命名空间解析报错。
    """
    _register_all_namespaces(orig_xml_text)
    new_xml_bytes = ET.tostring(tree.getroot(), encoding='utf-8', xml_declaration=True)
    new_xml_text = new_xml_bytes.decode('utf-8')

    orig_root_tag_match = re.search(r'<([a-zA-Z0-9_:]+)[^>]*>', orig_xml_text)
    new_root_tag_match = re.search(r'<([a-zA-Z0-9_:]+)[^>]*>', new_xml_text)

    if orig_root_tag_match and new_root_tag_match:
        orig_root_tag = orig_root_tag_match.group(0)
        new_root_tag = new_root_tag_match.group(0)

        # 提取 new_root_tag 中可能新增的 xmlns:nsX 声明，并安全补全至 orig_root_tag
        extra_xmlns = []
        for ns_m in re.finditer(r'xmlns:([a-zA-Z0-9_\-]+)="([^"]+)"', new_root_tag):
            prefix_decl = f'xmlns:{ns_m.group(1)}='
            if prefix_decl not in orig_root_tag:
                extra_xmlns.append(f'{prefix_decl}"{ns_m.group(2)}"')

        if extra_xmlns:
            orig_root_tag = orig_root_tag[:-1] + " " + " ".join(extra_xmlns) + ">"

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

    # 提取并备份已有断点缓存文件（.translation_cache.json 或 *.cache.json），避免每次 unpack 清空前序进度
    cached_entries = {}
    if os.path.exists(temp_dir):
        try:
            for entry in os.listdir(temp_dir):
                if entry.endswith('.cache.json') or entry in ('.translation_cache.json', '.translation_cache.meta.json'):
                    entry_path = os.path.join(temp_dir, entry)
                    if os.path.isfile(entry_path):
                        with open(entry_path, 'r', encoding='utf-8') as cf:
                            cached_entries[entry] = cf.read()
        except Exception:
            pass
        shutil.rmtree(temp_dir)

    os.makedirs(temp_dir, exist_ok=True)
    for fname, fcontent in cached_entries.items():
        try:
            with open(os.path.join(temp_dir, fname), 'w', encoding='utf-8') as cf:
                cf.write(fcontent)
            print(f"📦 [Cache] 已自动衔接断点缓存状态: {fname}")
        except Exception:
            pass

    print(f"📦 [1/3] 正在解析原始 Excel 工作簿归档: {os.path.basename(xlsx_path)}")
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        z.extractall(temp_dir)

    xl_dir = os.path.join(temp_dir, 'xl')
    if not os.path.exists(xl_dir):
        raise RuntimeError("XLSX 结构异常: 未找到 xl 目录")

    extracted_texts = {}
    mapping = {}
    protected_prefix_pool = (
        extract_referenced_prefixes(temp_dir)
        | extract_validation_code_prefixes(temp_dir)
    )

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
                meta = {
                    "type": "sst",
                    "si_idx": idx,
                    "has_runs": False,
                    "orig_text": text
                }
                if text.strip():
                    pref, _ = split_protected_prefix(
                        text.strip(), protected_prefix_pool, is_data_validation=False
                    )
                    if pref:
                        meta["protected_prefix"] = pref
                    extracted_texts[key] = text.strip()
                mapping[key] = meta
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
                run_keys = []
                for run_index, run in enumerate(runs):
                    text = run.find(f'{{{main_ns}}}t')
                    value = text.text or '' if text is not None else ''
                    run_key = f'{key}_run_{run_index}'
                    run_keys.append(run_key)
                    if value.strip():
                        extracted_texts[run_key] = value.strip()
                        mapping[run_key] = {'type': 'rich_text_run', 'orig_text': value}
                mapping[key]['run_keys'] = run_keys

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
                                        meta = {
                                            "type": "data_validation",
                                            "rel_file": f"xl/worksheets/{fname}",
                                            "dv_idx": dv_idx,
                                            "opt_idx": opt_idx,
                                            "orig_text": clean_opt
                                        }
                                        pref, _ = split_protected_prefix(
                                            clean_opt, protected_prefix_pool, is_data_validation=True
                                        )
                                        if pref:
                                            meta["protected_prefix"] = pref
                                        mapping[key] = meta
                                        extracted_texts[key] = clean_opt

                # 内联字符串 (inlineStr)
                inline_cells = sheet_root.findall(f'.//{{{NS["main"]}}}c[@t="inlineStr"]')
                for c in inline_cells:
                    r_coord = c.attrib.get('r', '')
                    t_elem = c.find(f'.//{{{NS["main"]}}}is/{{{NS["main"]}}}t')
                    if t_elem is not None and t_elem.text and t_elem.text.strip():
                        key = f"inline_{fname}_{r_coord}"
                        meta = {
                            "type": "inline_string",
                            "rel_file": f"xl/worksheets/{fname}",
                            "cell_coord": r_coord,
                            "orig_text": t_elem.text
                        }
                        pref, _ = split_protected_prefix(
                            t_elem.text.strip(), protected_prefix_pool, is_data_validation=False
                        )
                        if pref:
                            meta["protected_prefix"] = pref
                        mapping[key] = meta
                        extracted_texts[key] = t_elem.text.strip()
            except Exception as e:
                print(f"  ⚠️ 解析工作表 {fname} 数据验证时跳过: {e}")

    extract_native_text(temp_dir, mapping, extracted_texts)
    mapping_file = os.path.join(temp_dir, 'ooxml_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(extracted_texts, f, ensure_ascii=False, indent=2)

    print(f"✅ [3/3] 提取完成！共识别到 {len(extracted_texts)} 处待本地化文本项。")
    return extracted_texts


def translate_texts(input_json_path: str, output_json_path: str, target_lang: str = 'zh-CN',
                    batch_size: int = 50, concurrency: int = 4, *, session_id=None) -> dict:
    from xlsx_translation_batches import load_protected_prefixes, translate_texts as translate
    from xlsx_translation_client import review_batch
    protected_prefixes = load_protected_prefixes(input_json_path)
    kwargs = dict(
        is_passthrough=_is_passthrough_text,
        translate_batch_fn=_translate_single_batch_streaming,
        review_batch_fn=review_batch,
        session_id=session_id,
    )
    if protected_prefixes:
        kwargs['protected_prefixes'] = protected_prefixes
    return translate(input_json_path, output_json_path, target_lang, batch_size, concurrency, **kwargs)


def pack_xlsx(temp_dir: str, translated_json_path: str, output_xlsx: str,
              lang: str = 'zh-CN', run_recalc: bool = False) -> str:
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
            orig_meta = mapping.get(key, {})
            run_keys = orig_meta.get('run_keys')
            if key not in translations and not run_keys:
                continue
            new_text = translations.get(key, '')

            if not orig_meta.get('has_runs'):
                t_node = si.find(f'{{{main_ns}}}t')
                if t_node is not None:
                    original = t_node.text or ''
                    t_node.text = (re.match(r'^\s*', original).group(0) + new_text.strip()
                                   + re.search(r'\s*$', original).group(0))
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
                if runs and run_keys:
                    for run, run_key in zip(runs, run_keys):
                        text = run.find(f'{{{main_ns}}}t')
                        if text is not None and run_key in translations:
                            original = text.text or ''
                            leading = re.match(r'^\s*', original).group(0)
                            trailing = re.search(r'\s*$', original).group(0)
                            text.text = leading + translations[run_key].strip() + trailing
                            text.attrib['{http://www.w3.org/XML/1998/namespace}space'] = 'preserve'
                elif runs:
                    first_t = runs[0].find(f'{{{main_ns}}}t')
                    if first_t is not None:
                        first_t.text = new_text
                        if new_text.startswith(' ') or new_text.endswith(' ') or '\n' in new_text:
                            first_t.attrib['{http://www.w3.org/XML/1998/namespace}space'] = 'preserve'
                    for extra_r in runs[1:]:
                        extra_t = extra_r.find(f'{{{main_ns}}}t')
                        if extra_t is not None:
                            extra_t.text = ""
            if not is_ja:
                for phonetic in [*si.findall(f'{{{main_ns}}}rPh'), *si.findall(f'{{{main_ns}}}phoneticPr')]:
                    si.remove(phonetic)

        _preserve_root_tag_write(sst_tree, sst_path, orig_sst_text)
        print("  ✓ 已注入 xl/sharedStrings.xml 共享字符串。")

    # 2. 回填 xl/workbook.xml 中的工作表名称 (采用字节级无损正则替换，避免 ET 重建破坏 x15ac 等未声明前缀)
    sheet_name_map = {}
    wb_path = os.path.join(temp_dir, 'xl', 'workbook.xml')
    if os.path.isfile(wb_path):
        with open(wb_path, 'r', encoding='utf-8', errors='ignore') as f:
            orig_wb_text = f.read()

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
                name_val = html.unescape(match.group(1))
                if name_val in sheet_name_map:
                    target = escape(sheet_name_map[name_val], {'"': '&quot;'})
                    return full_tag.replace(f'name="{match.group(1)}"', f'name="{target}"')
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

                _register_all_namespaces(orig_ws_text)
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

    pack_native_text(temp_dir, mapping, translations, _preserve_root_tag_write)
    text_translations = {
        meta['orig_text']: translations[key]
        for key, meta in mapping.items()
        if key in translations and isinstance(meta.get('orig_text'), str)
    }
    update_package_references(temp_dir, sheet_name_map, text_translations)
    localized_fonts = apply_font_localization(temp_dir, lang)
    if localized_fonts:
        print(f"  ✓ 已本地化 {localized_fonts} 个 XML 部件的字体与字符集 ({lang})。")

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
                if os.path.abspath(full_path) in (os.path.abspath(output_xlsx), os.path.abspath(temp_zip_path)):
                    continue
                rel_path = os.path.relpath(full_path, temp_dir)
                if rel_path.startswith(('ooxml_mapping.json', 'translation_', '.translation_cache')):
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

    print(f"✓ 候选工作簿已打包，等待完整性验收: {output_xlsx}")
    return output_xlsx


def auto_translate_xlsx(xlsx_path: str, output_xlsx: str, lang: str = 'zh-CN',
                        batch_size: int = 50, concurrency: int = 4,
                        temp_dir: str = None, keep_temp: bool = False,
                        run_recalc: bool = False) -> str:
    """一键全自动端到端翻译 Excel 工作簿 (解包+并发翻译+回填打包)"""
    xlsx_path = os.path.abspath(xlsx_path)
    output_xlsx = os.path.abspath(output_xlsx)
    if xlsx_path == output_xlsx:
        raise ValueError('输入附件不能作为翻译输出覆盖')
    source_hash = hashlib.sha256(Path(xlsx_path).read_bytes()).hexdigest()

    if not temp_dir:
        temp_dir = os.path.join(os.path.dirname(output_xlsx), f".ooxml_{os.path.basename(output_xlsx)}")

    os.makedirs(temp_dir, exist_ok=True)
    in_json = os.path.join(temp_dir, 'translation_input.json')
    out_json = os.path.join(temp_dir, 'translation_output.json')
    candidate = os.path.join(temp_dir, 'candidate.xlsx')

    success = False
    try:
        unpack_xlsx(xlsx_path, temp_dir, in_json)
        translated = translate_texts(in_json, out_json, target_lang=lang,
                        batch_size=batch_size, concurrency=concurrency)
        pack_xlsx(temp_dir, out_json, candidate, lang=lang, run_recalc=run_recalc)
        from xlsx_translation_quality import validate_delivery
        with open(os.path.join(temp_dir, 'ooxml_mapping.json'), encoding='utf-8') as stream:
            quality = validate_delivery(xlsx_path, candidate, json.load(stream), translated, lang)
        if hashlib.sha256(Path(xlsx_path).read_bytes()).hexdigest() != source_hash:
            raise ValueError('翻译期间原始附件发生变化')
        os.replace(candidate, output_xlsx)
        print('✓ 工作簿结构及翻译验收通过', flush=True)
        success = True
    finally:
        if os.path.exists(candidate):
            os.remove(candidate)
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
    auto_parser.add_argument("--batch-size", type=int, default=50, help="每批翻译项数 (默认: 50)")
    auto_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")
    auto_parser.add_argument("--temp-dir", default=None, help="解压临时目录")
    auto_parser.add_argument("--keep-temp", action="store_true", default=False, help="保留临时解包目录 (默认自动清理)")
    auto_parser.add_argument("--no-recalc", action="store_true", default=True, help="保留原生结构，打开 Excel 时重算")

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
    translate_parser.add_argument("--batch-size", type=int, default=50, help="每批翻译项数 (默认: 50)")
    translate_parser.add_argument("--concurrency", type=int, default=4, help="并发线程数 (默认: 4)")

    # pack 子命令
    pack_parser = subparsers.add_parser("pack", help="将翻译后的 JSON 回填并重新打包为 XLSX")
    pack_parser.add_argument("temp_dir", help="解压临时目录")
    pack_parser.add_argument("translated_json", help="翻译后的译文 JSON 字典路径")
    pack_parser.add_argument("output_xlsx", help="输出的目标 XLSX 文件路径")
    pack_parser.add_argument("--lang", "--target-lang", dest="lang", default="zh-CN", help="目标语言代码 (默认: zh-CN)")
    pack_parser.add_argument("--no-recalc", action="store_true", default=True, help="保留原生结构，打开 Excel 时重算")

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
