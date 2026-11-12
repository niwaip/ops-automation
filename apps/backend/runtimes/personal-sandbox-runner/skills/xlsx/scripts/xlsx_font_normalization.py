"""Target-locale font and charset normalization for localized XLSX packages."""

import html
import os
import re
from pathlib import Path
from xml.sax.saxutils import escape

_KANA_RE = re.compile(r"[\u3040-\u30ff]")
_SERIF_HINT_RE = re.compile(r"mincho|明朝|serif|ryumin|リュウミン", re.I)

_JAPANESE_FONT_TOKENS = (
    "biz ud",
    "ms pgothic",
    "ms gothic",
    "ms ui gothic",
    "ms pmincho",
    "ms mincho",
    "ｍｓ ｐゴシック",
    "ｍｓ ゴシック",
    "ｍｓ ｐ明朝",
    "ｍｓ 明朝",
    "meiryo",
    "yu gothic",
    "yu mincho",
    "游ゴシック",
    "游明朝",
    "hiragino",
    "osaka",
    "ipagothic",
    "ipapgothic",
    "ipaexgothic",
    "ipamincho",
    "ipapmincho",
    "ipaexmincho",
    "noto sans jp",
    "noto serif jp",
    "noto sans cjk jp",
    "noto serif cjk jp",
    "takao",
    "hg丸ｺﾞｼｯｸ",
    "hgsｺﾞｼｯｸ",
    "hgpｺﾞｼｯｸ",
    "hgs明朝",
    "hgp明朝",
    "hg明朝",
)

_TRADITIONAL_LANGS = {"zh-tw", "zh-hk", "zh-mo", "zh-hant", "繁体中文"}
_CHINESE_LANGS = {"zh", "zh-cn", "zh-hans", "zh-sg", "chinese", "cn", "中文", "简体中文", *_TRADITIONAL_LANGS}

_FONT_BLOCK_RE = re.compile(
    r"(<(?P<qtag>(?:\w+:)?(?:font|rPr))\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*(?<!/)>)(?P<body>.*?)(</(?P=qtag)>)",
    re.DOTALL,
)
_FONT_NAME_TAG_RE = re.compile(
    r'(<(?:\w+:)?(?:name|rFont)\b[^>]*\bval=")([^"]*)("[^>]*?/?>)'
)
_CHARSET_TAG_RE = re.compile(
    r'(<(?:\w+:)?charset\b[^>]*\bval=")([^"]*)("[^>]*?/?>)'
)
_DRAWING_FONT_TAG_RE = re.compile(
    r'<(?:\w+:)?(?:latin|ea|cs|sym|font)\b[^>]*?/?>'
)


def font_localization_plan(target_lang: str):
    """Return locale font/charset mapping dict or None when localization is not needed."""
    normalized = (target_lang or "").strip().lower().replace("_", "-")
    if not normalized or normalized.startswith("ja") or "japanese" in normalized or "日文" in normalized:
        return None
    if normalized in _TRADITIONAL_LANGS or normalized.startswith(("zh-tw", "zh-hk", "zh-mo", "zh-hant")):
        return {
            "sans": "微軟正黑體",
            "serif": "新細明體",
            "charset": "136",
        }
    if normalized in _CHINESE_LANGS or normalized.startswith("zh"):
        return {
            "sans": "微软雅黑",
            "serif": "宋体",
            "charset": "134",
        }
    return {
        "sans": "Calibri",
        "serif": "Cambria",
        "charset": "0",
    }


def is_japanese_exclusive_font(font_name: str) -> bool:
    """Detect Japanese-specific font family names."""
    clean = " ".join((font_name or "").strip().lower().split())
    if not clean:
        return False
    if _KANA_RE.search(clean):
        return True
    return any(token in clean for token in _JAPANESE_FONT_TOKENS)


def map_japanese_font(font_name: str, target_lang: str) -> str:
    """Map a Japanese exclusive font name to the target locale equivalent."""
    plan = font_localization_plan(target_lang)
    if not plan or not is_japanese_exclusive_font(font_name):
        return font_name
    return plan["serif"] if _SERIF_HINT_RE.search(font_name or "") else plan["sans"]


def _patch_font_block(block_body: str, target_lang: str) -> str:
    plan = font_localization_plan(target_lang)
    if not plan:
        return block_body

    changed_japanese_font = False

    def replace_name(match):
        nonlocal changed_japanese_font
        orig_name = html.unescape(match.group(2))
        mapped = map_japanese_font(orig_name, target_lang)
        if mapped != orig_name:
            changed_japanese_font = True
            return match.group(1) + escape(mapped, {'"': "&quot;"}) + match.group(3)
        return match.group(0)

    updated = _FONT_NAME_TAG_RE.sub(replace_name, block_body)

    def replace_charset(match):
        val = html.unescape(match.group(2)).strip()
        if val == "128":
            return match.group(1) + plan["charset"] + match.group(3)
        return match.group(0)

    return _CHARSET_TAG_RE.sub(replace_charset, updated)


def localize_spreadsheet_fonts_xml(xml_text: str, target_lang: str) -> str:
    """Normalize Japanese font names and charset='128' inside <font> and <rPr> elements."""
    if not font_localization_plan(target_lang):
        return xml_text

    def replace_block(match):
        body = match.group("body")
        patched = _patch_font_block(body, target_lang)
        if patched == body:
            return match.group(0)
        return f"{match.group(1)}{patched}{match.group(4)}"

    return _FONT_BLOCK_RE.sub(replace_block, xml_text)


def localize_drawing_fonts_xml(xml_text: str, target_lang: str) -> str:
    """Normalize Japanese typeface and charset='128' attributes on DrawingML font elements."""
    plan = font_localization_plan(target_lang)
    if not plan:
        return xml_text

    def replace_tag(match):
        tag_text = match.group(0)
        typeface_m = re.search(r'\btypeface="([^"]*)"', tag_text)
        if not typeface_m:
            return tag_text
        orig_face = html.unescape(typeface_m.group(1))
        mapped_face = map_japanese_font(orig_face, target_lang)
        if mapped_face == orig_face:
            return tag_text
        updated = (
            tag_text[: typeface_m.start(1)]
            + escape(mapped_face, {'"': "&quot;"})
            + tag_text[typeface_m.end(1) :]
        )
        updated = re.sub(
            r'\bcharset="128"',
            f'charset="{plan["charset"]}"',
            updated,
        )
        return updated

    return _DRAWING_FONT_TAG_RE.sub(replace_tag, xml_text)


def apply_font_localization(temp_dir: str, target_lang: str) -> int:
    """Apply locale font/charset normalization across styles, sharedStrings, and drawings."""
    if not font_localization_plan(target_lang):
        return 0
    changed_files = 0
    xl_root = Path(temp_dir) / "xl"
    if not xl_root.is_dir():
        return 0

    for rel in ("styles.xml", "sharedStrings.xml"):
        target = xl_root / rel
        if target.is_file():
            orig = target.read_text(encoding="utf-8")
            updated = localize_spreadsheet_fonts_xml(orig, target_lang)
            if updated != orig:
                target.write_text(updated, encoding="utf-8")
                changed_files += 1

    for sub in ("worksheets", "drawings", "charts"):
        sub_dir = xl_root / sub
        if not sub_dir.is_dir():
            continue
        for xml_file in sorted(sub_dir.glob("*.xml")):
            orig = xml_file.read_text(encoding="utf-8")
            if sub == "worksheets":
                updated = localize_spreadsheet_fonts_xml(orig, target_lang)
            else:
                updated = localize_drawing_fonts_xml(orig, target_lang)
            if updated != orig:
                xml_file.write_text(updated, encoding="utf-8")
                changed_files += 1

    return changed_files
